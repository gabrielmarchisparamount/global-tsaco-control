import { lockManager } from '../lock.js';

const SOURCES = ['A', 'B', 'C', 'D'];

// Value shared by every selected channel, or null if they disagree (mixed selection).
function commonValue(channels, ids, getter) {
  if (!ids.length) return undefined;
  const values = ids.map((id) => getter(channels[id])).filter((v) => v !== undefined);
  if (!values.length) return undefined;
  return values.every((v) => v === values[0]) ? values[0] : null;
}

// Selected channels can span multiple backends (gang-select across servers) —
// group by backend so each gets its own switch:auto/switch:source call with
// only its own channel ids.
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

export function ControlPanel({
  channels,
  selected,
  locked,
  secondsRemaining,
  gangSelect,
  onToggleGang,
  onSelectAllInView,
}) {
  const disabled = locked || selected.length === 0;

  const mode = commonValue(channels, selected, (ch) => ch?.mode);
  const mainPath = commonValue(channels, selected, (ch) => ch?.main?.path);
  const backupPath = commonValue(channels, selected, (ch) => ch?.backup?.path);
  const mainRequested = commonValue(channels, selected, (ch) => ch?.main?.requestedPath);
  const backupRequested = commonValue(channels, selected, (ch) => ch?.backup?.requestedPath);

  function setAuto(targetMode) {
    groupByBackend(channels, selected).forEach((ids, backend) => backend.setAuto(ids, targetMode));
  }

  function switchSource(sourceLetter, isMain) {
    groupByBackend(channels, selected).forEach((ids, backend) => backend.switchSource(ids, sourceLetter, isMain));
  }

  return (
    <div className="controlPanel">
      <div className="selectionControls">
        <button className={gangSelect ? 'active' : ''} onClick={onToggleGang}>
          Gang Select
        </button>
        <button
          className={`lockButton ${locked ? 'locked' : 'unlocked'}`}
          onClick={() => (locked ? lockManager.unlock() : lockManager.lock())}
        >
          <span className="maintext">
            {locked ? 'Locked' : `Unlocked${secondsRemaining != null ? ` — ${secondsRemaining}s` : ''}`}
          </span>
          {!locked && <span className="subtext">Re-locks when the countdown reaches zero</span>}
        </button>
        <button onClick={onSelectAllInView}>Select All in View</button>
      </div>

      <div className="modeControls">
        <button className={mode === 'Auto' ? 'active' : ''} disabled={disabled} onClick={() => setAuto('Auto')}>
          Auto
        </button>
        <button className={mode === 'Manual' ? 'active' : ''} disabled={disabled} onClick={() => setAuto('Manual')}>
          Manual
        </button>
      </div>

      <div className="acoControls">
        <div className="switchSection">
          <div className="header">Main ACO</div>
          <div className="switches">
            {SOURCES.map((s) => (
              <button
                key={s}
                className={[mainPath === s && 'active', mainRequested === s && mainRequested !== 'none' && 'requested']
                  .filter(Boolean)
                  .join(' ')}
                disabled={disabled}
                onClick={() => switchSource(s, true)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="switchSection">
          <div className="header">Backup ACO</div>
          <div className="switches">
            {SOURCES.map((s) => (
              <button
                key={s}
                className={[backupPath === s && 'active', backupRequested === s && backupRequested !== 'none' && 'requested']
                  .filter(Boolean)
                  .join(' ')}
                disabled={disabled}
                onClick={() => switchSource(s, false)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
