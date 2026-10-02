import { useState } from 'react';
import { logStore } from '../logStore.js';

const STATUS_LABEL = {
  sent: 'Sent — awaiting confirmation',
  applied: 'Applied',
  acked: 'Acknowledged',
  unconfirmed: 'Not confirmed',
  error: 'Error',
  ok: 'OK',
};

function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function LogView() {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const needle = filter.toLowerCase();
  const rows = logStore.entries.filter((e) =>
    !needle ||
    [e.operator, e.workstation, e.destination, e.destinationName, e.summary, e.response, e.event]
      .some((v) => String(v ?? '').toLowerCase().includes(needle)),
  );

  return (
    <div className="logView">
      <div className="logHeader">
        <h2>Command log</h2>
        <div className="logActions">
          <input
            className="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
          <button onClick={() => download(`gdc-log-${stamp}.csv`, logStore.toCsv(), 'text/csv')}>
            Export CSV
          </button>
          <button onClick={() => download(`gdc-log-${stamp}.json`, JSON.stringify(logStore.entries, null, 2), 'application/json')}>
            Export JSON
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('Clear the whole command log? This cannot be undone.')) logStore.clear();
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <p className="logNote">
        Recorded in this browser only — there is no central log server, so this covers what was done
        from <strong>this machine</strong>{logStore.workstation ? ` (${logStore.workstation})` : ''}, browser
        ID <strong>{logStore.browserId}</strong>. Keeps the most recent 500 entries. Set a workstation
        label under ⚙ if you want a machine identifier in the Initiator column.
      </p>

      <table className="logTable">
        <thead>
          <tr>
            <th>Time</th>
            <th>Initiator</th>
            <th>Destination</th>
            <th>Command</th>
            <th>Response</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={e.id}
              className={`logRow ${e.status}`}
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
            >
              <td className="logTime">{localTime(e.time)}</td>
              <td>
                {e.operator}
                <span className="sub">
                  {e.workstation ? `${e.workstation} · ` : ''}
                  {e.browserId}
                </span>
              </td>
              <td>
                {e.destination}
                {e.destinationName && <span className="sub">{e.destinationName}</span>}
              </td>
              <td>
                {e.summary}
                <span className="sub">{e.event}</span>
                {expanded === e.id && e.detail && (
                  <pre className="logDetail">{JSON.stringify(e.detail, null, 2)}</pre>
                )}
              </td>
              <td>
                <span className={`logStatus ${e.status}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
                {e.response && <span className="sub">{e.response}</span>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                {logStore.entries.length === 0
                  ? 'Nothing logged yet. Commands and connection events appear here as they happen.'
                  : 'No entries match the filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
