import { useEffect, useState } from 'react';
import { backendRegistry } from './backendRegistry.js';
import { configStore } from './config.js';
import { lockManager } from './lock.js';
import { logStore } from './logStore.js';
import { useStore } from './useStore.js';
import { availableRegions, detectHomeRegion, regionForBackend } from './region.js';
import { ChannelTable } from './components/ChannelTable.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { ServerStatusRow } from './components/ServerStatusRow.jsx';
import { ServerConfig } from './components/ServerConfig.jsx';
import { RegionTabs } from './components/RegionTabs.jsx';
import { GroupTabs, ALL_GROUP } from './components/GroupTabs.jsx';
import { Pagination, PAGE_SIZE } from './components/Pagination.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { RegionChallenge } from './components/RegionChallenge.jsx';
import { LogView } from './components/LogView.jsx';

// Flattens every backend's channel map into one, keyed so channels from
// different servers (which may reuse the same channel ids) never collide.
function mergeChannels(backends) {
  const merged = {};
  backends.forEach((backend) => {
    Object.keys(backend.state).forEach((channelId) => {
      merged[`${backend.id}:${channelId}`] = {
        ...backend.state[channelId],
        backend,
        backendId: backend.id,
        backendLabel: backend.label,
        channelId,
      };
    });
  });
  return merged;
}

// Channels are named like "601 - MTV UK"; the leading number is the channel
// number. Falls back to the appliance's own ordering when there isn't one.
function channelNumber(ch) {
  const m = /^\s*(\d+)/.exec(ch.name ?? '');
  return m ? Number(m[1]) : (ch.order ?? Number.MAX_SAFE_INTEGER);
}

// The descriptive part, with the leading channel number stripped. Sorting on
// the raw name would just reproduce number order, since every name starts
// with its number — so "by name" has to mean "by title" to be useful.
function channelTitle(ch) {
  const name = ch.name ?? '';
  return name.replace(/^\s*\d+\s*[-–—:]\s*/, '').trim() || name;
}

export function App() {
  useStore(backendRegistry);
  useStore(lockManager);
  useStore(configStore);
  useStore(logStore);

  const [selected, setSelected] = useState([]);
  const [gangSelect, setGangSelect] = useState(false);
  const [view, setView] = useState('config');
  const [activeRegion, setActiveRegion] = useState(null);
  const [pendingRegion, setPendingRegion] = useState(null);
  const [activeGroup, setActiveGroup] = useState(ALL_GROUP);
  const [sortBy, setSortBy] = useState('number');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    backendRegistry.restore();
    if (backendRegistry.backends.length > 0) setView('dashboard');
    document.addEventListener('click', () => lockManager.refreshLock());
    document.addEventListener('keyup', () => lockManager.refreshLock());
  }, []);

  const backends = backendRegistry.backends;
  const homeRegion = detectHomeRegion(backends);
  const regions = availableRegions(backends);

  // Land on the local region once servers are known; the user can move away
  // afterwards (with a challenge) and that choice sticks.
  useEffect(() => {
    if (activeRegion === null && homeRegion) setActiveRegion(homeRegion);
  }, [homeRegion, activeRegion]);

  const currentRegion = activeRegion ?? homeRegion ?? regions[0];
  const regionBackends = backends.filter((b) => regionForBackend(b) === currentRegion);

  // Deliberately not memoised: the stores mutate their state in place and
  // signal via notify(), so a useMemo keyed on them would never invalidate
  // and would serve stale channels. At tens of channels this is free.
  const channels = mergeChannels(regionBackends);

  // All channel names across every server, for the settings editor.
  const allChannelNames = (() => {
    const names = new Set();
    backends.forEach((b) => Object.values(b.state).forEach((ch) => ch.name && names.add(ch.name)));
    return [...names].sort();
  })();

  // filter -> sort -> paginate
  const group = configStore.groups.find((g) => g.id === activeGroup);
  const filteredIds = Object.keys(channels)
    .filter((id) => {
      const ch = channels[id];
      if (!ch.name) return false;
      if (configStore.isHidden(ch.name)) return false;
      if (group && !group.channels.includes(ch.name)) return false;
      if (search && !ch.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const chA = channels[a];
      const chB = channels[b];
      if (chA.backendLabel !== chB.backendLabel) return chA.backendLabel.localeCompare(chB.backendLabel);
      return sortBy === 'name'
        ? channelTitle(chA).localeCompare(channelTitle(chB))
        : channelNumber(chA) - channelNumber(chB);
    });

  const pageCount = Math.max(1, Math.ceil(filteredIds.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleIds = filteredIds.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Any change to the filtered set can shrink the page count under us.
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [pageCount, page]);

  function requestRegion(target) {
    if (target === currentRegion) return;
    if (homeRegion && target !== homeRegion) setPendingRegion(target);
    else applyRegion(target);
  }

  function applyRegion(target) {
    setActiveRegion(target);
    setPendingRegion(null);
    setSelected([]);
    setPage(0);
  }

  return (
    <div className="app">
      <div className="topBar">
        <div className="title">Global TSACO Control</div>
        <nav className="topNav">
          {[
            ['dashboard', 'Dashboard'],
            ['config', 'Manage Servers'],
            ['logs', 'Logs'],
          ].map(([id, text]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
              {text}
            </button>
          ))}
        </nav>
      </div>

      {view === 'config' ? (
        <ServerConfig backends={backends} onAdd={() => setView('dashboard')} />
      ) : view === 'logs' ? (
        <LogView />
      ) : (
        <div className="dashboard">
          <div className="leftPanel">
            <ChannelTable
              channels={channels}
              visibleIds={visibleIds}
              selected={selected}
              onSelect={setSelected}
              gangSelect={gangSelect}
              search={search}
              onSearch={(v) => {
                setSearch(v);
                setPage(0);
              }}
            />
          </div>
          <div className="rightPanel">
            <RegionTabs
              regions={regions}
              active={currentRegion}
              homeRegion={homeRegion}
              onSelect={requestRegion}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            <GroupTabs
              groups={configStore.groups}
              activeGroup={activeGroup}
              sortBy={sortBy}
              onSelect={(id) => {
                setActiveGroup(id);
                setPage(0);
              }}
              onToggleSort={() => setSortBy(sortBy === 'number' ? 'name' : 'number')}
            />

            <Pagination pageCount={pageCount} page={safePage} onSelect={setPage} />

            <ServerStatusRow backends={regionBackends} />

            <ControlPanel
              channels={channels}
              selected={selected}
              locked={lockManager.locked}
              secondsRemaining={lockManager.secondsRemaining()}
              gangSelect={gangSelect}
              onToggleGang={() => {
                if (gangSelect) setSelected([]);
                setGangSelect(!gangSelect);
              }}
              onSelectAllInView={() => setSelected(visibleIds)}
            />
          </div>
        </div>
      )}

      {settingsOpen && <SettingsModal channelNames={allChannelNames} onClose={() => setSettingsOpen(false)} />}

      {pendingRegion && (
        <RegionChallenge
          targetRegion={pendingRegion}
          homeRegion={homeRegion}
          onConfirm={() => applyRegion(pendingRegion)}
          onCancel={() => setPendingRegion(null)}
        />
      )}
    </div>
  );
}
