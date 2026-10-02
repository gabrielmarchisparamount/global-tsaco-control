// Switching to a region this install does not live in is a deliberate act —
// the channels there belong to a different site's transmission chain.
export function RegionChallenge({ targetRegion, homeRegion, onConfirm, onCancel }) {
  return (
    <div className="modalBackdrop" onClick={onCancel}>
      <div className="modal challenge" onClick={(e) => e.stopPropagation()}>
        <h2>Switch to {targetRegion}?</h2>
        <p>
          This install is local to <strong>{homeRegion}</strong>. <strong>{targetRegion}</strong> is a remote
          region — its channels are on a different site's transmission chain.
        </p>
        <p className="warn">Any switch you make there takes effect on that site's live output.</p>
        <div className="challengeActions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>
            Switch to {targetRegion}
          </button>
        </div>
      </div>
    </div>
  );
}
