// Pure helpers for the Techex Engineer UI Socket.IO protocol (see README.md).
// Shared by every backend connection, regardless of which server it points at.

// Maps a source's PES/TS identifiers to the A/B/C/D label shown in the UI.
export function sourceLabel(pesSource, tsSource) {
  switch (tsSource) {
    case 'One':
      return pesSource === 'One' ? 'A' : 'B';
    case 'Two':
      return 'C';
    case 'Three':
      return 'D';
    default:
      return 'Unknown';
  }
}

// "none" if nothing pending, else the label of the requested-but-not-yet-applied source.
export function requestedLabel(leg) {
  if (leg.PESRequested === leg.PESSource) return 'none';
  return sourceLabel(leg.PESRequested, leg.TSSource);
}

// Different Engineer UI server versions send a channel leg (main/backup) in
// two different shapes:
//  - newer: { source: "A", requested: "A" } — already-resolved letters
//  - older: { PESSource, PESRequested, TSSource } — needs sourceLabel()
// This normalizes either into the { path, requestedPath } shape the UI uses.
export function resolveLeg(leg) {
  if (!leg) return { path: undefined, requestedPath: undefined };
  if (leg.source !== undefined) {
    return {
      path: leg.source,
      requestedPath: leg.requested === leg.source ? 'none' : leg.requested,
    };
  }
  return {
    path: sourceLabel(leg.PESSource, leg.TSSource),
    requestedPath: requestedLabel(leg),
  };
}

// Mode is derived from a channel's independent logic-block flags, not a flat field:
// all blocks truthy -> "Manual", all falsy -> "Auto", mixed -> "Partial".
export function computeMode(logicBlocks) {
  if (!logicBlocks) return undefined;
  const values = Object.values(logicBlocks);
  if (!values.length) return undefined;
  const allManual = values.every(Boolean);
  const allAuto = values.every((v) => !v);
  return allManual ? 'Manual' : allAuto ? 'Auto' : 'Partial';
}
