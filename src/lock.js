export const LOCK_TIMEOUT_MS = 60 * 1000;
// Matches the vendor app: controls start locked and re-lock after 60s idle.
const AUTO_LOCK_ENABLED = true;

// One lock covers every backend — it's a UI-level safety interlock, not
// something the vendor protocol sends to the server (see README.md).
class LockManager {
  constructor() {
    this.locked = AUTO_LOCK_ENABLED;
    this.lockTimeout = null;
    this.ticker = null;
    this.expiresAt = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.locked));
  }

  // Whole seconds until auto-lock, or null when that isn't running.
  secondsRemaining() {
    if (this.locked || !AUTO_LOCK_ENABLED || !this.expiresAt) return null;
    return Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1000));
  }

  lock() {
    this.locked = true;
    this.expiresAt = null;
    clearTimeout(this.lockTimeout);
    clearInterval(this.ticker);
    this.ticker = null;
    this.notify();
  }

  unlock() {
    this.locked = false;
    this.refreshLock();
    this.notify();
  }

  refreshLock() {
    if (!AUTO_LOCK_ENABLED || this.locked) return;
    clearTimeout(this.lockTimeout);
    this.expiresAt = Date.now() + LOCK_TIMEOUT_MS;
    this.lockTimeout = setTimeout(() => this.lock(), LOCK_TIMEOUT_MS);
    // Drive the visible countdown; only runs while actually unlocked.
    if (!this.ticker) {
      this.ticker = setInterval(() => this.notify(), 1000);
    }
  }
}

export const lockManager = new LockManager();
