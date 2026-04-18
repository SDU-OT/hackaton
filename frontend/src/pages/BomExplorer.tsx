import { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "@dagrejs/dagre";
import { GET_BOM_EXPLOSION } from "../graphql/queries";
import type { BomExplosionItem } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";

const NODE_W = 200;
const NODE_H = 72;
const MAX_NODES = 600;

function layoutNodes(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 20 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

function BomNodeComponent({ data }: { data: Record<string, unknown> }) {
  const totalMachine = data.totalMachineMin as number;
  const totalLabor   = data.totalLaborMin   as number;
  const total        = totalMachine + totalLabor || 1;
  const machW        = Math.round((totalMachine / total) * 100);
  const labW         = Math.round((totalLabor   / total) * 100);

  return (
    <div className={`bom-node${data.isRoot ? " root" : ""}`} style={{ fontSize: ".72rem" }}>
      <div className="node-id">{data.label as string}</div>
      <div className="node-desc" title={data.description as string}>
        {data.description as string || "—"}
      </div>
      {!!data.materialType && (
        <div style={{ marginTop: ".2rem" }}>
          <TypeBadge type={String(data.materialType)} />
        </div>
      )}
      {(totalMachine > 0 || totalLabor > 0) && (
        <div className="node-bars">
          {machW > 0 && <div className="bar-machine" style={{ width: `${machW}%` }} />}
          {labW  > 0 && <div className="bar-labor"   style={{ width: `${labW}%`  }} />}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { bomNode: BomNodeComponent };

export default function BomExplorer() {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState(paramId ?? "");
  const [committed, setCommitted] = useState(paramId ?? "");
  const [depth, setDepth] = useState(5);
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph");

  const { data, loading, error } = useQuery<{ bomExplosion: BomExplosionItem[] }>(GET_BOM_EXPLOSION, {
    variables: { materialId: committed, quantity: 1, maxDepth: depth },
    skip: !committed,
  });

  const items = data?.bomExplosion ?? [];

  const { nodes, edges, tooLarge } = useMemo(() => {
    if (!items.length || !committed) return { nodes: [], edges: [], tooLarge: false };

    const nodeMap = new Map<string, Node>();
    const edgeList: Edge[] = [];
    const edgeSeen = new Set<string>();

    nodeMap.set(committed, {
      id: committed,
      type: "bomNode",
      data: { label: committed, isRoot: true, totalMachineMin: 0, totalLaborMin: 0 },
      position: { x: 0, y: 0 },
    });

    for (const item of items) {
      const edgeKey = `${item.parent}->${item.component}`;
      if (!edgeSeen.has(edgeKey)) {
        edgeSeen.add(edgeKey);
        edgeList.push({
          id: edgeKey,
          source: item.parent,
          target: item.component,
          label: `${item.qtyPerParent.toFixed(item.qtyPerParent % 1 === 0 ? 0 : 3)} ${item.unit}`,
          type: "smoothstep",
          animated: item.depth <= 2,
          style: { stroke: "var(--border)" },
          labelStyle: { fill: "var(--text-muted)", fontSize: 10 },
          labelBgStyle: { fill: "var(--bg2)" },
        });
      }
      if (!nodeMap.has(item.component)) {
        nodeMap.set(item.component, {
          id: item.component,
          type: "bomNode",
          data: {
            label:           item.component,
            description:     item.description,
            materialType:    item.materialType,
            depth:           item.depth,
            isRoot:          false,
            totalMachineMin: item.totalMachineMin,
            totalLaborMin:   item.totalLaborMin,
          },
          position: { x: 0, y: 0 },
        });
      }
    }

    const tooLarge = nodeMap.size > MAX_NODES;
    const nodeArr = Array.from(nodeMap.values()).slice(0, MAX_NODES);
    const laidOut = layoutNodes(nodeArr, edgeList);
    return { nodes: laidOut, edges: edgeList, tooLarge };
  }, [items, committed]);

  const commit = useCallback(() => {
    setCommitted(searchId.trim());
    navigate(`/bom/${searchId.trim()}`, { replace: true });
  }, [searchId, navigate]);

  return (
    <>
      <div className="page-header"><h1>BOM Explorer</h1></div>

      <div className="card">
        <div className="search-bar">
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            placeholder="Material ID…"
          />
          <button className="btn btn-primary" onClick={commit}>Load</button>
          <div className="depth-slider">
            <span style={{ fontSize: ".8rem", color: "var(--text-muted)" }}>Depth:</span>
            <input
              type="range"
              min={1} max={15} value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            />
            <span style={{ fontWeight: 700, color: "var(--accent)" }}>{depth}</span>
          </div>
          <button
            className={`btn btn-ghost`}
            onClick={() => setViewMode(viewMode === "graph" ? "table" : "graph")}
          >
            {viewMode === "graph" ? "Table View" : "Graph View"}
          </button>
        </div>
      </div>

      {tooLarge && (
        <div className="error-msg">
          BOM has {items.length} nodes — showing first {MAX_NODES}. Reduce depth or switch to Table View.
        </div>
      )}

      {loading && <div className="spinner">Exploding BOM…</div>}
      {error   && <div className="error-msg">{error.message}</div>}

      {!loading && committed && items.length === 0 && (
        <div className="spinner">No BOM found for {committed}.</div>
      )}

      {!loading && items.length > 0 && viewMode === "graph" && (
        <div className="bom-graph-wrap">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            onNodeClick={(_, node) => navigate(`/materials/${node.id}`)}
          >
            <Background color="var(--border)" gap={24} size={1} />
            <Controls />
            <MiniMap nodeColor={() => "var(--accent)"} maskColor="rgba(15,17,23,.7)" />
          </ReactFlow>
        </div>
      )}

      {!loading && items.length > 0 && viewMode === "table" && (
        <div className="card">
          <div style={{ marginBottom: ".5rem", color: "var(--text-muted)", fontSize: ".85rem" }}>
            {items.length} BOM rows expanded
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Depth</th><th>Parent</th><th>Component</th><th>Description</th>
                  <th>Type</th><th>Qty/Parent</th><th>Total Qty</th>
                  <th>Machine (min)</th><th>Labor (min)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="clickable" onClick={() => navigate(`/materials/${it.component}`)}>
                    <td style={{ fontFamily: "var(--mono)" }}>{it.depth}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{it.parent}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{it.component}</td>
                    <td title={it.description ?? ""}>{it.description ?? "—"}</td>
                    <td><TypeBadge type={it.materialType} /></td>
                    <td>{it.qtyPerParent.toFixed(3)}</td>
                    <td>{it.totalQuantity.toFixed(3)}</td>
                    <td>{it.totalMachineMin > 0 ? it.totalMachineMin.toFixed(2) : "—"}</td>
                    <td>{it.totalLaborMin   > 0 ? it.totalLaborMin.toFixed(2)   : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
