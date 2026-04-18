import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { GET_MATERIAL, GET_ROUTING, GET_BOM_CHILDREN } from "../graphql/queries";
import type { Material, RoutingOperation, BomItem } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import { gql } from "@apollo/client";

const GET_MATERIAL_SCRAP = gql`
  query GetMaterialScrap($materialId: String!) {
    materialScrap(materialId: $materialId) {
      totalOrdered
      totalScrap
      totalDelivered
      scrapRatePct
    }
  }
`;

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const materialId = id!;

  const { data: mData, loading: mLoad } = useQuery<{ material: Material | null }>(GET_MATERIAL, {
    variables: { materialId },
  });
  const { data: rData, loading: rLoad } = useQuery<{ routing: RoutingOperation[] }>(GET_ROUTING, {
    variables: { materialId },
  });
  const { data: bData, loading: bLoad } = useQuery<{ bomChildren: BomItem[] }>(GET_BOM_CHILDREN, {
    variables: { materialId },
  });
  const { data: scrapData } = useQuery<{ materialScrap: { totalOrdered: number; totalScrap: number; totalDelivered: number; scrapRatePct: number } | null }>(GET_MATERIAL_SCRAP, { variables: { materialId } });

  if (mLoad) return <div className="spinner">Loading…</div>;
  const mat = mData?.material;
  if (!mat) return <div className="error-msg">Material not found: {materialId}</div>;

  const ops = rData?.routing ?? [];
  const children = bData?.bomChildren ?? [];
  const scrap = scrapData?.materialScrap;

  const totalMachine = ops.reduce((s, o) => s + (o.machineMin ?? 0), 0);
  const totalLabor   = ops.reduce((s, o) => s + (o.laborMin  ?? 0), 0);

  return (
    <>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.3rem" }}>{mat.material}</h1>
        <TypeBadge type={mat.materialType} />
      </div>

      <div className="card" style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <Info label="Description" value={mat.description} />
        <Info label="Group"       value={mat.materialGroup} />
        <Info label="Plant"       value={mat.plant} />
        <Info label="Weight"      value={mat.weightKg != null ? `${mat.weightKg} kg` : undefined} />
        <Info label="Status"      value={mat.status} />
        <Info label="Has BOM"     value={mat.hasBom ? "Yes" : "No"} />
        <Info label="Has Routing" value={mat.hasRouting ? "Yes" : "No"} />
      </div>

      {scrap && (
        <div className="card" style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          <Info label="Total Ordered"   value={scrap.totalOrdered.toLocaleString()} />
          <Info label="Total Scrap"     value={scrap.totalScrap.toLocaleString()} />
          <Info label="Total Delivered" value={scrap.totalDelivered.toLocaleString()} />
          <div>
            <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".2rem" }}>Scrap Rate</div>
            <ScrapBadge pct={scrap.scrapRatePct} />
          </div>
        </div>
      )}

      {mat.hasBom && (
        <div className="card">
          <details>
            <summary
              style={{
                cursor: "pointer",
                userSelect: "none",
                fontWeight: 700,
                color: "var(--text-head)",
              }}
            >
              Recipe (Immediate Ingredients) {bLoad ? "" : `(${children.length})`}
            </summary>

            <div style={{ marginTop: ".9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>
                  These are the direct ingredients used to make this material.
                </div>
                <Link to={`/bom/${mat.material}`} className="btn btn-ghost" style={{ fontSize: ".8rem", padding: ".3rem .8rem" }}>
                  Full BOM Explorer →
                </Link>
              </div>

              {bLoad ? (
                <div className="spinner">Loading ingredients…</div>
              ) : children.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>No immediate ingredients found.</div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Component</th><th>Description</th><th>Type</th><th>Qty</th><th>Unit</th><th>Cat</th><th>Has BOM</th></tr>
                    </thead>
                    <tbody>
                      {children.map((c) => (
                        <tr key={c.component} className="clickable" onClick={() => navigate(`/materials/${c.component}`)}>
                          <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{c.component}</code></td>
                          <td title={c.description ?? ""}>{c.description ?? "—"}</td>
                          <td><TypeBadge type={c.materialType} /></td>
                          <td>{c.quantity.toFixed(3)}</td>
                          <td>{c.unit}</td>
                          <td>{c.itemCategory}</td>
                          <td>{c.hasChildren ? "✓" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {mat.hasRouting && (
        <div className="card">
          <h3 style={{ marginBottom: ".75rem" }}>
            Routing Operations ({ops.length}) —
            Machine: <span style={{ color: "var(--accent)" }}>{totalMachine.toFixed(1)} min</span> |
            Labor: <span style={{ color: "var(--green)" }}>{totalLabor.toFixed(1)} min</span>
          </h3>
          {rLoad ? <div className="spinner">Loading routing…</div> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th>Description</th><th>WC</th><th>Key</th><th>Machine</th><th>Labor</th><th>Setup</th></tr>
                </thead>
                <tbody>
                  {ops.map((op, i) => (
                    <tr key={i}>
                      <td>{op.sequence}</td>
                      <td>{op.description ?? "—"}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{op.wcId ?? "—"}</td>
                      <td>{op.ctrlKey ?? "—"}</td>
                      <td>{op.machineMin != null ? <span className="time-pill machine">{op.machineMin.toFixed(2)} min</span> : "—"}</td>
                      <td>{op.laborMin  != null ? <span className="time-pill labor">{op.laborMin.toFixed(2)} min</span>  : "—"}</td>
                      <td>{op.setupMin  != null ? <span className="time-pill setup">{op.setupMin.toFixed(2)} min</span>  : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".15rem" }}>{label}</div>
      <div style={{ fontWeight: 600, color: "var(--text-head)" }}>{value ?? "—"}</div>
    </div>
  );
}
