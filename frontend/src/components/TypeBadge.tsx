const TYPED = new Set([
  "ZFRT","ZHLB","ZROH","ZHFRT","ZMAT",
  "ZDIE","ZFHM","ZFRC","ZHAW","ZHIB","ZNLG","ZVRP",
]);

export default function TypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const cls = TYPED.has(type) ? `badge badge-${type}` : "badge";
  return <span className={cls}>{type}</span>;
}
