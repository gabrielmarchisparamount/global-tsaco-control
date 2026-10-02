import { useState } from 'react';
import { configStore } from '../config.js';
import { logStore } from '../logStore.js';

// Edits the local presentation layer only: which channels are shown, and
// which groups they belong to. Channel names come from the appliances and
// are not editable here.
export function SettingsModal({ channelNames, onClose }) {
  const [editingGroupId, setEditingGroupId] = useState(configStore.groups[0]?.id ?? null);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [workstation, setWorkstation] = useState(logStore.workstation);

  const groups = configStore.groups;
  const editingGroup = groups.find((g) => g.id === editingGroupId) ?? null;

  function addGroup(e) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    const created = configStore.addGroup(name);
    if (!created) {
      setError(`A group called “${name}” already exists.`);
      return;
    }
    setError('');
    setNewGroupName('');
    setEditingGroupId(created.id);
  }

  function startRename(group) {
    setRenamingId(group.id);
    setRenameValue(group.name);
    setError('');
  }

  function commitRename(e) {
    e?.preventDefault();
    if (!configStore.renameGroup(renamingId, renameValue)) {
      setError('That name is empty or already in use.');
      return;
    }
    setError('');
    setRenamingId(null);
  }

  function removeGroup(id) {
    configStore.removeGroup(id);
    if (editingGroupId === id) setEditingGroupId(configStore.groups[0]?.id ?? null);
    if (renamingId === id) setRenamingId(null);
  }

  const shown = channelNames.filter((n) => n.toLowerCase().includes(filter.toLowerCase()));
  const allShownInGroup =
    editingGroup && shown.length > 0 && shown.every((n) => editingGroup.channels.includes(n));

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Channel list &amp; groups</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <p className="modalNote">
          Saved in this browser only — groups and hidden channels are not shared with other machines.
        </p>
        {error && <p className="modalError">{error}</p>}

        <div className="workstationRow">
          <label htmlFor="workstation">This workstation</label>
          <input
            id="workstation"
            placeholder="e.g. 10.144.8.42 or MCR-Desk-3"
            value={workstation}
            onChange={(e) => {
              setWorkstation(e.currentTarget.value);
              logStore.setWorkstation(e.currentTarget.value);
            }}
          />
          <span className="subtle">
            Shown in the Initiator column of the log. A browser cannot read its own IP, so set it here
            if you want one recorded.
          </span>
        </div>

        <div className="settingsBody">
          <div className="groupsPane">
            <h3>Groups</h3>
            {groups.length === 0 && <p className="empty">No groups yet.</p>}
            <ul className="groupList">
              {groups.map((g, i) => (
                <li key={g.id} className={g.id === editingGroupId ? 'active' : ''}>
                  {renamingId === g.id ? (
                    <form className="renameForm" onSubmit={commitRename}>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                        autoFocus
                      />
                      <button type="submit" title="Save name">
                        ✓
                      </button>
                    </form>
                  ) : (
                    <>
                      <button className="groupPick" onClick={() => setEditingGroupId(g.id)}>
                        {g.name} <span className="count">{g.channels.length}</span>
                      </button>
                      <button
                        className="iconBtn"
                        onClick={() => configStore.moveGroup(g.id, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="iconBtn"
                        onClick={() => configStore.moveGroup(g.id, 1)}
                        disabled={i === groups.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button className="iconBtn" onClick={() => startRename(g)} title={`Rename ${g.name}`}>
                        ✎
                      </button>
                      <button className="iconBtn danger" onClick={() => removeGroup(g.id)} title={`Delete ${g.name}`}>
                        ✕
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <form className="addGroup" onSubmit={addGroup}>
              <input
                placeholder="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.currentTarget.value)}
              />
              <button type="submit">Add</button>
            </form>
          </div>

          <div className="channelsPane">
            <h3>
              Channels
              {editingGroup ? <span className="subtle"> — tick to include in “{editingGroup.name}”</span> : null}
            </h3>
            <div className="channelsToolbar">
              <input
                className="search"
                placeholder="Filter channels…"
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
              />
              {editingGroup && shown.length > 0 && (
                <button
                  onClick={() => configStore.setChannelsInGroup(editingGroup.id, shown, !allShownInGroup)}
                  title={`${allShownInGroup ? 'Remove' : 'Add'} all ${shown.length} listed channels`}
                >
                  {allShownInGroup ? 'Remove all listed' : 'Add all listed'}
                </button>
              )}
            </div>
            {channelNames.length === 0 && <p className="empty">Connect a server to see its channels.</p>}
            <table className="settingsChannelTable">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Visible</th>
                  <th>{editingGroup ? 'In group' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((name) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!configStore.isHidden(name)}
                        onChange={(e) => configStore.setChannelHidden(name, !e.currentTarget.checked)}
                      />
                    </td>
                    <td>
                      {editingGroup && (
                        <input
                          type="checkbox"
                          checked={configStore.isInGroup(editingGroup.id, name)}
                          onChange={() => configStore.toggleChannelInGroup(editingGroup.id, name)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
