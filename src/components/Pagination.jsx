export const PAGE_SIZE = 30;

// Only rendered when the filtered list exceeds one page.
export function Pagination({ pageCount, page, onSelect }) {
  if (pageCount <= 1) return null;
  return (
    <div className="pagination">
      {Array.from({ length: pageCount }, (_, i) => (
        <button key={i} className={`pageTab ${i === page ? 'active' : ''}`} onClick={() => onSelect(i)}>
          Page {i + 1}
        </button>
      ))}
    </div>
  );
}
