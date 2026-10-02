// Filtering, sorting and pagination all happen in App.jsx — this component
// renders exactly the ids it is handed, in the order given.
export function ChannelTable({ channels, visibleIds, selected, onSelect, gangSelect, search, onSearch }) {
  function toggle(id) {
    if (gangSelect) {
      onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      onSelect([id]);
    }
  }

  return (
    <div className="channelTable">
      <input
        className="search"
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => onSearch(e.currentTarget.value)}
      />
      <table>
        <thead>
          <tr>
            <th>Server</th>
            <th>Channel Name</th>
            <th>Main</th>
            <th>Backup</th>
            <th>Mode</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleIds.map((id, i) => {
            const ch = channels[id];
            if (!ch) return null;
            const outOfSync = ch.main?.path !== ch.backup?.path;
            return (
              <tr
                key={id}
                onClick={() => toggle(id)}
                className={`channelRow ${i % 2 === 0 ? 'dark' : ''} ${selected.includes(id) ? 'selected' : ''}`}
              >
                <td className="server">{ch.backendLabel}</td>
                <td>{ch.name}</td>
                <td className={`path leg-main ${ch.main?.path}`}>{ch.main?.path}</td>
                <td className={`path leg-backup ${ch.backup?.path}`}>{ch.backup?.path}</td>
                <td className={`mode ${ch.mode}`}>{ch.mode}</td>
                <td className={outOfSync ? 'status desync' : 'status'}>{outOfSync ? 'TSACOS OUT OF SYNC' : ''}</td>
              </tr>
            );
          })}
          {visibleIds.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No channels match the current region, group and search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
