import { useState } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GET_PRODUCTION_PLAN } from "../graphql/queries";
import type { ProductionPlan, ProductionPlanComponent } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;
type SortKey = "component" | "materialGroup" | "totalQuantity" | "depth" | "totalMachineMin" | "totalLaborMin";

function getMrpGroupLabel(component: ProductionPlanComponent): string {
  return component.materialGroup?.trim() || "Unassigned";
}

export default function ProductionPlanner() {
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity]   = useState("1");
  const [sortKey, setSortKey]     = useState<SortKey>("depth");
  const [sortAsc, setSortAsc]     = useState(true);
  const [mrpFilter, setMrpFilter] = useState("ALL");
  const [tableOffset, setTableOffset] = useState(0);
  const navigate = useNavigate();

  const [runPlan, { data, loading, error }] = useLazyQuery<{ productionPlan: ProductionPlan }>(
    GET_PRODUCTION_PLAN
  );

  const plan = data?.productionPlan;

  function handleSubmit() {
    const qty = parseFloat(quantity);
    if (!materialId.trim() || isNaN(qty) || qty <= 0) return;
    setTableOffset(0);
    setMrpFilter("ALL");
    runPlan({ variables: { materialId: materialId.trim(), quantity: qty } });
  }

  function toggleSort(key: SortKey) {
    setTableOffset(0);
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "component" || key === "materialGroup"); }
  }

  const sorted: ProductionPlanComponent[] = plan
    ? [...plan.components].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "component") {
          cmp = a.component.localeCompare(b.component);
        } else if (sortKey === "materialGroup") {
          cmp = getMrpGroupLabel(a).localeCompare(getMrpGroupLabel(b));
        } else {
          const v1 = a[sortKey] as number;
          const v2 = b[sortKey] as number;
          cmp = v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
        }
        return sortAsc ? cmp : -cmp;
      })
    : [];

  const mrpGroups = plan
    ? Array.from(new Set(plan.components.map((c) => getMrpGroupLabel(c)))).sort((a, b) => a.localeCompare(b))
    : [];

  const groupedByMrp = plan
    ? mrpGroups.map((group) => ({
        group,
        count: plan.components.filter((c) => getMrpGroupLabel(c) === group).length,
      }))
    : [];

  const filtered = sorted.filter((c) => mrpFilter === "ALL" || getMrpGroupLabel(c) === mrpFilter);

  // Chart: machine + labor per depth level
  const depthChart = (() => {
    if (!plan) return [];
    const map = new Map<number, { machine: number; labor: number }>();
    for (const c of plan.components) {
      const cur = map.get(c.depth) ?? { machine: 0, labor: 0 };
      cur.machine += c.totalMachineMin;
      cur.labor   += c.totalLaborMin;
      map.set(c.depth, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([depth, v]) => ({ depth: `L${depth}`, machine: +v.machine.toFixed(1), labor: +v.labor.toFixed(1) }));
  })();

  const th = (key: SortKey, label: string) => (
    <th onClick={() => toggleSort(key)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {sortKey === key ? (sortAsc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <>
      <div className="page-header"><h1>Production Planner</h1></div>

      <div className="card">
        <div className="planner-form">
          <div className="form-group">
            <label>Material ID</label>
            <input
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. 0100769"
              style={{ width: 200 }}
            />
          </div>
          <div className="form-group">
            <label>Quantity</label>
            <input
              type="number"
              min="0.001"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={{ width: 100 }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Calculating…" : "Calculate Plan"}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error.message}</div>}

      {plan && (
        <>
          <div className="card" style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>Root Material</div>
              <div style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>
                <span
                  style={{ cursor: "pointer", color: "var(--accent)" }}
                  onClick={() => navigate(`/materials/${plan.rootMaterial}`)}
                >
                  {plan.rootMaterial}
                </span>
              </div>
              {plan.rootDescription && (
                <div style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>{plan.rootDescription}</div>
              )}
            </div>
            <Info label="Quantity" value={plan.requestedQuantity.toLocaleString()} />
            <Info label="Unique Components" value={plan.components.length.toLocaleString()} />
            <Info label="Max Depth" value={String(plan.maxDepthReached)} />
            <Info label="Total Machine" value={`${plan.totalMachineMin.toFixed(1)} min`} color="var(--accent)" />
            <Info label="Total Labor"   value={`${plan.totalLaborMin.toFixed(1)} min`} color="var(--green)" />
          </div>

          {depthChart.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: ".75rem" }}>Machine vs Labor Time by Depth Level</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={depthChart}>
                  <XAxis dataKey="depth" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => `${v} min`}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v: any, name: any) => [`${Number(v).toLocaleString()} min`, name]}
                    contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
                  />
                  <Legend />
                  <Bar dataKey="machine" name="Machine (min)" stackId="a" fill="#4f8ef7" />
                  <Bar dataKey="labor"   name="Labor (min)"   stackId="a" fill="#34d399" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".75rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
              <h3 style={{ margin: 0 }}>
                Component Summary ({filtered.length.toLocaleString()} shown of {sorted.length.toLocaleString()} unique)
              </h3>
              <div className="planner-form">
                <div className="form-group">
                  <label>MRP Group Filter</label>
                  <select
                    value={mrpFilter}
                    onChange={(e) => {
                      setMrpFilter(e.target.value);
                      setTableOffset(0);
                    }}
                    style={{ minWidth: 180 }}
                  >
                    <option value="ALL">All Groups</option>
                    {mrpGroups.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {groupedByMrp.length > 0 && (
              <div style={{ marginBottom: ".75rem", color: "var(--text-muted)", fontSize: ".82rem" }}>
                {groupedByMrp.map((g) => `${g.group}: ${g.count}`).join("  |  ")}
              </div>
            )}
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {th("component",       "Component")}
                    {th("materialGroup",   "MRP Group")}
                    <th>Description</th>
                    <th>Type</th>
                    {th("depth",           "Depth")}
                    {th("totalQuantity",   "Total Qty")}
                    <th>Unit</th>
                    {th("totalMachineMin", "Machine (min)")}
                    {th("totalLaborMin",   "Labor (min)")}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(tableOffset, tableOffset + PAGE_SIZE).map((c) => (
                    <tr key={c.component} className="clickable" onClick={() => navigate(`/materials/${c.component}`)}>
                      <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{c.component}</code></td>
                      <td>{getMrpGroupLabel(c)}</td>
                      <td title={c.description ?? ""}>{c.description ?? "—"}</td>
                      <td><TypeBadge type={c.materialType} /></td>
                      <td>{c.depth}</td>
                      <td>{c.totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                      <td>{c.unit}</td>
                      <td>{c.totalMachineMin > 0 ? c.totalMachineMin.toFixed(2) : "—"}</td>
                      <td>{c.totalLaborMin   > 0 ? c.totalLaborMin.toFixed(2)   : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              offset={tableOffset}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPage={setTableOffset}
            />
          </div>
        </>
      )}
    </>
  );
}

function Info({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".15rem" }}>{label}</div>
      <div style={{ fontWeight: 700, color: color ?? "var(--text-head)" }}>{value}</div>
    </div>
  );
}
