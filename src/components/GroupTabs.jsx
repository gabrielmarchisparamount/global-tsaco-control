export const ALL_GROUP = '__all__';

// Pressing a group selects it; pressing the group that is already selected
// toggles the channel list between number order and name order.
export function GroupTabs({ groups, activeGroup, sortBy, onSelect, onToggleSort }) {
  function press(id) {
    if (id === activeGroup) onToggleSort();
    else onSelect(id);
  }

  const tabs = [{ id: ALL_GROUP, name: 'All Channels' }, ...groups];

  return (
    <div className="groupTabs">
      {tabs.map((g) => {
        const isActive = g.id === activeGroup;
        return (
          <button
            key={g.id}
            className={`groupTab ${isActive ? 'active' : ''}`}
            onClick={() => press(g.id)}
            title={isActive ? 'Press again to change sort order' : `Show ${g.name}`}
          >
            {g.name}
            {isActive && <span className="sortHint">{sortBy === 'number' ? 'by number' : 'by name'}</span>}
          </button>
        );
      })}
    </div>
  );
}
