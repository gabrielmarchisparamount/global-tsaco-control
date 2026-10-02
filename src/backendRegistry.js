import { Backend } from './backend.js';

const STORAGE_KEY = 'techex-servers';

// crypto.randomUUID() needs a secure context (HTTPS/localhost); this app is
// often served over plain http:// to a LAN IP, so it isn't guaranteed.
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Plaintext credentials, same tradeoff the vendor app makes with its own
// localStorage token — see README.md. Don't point this at anything you
// wouldn't already trust the browser's localStorage with.
function loadSavedServers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(servers) {
  const saved = servers.map((b) => ({
    id: b.id,
    label: b.label,
    host: b.host,
    port: b.port,
    username: b.username,
    password: b.password,
    // Last-known identity, so a server that is down still renders as a
    // named Main/Backup pair rather than one anonymous box.
    pairAddress: b.pairAddress,
    isMain: b.isMain,
    systemName: b.systemName,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

class BackendRegistry {
  constructor() {
    this.backends = [];
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn());
  }

  // Subscribe, and re-persist when an appliance reveals its identity.
  // Guarded on actual change so routine state:update traffic doesn't write
  // to localStorage several times a second.
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

  // Reconnect every backend saved from a previous session.
  restore() {
    loadSavedServers().forEach((saved) => {
      const backend = new Backend(saved);
      this.track(backend);
      this.backends.push(backend);
      backend.connect();
    });
    this.notify();
  }

  add({ label, host, port, username, password }) {
    const id = generateId();
    const backend = new Backend({ id, label, host, port, username, password });
    this.track(backend);
    this.backends.push(backend);
    backend.connect();
    persist(this.backends);
    this.notify();
    return backend;
  }

  remove(id) {
    const backend = this.backends.find((b) => b.id === id);
    backend?.disconnect();
    this.backends = this.backends.filter((b) => b.id !== id);
    persist(this.backends);
    this.notify();
  }
}

export const backendRegistry = new BackendRegistry();
