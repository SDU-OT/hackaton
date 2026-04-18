import { useQuery } from "@apollo/client/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { GET_DASHBOARD_STATS } from "../graphql/queries";
import type { DashboardStats } from "../graphql/types";

const PIE_COLORS = ["#4f8ef7", "#a78bfa", "#34d399", "#fbbf24", "#f87171",
                    "#38bdf8", "#fb923c", "#e879f9", "#4ade80", "#facc15"];

export default function Dashboard() {
  const { data, loading, error } = useQuery<{ dashboardStats: DashboardStats }>(GET_DASHBOARD_STATS);

  if (loading) return <div className="spinner">Loading dashboard…</div>;
  if (error)   return <div className="error-msg">Error: {error.message}</div>;

  const s = data!.dashboardStats;

  return (
    <>
      <div className="page-header"><h1>Dashboard</h1></div>

      <div className="stat-grid">
        <StatCard label="Total Materials" value={s.totalMaterials.toLocaleString()} color="accent" />
        <StatCard label="With BOM"        value={s.materialsWithBom.toLocaleString()} color="accent" />
        <StatCard label="With Routing"    value={s.materialsWithRouting.toLocaleString()} color="green" />
        <StatCard label="Total BOM Rows"  value={s.totalBomRows.toLocaleString()} color="yellow" />
      </div>

      <div className="charts-row">
        <div className="card">
          <h3>Material Type Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={s.typeDistribution}
                dataKey="count"
                nameKey="materialType"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ materialType, percent }: any) =>
                  `${materialType} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {s.typeDistribution.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any) => [Number(v).toLocaleString()]}
                contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Top 15 Complex Assemblies (component count)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={s.topComplexMaterials} layout="vertical">
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="material"
                width={80}
                tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--mono)" }}
              />
              <Tooltip
                formatter={(v: any) => [Number(v).toLocaleString(), "Components"]}
                contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Bar dataKey="componentCount" fill="#4f8ef7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Top 15 Worst Scrap Rates</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={s.topScrapMaterials}>
            <XAxis
              dataKey="material"
              tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--mono)" }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={55}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: any, name: any) => [
                name === "scrapRatePct" ? `${Number(v).toFixed(2)}%` : Number(v).toLocaleString(), name,
              ]}
              contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
            />
            <Bar dataKey="scrapRatePct" name="Scrap %" fill="#f87171" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={`value ${color}`}>{value}</div>
    </div>
  );
}
