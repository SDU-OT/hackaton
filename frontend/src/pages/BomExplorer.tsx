import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import ReactFlow, {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  MarkerType,
  getBezierPath,
  type Node,
  type Edge,
  type EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { GET_BOM_EXPLOSION, GET_MATERIAL } from "../graphql/queries";
import type { BomExplosionItem } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";

const NODE_W = 200;
const NODE_H = 72;
const GROUP_PAD_X = 40;
const GROUP_PAD_TOP = 38;
const GROUP_PAD_BOTTOM = 24;
const GROUP_COLUMN_GAP = 76;
const LEVEL_ROW_GAP = 44;
const LEVEL_NODE_GAP = 24;
const ROOT_TO_LEVEL_GAP = 90;
const MAX_NODES = 600;

function getMrpLabel(value: unknown) {
  const s = String(value ?? "").trim();
  return s || "Unassigned";
}

function getColorForGroup(index: number) {
  const hue = (index * 61) % 360;
  return {
    accent: `hsl(${hue}, 78%, 56%)`,
    border: `hsla(${hue}, 80%, 56%, 0.52)`,
    fill: `hsla(${hue}, 85%, 54%, 0.12)`,
    inset: `hsla(${hue}, 88%, 58%, 0.26)`,
    chipFill: `hsla(${hue}, 85%, 54%, 0.2)`,
  };
}

function BomNodeComponent({ data }: { data: Record<string, unknown> }) {
  const totalMachine = data.totalMachineMin as number;
  const totalLabor   = data.totalLaborMin   as number;
  const total        = totalMachine + totalLabor || 1;
  const machW        = Math.round((totalMachine / total) * 100);
  const labW         = Math.round((totalLabor   / total) * 100);
  const mrpColor     = typeof data.mrpColor === "string" ? data.mrpColor : "";
  const dimmed       = Boolean(data.dimmed);
  const requiredQty  = Number(data.requiredQty ?? 0);
  const requiredUnit = String(data.requiredUnit ?? "").trim();
  const requiredText = Number.isFinite(requiredQty)
    ? requiredQty.toFixed(requiredQty % 1 === 0 ? 0 : 3)
    : "0";
  const colorStyle = !data.isRoot && mrpColor
    ? {
        borderColor: mrpColor,
        boxShadow: `0 0 0 1px ${mrpColor}33, inset 4px 0 0 ${mrpColor}`,
      }
    : undefined;

  return (
    <div
      className={`bom-node${data.isRoot ? " root" : ""}`}
      style={{
        fontSize: ".72rem",
        ...colorStyle,
        opacity: dimmed ? 0.28 : 1,
        filter: dimmed ? "saturate(0.22)" : "none",
        transition: "opacity .15s ease, filter .15s ease",
      }}
    >
      <Handle type="target" position={Position.Top} className="bom-handle" />
      <div className="node-id">{data.label as string}</div>
      <div className="node-desc" title={data.description as string}>
        {data.description as string || "-"}
      </div>
      {requiredQty > 0 && (
        <div className="node-qty" title="Total required quantity for this BOM explosion">
          Quantity : {requiredText}
        </div>
      )}
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
      <Handle type="source" position={Position.Bottom} className="bom-handle" />
    </div>
  );
}

function MrpGroupNodeComponent({ data }: { data: Record<string, unknown> }) {
  const metaText = data.metaText != null ? String(data.metaText) : `${String(data.count ?? 0)} materials`;
  const accent = typeof data.groupAccent === "string" ? data.groupAccent : "#93c5fd";
  const border = typeof data.groupBorderColor === "string" ? data.groupBorderColor : "rgba(147,197,253,.4)";
  const fill = typeof data.groupFill === "string" ? data.groupFill : "transparent";
  const inset = typeof data.groupInset === "string" ? data.groupInset : "none";

  return (
    <div
      className="mrp-group-node"
      style={{
        color: accent,
        borderColor: border,
        background: fill,
        boxShadow: inset,
        opacity: Boolean(data.dimmed) ? 0.28 : 1,
        filter: Boolean(data.dimmed) ? "saturate(0.22)" : "none",
        transition: "opacity .15s ease, filter .15s ease",
      }}
    >
      <div className="mrp-group-title">MRP {String(data.label ?? "")}</div>
      <div className="mrp-group-meta">{metaText}</div>
    </div>
  );
}

function BomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
}: EdgeProps) {
  const edgeLabel = String(label ?? "").trim();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            className="bom-edge-label"
            style={{
              transform: `translate(-50%, -130%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { bomNode: BomNodeComponent, mrpGroup: MrpGroupNodeComponent };
const edgeTypes = { bomEdge: BomEdge };

export default function BomExplorer() {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState(paramId ?? "");
  const [committed, setCommitted] = useState(paramId ?? "");
  const [depth, setDepth] = useState(5);
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph");
  const [inactiveMrps, setInactiveMrps] = useState<string[]>([]);

  const { data, loading, error } = useQuery<{ bomExplosion: BomExplosionItem[] }>(GET_BOM_EXPLOSION, {
    variables: { materialId: committed, quantity: 1, maxDepth: depth },
    skip: !committed,
  });

  const items = data?.bomExplosion ?? [];
  const rootMaterialId = items[0]?.parent ?? committed;

  const { data: rootMaterialData } = useQuery<{
    material: {
      mrpController?: string | null;
      materialType?: string | null;
      description?: string | null;
    } | null;
  }>(GET_MATERIAL, {
    variables: { materialId: rootMaterialId },
    skip: !rootMaterialId,
  });

  const rootMrpController = rootMaterialData?.material?.mrpController;
  const rootMaterialType = rootMaterialData?.material?.materialType ?? null;
  const rootMaterialDescription = rootMaterialData?.material?.description?.trim() || "—";
  const rootMrpLabel = getMrpLabel(rootMrpController);

  useEffect(() => {
    const next = (paramId ?? "").trim();
    setSearchId(next);
    setCommitted(next);
    setInactiveMrps([]);
  }, [paramId]);

  const { nodes, edges, tooLarge, mrpLegend } = useMemo(() => {
    if (!items.length || !committed) return { nodes: [], edges: [], tooLarge: false, mrpLegend: [] };

    const effectiveRootId = items[0]?.parent ?? committed;
    const nodeMap = new Map<string, Node>();
    const edgeList: Edge[] = [];
    const edgeSeen = new Set<string>();

    nodeMap.set(effectiveRootId, {
      id: effectiveRootId,
      type: "bomNode",
      data: {
        label: effectiveRootId,
        isRoot: true,
        mrpController: rootMrpLabel,
        materialType: rootMaterialType,
        requiredQty: 1,
        requiredUnit: "PC",
        totalMachineMin: 0,
        totalLaborMin: 0,
      },
      position: { x: 0, y: 0 },
      zIndex: 2,
    });

    for (const item of items) {
      const edgeKey = `${item.parent}->${item.component}`;
      if (!edgeSeen.has(edgeKey)) {
        edgeSeen.add(edgeKey);
        edgeList.push({
          id: edgeKey,
          source: item.parent,
          target: item.component,
          type: "bomEdge",
          data: { depth: item.depth },
        });
      }
      const existingNode = nodeMap.get(item.component);
      if (!existingNode) {
        nodeMap.set(item.component, {
          id: item.component,
          type: "bomNode",
          data: {
            label:           item.component,
            description:     item.description,
            materialType:    item.materialType,
            mrpController:   item.mrpController,
            depth:           item.depth,
            isRoot:          false,
            requiredQty:     item.totalQuantity,
            requiredUnit:    item.unit,
            totalMachineMin: item.totalMachineMin,
            totalLaborMin:   item.totalLaborMin,
          },
          position: { x: 0, y: 0 },
          zIndex: 2,
        });
      } else {
        const currentData = existingNode.data as Record<string, unknown>;
        const prevQty = Number(currentData.requiredQty ?? 0);
        const prevUnit = String(currentData.requiredUnit ?? "").trim();
        const nextUnitRaw = String(item.unit ?? "").trim();
        const nextUnit = prevUnit && nextUnitRaw && prevUnit !== nextUnitRaw
          ? "mixed"
          : (prevUnit || nextUnitRaw);
        existingNode.data = {
          ...currentData,
          requiredQty: (Number.isFinite(prevQty) ? prevQty : 0) + item.totalQuantity,
          requiredUnit: nextUnit,
        };
      }
    }

    const tooLarge = nodeMap.size > MAX_NODES;
    const nodeArr = Array.from(nodeMap.values()).slice(0, MAX_NODES);
    const rootNode = nodeArr.find((node) => node.data?.isRoot);
    const nonRootNodes = nodeArr.filter((node) => !node.data?.isRoot);

    const groupBuckets = new Map<string, Node[]>();
    for (const node of nonRootNodes) {
      const mrp = getMrpLabel(node.data?.mrpController);
      if (!groupBuckets.has(mrp)) groupBuckets.set(mrp, []);
      groupBuckets.get(mrp)!.push(node);
    }

    const groupNodes: Node[] = [];
    const sortedGroups = Array.from(groupBuckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const allLabels = Array.from(new Set([...sortedGroups.map(([label]) => label), rootMrpLabel]))
      .sort((a, b) => a.localeCompare(b));
    const colorByLabel = new Map<string, ReturnType<typeof getColorForGroup>>();
    for (let i = 0; i < allLabels.length; i += 1) {
      colorByLabel.set(allLabels[i], getColorForGroup(i));
    }

    const legendCounts = new Map<string, number>();
    for (const [label, nodesInGroup] of sortedGroups) {
      legendCounts.set(label, nodesInGroup.length);
    }
    legendCounts.set(rootMrpLabel, (legendCounts.get(rootMrpLabel) ?? 0) + 1);

    let cursorX = 0;
    const levelBaseY = NODE_H + ROOT_TO_LEVEL_GAP;

    for (let index = 0; index < sortedGroups.length; index += 1) {
      const [mrp, groupNodesRaw] = sortedGroups[index];
      if (!groupNodesRaw.length) continue;

      const colors = colorByLabel.get(mrp) ?? getColorForGroup(index);
      const isMuted = inactiveMrps.includes(mrp);
      const depthBuckets = new Map<number, Node[]>();

      for (const node of groupNodesRaw) {
        const nodeDepth = Number(node.data?.depth ?? 1);
        const depth = Number.isFinite(nodeDepth) && nodeDepth > 0 ? nodeDepth : 1;
        if (!depthBuckets.has(depth)) depthBuckets.set(depth, []);
        depthBuckets.get(depth)!.push(node);
      }

      const sortedDepths = Array.from(depthBuckets.keys()).sort((a, b) => a - b);
      let maxCols = 1;
      for (const depth of sortedDepths) {
        const rowNodes = depthBuckets.get(depth)!;
        rowNodes.sort((a, b) => String(a.data?.label ?? "").localeCompare(String(b.data?.label ?? "")));
        if (rowNodes.length > maxCols) maxCols = rowNodes.length;
      }

      const groupContentWidth = maxCols * NODE_W + (maxCols - 1) * LEVEL_NODE_GAP;
      const groupLeft = cursorX;

      for (const depth of sortedDepths) {
        const rowY = levelBaseY + (depth - 1) * (NODE_H + LEVEL_ROW_GAP);
        const rowNodes = depthBuckets.get(depth)!;
        for (let col = 0; col < rowNodes.length; col += 1) {
          const node = rowNodes[col];
          node.position = { x: groupLeft + col * (NODE_W + LEVEL_NODE_GAP), y: rowY };
          node.data = { ...node.data, mrpColor: colors.accent, dimmed: isMuted };
        }
      }

      const minX = Math.min(...groupNodesRaw.map((n) => n.position.x));
      const minY = Math.min(...groupNodesRaw.map((n) => n.position.y));
      const maxX = Math.max(...groupNodesRaw.map((n) => n.position.x + NODE_W));
      const maxY = Math.max(...groupNodesRaw.map((n) => n.position.y + NODE_H));

      groupNodes.push({
        id: `mrp:${mrp}`,
        type: "mrpGroup",
        position: { x: minX - GROUP_PAD_X, y: minY - GROUP_PAD_TOP },
        data: {
          label: mrp,
          count: groupNodesRaw.length,
          dimmed: isMuted,
          groupAccent: colors.accent,
          groupBorderColor: colors.border,
          groupFill: colors.fill,
          groupInset: `inset 0 0 0 1px ${colors.inset}`,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        zIndex: 0,
        style: {
          width: maxX - minX + GROUP_PAD_X * 2,
          height: maxY - minY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
        },
      });

      cursorX += groupContentWidth + GROUP_PAD_X * 2 + GROUP_COLUMN_GAP;
    }

    if (rootNode) {
      const totalWidth = cursorX > 0 ? cursorX - GROUP_COLUMN_GAP : NODE_W;
      rootNode.position = { x: Math.max(0, totalWidth / 2 - NODE_W / 2), y: 0 };

      const rootColors = colorByLabel.get(rootMrpLabel) ?? getColorForGroup(0);
      const rootMuted = inactiveMrps.includes(rootMrpLabel);
      rootNode.data = {
        ...rootNode.data,
        mrpColor: rootColors.accent,
        dimmed: rootMuted,
        mrpController: rootMrpLabel,
        materialType: rootMaterialType,
      };

      groupNodes.push({
        id: `mrp:root:${rootMrpLabel}`,
        type: "mrpGroup",
        position: { x: rootNode.position.x - GROUP_PAD_X, y: rootNode.position.y - GROUP_PAD_TOP },
        data: {
          label: rootMrpLabel,
          count: 1,
          metaText: "Root material",
          dimmed: rootMuted,
          groupAccent: rootColors.accent,
          groupBorderColor: rootColors.border,
          groupFill: rootColors.fill,
          groupInset: `inset 0 0 0 1px ${rootColors.inset}`,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        zIndex: 1,
        style: {
          width: NODE_W + GROUP_PAD_X * 2,
          height: NODE_H + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
        },
      });
    }

    const nodeById = new Map(nodeArr.map((node) => [node.id, node]));
    const styledEdges = edgeList.map((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const sourceData = (sourceNode?.data ?? {}) as Record<string, unknown>;
      const targetData = (targetNode?.data ?? {}) as Record<string, unknown>;
      const isDimmed = Boolean(sourceData.dimmed) || Boolean(targetData.dimmed);
      const color = isDimmed ? "#4b4f62" : "var(--accent)";
      const edgeDepth = Number((edge.data as { depth?: number } | undefined)?.depth ?? 99);

      return {
        ...edge,
        animated: !isDimmed && edgeDepth <= 2,
        style: {
          stroke: color,
          strokeWidth: isDimmed ? 1.25 : 1.65,
          opacity: isDimmed ? 0.24 : 0.9,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });

    const mrpLegend = Array.from(legendCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({
        label,
        count,
        color: (colorByLabel.get(label) ?? getColorForGroup(0)).accent,
        chipFill: (colorByLabel.get(label) ?? getColorForGroup(0)).chipFill,
        active: !inactiveMrps.includes(label),
      }));

    return { nodes: [...groupNodes, ...nodeArr], edges: styledEdges, tooLarge, mrpLegend };
  }, [items, committed, rootMrpLabel, rootMaterialType, inactiveMrps]);

  useEffect(() => {
    setInactiveMrps((prev) => {
      const labels = new Set(mrpLegend.map((entry) => entry.label));
      const next = prev.filter((label) => labels.has(label));
      return next.length === prev.length ? prev : next;
    });
  }, [mrpLegend]);

  const toggleMrp = useCallback((label: string) => {
    setInactiveMrps((prev) => (
      prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label]
    ));
  }, []);

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
        {committed && (
          <div style={{ marginTop: ".65rem", fontSize: ".82rem", color: "var(--text-muted)", display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
            <span>
              Queried material description: <strong style={{ color: "var(--text)" }}>{rootMaterialDescription}</strong>
            </span>
            <span>
              Queried material MRP controller: <strong style={{ color: "var(--text)" }}>{rootMrpLabel}</strong>
            </span>
          </div>
        )}
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
        <>
          {mrpLegend.length > 0 && (
            <div className="card" style={{ color: "var(--text-muted)", fontSize: ".82rem", paddingTop: ".8rem", paddingBottom: ".8rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".55rem .95rem", alignItems: "center" }}>
                {mrpLegend.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    className="mrp-chip-btn"
                    onClick={() => toggleMrp(entry.label)}
                    aria-pressed={entry.active}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: ".4rem",
                      borderRadius: 999,
                      border: `1px solid ${entry.active ? `${entry.color}aa` : "var(--border)"}`,
                      background: entry.active ? entry.chipFill : "rgba(255,255,255,.03)",
                      color: entry.active ? "var(--text)" : "var(--text-muted)",
                      padding: ".28rem .62rem",
                      cursor: "pointer",
                      fontSize: ".8rem",
                      outline: "none",
                      boxShadow: "none",
                      appearance: "none",
                      WebkitAppearance: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: entry.active ? entry.color : "#4b4f62",
                        boxShadow: `0 0 0 1px ${entry.active ? `${entry.color}66` : "#4b4f6299"}`,
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ color: entry.active ? "var(--text)" : "var(--text-muted)" }}>{entry.label}</strong>
                    <span>({entry.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bom-graph-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              minZoom={0.1}
              onNodeClick={(_, node) => {
                if (node.type === "bomNode") navigate(`/materials/${node.id}`);
              }}
            >
              <Background color="var(--border)" gap={24} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  const data = node.data as Record<string, unknown>;
                  if (Boolean(data?.dimmed)) return "#4b4f62";
                  if (node.type === "mrpGroup") return String(data?.groupAccent ?? "#2e3250");
                  return String(data?.mrpColor ?? "var(--accent)");
                }}
                maskColor="rgba(15,17,23,.7)"
              />
            </ReactFlow>
          </div>
        </>
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
                  <th>Type</th><th>MRP</th><th>Qty/Parent</th><th>Total Qty</th>
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
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".78rem" }}>{it.mrpController ?? "—"}</td>
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
