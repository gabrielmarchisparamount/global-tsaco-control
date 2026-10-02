export function RegionTabs({ regions, active, homeRegion, onSelect, onOpenSettings }) {
  return (
    <div className="regionTabs">
      {regions.map((r) => (
        <button
          key={r}
          className={`regionTab ${r === active ? 'active' : ''}`}
          onClick={() => onSelect(r)}
          title={r === homeRegion ? `${r} (local region)` : `${r} (remote region)`}
        >
          {r}
          {r === homeRegion && <span className="homeDot" aria-label="local region" />}
        </button>
      ))}
      <button className="settingsButton" onClick={onOpenSettings} title="Channel list & groups">
        ⚙
      </button>
    </div>
  );
}
