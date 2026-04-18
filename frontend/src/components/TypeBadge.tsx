export default function TypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  const cls = ["ZFRT", "ZHLB", "ZROH", "ZHFRT", "ZMAT"].includes(type)
    ? `badge badge-${type}`
    : "badge badge-default";
  return <span className={cls}>{type}</span>;
}
