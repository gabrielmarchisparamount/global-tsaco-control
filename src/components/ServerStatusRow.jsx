// Every configured appliance is half of a changeover pair, so every one
// renders two boxes: the appliance itself and its opposite leg.
//
// The appliance reports its own role (config.options.isMain) and its
// partner's address (config.options.pairAddress) once connected, and the
// partner's reachability via the pair:* events. Those values are remembered
// in localStorage, so a server that is currently down still renders as a
// named Main/Backup pair rather than a single anonymous box.

function selfStatus(backend) {
  if (backend.connected) return { text: 'Connected', cls: 'connected' };
  if (backend.connecting) return { text: 'Connecting…', cls: 'connecting' };
  if (backend.authFailed) return { text: 'Login failed', cls: 'disconnected' };
  if (backend.lastError) return { text: 'Unreachable', cls: 'disconnected' };
  return { text: 'Disconnected', cls: 'disconnected' };
}

// The partner's state is reported *by* the appliance, so it is only known
// while we are connected to that appliance. Saying "Unknown" is honest;
// saying "Disconnected" would claim a leg is down when we simply cannot see it.
function partnerStatus(backend) {
  if (!backend.connected) return { text: 'Unknown', cls: 'unknown' };
  return backend.pairConnected
    ? { text: 'Connected', cls: 'connected' }
    : { text: 'Disconnected', cls: 'disconnected' };
}

function roleLabel(isMain) {
  if (isMain === undefined) return '';
  return isMain ? ' (Main)' : ' (Backup)';
}

function Box({ name, role, status, hint, muted }) {
  return (
    <div className={`serverBox ${status.cls} ${muted ? 'muted' : ''}`} title={hint}>
      <div className="serverName">
        {name}
        {role}
      </div>
      <div className="serverStatusLine">
        <span className={`pip ${status.cls}`} />
        <span>{status.text}</span>
      </div>
    </div>
  );
}

export function ServerStatusRow({ backends }) {
  if (!backends.length) {
    return <div className="serverStatusRow empty">No servers in this region.</div>;
  }

  return (
    <div className="serverStatusRow">
      {backends.flatMap((b) => {
        const { isMain, pairAddress } = b;
        const partnerRole = isMain === undefined ? '' : roleLabel(!isMain);
        return [
          <Box
            key={`${b.id}-self`}
            name={b.systemName || b.label}
            role={roleLabel(isMain)}
            status={selfStatus(b)}
            hint={`${b.host}${b.port ? `:${b.port}` : ''}`}
          />,
          <Box
            key={`${b.id}-pair`}
            name={pairAddress || 'Paired appliance'}
            role={partnerRole}
            status={partnerStatus(b)}
            // Nothing has told us this pair exists yet — show the slot, but
            // don't dress it up as a known appliance.
            muted={!pairAddress}
            hint={
              pairAddress
                ? `Paired appliance of ${b.systemName || b.label}`
                : `Partner of ${b.label} — not reported yet; connect to learn it`
            }
          />,
        ];
      })}
    </div>
  );
}
