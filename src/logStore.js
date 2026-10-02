// Command audit log.
//
// SCOPE: this is a *local* log. There is no backend of ours to ship it to,
// so it records what this browser did and lives in this browser only.
// Two operators on two machines have two separate logs. If a central audit
// trail is ever needed, that requires a server component — see
// docs/DEVELOPER-GUIDE.md.

const STORAGE_KEY = 'gdc-command-log';
const BROWSER_ID_KEY = 'gdc-browser-id';
const WORKSTATION_KEY = 'gdc-workstation';
const MAX_ENTRIES = 500;

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// A stable per-browser identifier, so two people using the same appliance
// credentials are still distinguishable in the log.
function loadBrowserId() {
  try {
    let id = localStorage.getItem(BROWSER_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem(BROWSER_ID_KEY, id);
    }
    return id;
  } catch {
    return 'UNKNOWN';
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class LogStore {
  constructor() {
    this.entries = load(); // newest first
    this.browserId = loadBrowserId();
    // Operator-supplied label for this machine. The browser cannot discover
    // its own IP, so if an IP is wanted in the log it has to be set here.
    this.workstation = localStorage.getItem(WORKSTATION_KEY) ?? '';
    this.listeners = new Set();
  }

  setWorkstation(value) {
    this.workstation = value.trim();
    try {
      localStorage.setItem(WORKSTATION_KEY, this.workstation);
    } catch {
      /* keep working in memory */
    }
    this.notify();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn());
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Quota exceeded — drop the oldest half rather than losing new events.
      this.entries = this.entries.slice(0, Math.floor(this.entries.length / 2));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
      } catch {
        /* give up persisting; keep working in memory */
      }
    }
    this.notify();
  }

  // Returns the entry id so a later response can be attached to it.
  log({ operator, destination, destinationName, event, detail, summary, status, response }) {
    const entry = {
      id: newId(),
      time: new Date().toISOString(),
      operator: operator || '—',
      workstation: this.workstation,
      browserId: this.browserId,
      destination: destination || '—',
      destinationName: destinationName || '',
      event,
      detail: detail ?? null,
      summary: summary || event,
      status: status || 'sent',
      response: response ?? null,
      respondedAt: status && status !== 'sent' ? new Date().toISOString() : null,
    };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this.persist();
    return entry.id;
  }

  // Attach the outcome to an earlier command.
  resolve(id, { status, response }) {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.status = status;
    entry.response = response ?? entry.response;
    entry.respondedAt = new Date().toISOString();
    this.persist();
  }

  clear() {
    this.entries = [];
    this.persist();
  }

  toCsv() {
    const cols = [
      'time', 'operator', 'workstation', 'browserId',
      'destination', 'destinationName', 'event', 'summary',
      'status', 'response', 'respondedAt',
    ];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...this.entries.map((e) => cols.map((c) => esc(e[c])).join(','))].join('\n');
  }
}

export const logStore = new LogStore();
