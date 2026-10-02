// Channel presentation config: custom groups and hidden channels.
// Browser-local only (no backend of ours to store it in), so each operator
// configures their own — same tradeoff as the server list.
//
// Membership is keyed by channel NAME rather than by channel id, so a group
// survives an appliance being removed and re-added (which mints a new
// backend id) and stays legible if anyone inspects localStorage.

const STORAGE_KEY = 'gdc-channel-config';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden : [],
    };
  } catch {
    return { groups: [], hidden: [] };
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class ConfigStore {
  constructor() {
    const { groups, hidden } = load();
    this.groups = groups; // [{ id, name, channels: [channelName] }]
    this.hidden = hidden; // [channelName]
    this.listeners = new Set();
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: this.groups, hidden: this.hidden }));
    } catch {
      /* quota or private mode — keep working in memory */
    }
    this.notify();
  }

  addGroup(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (this.groups.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const group = { id: newId(), name: trimmed, channels: [] };
    this.groups.push(group);
    this.persist();
    return group;
  }

  removeGroup(id) {
    this.groups = this.groups.filter((g) => g.id !== id);
    this.persist();
  }

  renameGroup(id, name) {
    const trimmed = name.trim();
    const group = this.groups.find((g) => g.id === id);
    if (!group || !trimmed) return false;
    // Don't allow a rename to collide with another group.
    if (this.groups.some((g) => g.id !== id && g.name.toLowerCase() === trimmed.toLowerCase())) return false;
    group.name = trimmed;
    this.persist();
    return true;
  }

  // Group order is the order of the tabs in the dashboard.
  moveGroup(id, delta) {
    const from = this.groups.findIndex((g) => g.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.groups.length) return;
    const [group] = this.groups.splice(from, 1);
    this.groups.splice(to, 0, group);
    this.persist();
  }

  // Bulk membership, for "add/remove everything currently listed".
  setChannelsInGroup(groupId, channelNames, include) {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return;
    const set = new Set(group.channels);
    channelNames.forEach((n) => (include ? set.add(n) : set.delete(n)));
    group.channels = [...set];
    this.persist();
  }

  toggleChannelInGroup(groupId, channelName) {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) return;
    group.channels = group.channels.includes(channelName)
      ? group.channels.filter((c) => c !== channelName)
      : [...group.channels, channelName];
    this.persist();
  }

  isInGroup(groupId, channelName) {
    return !!this.groups.find((g) => g.id === groupId)?.channels.includes(channelName);
  }

  setChannelHidden(channelName, isHidden) {
    const already = this.hidden.includes(channelName);
    if (isHidden && !already) this.hidden.push(channelName);
    if (!isHidden && already) this.hidden = this.hidden.filter((c) => c !== channelName);
    this.persist();
  }

  isHidden(channelName) {
    return this.hidden.includes(channelName);
  }
}

export const configStore = new ConfigStore();
