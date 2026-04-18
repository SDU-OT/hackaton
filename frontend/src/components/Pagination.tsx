interface Props {
  offset: number;
  pageSize: number;
  total: number;
  onPage: (offset: number) => void;
}

export default function Pagination({ offset, pageSize, total, onPage }: Props) {
  const page     = Math.floor(offset / pageSize) + 1;
  const lastPage = Math.ceil(total / pageSize);
  const from     = Math.min(offset + 1, total);
  const to       = Math.min(offset + pageSize, total);

  if (total <= pageSize) return null;

  return (
    <div className="pagination" style={{ marginTop: "1rem", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
      <span style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div style={{ display: "flex", gap: ".35rem" }}>
        <button className="btn btn-ghost" disabled={offset === 0} onClick={() => onPage(0)}>«</button>
        <button className="btn btn-ghost" disabled={offset === 0} onClick={() => onPage(offset - pageSize)}>‹ Prev</button>
        <span style={{ padding: ".55rem .75rem", color: "var(--text-muted)", fontSize: ".85rem" }}>
          {page} / {lastPage}
        </span>
        <button className="btn btn-ghost" disabled={page >= lastPage} onClick={() => onPage(offset + pageSize)}>Next ›</button>
        <button className="btn btn-ghost" disabled={page >= lastPage} onClick={() => onPage((lastPage - 1) * pageSize)}>»</button>
      </div>
    </div>
  );
}
