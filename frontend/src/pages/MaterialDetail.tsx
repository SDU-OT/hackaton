import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { GET_MATERIAL, GET_ROUTING, GET_BOM_CHILDREN, GET_BOM_EXPLOSION } from "../graphql/queries";
import type { Material, RoutingOperation, BomItem, BomExplosionItem } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import { gql } from "@apollo/client";
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Position, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

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
  const [bomBarOpen, setBomBarOpen] = useState(false);

  const { data: mData, loading: mLoad } = useQuery<{ material: Material | null }>(GET_MATERIAL, {
    variables: { materialId },
  });
  const { data: rData, loading: rLoad } = useQuery<{ routing: RoutingOperation[] }>(GET_ROUTING, {
    variables: { materialId },
  });
  const { data: bData, loading: bLoad } = useQuery<{ bomChildren: BomItem[] }>(GET_BOM_CHILDREN, {
    variables: { materialId },
  });
  const hasBom = Boolean(mData?.material?.hasBom);
  const { data: xData, loading: xLoad } = useQuery<{ bomExplosion: BomExplosionItem[] }>(GET_BOM_EXPLOSION, {
    variables: { materialId, quantity: 1, maxDepth: 3 },
    skip: !hasBom || !bomBarOpen,
  });
  const { data: scrapData } = useQuery<{ materialScrap: { totalOrdered: number; totalScrap: number; totalDelivered: number; scrapRatePct: number } | null }>(GET_MATERIAL_SCRAP, { variables: { materialId } });

  if (mLoad) return <div className="spinner">Loading…</div>;
  const mat = mData?.material;
  if (!mat) return <div className="error-msg">Material not found: {materialId}</div>;

  const ops = rData?.routing ?? [];
  const children = bData?.bomChildren ?? [];
  const explosion = xData?.bomExplosion ?? [];
  const scrap = scrapData?.materialScrap;

  const totalMachine = ops.reduce((s, o) => s + (o.machineMin ?? 0), 0);
  const totalLabor   = ops.reduce((s, o) => s + (o.laborMin  ?? 0), 0);
  const embeddedGraph = buildEmbeddedBomGraph(mat.material, mat.description ?? null, explosion);

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

      {mat.hasBom && (
        <div className="card">
          <details onToggle={(e) => setBomBarOpen(e.currentTarget.open)}>
            <summary
              style={{
                cursor: "pointer",
                userSelect: "none",
                fontWeight: 700,
                color: "var(--text-head)",
              }}
            >
              BOM Explorer
            </summary>

            <div style={{ marginTop: ".9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>
                  Diagram preview for {mat.material}.
                </div>
                <Link to={`/bom/${mat.material}`} className="btn btn-ghost" style={{ fontSize: ".8rem", padding: ".3rem .8rem" }}>
                  Open Full BOM Explorer →
                </Link>
              </div>

              {!bomBarOpen ? (
                <div style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>
                  Expand this section to load the BOM diagram.
                </div>
              ) : xLoad ? (
                <div className="spinner">Loading BOM diagram…</div>
              ) : embeddedGraph.nodes.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>
                  No BOM diagram data available for this material.
                </div>
              ) : (
                <div
                  style={{
                    height: 540,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--bg2)",
                  }}
                >
                  <ReactFlow
                    nodes={embeddedGraph.nodes}
                    edges={embeddedGraph.edges}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    defaultEdgeOptions={{
                      type: "smoothstep",
                      markerEnd: { type: MarkerType.ArrowClosed },
                    }}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    panOnDrag
                    zoomOnScroll
                    minZoom={0.2}
                    maxZoom={1.8}
                  >
                    <MiniMap
                      zoomable
                      pannable
                      nodeColor={(node) => (node.id === mat.material ? "#2e90fa" : "#5a6076")}
                      maskColor="rgba(15,17,23,.65)"
                    />
                    <Controls showInteractive={false} />
                    <Background gap={18} size={1} />
                  </ReactFlow>
                </div>
              )}

              {bomBarOpen && embeddedGraph.truncated && (
                <div style={{ color: "var(--text-muted)", fontSize: ".78rem", marginTop: ".55rem" }}>
                  Diagram is truncated for performance. Open Full BOM Explorer for complete detail.
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

function buildEmbeddedBomGraph(
  rootMaterial: string,
  rootDescription: string | null,
  items: BomExplosionItem[],
): { nodes: Node[]; edges: Edge[]; truncated: boolean } {
  const NODE_W = 220;
  const COL_GAP = 110;
  const ROW_GAP = 86;
  const MAX_ITEMS = 1000;
  const MAX_NODES = 260;
  const MAX_EDGES = 420;

  const sourceItems = items.slice(0, MAX_ITEMS);
  const truncatedByItems = sourceItems.length < items.length;

  const nodeDepth = new Map<string, number>();
  const nodeLabel = new Map<string, string>();
  const edgeMap = new Map<string, Edge>();

  nodeDepth.set(rootMaterial, 0);
  nodeLabel.set(rootMaterial, rootDescription ? `${rootMaterial} - ${rootDescription}` : rootMaterial);

  for (const row of sourceItems) {
    const currentDepth = nodeDepth.get(row.component);
    if (currentDepth == null || row.depth < currentDepth) {
      nodeDepth.set(row.component, row.depth);
    }
    if (!nodeDepth.has(row.parent)) {
      nodeDepth.set(row.parent, Math.max(0, row.depth - 1));
    }

    if (!nodeLabel.has(row.component)) {
      const desc = row.description ? ` - ${row.description}` : "";
      const label = `${row.component}${desc}`;
      nodeLabel.set(row.component, label.length > 72 ? `${label.slice(0, 72)}...` : label);
    }

    const key = `${row.parent}->${row.component}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        id: key,
        source: row.parent,
        target: row.component,
        label: row.qtyPerParent > 0 ? `${row.qtyPerParent.toFixed(3)} ${row.unit}` : undefined,
      });
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const [id, depth] of nodeDepth.entries()) {
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(id);
  }

  const nodes: Node[] = [];
  for (const [depth, ids] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
    ids.sort((a, b) => a.localeCompare(b));
    const offsetY = ((ids.length - 1) * ROW_GAP) / 2;

    ids.forEach((id, idx) => {
      const isRoot = id === rootMaterial;
      nodes.push({
        id,
        position: { x: depth * (NODE_W + COL_GAP), y: idx * ROW_GAP - offsetY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: nodeLabel.get(id) ?? id },
        style: {
          width: NODE_W,
          borderRadius: 10,
          border: isRoot ? "2px solid #2e90fa" : "1px solid var(--border)",
          background: isRoot ? "rgba(46,144,250,.12)" : "var(--surface)",
          color: "var(--text-head)",
          fontSize: ".75rem",
          fontWeight: isRoot ? 700 : 500,
          boxShadow: isRoot ? "0 0 0 1px rgba(46,144,250,.25)" : "none",
          padding: "8px 10px",
        },
      });
    });
  }

  const edges = Array.from(edgeMap.values());
  const truncatedBySize = nodes.length > MAX_NODES || edges.length > MAX_EDGES;

  return {
    nodes: nodes.slice(0, MAX_NODES),
    edges: edges.slice(0, MAX_EDGES),
    truncated: truncatedByItems || truncatedBySize,
  };
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".15rem" }}>{label}</div>
      <div style={{ fontWeight: 600, color: "var(--text-head)" }}>{value ?? "—"}</div>
    </div>
  );
}
