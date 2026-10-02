import { useState } from 'react';
import { backendRegistry } from '../backendRegistry.js';

function statusText(backend) {
  if (backend.connecting) return 'Connecting…';
  if (backend.authFailed) return 'Login failed';
  if (backend.connected) return `Connected — ${Object.keys(backend.state).length} channels`;
  if (backend.lastError) return `Connection error: ${backend.lastError}`;
  return 'Disconnected';
}

export function ServerConfig({ backends, onAdd }) {
  const [label, setLabel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5160');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!host || !username) return;
    backendRegistry.add({ label: label || host, host, port, username, password });
    setLabel('');
    setHost('');
    setUsername('');
    setPassword('');
    onAdd?.();
  }

  return (
    <div className="serverConfig">
      <h2>Backend servers</h2>

      <table className="serverTable">
        <thead>
          <tr>
            <th>Label</th>
            <th>Host</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {backends.map((b) => (
            <tr key={b.id}>
              <td>{b.label}</td>
              <td>{b.port ? `${b.host}:${b.port}` : b.host}</td>
              <td className={b.connected ? 'ok' : b.authFailed || b.lastError ? 'error' : ''}>{statusText(b)}</td>
              <td>
                <button onClick={() => backendRegistry.remove(b.id)}>Remove</button>
              </td>
            </tr>
          ))}
          {backends.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">No servers added yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Add server</h3>
      <form className="serverForm" onSubmit={submit}>
        <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        <input
          placeholder="Host / IP (or https://host)"
          value={host}
          onChange={(e) => setHost(e.currentTarget.value)}
          required
        />
        <input placeholder="Port (optional)" value={port} onChange={(e) => setPort(e.currentTarget.value)} />
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.currentTarget.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <button type="submit">Add & Connect</button>
      </form>
    </div>
  );
}
