# Global TSACO Control — Developer Guide

Last updated: 2026-09-25 · applies to v0.3.0

Everything needed to make a change to this codebase safely: how to get set
up, what every file does and whether you should touch it, step-by-step
recipes for the changes most likely to be asked for, and the traps that have
already caught someone.

**Companion documents**

- [ARCHITECTURE.md](ARCHITECTURE.md) — the reverse-engineered Socket.IO
  protocol and the design reasoning. Read §4 before touching anything that
  talks to an appliance.
- [INSTALLATION.md](INSTALLATION.md) — Docker, systemd, deployment.
- [USER-GUIDE.md](USER-GUIDE.md) — what operators see.

---

## Contents

1. [Getting set up](#1-getting-set-up)
2. [The 60-second mental model](#2-the-60-second-mental-model)
3. [Complete file reference](#3-complete-file-reference)
4. [Change recipes](#4-change-recipes)
5. [Traps](#5-traps)
6. [Verifying a change](#6-verifying-a-change)
7. [Shipping a change](#7-shipping-a-change)

---

## 1. Getting set up

Node lives **user-locally** on the current host — it is not a system package:

```bash
export PATH="/data/victoria/toolchain/node/bin:$PATH"
node --version    # v24.19.0
```

Put that `export` in your shell profile. Then:

```bash
cd /data/victoria/techex-ui-replica
npm install
npm run dev       # http://<host>:5173 with hot reload
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server, hot module reload. Use this while developing. |
| `npm run build` | Production bundle into `dist/`. |
| `npm run preview` | Serves the built `dist/` on 5173 — what the systemd unit runs. |

There is **no test suite, no linter and no TypeScript**. The practical check
is: does it build, and does it behave against a UAT appliance. See
[§6](#6-verifying-a-change).

> The deployed service runs `preview`, not `dev`, so **there is no hot reload
> in the deployment**. After changing code you must rebuild *and* restart —
> see [§7](#7-shipping-a-change).

---

## 2. The 60-second mental model

```
 Techex appliance ──socket.io──┐
 Techex appliance ──socket.io──┤
                               ▼
                    ┌──────────────────────┐
                    │ Backend (one each)   │  connection + channel state
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ backendRegistry      │  the list, + localStorage
                    └──────────┬───────────┘
                               ▼
                               │  commands out, responses back
                               ▼
                         logStore (audit log)

   configStore ────────► App.jsx ◄──────── lockManager
   (groups, hidden)      │  merge → filter → sort → paginate
                         ▼
        ChannelTable + ControlPanel + LogView + …
```

Four things to internalise:

1. **The browser talks to the appliances, not the web server.** The server
   only ships files. ([why this matters](ARCHITECTURE.md#3-where-the-connections-actually-happen))
2. **State lives in plain-JS singletons**, not React. They mutate in place
   and call `notify()`; `useStore()` re-renders on that signal.
3. **`App.jsx` owns all filtering.** Components render what they are given.
4. **Nothing is optimistic.** Everything displayed is state an appliance
   reported.

---

## 3. Complete file reference

Legend for **Edit?**

| Symbol | Meaning |
|---|---|
| 🟢 | Safe — routine, self-contained changes |
| 🟡 | Careful — understand the surrounding contract first |
| 🔴 | Risky — protocol- or safety-critical; verify against a UAT appliance |
| ⚫ | Generated / do not hand-edit |

### 3.1 Application source — `src/`

#### `src/main.jsx` — 10 lines · 🟢
React entry point. Mounts `<App/>` into `#root` and imports the stylesheet.

*Edit to:* add a global provider or error boundary.
*Do not:* put app logic here, or re-add a `window.*` debug hook in a
committed build.

---

#### `src/App.jsx` — 232 lines · 🟡 **the hub**
The only place that composes everything. Owns:

- **UI state** — `selected`, `gangSelect`, `view`, `activeRegion`,
  `pendingRegion`, `activeGroup`, `sortBy`, `page`, `search`, `settingsOpen`.
- **`mergeChannels()`** — flattens all backends' channels into one map keyed
  `"<backendId>:<channelId>"`, attaching `backend`, `backendLabel` and the
  original `channelId`.
- **`channelNumber()` / `channelTitle()`** — sort keys.
- **The filter pipeline** (lines ~98–120): region → hidden → group → search →
  sort → page.
- **Region switching** with the remote-region challenge.

*Edit to:* add a filter, change the pipeline order, add a panel, change what
`Select All in View` means.
*Careful:* the pipeline is **deliberately unmemoised** — see
[trap 1](#trap-1-usememo-over-mutated-stores). Two different ids exist
(compound vs `channelId`); mixing them up is
[trap 2](#trap-2-compound-id-vs-channelid).

---

#### `src/backend.js` — 283 lines · 🔴 **protocol**
One instance per appliance. Owns the Socket.IO connection, auth, channel
state, and the two command emits.

Key members:

| Member | Purpose |
|---|---|
| `connect()` | Opens the socket, wires `connect_error` / `auth:fail` / `auth:success` |
| `bootstrap()` | `state:all`, `get:systemName`, `get:config`, `pair:status`, and the `state:update` / `pair:*` listeners |
| `mergeState(id, raw)` | Folds a full or partial channel update into `this.state` |
| `setAuto(ids, mode)` | Emits `switch:auto` — mode is the **string** `"Auto"`/`"Manual"` |
| `switchSource(ids, letter, isMain)` | Emits `switch:source` |
| `get pairAddress()` / `get isMain()` | Live value, falling back to the persisted last-known one |
| `get address()` | `host:port`, for the log's Destination column |
| `buildUrl(host, port)` | Accepts bare host, `https://host`, optional port |
| `logEvent(...)` | Records a connection/auth event in the audit log |
| `awaitConfirmation(...)` / `checkPending()` | Correlates a following `state:update` back to the command that caused it, resolving the log entry |

*Edit to:* handle a new server event, add a command, adjust reconnect
behaviour.
*Do not* change emit names, argument order or argument types without
re-reading [ARCHITECTURE §4.4](ARCHITECTURE.md#44-commands-client--server).
Sending a boolean instead of `"Auto"` is a real bug that already happened and
fails **silently** — the appliance just ignores it.

---

#### `src/protocol.js` — 52 lines · 🔴 **pure, and the subtle bit**
No imports, no I/O, no React. Normalises wire formats:

| Function | Does |
|---|---|
| `sourceLabel(pes, ts)` | Old-schema enums → `A`/`B`/`C`/`D`/`Unknown` |
| `requestedLabel(leg)` | `'none'` or the pending letter (old schema) |
| `resolveLeg(leg)` | **Handles both schemas** → `{path, requestedPath}` |
| `computeMode(logicBlocks)` | all set → `Manual`, all clear → `Auto`, mixed → `Partial` |

*Edit to:* support a third appliance schema — this is the designed extension
point, and nothing else should need to change.
*Test it first:* this file is pure, so it is the one place you can check
logic in `node -e` without a browser or an appliance.

---

#### `src/backendRegistry.js` — 101 lines · 🟡
The list of `Backend`s, plus `localStorage` persistence under
**`techex-servers`**.

- `restore()` — recreate and reconnect saved appliances at page load
- `add()` / `remove()` — with re-persist
- `track(backend)` — subscribes and re-persists **only when identity
  changes** (`pairAddress` / `isMain` / `systemName`)

*Edit to:* move config to a server, add import/export, add a manual pair
override.
*Careful:* `track()`'s change-guard exists because `notify()` also fires on
every `state:update`; removing it writes to `localStorage` several times a
second. Persisted entries hold **plaintext credentials** — see
[ARCHITECTURE §5.4](ARCHITECTURE.md#54-backendregistryjs--the-set-of-appliances).

---

#### `src/config.js` — 125 lines · 🟢
Groups and hidden channels, stored under **`gdc-channel-config`**.
Full CRUD: `addGroup`, `renameGroup`, `removeGroup`, `moveGroup`,
`toggleChannelInGroup`, `setChannelsInGroup`, `setChannelHidden`, plus
`isInGroup` / `isHidden`.

*Edit to:* add per-group settings, change the storage shape (handle old data
in `load()`), add export/import.
*Note:* membership is keyed by channel **name**, not id, so groups survive an
appliance being removed and re-added. Changing that key breaks everyone's
saved groups.

---

#### `src/region.js` — 50 lines · 🟢
`CCC` = `10.165.x`, `LMC` = `10.144.x`, everything else `Other`.
`regionForHost()`, `regionForBackend()`, `detectHomeRegion()`,
`availableRegions()`.

*Edit to:* add a site or change an IP range — just extend the `PREFIXES`
array. `Other` is intentional: without it, appliances outside both ranges
would be invisible on every tab.

---

#### `src/logStore.js` — 136 lines · 🟢
The command audit log, in `localStorage` under **`gdc-command-log`** (ring
buffer, newest first, capped at `MAX_ENTRIES = 500`). Also owns the
per-browser id (`gdc-browser-id`) and the operator's workstation label
(`gdc-workstation`).

`log(entry)` returns an id; `resolve(id, {status, response})` attaches the
outcome later. `toCsv()` backs the export buttons. `persist()` degrades
gracefully on a quota error by dropping the oldest half rather than losing
new events.

*Edit to:* change retention, add fields, add an export format.
*Note:* this is **browser-local**. A central audit trail needs a server
component — see the caveat in [§4](#4-change-recipes).

---

#### `src/lock.js` — 58 lines · 🔴 **safety**
The single UI interlock. `AUTO_LOCK_ENABLED` and `LOCK_TIMEOUT_MS` at the
top; `secondsRemaining()` drives the countdown; a 1 s `setInterval` runs
**only while unlocked**.

*Edit to:* change the timeout, or make the lock per-region.
*Understand:* this is **client-side only** — the appliance accepts commands
from any authenticated client regardless. It prevents stray clicks, not
unauthorised access. Turning `AUTO_LOCK_ENABLED` off in a deployed build
removes a real safety net on live transmission.

---

#### `src/useStore.js` — 8 lines · 🟡
The whole React binding. Subscribes to a store's `onChange` and bumps a
counter to force re-render. Small, load-bearing, rarely needs changing.

---

#### `src/styles.css` — 232 lines · 🟢
All styling; no CSS modules, no framework. Roughly in order: layout,
channel table, region/group/page tabs, server status, modals, controls.

Useful hooks:

| Selector | Controls |
|---|---|
| `.path.A` / `.B` / `.C` / `.D` | Source letter colours (green / orange / red / red) |
| `.switches button` | Size of the big A–D buttons |
| `.channelRow.selected` | Selection outline |
| `.status.desync` | The red OUT OF SYNC cell |
| `.serverBox.unknown` / `.muted` | Unknown partner state |
| `button.active` / `.requested` | Active vs pending switch |

---

### 3.2 Components — `src/components/`

All are presentational and take props; none fetch or filter. `App.jsx` does
that.

| File | Lines | Edit? | Responsibility |
|---|---|---|---|
| `ChannelTable.jsx` | 63 | 🟢 | Renders `visibleIds` in the order given, plus the search box. Computes `outOfSync`. **Add a column here.** |
| `ControlPanel.jsx` | 117 | 🔴 | Gang/lock/select buttons, Auto-Manual, the A–D ACO grids. Contains `commonValue()` (mixed selections show nothing) and `groupByBackend()` (fans one click out to several appliances). **This is what actually issues switch commands.** |
| `ServerStatusRow.jsx` | 84 | 🟡 | Two boxes per appliance — itself and its partner. Distinguishes `Unknown` (we can't see it) from `Disconnected` (it's down). |
| `SettingsModal.jsx` | 210 | 🟢 | Group CRUD, reordering, bulk add/remove, channel visibility. |
| `ServerConfig.jsx` | 83 | 🟢 | "Manage Servers" — add/remove appliances and their status. |
| `GroupTabs.jsx` | 31 | 🟢 | Group filter. Re-pressing the active tab toggles sort. Exports `ALL_GROUP`. |
| `RegionTabs.jsx` | 20 | 🟢 | CCC / LMC / Other plus the settings gear. |
| `Pagination.jsx` | 15 | 🟢 | Page buttons. Exports **`PAGE_SIZE = 30`**. Renders nothing when there is one page. |
| `LogView.jsx` | 129 | 🟢 | The Logs page: filter, row expansion showing exact emit arguments, CSV/JSON export, clear. |
| `RegionChallenge.jsx` | 22 | 🟡 | The remote-region confirmation. Deliberately a deliberate act. |

---

### 3.3 Build, packaging and config

| File | Edit? | Notes |
|---|---|---|
| `index.html` | 🟢 | Shell + `<title>`. |
| `vite.config.js` | 🟡 | Dev-server host/port. No proxy — appliances are reached directly by the browser. |
| `package.json` | 🟡 | Deps, scripts, version. Bump `version` for a release. |
| `package-lock.json` | ⚫ | Regenerate with `npm install`, never hand-edit. |
| `Dockerfile` | 🟡 | Two-stage build. **Uses explicit `COPY`, not `COPY . .`** — a new top-level file the build needs must be added here. |
| `nginx.conf` | 🟡 | Serving, SPA fallback, `/healthz`, cache rules. `index.html` must stay `no-store`. |
| `docker-compose.yml` | 🟢 | Ports, restart policy, log caps. |
| `.dockerignore` | 🟢 | Keeps the build context ~140 KB. |
| `dist/` | ⚫ | Build output. |
| `node_modules/` | ⚫ | Dependencies. |
| `docs/`, `README.md` | 🟢 | Keep in step with code — see [§7](#7-shipping-a-change). |

---

### 3.4 Things that live outside this directory

| Thing | Where | Notes |
|---|---|---|
| Node toolchain | `/data/victoria/toolchain/node` | User-local, not a system package |
| systemd unit | `~/.config/systemd/user/global-tsaco-control.service` | User service; `enable-linger` is on |
| Appliance list | Browser `localStorage` → `techex-servers` | Per browser, includes plaintext credentials |
| Groups / hidden | Browser `localStorage` → `gdc-channel-config` | Per browser |

---

## 4. Change recipes

### Add a column to the channel table
1. `ChannelTable.jsx` — add a `<th>` and a matching `<td>`.
2. `styles.css` — width/alignment if needed.
3. If the value isn't already on the channel object, make sure
   `Backend.mergeState()` keeps that field.

### Change the source letter colours
`styles.css`, the `.path.A` / `.B` / `.C` / `.D` block. Both Main and Backup
columns share it; the cells also carry `.leg-main` / `.leg-backup` if you
ever need to differentiate again.

### Change page size
`PAGE_SIZE` in `Pagination.jsx`. `App.jsx` imports it; nothing else needs
touching.

### Change the lock timeout
`LOCK_TIMEOUT_MS` in `lock.js`. The countdown follows automatically.

### Add a region / change an IP range
`PREFIXES` in `region.js`. Tabs, filtering and the challenge all derive from
it.

### Support a new appliance schema
`resolveLeg()` in `protocol.js`. Detect on a distinguishing field, as the
current code does with `leg.source !== undefined`. **Symptom that you need
this:** every channel shows `Unknown` and the A–D buttons appear dead.

### Show the human-readable source names
Newer appliances send a `sources` map (`{A: "...", …}`). It already survives
`mergeState()`. Render `ch.sources?.[ch.main.path]` in `ChannelTable.jsx`.

### Handle a new server-pushed event
1. `Backend.bootstrap()` — `sock.on('thing:happened', …)`, store on `this`,
   call `this.notify()`.
2. Read it in a component. No other wiring: `useStore` picks it up.

### Add a command the operator can send
1. Add a method to `Backend` alongside `setAuto` / `switchSource`.
2. In `ControlPanel.jsx`, route through `groupByBackend()` so a
   multi-appliance selection fans out correctly.
3. Verify the exact emit signature against the vendor bundle first.

### Understand how a command's "response" is captured
The protocol has **no acknowledgement** on `switch:auto` / `switch:source` —
the vendor UI doesn't use one either. So `Backend` derives the response two
ways:

1. **An ack callback is passed anyway.** Socket.IO treats a trailing
   function as an ack handler and does *not* send it as an argument, so the
   appliance still receives exactly the three it expects. If a future
   firmware ever acks, it is captured for free.
2. **State correlation**, which is the one that actually fires.
   `awaitConfirmation()` records what the commanded channels should look
   like; `checkPending()` runs on every `state:update` and, when they match,
   resolves the log entry with the observed value and the elapsed time
   (`main=B — confirmed after 1154 ms`). A `CONFIRM_TIMEOUT_MS` timer marks
   it `unconfirmed` if nothing arrives.

That second mechanism is why the log can distinguish "sent" from "actually
took effect" — which is exactly the failure mode seen on channel 603
([ARCHITECTURE §7](ARCHITECTURE.md#7-observed-backend-behaviour-and-known-quirks)).

### Make the log central rather than per-browser
Today the log is browser-local, because there is no server of ours. A shared
audit trail needs a collector — POST each entry from `logStore.log()` to an
endpoint, keeping the local buffer as a fallback for when it is unreachable.
Note also that **the browser cannot determine its own IP**, so a true
"initiator IP" column only becomes possible once a server is observing the
source address of those POSTs. Until then the workstation label is the
substitute.

### Move config off the browser
Replace `loadSavedServers()` / `persist()` in `backendRegistry.js` and the
`load()` / `persist()` pair in `config.js`. Everything else is unaware of
where the data came from. Worth doing if plaintext credentials on every
workstation becomes unacceptable.

---

## 5. Traps

### Trap 1: `useMemo` over mutated stores
The stores mutate arrays and objects **in place** and then call `notify()`.
Their identity never changes, so a `useMemo` keyed on them never invalidates
and silently serves stale data. This exact bug shipped once: the filter
pipeline was memoised on `backendRegistry.backends` and the table stopped
updating. The pipeline is now plain computation on every render — that is
intentional, not an oversight.

### Trap 2: compound id vs `channelId`
`"<backendId>:<channelId>"` is for **selection and React keys** — unique
across appliances. The bare `channelId` is the **only thing an appliance
understands** and is what must be emitted. Appliances genuinely reuse channel
numbers, so confusing these switches the wrong channel on the wrong site.

### Trap 3: `switch:auto` takes a string
`"Auto"` / `"Manual"`, not a boolean. A boolean is silently ignored — no
error, no state change, looks like a dead button.

### Trap 4: the lock hides real behaviour
While testing, an unnoticed auto-lock looks exactly like broken buttons. The
countdown was added for this reason. Check the lock before debugging a
"dead" control.

### Trap 5: `crypto.randomUUID()` is unavailable
It needs a secure context; this app is routinely served over plain HTTP to a
LAN IP. `generateId()` in `backendRegistry.js` and `config.js` exists for
that reason — don't "modernise" it.

### Trap 6: sorting by raw name does nothing
Every channel name begins with its number, so alphabetical order equals
number order. `channelTitle()` strips the prefix; without it the sort toggle
appears broken.

### Trap 7: `index.html` must never be cached
It points at content-hashed assets. A cached copy pins clients to an old
bundle after deploy — on a control surface, that is people operating a stale
UI. `nginx.conf` sets `no-store`; keep it.

---

## 6. Verifying a change

There are no automated tests, so verification is deliberate:

**1. It builds.**
```bash
npm run build
```

**2. Pure logic — check directly.** `protocol.js` has no imports, so:
```bash
node --input-type=module -e "
import('./src/protocol.js').then(({computeMode, resolveLeg}) => {
  console.log(computeMode({a:true,b:true}));            // Manual
  console.log(computeMode({a:false,b:false}));          // Auto
  console.log(computeMode({a:true,b:false}));           // Partial
  console.log(resolveLeg({source:'B', requested:'B'})); // path B, none
});"
```

**3. In the browser, against UAT.** Load the app, open the console (F12), and
confirm no errors. Exercise the specific path you changed.

**4. Never verify a switching change on production channels.** Use a UAT
appliance. Every switch goes to air immediately.

---

## 7. Shipping a change

```bash
export PATH="/data/victoria/toolchain/node/bin:$PATH"
cd /data/victoria/techex-ui-replica
npm run build
systemctl --user restart global-tsaco-control.service
systemctl --user status global-tsaco-control.service
```

Then hard-reload the browser (Ctrl+Shift+R) — operators must reload to pick
up a new bundle.

Docker deployments: `docker compose up -d --build`. See
[INSTALLATION.md](INSTALLATION.md).

Before you call it done:

- [ ] `npm run build` clean
- [ ] Verified in a browser against a UAT appliance
- [ ] No `window.*` debug hooks left in `main.jsx`
- [ ] Docs updated if behaviour changed — `USER-GUIDE.md` for anything an
      operator sees, `ARCHITECTURE.md` for protocol or design, this file for
      new files or new traps
- [ ] `package.json` version bumped for a meaningful release
