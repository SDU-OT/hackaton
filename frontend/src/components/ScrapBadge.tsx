export default function ScrapBadge({ pct }: { pct: number }) {
  const cls = pct >= 10 ? "scrap-high" : pct >= 2 ? "scrap-mid" : "scrap-low";
  return <span className={cls}>{pct.toFixed(1)}%</span>;
}
