# Global TSACO Control — Technical Documentation

Last updated: 2026-09-25 · applies to v0.3.0

An in-depth description of how this application works: the reverse-engineered
Socket.IO protocol it speaks, a module-by-module walkthrough of the code, and
the behaviours of the real backends that shaped its design.

**Audience:** whoever maintains or extends this codebase.

---

## Contents

1. [What this is, and what it is not](#1-what-this-is-and-what-it-is-not)
2. [Provenance: how the protocol was obtained](#2-provenance-how-the-protocol-was-obtained)
3. [Where the connections actually happen](#3-where-the-connections-actually-happen)
4. [Protocol specification](#4-protocol-specification)
5. [Code walkthrough](#5-code-walkthrough)
6. [End-to-end: what a source switch does](#6-end-to-end-what-a-source-switch-does)
7. [Observed backend behaviour and known quirks](#7-observed-backend-behaviour-and-known-quirks)
8. [Build and bundle](#8-build-and-bundle)
9. [Extending the app](#9-extending-the-app)

---

## 1. What this is, and what it is not

Global TSACO Control is a **replacement frontend** for the Techex "Engineer
UI", the web panel that controls TSACO (Transport Stream Automatic
ChangeOver) switching for linear broadcast channels.

**It is:** a React single-page app that speaks the same Socket.IO protocol as
the vendor's own UI, against the vendor's own unmodified backends.

**It is not:** a replacement for the backend. The logic that actually drives
the physical ACO hardware lives server-side on each appliance and is not
visible to a browser at all. Nothing in this repo touches that layer.

The functional gain over the vendor UI is that this connects to **multiple
backends simultaneously**, presenting all their channels in one table with
selection and switching routed to the right appliance automatically. The
vendor UI is one-appliance-per-tab.

---

## 2. Provenance: how the protocol was obtained

No vendor documentation or source was available. The protocol was recovered
by reading the vendor's own minified frontend bundle, served publicly by each
appliance:

```
http://172.23.191.27:5160/assets/index-7f050af4.js     (257 KB, older build)
http://10.165.24.17/assets/index-Cgnzokt8.js           (263 KB, newer build)
```

Both were fetched and searched for event-name string literals, socket
construction options, and the state-shaping functions. Every event name,
argument order, and field name documented below was read out of those
bundles — none of it is guessed.

Two independent builds were analysed because the first backend added after
the initial implementation turned out to run a **different version** with a
different channel-state shape. That discovery is why `resolveLeg()` exists
(see [§4.5](#45-channel-state-two-schema-variants)).

No vendor CSS, images, fonts, or code were copied. The visual design here is
original.

---

## 3. Where the connections actually happen

This is the single most important thing to understand before debugging
anything network-related.

```
┌────────────────────┐        serves static HTML/JS once
│  Web server host   │ ──────────────────────────────────┐
│  172.23.191.54     │                                   │
│  (nginx or vite)   │                                   ▼
└────────────────────┘                        ┌─────────────────────┐
        ▲                                     │  Operator browser   │
        │ HTTP GET / (page load only)         │  (runs all the JS)  │
        └─────────────────────────────────────└─────────┬───────────┘
                                                        │
                        Socket.IO / WebSocket           │
        ┌───────────────────────────────────────────────┤
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Techex backend│      │ Techex backend│      │ Techex backend│
│ 172.23.191.27 │      │ 10.165.24.17  │      │      ...      │
│  :5160        │      │  :80          │      │               │
└───────┬───────┘      └───────┬───────┘      └───────────────┘
        │                      │
        ▼                      ▼
   TSACO / ACO hardware   TSACO / ACO hardware
```

The web server ships files and then plays no further part. Every Socket.IO
connection originates in the **operator's browser**.

Practical consequences:

- The hosting server needs **no** route to the appliances, no credentials,
  and no firewall rules toward them.
- Each **operator workstation** needs TCP access to every backend it adds.
- Diagnostics run from the hosting server (`curl`, `ping` to an appliance)
  prove nothing about whether an operator can connect.
- Closing the browser tab drops all connections. Nothing is queued or
  retried server-side on this app's behalf.

The vendor's own Engineer UI page does **not** need to be open anywhere for
this to work. The backend service on each appliance runs continuously and
accepts connections from any client speaking its protocol; the vendor page is
just one such client. If someone has the vendor UI open while you switch a
source here, their view updates live too, via the same `state:update` push.

---

## 4. Protocol specification

Transport: **Socket.IO** at path `/api/socket.io`.

### 4.1 Connection and authentication

```js
// src/backend.js
this.sock = io(buildUrl(this.host, this.port), {
  path: '/api/socket.io',
  transports: ['websocket'],
  auth: { token: `${this.username}${this.password}` },
});
```

The token is the username and password **concatenated with no separator and
no hashing**. That is what the vendor app does (it stores exactly that string
in `localStorage`); it is reproduced here for compatibility, not chosen.

The server then emits one of:

| Event | Meaning |
|---|---|
| `auth:success` | Authenticated. Client must then emit `join:frontend`. |
| `auth:fail` | Rejected. |

Note this app uses `transports: ['websocket']` (WebSocket only). The newer
vendor build uses `['polling', 'websocket']`. WebSocket-only has worked
against both backends tested; if a future appliance refuses a direct upgrade,
adding `'polling'` as a fallback is the first thing to try.

### 4.2 Bootstrap sequence

After `auth:success`, the client emits `join:frontend` and then four
requests. Three use Socket.IO acknowledgement callbacks:

| Emit | Ack payload |
|---|---|
| `state:all` | `{ [channelId]: ChannelState }` — the full channel map |
| `get:systemName` | `string` — e.g. `lmc-tsaco-techex-uat-01a` |
| `get:config` | `{ options: { UIPort, pairAddress, isMain, ... } }` |
| `pair:status` | `boolean` — is the paired appliance reachable |

### 4.3 Server-pushed events

| Event | Payload | Meaning |
|---|---|---|
| `state:update` | `{ [channelId]: PartialChannelState }` | One or more channels changed |
| `pair:connected` | — | Paired appliance came up |
| `pair:disconnected` | — | Paired appliance went away |

`state:update` payloads are **partial** — only changed channels, and
potentially only changed fields within them. `mergeState()` is written
accordingly.

### 4.4 Commands (client → server)

```js
// src/backend.js
setAuto(ids, mode) {
  if (!ids.length) return;
  this.sock?.emit('switch:auto', ids, mode, true);
}

switchSource(ids, sourceLetter, isMain) {
  if (!ids.length) return;
  this.sock?.emit('switch:source', ids, sourceLetter, isMain);
}
```

| Event | Arguments |
|---|---|
| `switch:auto` | `(channelIds: string[], mode: "Auto" \| "Manual", true)` |
| `switch:source` | `(channelIds: string[], source: "A"\|"B"\|"C"\|"D", isMain: boolean)` |

Two details that cost debugging time and are easy to get wrong:

- `switch:auto` takes the mode as its **literal name string** — `"Auto"` or
  `"Manual"` — not a boolean. An earlier implementation here sent
  `true`/`false` and the backend ignored it.
- The trailing `true` on `switch:auto` is present in the vendor bundle. Its
  meaning is not known; it is sent verbatim.

Both take an **array** of channel ids, which is what makes gang switching a
single round trip.

There is **no lock event.** The lock is purely a client-side interlock; the
vendor app never tells the server about it, and neither does this one.

### 4.5 Channel state: two schema variants

A channel looks like this:

```js
{
  name: "601 - MTV UK",
  order: 1,
  logicBlocks: { ... },       // drives mode; see computeMode()
  main:   { /* leg — see below */ },
  backup: { /* leg — see below */ },
  sources: { A: "...", ... }  // newer builds only; human-readable source names
}
```

The **leg** (`main` / `backup`) is where the two builds diverge:

| Build | Leg shape | Example |
|---|---|---|
| Older (`172.23.191.27:5160`) | `PESSource`, `PESRequested`, `TSSource` enums | `{ PESSource: "One", PESRequested: "One", TSSource: "One" }` |
| Newer (`10.165.24.17:80`) | `source`, `requested` — already A/B/C/D | `{ source: "A", requested: "A" }` |

The older form encodes the display letter across two enum fields, decoded as:

```js
// src/protocol.js
export function sourceLabel(pesSource, tsSource) {
  switch (tsSource) {
    case 'One':  return pesSource === 'One' ? 'A' : 'B';
    case 'Two':  return 'C';
    case 'Three': return 'D';
    default:     return 'Unknown';
  }
}
```

`resolveLeg()` normalises both into the `{ path, requestedPath }` pair the
rest of the app uses:

```js
// src/protocol.js
export function resolveLeg(leg) {
  if (!leg) return { path: undefined, requestedPath: undefined };
  if (leg.source !== undefined) {
    return {
      path: leg.source,
      requestedPath: leg.requested === leg.source ? 'none' : leg.requested,
    };
  }
  return {
    path: sourceLabel(leg.PESSource, leg.TSSource),
    requestedPath: requestedLabel(leg),
  };
}
```

`requestedPath` is the string `'none'` when nothing is pending, otherwise the
letter being switched to but not yet confirmed by the hardware.

**Failure signature if this is wrong:** every channel displays `Unknown` and
the A/B/C/D buttons appear dead — because the UI never reflects the real
state, so clicks look like no-ops even though the emits are going out fine.
That is exactly how the newer-schema backend first presented.

### 4.6 Mode derivation

`mode` is not a field. It is computed from the channel's `logicBlocks`:

```js
// src/protocol.js
export function computeMode(logicBlocks) {
  if (!logicBlocks) return undefined;
  const values = Object.values(logicBlocks);
  if (!values.length) return undefined;
  const allManual = values.every(Boolean);
  const allAuto = values.every((v) => !v);
  return allManual ? 'Manual' : allAuto ? 'Auto' : 'Partial';
}
```

A channel has several independent logic blocks. All set → `Manual`; all
clear → `Auto`; mixed → `Partial`. `Partial` is a real state the hardware can
be in, not an error.

---

## 5. Code walkthrough

```
src/
├── protocol.js          pure protocol helpers, no I/O, no React
├── backend.js           Backend class — one per appliance
├── backendRegistry.js   the set of Backends + localStorage persistence
├── region.js            CCC/LMC/Other inference from appliance IP
├── config.js            groups + hidden channels (localStorage)
├── logStore.js          command audit log (localStorage, capped ring buffer)
├── lock.js              the shared UI safety interlock + countdown
├── useStore.js          React binding for the plain-object stores
├── App.jsx              region/group/page filtering, channel merge, wiring
├── styles.css
└── components/
    ├── ServerConfig.jsx     "Manage Servers" page
    ├── RegionTabs.jsx       CCC / LMC / Other + settings gear
    ├── GroupTabs.jsx        group filter; re-press toggles sort
    ├── Pagination.jsx       Page N buttons (30 channels per page)
    ├── ServerStatusRow.jsx  status of every server in the region
    ├── SettingsModal.jsx    channel visibility + group editing
    ├── RegionChallenge.jsx  confirmation for remote-region switches
    ├── ChannelTable.jsx     left pane: renders the ids it is given
    ├── ControlPanel.jsx     right pane: mode + ACO buttons
    └── LogView.jsx          the Logs page
```

### 5.0 Regions, groups and paging

**Region** (`region.js`) is inferred from each appliance's IP: `10.165.x` →
CCC, `10.144.x` → LMC, anything else → `Other`. The *home* region is the most
common known region among configured appliances; the app opens there.
Selecting a different region raises `RegionChallenge` first — switching site
is deliberate, because those channels are a different site's live output.

`Other` exists so appliances outside both ranges (the `172.23.191.x` UAT
boxes) stay reachable instead of silently disappearing from every tab. It is
only offered when such an appliance is configured.

**Groups** (`config.js`) are local presentation only — the backend knows
nothing about them. Membership is keyed by channel **name**, not id, so a
group survives an appliance being removed and re-added (which mints a new
backend id). Stored in `localStorage` under `gdc-channel-config` alongside
the hidden-channel list.

The store exposes full CRUD — `addGroup`, `renameGroup`, `removeGroup`,
`moveGroup` (tab order), `toggleChannelInGroup` and `setChannelsInGroup`
(bulk add/remove of everything currently listed). Names are unique
case-insensitively; `addGroup` returns `null` and `renameGroup` returns
`false` on a collision, which `SettingsModal` surfaces as an inline error.

**Sorting** has two modes, toggled by re-pressing the already-active group
tab. Note that `by name` sorts on `channelTitle()` — the name with its
leading number stripped — because every channel name begins with its own
number, so a raw alphabetical sort would just reproduce number order and the
control would appear to do nothing.

**Paging** is fixed at 30 rows (`PAGE_SIZE` in `Pagination.jsx`); the page
row only renders when there is more than one page. "Select All in View"
selects the current page, not the whole filtered set.

The pipeline in `App.jsx` runs region → group → hidden → search → sort →
page, and all of it is plain computation on every render rather than
memoised — see [§5.1](#51-state-management-why-there-is-no-redux).

### 5.1 State management: why there is no Redux

State lives in plain-JS singletons (`backendRegistry`, `configStore`,
`lockManager`, and each `Backend`), each implementing the same minimal
observable:

```js
onChange(fn) {
  this.listeners.add(fn);
  return () => this.listeners.delete(fn);   // unsubscribe
}

notify() {
  this.listeners.forEach((fn) => fn());
}
```

React subscribes through one small hook:

```js
// src/useStore.js
export function useStore(store) {
  const [, setTick] = useState(0);
  useEffect(() => store.onChange(() => setTick((n) => n + 1)), [store]);
  return store;
}
```

This is deliberate. The authoritative state is a live socket feed owned by
long-lived connection objects, not something React should own. The objects
mutate in place and signal "something changed"; components re-read what they
need on re-render. Introducing a reducer layer here would add ceremony
without changing behaviour.

The cost: mutation is in-place, so React's referential-equality
optimisations (`memo`, `useMemo` on these objects) will not work as expected.
At this scale — tens of channels, human-paced updates — that is irrelevant.
It would matter at thousands of rows.

**This is a trap worth naming.** An early version of the region/group/paging
pipeline wrapped the filtering in `useMemo` keyed on `backendRegistry.backends`
and `configStore.groups`. Both are arrays mutated in place, so their
references never change, so the memo never invalidated and the table served
stale channels. The filtering is now unmemoised on purpose. If you reach for
`useMemo` here, key it on something that actually changes identity, or don't.

### 5.2 `protocol.js`

Pure functions, no imports, no side effects: `sourceLabel()`,
`requestedLabel()`, `resolveLeg()`, `computeMode()`. All covered in
[§4](#4-protocol-specification).

Keeping these free of I/O and React is what makes the two-schema support
tractable — it is the only place that knows about wire formats.

### 5.3 `backend.js` — one connection per appliance

`Backend` owns a socket, an auth identity, and the channel state for a single
appliance.

**URL construction** accepts a bare host, a host with scheme, and an optional
port:

```js
function buildUrl(host, port) {
  const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  return port ? `${base}:${port}` : base;
}
```

So `10.165.24.17` + `80`, `https://10.165.24.17` + blank, and
`172.23.191.27` + `5160` all work.

**Connection error reporting.** socket.io-client retries silently and
indefinitely by default. Without an explicit handler, a wrong host, wrong
path, or TLS failure presents as a permanent "Connecting…" with no
diagnostic:

```js
this.sock.on('connect_error', (err) => {
  this.connecting = false;
  this.lastError = err?.message || String(err);
  this.notify();
});
```

`lastError` surfaces in the Manage Servers table. This was added after
exactly that dead-end.

**`mergeState()`** applies partial updates field by field:

```js
mergeState(id, raw) {
  const incoming = raw[id];
  if (!incoming) return;
  if (!this.state[id]) this.state[id] = {};
  const entry = this.state[id];
  if (incoming.name) entry.name = incoming.name;
  if (incoming.order) entry.order = incoming.order;
  if (incoming.logicBlocks) entry.mode = computeMode(incoming.logicBlocks);
  if (incoming.main) {
    entry.main = { ...incoming.main, ...resolveLeg(incoming.main) };
  }
  if (incoming.backup) {
    entry.backup = { ...incoming.backup, ...resolveLeg(incoming.backup) };
  }
}
```

Each field is guarded because `state:update` may carry only a subset.
A leg, when present, is replaced wholesale and re-resolved — legs are small
and always sent complete.

The same method serves both `state:all` and `state:update`; the bulk load is
just a merge over an empty map.

### 5.4 `backendRegistry.js` — the set of appliances

Holds the `Backend` list, persists it, and restores it on load.

```js
const STORAGE_KEY = 'techex-servers';
```

Persistence writes the connection fields plus the appliance's last-known
identity — never live socket or channel state:

Each entry holds `{id, label, host, port, username, password}` plus
`{systemName, isMain, pairAddress}` — the identity the appliance reported
last time it was reachable, which is what lets a downed server still render
as a named Main/Backup pair.

Those identity fields only become known after connecting, so the registry
re-persists when they change. That is guarded on an actual change, because
`notify()` also fires on every `state:update` and would otherwise write to
`localStorage` several times a second:

```js
// src/backendRegistry.js
  track(backend) {
    let seen = `${backend.pairAddress}|${backend.isMain}|${backend.systemName}`;
    backend.onChange(() => {
      const now = `${backend.pairAddress}|${backend.isMain}|${backend.systemName}`;
      if (now !== seen) {
        seen = now;
        persist(this.backends);
      }
      this.notify();
    });
  }
```

**Credentials are stored in plaintext.** This matches the vendor app's own
handling of its token. It is a deliberate compatibility choice, documented
rather than hidden — see [INSTALLATION.md §14](INSTALLATION.md#14-what-does-not-carry-across-installs).

Ids avoid `crypto.randomUUID()`, which requires a secure context. The app is
routinely served over plain HTTP to a LAN IP, where that API is undefined:

```js
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

`restore()` reconnects every saved backend at page load; `add()` and
`remove()` connect/disconnect and re-persist.

### 5.5 `lock.js` — the safety interlock

```js
const LOCK_TIMEOUT_MS = 60 * 1000;
const AUTO_LOCK_ENABLED = true;
```

One lock for the whole app, not per backend. Controls start **locked** and
re-lock after 60 s of inactivity. `App.jsx` feeds it activity:

```js
document.addEventListener('click', () => lockManager.refreshLock());
document.addEventListener('keyup', () => lockManager.refreshLock());
```

`refreshLock()` is a no-op while locked or when disabled, so the timer only
runs when it can actually do something.

This is **UI-only** — it is not enforced by the backend, which will happily
accept commands from any authenticated client. It prevents stray clicks, not
unauthorised access.

Setting `AUTO_LOCK_ENABLED = false` disables auto-locking and starts
unlocked; the manual Lock/Unlock button keeps working. Useful during
development, and it was off for part of the testing phase — an unlabelled
re-lock mid-test is very easy to misread as "buttons randomly stopped
working".

### 5.6 `App.jsx` — merging and routing

Channels from all backends are flattened into one map with a compound key:

```js
function mergeChannels(backends) {
  const merged = {};
  backends.forEach((backend) => {
    Object.keys(backend.state).forEach((channelId) => {
      merged[`${backend.id}:${channelId}`] = {
        ...backend.state[channelId],
        backend,          // live object reference, used to route commands
        backendId: backend.id,
        backendLabel: backend.label,
        channelId,        // original per-appliance id, for emits
      };
    });
  });
  return merged;
}
```

Two ids matter and must not be confused:

- the compound `"<backendId>:<channelId>"` — used for **selection and React
  keys**, unique across appliances;
- the original `channelId` — the only thing the backend understands, so it is
  what gets emitted.

Different appliances legitimately use the same channel ids. Without the
compound key, selecting channel `601` on one appliance would select it on all
of them.

Each merged channel also carries a direct reference to its `Backend`, which
is what makes command routing trivial downstream.

### 5.7 `ControlPanel.jsx` — aggregation and fan-out

Two helpers do the interesting work.

**`commonValue()`** decides what a button should show for a selection that
may span many channels:

```js
function commonValue(channels, ids, getter) {
  if (!ids.length) return undefined;
  const values = ids.map((id) => getter(channels[id])).filter((v) => v !== undefined);
  if (!values.length) return undefined;
  return values.every((v) => v === values[0]) ? values[0] : null;
}
```

All selected channels agree → that value, and the button highlights.
They disagree → `null`, and nothing highlights. A mixed selection therefore
shows no active state rather than an arbitrary one.

**`groupByBackend()`** splits a selection by appliance so each gets one call
containing only its own ids:

```js
function groupByBackend(channels, ids) {
  const groups = new Map();
  ids.forEach((id) => {
    const ch = channels[id];
    if (!ch) return;
    if (!groups.has(ch.backend)) groups.set(ch.backend, []);
    groups.get(ch.backend).push(ch.channelId);
  });
  return groups;
}

function switchSource(sourceLetter, isMain) {
  groupByBackend(channels, selected)
    .forEach((ids, backend) => backend.switchSource(ids, sourceLetter, isMain));
}
```

Note the `Map` is keyed by the `Backend` **object**, so the value is both the
grouping key and the thing the command is issued on.

Button styling carries two independent flags:

```js
className={[
  mainPath === s && 'active',
  mainRequested === s && mainRequested !== 'none' && 'requested',
].filter(Boolean).join(' ')}
```

`active` = the hardware's current source. `requested` = a pending switch not
yet confirmed. They are visually distinct on purpose.

### 5.8 `ChannelTable.jsx`

Filters by the search box, sorts by appliance label then the backend-supplied
`order`, and flags desync:

```js
const outOfSync = ch.main?.path !== ch.backup?.path;
```

Selection respects gang mode: with it off, a click replaces the selection;
with it on, a click toggles that row in or out.

### 5.9 `ServerConfig.jsx`

The add/remove form and status table. Status text is derived, in priority
order:

```js
function statusText(backend) {
  if (backend.connecting) return 'Connecting…';
  if (backend.authFailed) return 'Login failed';
  if (backend.connected) return `Connected — ${Object.keys(backend.state).length} channels`;
  if (backend.lastError) return `Connection error: ${backend.lastError}`;
  return 'Disconnected';
}
```

The channel count doubles as confirmation that bootstrap actually completed,
not just that the socket opened.

### 5.10 `ServerStatusRow.jsx`

Every configured appliance is half of a changeover pair, so every one renders
**exactly two boxes** — always, regardless of connection state:

| Box | Identity | Role | Status from |
|---|---|---|---|
| self | `systemName` | `isMain` | the socket connection |
| partner | `pairAddress` | inverse of `isMain` | `pair:status` / `pair:*` events |

The partner's state is reported *by* the appliance, so it is only meaningful
while we are connected to it. Otherwise the box reads `Unknown` and dims —
saying `Disconnected` would claim a leg is down when we simply cannot see it.

`isMain` and `pairAddress` come from `config.options`, which only arrives
after a successful connection. `Backend` therefore exposes them as getters
that fall back to values persisted in `localStorage`
([§5.4](#54-backendregistryjs--the-set-of-appliances)):

```js
get pairAddress() {
  return this.config?.options?.pairAddress ?? this.savedPairAddress ?? null;
}
```

That way an appliance that is down still renders as a *named* Main/Backup
pair from what was learned last time, instead of one anonymous box. Only a
server that has never once connected shows the placeholder
`Paired appliance — Unknown`, italicised so it is clearly a slot rather than
a known machine.

This component has been through three revisions worth knowing about: the
original `PairStatus.jsx` rendered only *connected* backends and guessed at
pair semantics; a second dropped the partner box entirely and lost backup
visibility altogether; this one always shows both legs and distinguishes
"partner is down" from "we cannot see the partner".

---

### 5.11 `logStore.js` — the audit log, and deriving a "response"

Records every command and connection event to `localStorage`
(`gdc-command-log`, newest first, capped at 500), along with a stable
per-browser id and an operator-supplied workstation label.

The interesting problem is what counts as a **response**. The protocol has
**no acknowledgement** on `switch:auto` / `switch:source`
([§4.4](#44-commands-client--server)), and the vendor UI does not use one
either. Two mechanisms cover it:

**1. An ack callback is passed anyway.** Socket.IO treats a trailing
function as an ack handler and does *not* transmit it as an argument, so the
appliance still receives exactly the three it expects. This is free
insurance if firmware ever starts acknowledging; today it never fires.

**2. State correlation — the one that actually works.** When a command goes
out, `Backend.awaitConfirmation()` records what the commanded channels
should look like. `checkPending()` runs on every `state:update` and, once
they match, resolves the log entry with the observed value and elapsed time:

```
Applied — main=B — confirmed after 1154 ms
```

If nothing matching arrives within `CONFIRM_TIMEOUT_MS` (15 s) the entry
becomes `unconfirmed`. That distinction is the point of the whole design: it
separates "the command was sent" from "the hardware actually did it", which
is precisely the failure mode seen on channel 603
([§7](#7-observed-backend-behaviour-and-known-quirks)) where a switch was
silently ignored.

**Scope limits, by construction.** There is no server of ours, so the log is
per-browser: it does not see a colleague's commands, the vendor UI's
commands, or autonomous changeovers by the hardware. And a browser cannot
read its own IP — there is no API for it, and WebRTC's old leak is
mDNS-obfuscated in current Chrome — so the "initiator" is the appliance
username plus the browser id, with an optional operator-set workstation
label standing in for an address. A genuine initiator IP requires a
server-side collector observing the source address.

---

## 6. End-to-end: what a source switch does

Operator has channels `601` (appliance A) and `705` (appliance B) selected in
gang mode, and clicks **Main ACO → B**.

1. `ControlPanel.switchSource('B', true)`.
2. `groupByBackend()` produces `Map { BackendA => ['601'], BackendB => ['705'] }`.
3. Two emits, one per appliance:
   `switch:source(['601'], 'B', true)` and `switch:source(['705'], 'B', true)`.
4. Each backend commands its hardware. **No acknowledgement is expected** —
   these emits have no callback.
5. Each appliance pushes `state:update` as its hardware reports progress.
   Typically the leg first shows `requested = "B"` (button gains the dashed
   `requested` outline), then `source = "B"` once confirmed (button becomes
   solid `active`).
6. `mergeState()` folds each update in and calls `notify()`.
7. `useStore` re-renders; the table and buttons show the new state.

Channels do not all transition simultaneously — each confirms independently,
which is why the intermediate "requested" state exists and is rendered rather
than hidden.

The UI never optimistically assumes success. Everything displayed is a state
the backend reported.

---

## 7. Observed backend behaviour and known quirks

Recorded from live testing against UAT appliances. These are **backend or
hardware behaviours**, not frontend bugs, and are documented so they are not
re-investigated as such.

**Main and Backup legs are not always independent.** On channel 603
(`172.23.191.27`, then at Main=B, Backup=A), clicking **Main ACO → A**
produced no change at all — no pending indicator, nothing. Clicking **Backup
ACO → B** worked immediately and brought *both* legs to B. The frontend sends
a correct, distinct `isMain` flag for each panel; one direction simply did
nothing at the appliance while the structurally identical reverse worked.

Likely signal-presence dependent — a leg may refuse a source it has no valid
input for. Verify against the vendor UI before treating a recurrence as a
regression here.

**"TSACOS OUT OF SYNC" is a fault indicator, not a mode.** Main and Backup
are expected to track together, which is consistent with the mirroring above.
A mismatch means something is wrong, not that someone configured a split.

**Multi-channel switches apply progressively.** A gang switch is one emit per
appliance, but the hardware works through channels individually. Watching
rows update one at a time is normal.

**Appliance software versions differ in the field.** Two builds with
different channel-state schemas were found across two UAT appliances (see
[§4.5](#45-channel-state-two-schema-variants)). Assume a newly added
appliance may differ again; `resolveLeg()` is the extension point.

**The newer build sends a `sources` map** of letter → human-readable source
name. This app does not display it. Surfacing it would be a small change in
`ChannelTable.jsx` and is probably worth doing.

---

## 8. Build and bundle

Vite 5 + React 18. Three runtime dependencies: `react`, `react-dom`,
`socket.io-client`.

```bash
npm run dev      # dev server, hot reload, port 5173
npm run build    # -> dist/
npm run preview  # serve dist/ (what the systemd unit runs)
```

Output is roughly 197 KB of JS (62 KB gzipped), 2.3 KB CSS, from 69 modules.
Asset filenames are content-hashed; `index.html` is not and must never be
cached.

There is no test suite, no linter config, and no TypeScript. For a codebase
of this size and a protocol verified against live hardware, the practical
check has been the build plus manual verification against a UAT appliance.
Adding tests around `protocol.js` would be the highest-value first step, as
it is pure, self-contained, and where the subtle correctness lives.

---

## 9. Extending the app

**A third channel-state schema** → extend `resolveLeg()` in `protocol.js`.
Nothing else should need to change. Detect on a distinguishing field, as the
current code does with `leg.source !== undefined`.

**Show source names** (newer builds) → `sources` already arrives and is
preserved by `mergeState()`; render `ch.sources?.[ch.main.path]` in
`ChannelTable.jsx`.

**Per-backend locks** instead of one global → `lock.js` is a singleton;
move an instance onto `Backend` and thread it through `ControlPanel`.

**Server-side or shared configuration** → replace the `localStorage` layer in
`backendRegistry.js` (`loadSavedServers` / `persist`). Worth doing if
plaintext credentials on every workstation becomes unacceptable; it would
also make server lists follow operators between machines.

**A new protocol event** → add the listener in `Backend.bootstrap()`, store
on `this`, call `this.notify()`. The React layer picks it up with no wiring.

---

## Related documents

- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — file-by-file reference, what is
  safe to edit, change recipes and known traps.
- [INSTALLATION.md](INSTALLATION.md) — installing Docker, deploying,
  upgrading, working inside the container.
- [USER-GUIDE.md](USER-GUIDE.md) — operating the UI.
