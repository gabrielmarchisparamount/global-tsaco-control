# Global TSACO Control — Installation Guide

Last updated: 2026-09-25 · applies to v0.3.0

Covers everything from a bare host to a running deployment: installing
Docker, building and deploying the image, working inside the container,
upgrading, rolling back, and the alternative systemd deployment.

**Companion documents**

- [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) — making code changes
- [ARCHITECTURE.md](ARCHITECTURE.md) — how it works internally
- [USER-GUIDE.md](USER-GUIDE.md) — operating the UI

---

## Contents

1. [What you are installing](#1-what-you-are-installing)
2. [Read this first: where the connections happen](#2-read-this-first-where-the-connections-happen)
3. [Part 1 — Installing Docker](#3-part-1--installing-docker)
4. [Part 2 — Getting the application onto the host](#4-part-2--getting-the-application-onto-the-host)
5. [Part 3 — Build and deploy](#5-part-3--build-and-deploy)
6. [Part 4 — Verify](#6-part-4--verify)
7. [Part 5 — Working inside the container](#7-part-5--working-inside-the-container)
8. [Alternative: systemd (no Docker)](#8-alternative-systemd-no-docker)
9. [Alternative: any static web server](#9-alternative-any-static-web-server)
10. [Upgrading](#10-upgrading)
11. [Rolling back](#11-rolling-back)
12. [Uninstalling](#12-uninstalling)
13. [Caching and redeploys](#13-caching-and-redeploys)
14. [What does not carry across installs](#14-what-does-not-carry-across-installs)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What you are installing

A **static web application** — a directory of HTML/CSS/JS behind a web
server. There is no application server of ours, no database, and no
configuration file. Appliances are added at runtime through the UI and stored
in each operator's browser.

Total footprint: three files, about 215 KB (65 KB gzipped).

| Deployment | Use when |
|---|---|
| **Docker** (Part 1–5) | Standard. Reproducible, easy to run several copies. |
| **systemd** ([§8](#8-alternative-systemd-no-docker)) | No Docker available, or no root. This is what runs today on `172.23.191.54`. |
| **Existing web server** ([§9](#9-alternative-any-static-web-server)) | You already have nginx/Apache serving other things. |

---

## 2. Read this first: where the connections happen

**The host serving this app never contacts a Techex appliance.** It ships
files; the browser then opens every Socket.IO connection itself.

```
   web host  ──serves files once──►  operator's browser
   (no route to appliances needed)         │
                                           │ socket.io (WebSocket)
                                           ▼
                                  Techex appliances
```

Consequences that save a lot of firewall debugging:

- The **hosting server** needs no route to the appliances, no credentials,
  and no rules toward them.
- Each **operator workstation** needs TCP access to every appliance it adds.
- `curl` from the web host to an appliance proves nothing about whether an
  operator can connect.

Full explanation: [ARCHITECTURE §3](ARCHITECTURE.md#3-where-the-connections-actually-happen).

---

## 3. Part 1 — Installing Docker

> Verified facts for the current host (`172.23.191.54`, Ubuntu 22.04 jammy,
> amd64): Docker **29.3.0** and Compose **v5.1.1** are already installed,
> and the service is enabled and active. **Skip to
> [§3.3](#33-grant-non-root-access-required)** — that step has *not* been
> done and is what currently blocks non-root use.
>
> The commands in §3.1–3.2 are Docker's documented procedure. They require
> root, which was not available while writing this, so they are given as
> reference rather than as commands executed here.

### 3.1 Check whether Docker is already there

```bash
docker --version
docker compose version
systemctl is-active docker
```

If all three answer, go to [§3.3](#33-grant-non-root-access-required).

### 3.2 Install Docker Engine (Ubuntu)

Remove any distro packages that conflict:

```bash
for p in docker.io docker-doc docker-compose podman-docker containerd runc; do
  sudo apt-get remove -y "$p"
done
```

Add Docker's official repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install:

```bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Start it and enable at boot:

```bash
sudo systemctl enable --now docker
systemctl is-active docker      # expect: active
```

### 3.3 Grant non-root access (required)

By default the Docker socket is `root:docker` and only root can use it.
Check who is in the group:

```bash
getent group docker
```

On this host that currently returns `docker:x:997:` — an **empty member
list**, which is why any non-root user gets:

```
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

Fix it:

```bash
sudo usermod -aG docker "$USER"
```

Then start a new session so the group takes effect — log out and back in, or
for the current shell:

```bash
newgrp docker
```

Verify:

```bash
id -nG | tr ' ' '\n' | grep -x docker    # expect: docker
docker run --rm hello-world
```

> **Security note.** Membership of `docker` is equivalent to root on the
> host: a container can mount the host filesystem. Grant it deliberately. If
> that is not acceptable, use the systemd deployment in
> [§8](#8-alternative-systemd-no-docker), which needs no root at all.

---

## 4. Part 2 — Getting the application onto the host

The build needs the source tree, not just the built output.

**Already on this host:** `/data/victoria/techex-ui-replica`.

**Onto a new host** — copy the source, excluding build artefacts:

```bash
rsync -av --exclude node_modules --exclude dist \
  /data/victoria/techex-ui-replica/ user@newhost:/opt/global-tsaco-control/
```

You need these for a Docker build: `package.json`, `package-lock.json`,
`index.html`, `vite.config.js`, `src/`, `nginx.conf`, `Dockerfile`,
`docker-compose.yml`, `.dockerignore`.

**Or skip building on the target entirely** — see
[§5.3](#53-shipping-a-prebuilt-image-to-another-host).

---

## 5. Part 3 — Build and deploy

### 5.1 With Compose (recommended)

```bash
cd /data/victoria/techex-ui-replica
docker compose up -d --build
```

That builds `global-tsaco-control:latest` and starts a container of the same
name, publishing container port 80 on **host port 5173**.

What the build does:

| Stage | Base | Does |
|---|---|---|
| 1 | `node:24.19.0-alpine` | `npm ci`, then `npm run build` → `dist/` |
| 2 | `nginx:1.30-alpine` | Copies `dist/` to `/usr/share/nginx/html` and `nginx.conf` to `/etc/nginx/conf.d/default.conf` |

No build args, environment variables, or credentials are required.

> **Verification status.** The build stage is validated on every packaging
> change by replicating its exact steps outside Docker (`npm ci` +
> `npm run build` from precisely the file set the Dockerfile copies); as of
> v0.3.0 that produces output byte-identical to the running systemd
> deployment. The **nginx stage has never been assembled or syntax-checked**,
> because no Docker access was available. Allow a little time on the first
> `docker compose up --build`.

### 5.2 Running several instances on one host

Change only the **host** side of the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "5174:80"
```

Each instance is a separate browser origin, so each has its own independent
appliance list and groups ([§14](#14-what-does-not-carry-across-installs)).

To run genuinely separate stacks, also change `container_name` and use
`docker compose -p <project>`.

### 5.3 Shipping a prebuilt image to another host

There is no registry configured. Build once, then move the image:

```bash
# on the build host
docker save global-tsaco-control:latest | gzip > gdc-0.3.0.tar.gz

# on the target host
gunzip -c gdc-0.3.0.tar.gz | docker load
docker run -d --name global-tsaco-control \
  -p 5173:80 --restart unless-stopped \
  global-tsaco-control:latest
```

### 5.4 Without Compose

```bash
docker build -t global-tsaco-control:latest .
docker run -d --name global-tsaco-control \
  -p 5173:80 --restart unless-stopped \
  global-tsaco-control:latest
```

---

## 6. Part 4 — Verify

```bash
docker compose ps                       # expect: running (healthy)
docker compose logs --tail 20
curl -sI http://localhost:5173/         # expect: HTTP/1.1 200 OK
curl -s  http://localhost:5173/healthz  # expect: ok
curl -s  http://localhost:5173/ | grep '<title>'
```

The image declares a `HEALTHCHECK` against `/healthz`, so `docker ps` reports
`healthy` / `unhealthy` rather than just `up`. It can take ~35 s after start
for the first check to pass.

Then in a browser:

1. Open `http://<host>:5173/`.
2. You should land on **Manage Servers** with an empty list.
3. Add an appliance and confirm it reaches `Connected — N channels`.

If not, see [§15](#15-troubleshooting) and
[USER-GUIDE §Troubleshooting](USER-GUIDE.md#troubleshooting).

---

## 7. Part 5 — Working inside the container

### 7.1 What is in there

| Path | Contents |
|---|---|
| `/usr/share/nginx/html/index.html` | Page shell — small, human-readable |
| `/usr/share/nginx/html/assets/index-<hash>.js` | The whole app, minified |
| `/usr/share/nginx/html/assets/index-<hash>.css` | All styling, minified |
| `/etc/nginx/conf.d/default.conf` | Our `nginx.conf` |
| `/var/log/nginx/` | Access and error logs (also via `docker logs`) |

### 7.2 Looking around

```bash
docker exec -it global-tsaco-control sh        # interactive shell (busybox)
docker exec global-tsaco-control ls -la /usr/share/nginx/html/assets
docker exec global-tsaco-control cat /etc/nginx/conf.d/default.conf
docker compose logs -f
```

### 7.3 Editing files in a running container

The base image is Alpine, so `vi` is available (busybox); `nano` is not
unless you install it.

```bash
docker exec -it global-tsaco-control vi /etc/nginx/conf.d/default.conf
docker exec global-tsaco-control nginx -t          # ALWAYS test config first
docker exec global-tsaco-control nginx -s reload   # apply without downtime
```

Copying files in and out is usually easier than editing in place:

```bash
docker cp global-tsaco-control:/etc/nginx/conf.d/default.conf ./default.conf
# edit ./default.conf on the host with your normal editor
docker cp ./default.conf global-tsaco-control:/etc/nginx/conf.d/default.conf
docker exec global-tsaco-control nginx -t && \
docker exec global-tsaco-control nginx -s reload
```

To install a tool temporarily inside the container:

```bash
docker exec global-tsaco-control apk add --no-cache nano
```

### 7.4 What survives what — read before relying on an in-container edit

| Action | In-container edits survive? |
|---|---|
| `docker compose restart` | ✅ Yes |
| `docker stop` / `docker start` | ✅ Yes |
| Host reboot (with `restart: unless-stopped`) | ✅ Yes |
| `docker compose up -d --build` | ❌ **No** — new container |
| `docker compose down` then `up` | ❌ **No** |
| `docker rm` / image rebuild | ❌ **No** |

Edits live only in that container's writable layer. Any rebuild silently
reverts them — which is exactly when someone concludes "the fix didn't work".

**Treat in-container edits as temporary.** For anything you want to keep,
change the source and rebuild ([§10](#10-upgrading)).

### 7.5 Editing the application itself inside the container

Possible, but rarely sensible:

- `index.html` is small and safe to tweak (a title, say). It carries the
  content hashes of the JS/CSS — **do not change those** or the app will
  fail to load.
- The `.js` and `.css` bundles are minified single-line output. Hand-editing
  them is impractical and unreviewable. Don't, except as a genuine
  emergency hotfix — and open a proper fix immediately after.

The supported way to change the app is to edit `src/` and rebuild. See
[DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md).

### 7.6 Making nginx config editable without rebuilding

If you expect to tune nginx often, bind-mount it. Add to
`docker-compose.yml`:

```yaml
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

Then edit `nginx.conf` **on the host** and apply with:

```bash
docker compose restart
```

The edit is now in a file that lives outside the container, so it survives
rebuilds and is visible to whoever looks at the source next.

The same trick can serve a build without rebuilding the image:

```yaml
    volumes:
      - ./dist:/usr/share/nginx/html:ro
```

Useful while iterating (`npm run build` then refresh), but for a real
deployment prefer a self-contained image — a bind-mounted `dist/` means the
image no longer describes what is being served.

---

## 8. Alternative: systemd (no Docker)

This is what runs on `172.23.191.54` today. It needs **no root**.

### 8.1 Install Node (user-local)

```bash
cd /data/victoria/toolchain
curl -sLO https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz
curl -sL https://nodejs.org/dist/v24.19.0/SHASUMS256.txt | grep linux-x64.tar.xz | sha256sum -c -
tar xf node-v24.19.0-linux-x64.tar.xz
mv node-v24.19.0-linux-x64 node
rm node-v24.19.0-linux-x64.tar.xz
export PATH="/data/victoria/toolchain/node/bin:$PATH"
node --version    # v24.19.0
```

Confirm the checksum line prints `OK` before continuing.

### 8.2 Build

```bash
cd /data/victoria/techex-ui-replica
npm ci
npm run build     # -> dist/
```

### 8.3 Enable linger

So the service survives logout and starts at boot:

```bash
loginctl enable-linger "$(whoami)"
loginctl show-user "$(whoami)" -p Linger   # expect Linger=yes
```

### 8.4 Create the unit

`~/.config/systemd/user/global-tsaco-control.service`:

```ini
[Unit]
Description=Global TSACO Control (Techex TSACO web UI)
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/victoria/techex-ui-replica
Environment=PATH=/data/victoria/toolchain/node/bin:/usr/bin:/bin
ExecStart=/data/victoria/toolchain/node/bin/node node_modules/vite/bin/vite.js preview --host 0.0.0.0 --port 5173
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

### 8.5 Start

```bash
systemctl --user daemon-reload
systemctl --user enable --now global-tsaco-control.service
systemctl --user status global-tsaco-control.service
```

Note this serves via `vite preview`, so `node_modules/` must stay on the
host. Adequate, and what runs today, but nginx is the better long-term
choice for static content.

---

## 9. Alternative: any static web server

`dist/` is plain static content. Point any web server at it. Two rules:

1. Serve `index.html` as the fallback for unmatched paths (SPA behaviour).
2. Do **not** cache `index.html` — see [§13](#13-caching-and-redeploys).

---

## 10. Upgrading

**Docker:**

```bash
cd /data/victoria/techex-ui-replica
git pull                      # or copy in the new source
docker compose up -d --build
docker compose ps
```

**systemd:**

```bash
export PATH="/data/victoria/toolchain/node/bin:$PATH"
cd /data/victoria/techex-ui-replica
npm ci                        # only if dependencies changed
npm run build
systemctl --user restart global-tsaco-control.service
```

Neither has hot reload. **Operators must hard-reload their browser tab**
(Ctrl+Shift+R) to pick up a new bundle. Their saved appliances and groups are
untouched by an upgrade.

---

## 11. Rolling back

Tag before you upgrade and rollback is trivial:

```bash
docker tag global-tsaco-control:latest global-tsaco-control:0.3.0
```

To go back:

```bash
docker compose down
docker tag global-tsaco-control:0.3.0 global-tsaco-control:latest
docker compose up -d          # note: no --build
```

For systemd, keep a copy of the previous `dist/`:

```bash
cp -r dist dist.bak-0.3.0
# to roll back:
rm -rf dist && mv dist.bak-0.3.0 dist
systemctl --user restart global-tsaco-control.service
```

---

## 12. Uninstalling

```bash
# Docker
docker compose down
docker image rm global-tsaco-control:latest

# systemd
systemctl --user disable --now global-tsaco-control.service
rm ~/.config/systemd/user/global-tsaco-control.service
systemctl --user daemon-reload
```

Neither removes operators' saved appliances or groups — those live in their
browsers. To clear one, use **Remove** on each server in the UI, or clear
site data for that origin.

---

## 13. Caching and redeploys

Asset filenames are content-hashed and can be cached indefinitely.
`index.html` must **not** be — it is the file that points at the current
hashes. A cached copy pins that client to the old bundle after an update,
which on a control surface means someone operating a stale UI.

`nginx.conf` handles this:

```nginx
location /assets/       { expires 1y; add_header Cache-Control "public, immutable"; }
location = /index.html  { add_header Cache-Control "no-store, must-revalidate" always; }
```

Reproduce that behaviour if you deploy behind your own web server.

---

## 14. What does not carry across installs

Two things live in the **browser**, in `localStorage`, scoped to the page's
origin:

| Key | Holds |
|---|---|
| `techex-servers` | Appliances — labels, hosts, ports, usernames, passwords, plus last-known pair identity |
| `gdc-channel-config` | Custom groups and hidden channels |
| `gdc-command-log` | The command audit log (most recent 500 entries) |
| `gdc-workstation` | This machine's label, shown in the log's Initiator column |
| `gdc-browser-id` | Stable per-browser id used in the log |

Consequences:

- A new install at a different host or port is a different origin, so it
  starts with an empty appliance list and no groups.
- Clearing browser data wipes both.
- There is no central config; each operator configures their own, and groups
  must be recreated per operator.
- **Credentials are stored in plaintext.** This matches what the vendor
  Engineer UI does with its own token. Treat any workstation with a
  configured appliance as holding those credentials.

---

## 15. Troubleshooting

### Docker

| Symptom | Cause / fix |
|---|---|
| `permission denied ... docker.sock` | Not in the `docker` group. See [§3.3](#33-grant-non-root-access-required). Remember a new login is needed. |
| `docker: command not found` | Not installed — [§3.2](#32-install-docker-engine-ubuntu). |
| Build fails at `npm ci` | `package-lock.json` out of step with `package.json`. Run `npm install` on the host and rebuild. |
| Build fails on a missing file | The Dockerfile uses explicit `COPY`, not `COPY . .`. A new top-level file the build needs must be added to it. |
| `port is already allocated` | Something else holds 5173: `ss -tlnp \| grep 5173`. Change the host side of the mapping, or stop the other service (the systemd unit uses 5173 too — the two cannot both run). |
| Container restarts repeatedly | `docker compose logs`. Usually invalid nginx config: `docker run --rm -i nginx:1.30-alpine nginx -t < nginx.conf`. |
| `unhealthy` in `docker ps` | `/healthz` not answering — check `docker compose logs` and that the `location /healthz` block is intact. |
| Edits inside the container vanished | Expected after any rebuild — [§7.4](#74-what-survives-what--read-before-relying-on-an-in-container-edit). |

### Application

| Symptom | Cause / fix |
|---|---|
| Page loads blank | Browser console (F12). Usually a stale cached `index.html` pointing at hashes that no longer exist — hard-reload, then fix cache headers per [§13](#13-caching-and-redeploys). |
| Appliance stuck on `Connecting…` | The **browser** cannot reach it. Confirm from the operator's PC, not the server — [§2](#2-read-this-first-where-the-connections-happen). |
| `Connection error: websocket error` | No network path, wrong port, or an HTTPS certificate the browser has not accepted. Open the appliance's own URL in a tab and accept the warning. |
| Every channel shows `Unknown` | An appliance software version the app doesn't recognise — [DEVELOPER-GUIDE §4](DEVELOPER-GUIDE.md#4-change-recipes), "Support a new appliance schema". |
| Buttons do nothing | Check the safety lock first; it re-locks after 60 s. The countdown on the button shows the state. |

### systemd

| Symptom | Cause / fix |
|---|---|
| `npm: command not found` | `export PATH="/data/victoria/toolchain/node/bin:$PATH"` |
| Service exits immediately | `journalctl --user -u global-tsaco-control -n 50`. Usually a missing `node_modules/` — run `npm ci`. |
| Service dies at logout | `loginctl enable-linger "$(whoami)"` |
