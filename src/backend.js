import { io } from 'socket.io-client';
import { resolveLeg, computeMode } from './protocol.js';
import { logStore } from './logStore.js';

// How long to wait for the appliance to reflect a command in its state
// before the log records that it was never confirmed.
const CONFIRM_TIMEOUT_MS = 15000;

// `host` may already include a scheme ("https://10.165.24.17"); if not,
// defaults to http://. `port` is optional — omit it to use the scheme's
// default port (e.g. an https-only server with no explicit port).
function buildUrl(host, port) {
  const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  return port ? `${base}:${port}` : base;
}

// One instance per configured Techex backend server. Owns its own Socket.IO
// connection, auth, and channel state — see backendRegistry.js for the list
// of these and ServerConfig.jsx for the UI that adds/removes them.
export class Backend {
  constructor({ id, label, host, port, username, password, pairAddress, isMain, systemName }) {
    this.id = id;
    this.label = label;
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;

    // Last-known identity, restored from localStorage. An appliance only
    // tells us its role and partner once connected, so without these a
    // server that is down would show as an anonymous single box.
    this.savedPairAddress = pairAddress ?? null;
    this.savedIsMain = isMain ?? undefined;
    this.savedSystemName = systemName ?? '';

    this.sock = null;
    this.connecting = false;
    this.connected = false;
    this.authFailed = false;
    this.lastError = null;
    this.stateLoaded = false;
    this.state = {};
    this.systemName = this.savedSystemName;
    this.config = null;
    this.pairConnected = false;
    this.listeners = new Set();
    // Commands awaiting confirmation via a following state:update.
    this.pending = [];
  }

  // Where this appliance is, for the log's destination column.
  get address() {
    return `${this.host}${this.port ? `:${this.port}` : ''}`;
  }

  // Live value when connected, last-known value otherwise.
  get pairAddress() {
    return this.config?.options?.pairAddress ?? this.savedPairAddress ?? null;
  }

  get isMain() {
    return this.config?.options?.isMain ?? this.savedIsMain;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn());
  }

  connect() {
    this.sock?.disconnect();
    this.connecting = true;
    this.connected = false;
    this.authFailed = false;
    this.lastError = null;
    this.notify();

    this.sock = io(buildUrl(this.host, this.port), {
      path: '/api/socket.io',
      transports: ['websocket'],
      auth: { token: `${this.username}${this.password}` },
    });

    // socket.io-client retries silently forever by default — without this,
    // a bad host/path/TLS setup just hangs on "Connecting…" with no feedback.
    this.sock.on('connect_error', (err) => {
      this.connecting = false;
      this.lastError = err?.message || String(err);
      this.notify();
      this.logEvent('connect', 'Connection attempt', 'error', this.lastError);
    });

    this.sock.on('auth:fail', () => {
      this.connecting = false;
      this.connected = false;
      this.authFailed = true;
      this.notify();
      this.logEvent('auth', 'Authentication', 'error', 'auth:fail — credentials rejected');
    });

    this.sock.on('auth:success', () => {
      this.connecting = false;
      this.connected = true;
      this.lastError = null;
      this.notify();
      this.logEvent('auth', 'Authentication', 'ok', 'auth:success');
      this.sock.emit('join:frontend');
      this.bootstrap();
    });
  }

  bootstrap() {
    const sock = this.sock;

    sock.emit('state:all', (raw) => {
      Object.keys(raw).forEach((id) => this.mergeState(id, raw));
      this.stateLoaded = true;
      this.notify();
    });

    sock.emit('get:systemName', (name) => {
      this.systemName = name;
      this.notify();
    });

    sock.on('state:update', (raw) => {
      Object.keys(raw).forEach((id) => this.mergeState(id, raw));
      // A state push is the appliance's de-facto response to a command.
      this.checkPending();
      this.notify();
    });

    sock.emit('get:config', (config) => {
      this.config = config;
      this.notify();
    });

    sock.emit('pair:status', (isConnected) => {
      this.pairConnected = isConnected;
      this.notify();
    });
    sock.on('pair:connected', () => {
      this.pairConnected = true;
      this.notify();
    });
    sock.on('pair:disconnected', () => {
      this.pairConnected = false;
      this.notify();
    });
  }

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

  disconnect() {
    this.sock?.disconnect();
    this.sock = null;
    this.connected = false;
    this.connecting = false;
    this.notify();
  }

  // ---- logging -------------------------------------------------------

  logEvent(event, summary, status, response) {
    logStore.log({
      operator: this.username,
      destination: this.address,
      destinationName: this.systemName || this.label,
      event,
      summary,
      status,
      response,
    });
  }

  channelName(id) {
    return this.state[id]?.name || id;
  }

  // The appliance does not acknowledge switch commands, so the real
  // "response" is the state:update it pushes afterwards. Watch for the
  // commanded channels to reach the expected value and record that, with
  // how long it took.
  awaitConfirmation(logId, ids, predicate, describe) {
    const pending = {
      logId,
      ids: [...ids],
      predicate,
      describe,
      started: Date.now(),
      timer: setTimeout(() => {
        this.pending = this.pending.filter((p) => p !== pending);
        logStore.resolve(logId, {
          status: 'unconfirmed',
          response: `No confirming state:update within ${CONFIRM_TIMEOUT_MS / 1000}s`,
        });
      }, CONFIRM_TIMEOUT_MS),
    };
    this.pending.push(pending);
  }

  checkPending() {
    if (!this.pending.length) return;
    this.pending = this.pending.filter((p) => {
      const states = p.ids.map((id) => this.state[id]).filter(Boolean);
      if (states.length !== p.ids.length || !states.every(p.predicate)) return true;
      clearTimeout(p.timer);
      logStore.resolve(p.logId, {
        status: 'applied',
        response: `${p.describe(states)} — confirmed after ${Date.now() - p.started} ms`,
      });
      return false;
    });
  }

  // ---- commands ------------------------------------------------------

  setAuto(ids, mode) {
    if (!ids.length) return;
    const names = ids.map((id) => this.channelName(id));
    const logId = logStore.log({
      operator: this.username,
      destination: this.address,
      destinationName: this.systemName || this.label,
      event: 'switch:auto',
      summary: `Mode → ${mode} on ${names.length} channel(s): ${names.join(', ')}`,
      detail: { event: 'switch:auto', args: [ids, mode, true] },
    });
    // A trailing function is treated by socket.io as an ack callback and is
    // NOT sent as an argument, so the appliance still receives exactly the
    // three it expects. It does not ack today; this captures one if it ever does.
    this.sock?.emit('switch:auto', ids, mode, true, (ack) =>
      logStore.resolve(logId, { status: 'acked', response: `ack: ${JSON.stringify(ack)}` }),
    );
    this.awaitConfirmation(
      logId,
      ids,
      (ch) => ch.mode === mode,
      (states) => `mode=${[...new Set(states.map((s) => s.mode))].join('/')}`,
    );
  }

  switchSource(ids, sourceLetter, isMain) {
    if (!ids.length) return;
    const leg = isMain ? 'main' : 'backup';
    const names = ids.map((id) => this.channelName(id));
    const logId = logStore.log({
      operator: this.username,
      destination: this.address,
      destinationName: this.systemName || this.label,
      event: 'switch:source',
      summary: `${isMain ? 'Main' : 'Backup'} ACO → ${sourceLetter} on ${names.length} channel(s): ${names.join(', ')}`,
      detail: { event: 'switch:source', args: [ids, sourceLetter, isMain] },
    });
    this.sock?.emit('switch:source', ids, sourceLetter, isMain, (ack) =>
      logStore.resolve(logId, { status: 'acked', response: `ack: ${JSON.stringify(ack)}` }),
    );
    this.awaitConfirmation(
      logId,
      ids,
      (ch) => ch[leg]?.path === sourceLetter,
      (states) => `${leg}=${[...new Set(states.map((s) => s[leg]?.path))].join('/')}`,
    );
  }
}
