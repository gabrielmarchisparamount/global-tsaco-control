# Global TSACO Control

A web panel for Techex TSACO (Transport Stream Automatic ChangeOver) control,
built as a from-scratch replacement for the vendor "Engineer UI".

It speaks the same Socket.IO protocol as the vendor panel, against the
vendor's own **unmodified backends** — no hardware-control logic was
reimplemented, because that layer lives on the appliance and is not visible
to a browser.

What it adds over the vendor UI:

- **Multiple appliances at once**, merged into one channel list, with
  switching routed to the right appliance automatically.
- **Regions** — CCC and LMC, inferred from appliance IPs, with a confirmation
  challenge before operating on a remote site.
- **Custom groups**, channel hiding, paging, and sorting by number or name.
- A visible **countdown** on the safety lock.
- A **command log** recording every switch with the appliance's confirmation
  and how long it took — including when a command was *not* confirmed.

> Throughout the documentation, "Engineer UI" refers to the *vendor's*
> product. Global TSACO Control is the replacement frontend in this repo.

---

## Documentation

| Document | For |
|---|---|
| **[docs/USER-GUIDE.md](docs/USER-GUIDE.md)** | Operators. Adding appliances, regions, groups, selecting channels, switching sources, the lock, OUT OF SYNC, troubleshooting. |
| **[docs/INSTALLATION.md](docs/INSTALLATION.md)** | Deploying. Installing Docker from scratch, building, running, working inside the container, the systemd alternative, upgrade and rollback. |
| **[docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md)** | Changing the code. Every file listed with what may be edited and how risky it is, change recipes, known traps, verification. |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Understanding it. Full protocol spec, module-by-module walkthrough, backend quirks, design rationale. |

New to the codebase? **DEVELOPER-GUIDE** first for orientation and the file
map, then **ARCHITECTURE §4** before touching anything that talks to an
appliance.

---

## Quick reference

**Running deployment:** `http://172.23.191.54:5173/` — systemd user service.

```bash
systemctl --user status global-tsaco-control.service
```

**Rebuild and redeploy** (there is no hot reload):

```bash
export PATH="/data/victoria/toolchain/node/bin:$PATH"
cd /data/victoria/techex-ui-replica && npm run build
systemctl --user restart global-tsaco-control.service
```

**Docker** (packaging written, but never yet built — see
[INSTALLATION.md §5](docs/INSTALLATION.md#5-part-3--build-and-deploy)):

```bash
docker compose up -d --build
```

---

## Three things that surprise people

1. **The web server never talks to a Techex appliance.** It serves static
   files; the browser opens every Socket.IO connection itself. So the
   hosting host needs no route to the appliances — the *operator
   workstations* do. ([details](docs/ARCHITECTURE.md#3-where-the-connections-actually-happen))

2. **Appliance lists and channel groups live in the browser**, in
   `localStorage` keyed by page origin — including credentials, in plaintext,
   matching what the vendor app does with its own token. Neither follows
   users between machines.
   ([details](docs/INSTALLATION.md#14-what-does-not-carry-across-installs))

3. **Appliance software versions differ in the field.** Two builds with
   different channel-state schemas are already in use across two UAT boxes;
   `resolveLeg()` normalises both.
   ([details](docs/ARCHITECTURE.md#45-channel-state-two-schema-variants))

---

## Stack

React 18, Vite 5, socket.io-client. Three runtime dependencies, ~62 KB
gzipped. No backend, no database, no configuration file.
