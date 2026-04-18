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
import { GET_BOM_EXPLOSION, GET_MATERIAL, GET_SCRAP_CHAIN } from "../graphql/queries";
import type { BomExplosionItem, ScrapChainItem } from "../graphql/types";
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

function formatMin(min: number | null | undefined) {
  if (!min || min === 0) return "—";
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${(min / 60).toFixed(2)} h`;
}

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
  const selected = Boolean(data.selected);

  return (
    <div
      className={`bom-node${data.isRoot ? " root" : ""}${selected ? " selected" : ""}`}
      style={{
        fontSize: ".72rem",
        ...colorStyle,
        opacity: dimmed ? 0.28 : 1,
        filter: dimmed ? "saturate(0.22)" : "none",
        transition: "opacity .15s ease, filter .15s ease",
        outline: selected ? "2px solid var(--accent)" : undefined,
        outlineOffset: selected ? 2 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="bom-handle" />
      <div className="node-id">{data.label as string}</div>
      <div className="node-desc" title={data.description as string}>
        {data.description as string || "-"}
      </div>
      {requiredQty > 0 && (
        <div className="node-qty" title="Total required quantity for this BOM explosion">
          Quantity : {requiredText} {requiredUnit}
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
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, style, label,
}: EdgeProps) {
  const edgeLabel = String(label ?? "").trim();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    curvature: 0.35,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {edgeLabel && (
        <EdgeLabelRenderer>
          <div
            className="bom-edge-label"
            style={{ transform: `translate(-50%, -130%) translate(${labelX}px,${labelY}px)` }}
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

interface SelectedNodeData {
  id: string;
  description: string | null;
  materialType: string | null;
  mrpController: string | null;
  requiredQty: number;
  requiredUnit: string;
  totalMachineMin: number;
  totalLaborMin: number;
  qtyPerParent?: number;
}

function NodeDetailPanel({
  node,
  items,
  onClose,
  onNavigate,
  onViewScrap,
}: {
  node: SelectedNodeData;
  items: BomExplosionItem[];
  onClose: () => void;
  onNavigate: () => void;
  onViewScrap: () => void;
}) {
  // Find this node in the explosion to get per-unit times
  const itemData = items.find((i) => i.component === node.id);
  const perUnitMachine = itemData && itemData.totalQuantity > 0
    ? itemData.totalMachineMin / itemData.totalQuantity
    : 0;
  const perUnitLabor = itemData && itemData.totalQuantity > 0
    ? itemData.totalLaborMin / itemData.totalQuantity
    : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 280,
        zIndex: 100,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem",
        boxShadow: "0 8px 32px rgba(0,0,0,.4)",
        fontSize: ".82rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".7rem" }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: ".9rem" }}>{node.id}</div>
          <div style={{ color: "var(--text-muted)", marginTop: ".2rem" }}>{node.description ?? "—"}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {node.materialType && (
        <div style={{ marginBottom: ".6rem" }}><TypeBadge type={node.materialType} /></div>
      )}

      <div style={{ display: "grid", gap: ".4rem", marginBottom: ".8rem" }}>
        <Row label="MRP Controller" value={node.mrpController ?? "—"} />
        <Row label="Total qty (this explosion)" value={`${node.requiredQty.toFixed(node.requiredQty % 1 === 0 ? 0 : 4)} ${node.requiredUnit}`} />
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: ".6rem", marginBottom: ".8rem" }}>
        <div style={{ color: "var(--text-muted)", fontSize: ".75rem", marginBottom: ".4rem", textTransform: "uppercase", letterSpacing: ".04em" }}>
          Routing time
        </div>
        <div style={{ display: "grid", gap: ".3rem" }}>
          <Row label="Machine / unit" value={formatMin(perUnitMachine)} accent />
          <Row label="Machine × qty" value={formatMin(node.totalMachineMin)} accent />
          <Row label="Labor / unit" value={formatMin(perUnitLabor)} />
          <Row label="Labor × qty" value={formatMin(node.totalLaborMin)} />
          <Row
            label="Total (machine + labor)"
            value={formatMin(node.totalMachineMin + node.totalLaborMin)}
            strong
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ fontSize: ".78rem" }} onClick={onNavigate}>
          Material detail →
        </button>
        <button className="btn btn-ghost" style={{ fontSize: ".78rem" }} onClick={onViewScrap}>
          Scrap chain →
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, accent, strong }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--mono)", fontWeight: strong ? 700 : undefined, color: accent ? "var(--accent)" : "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

function ScrapChainPanel({
  materialId,
  onClose,
}: {
  materialId: string;
  onClose: () => void;
}) {
  const { data, loading } = useQuery<{ scrapChain: ScrapChainItem[] }>(GET_SCRAP_CHAIN, {
    variables: { materialId },
  });
  const chain = data?.scrapChain ?? [];

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: ".8rem" }}>
        <h3 style={{ margin: 0, fontSize: ".95rem" }}>Scrap chain: {materialId}</h3>
        <button className="btn btn-ghost" style={{ fontSize: ".78rem" }} onClick={onClose}>Close</button>
      </div>
      {loading && <div className="spinner">Loading…</div>}
      {!loading && chain.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: ".85rem" }}>
          No scrap chain data. Either no scrap was recorded for this material, or production orders haven't been imported.
        </div>
      )}
      {chain.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table" style={{ fontSize: ".78rem" }}>
            <thead>
              <tr>
                <th>Depth</th><th>Component</th><th>Description</th>
                <th>Qty / scrapped unit</th><th>Total qty wasted</th>
                <th>Machine wasted</th><th>Labor wasted</th><th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--mono)" }}>{item.depth}</td>
                  <td style={{ fontFamily: "var(--mono)" }}>{item.component}</td>
                  <td title={item.description ?? ""}>{item.description ?? "—"}</td>
                  <td>{item.qtyPerScrappedUnit.toFixed(4)}</td>
                  <td style={{ color: "var(--red)", fontWeight: 600 }}>
                    {item.totalQtyWasted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td>{formatMin(item.machineMinWasted)}</td>
                  <td>{formatMin(item.laborMinWasted)}</td>
                  <td>{item.estimatedCost != null ? item.estimatedCost.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BomExplorer() {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState(paramId ?? "");
  const [committed, setCommitted] = useState(paramId ?? "");
  const [depth, setDepth] = useState(5);
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph");
  const [inactiveMrps, setInactiveMrps] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeData | null>(null);
  const [scrapChainFor, setScrapChainFor] = useState<string | null>(null);

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
    setSelectedNode(null);
    setScrapChainFor(null);
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
        selected: selectedNode?.id === effectiveRootId,
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
            selected:        selectedNode?.id === item.component,
          },
          position: { x: 0, y: 0 },
          zIndex: 2,
        });
      } else {
        const currentData = existingNode.data as Record<string, unknown>;
        const prevQty  = Number(currentData.requiredQty ?? 0);
        const prevUnit = String(currentData.requiredUnit ?? "").trim();
        const nextUnitRaw = String(item.unit ?? "").trim();
        const nextUnit = prevUnit && nextUnitRaw && prevUnit !== nextUnitRaw ? "mixed" : (prevUnit || nextUnitRaw);
        existingNode.data = {
          ...currentData,
          requiredQty:     (Number.isFinite(prevQty) ? prevQty : 0) + item.totalQuantity,
          requiredUnit:    nextUnit,
          totalMachineMin: Number(currentData.totalMachineMin ?? 0) + item.totalMachineMin,
          totalLaborMin:   Number(currentData.totalLaborMin ?? 0)   + item.totalLaborMin,
          selected:        selectedNode?.id === item.component,
        };
      }
    }

    const tooLarge = nodeMap.size > MAX_NODES;
    const nodeArr  = Array.from(nodeMap.values()).slice(0, MAX_NODES);
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
        const d = Number.isFinite(nodeDepth) && nodeDepth > 0 ? nodeDepth : 1;
        if (!depthBuckets.has(d)) depthBuckets.set(d, []);
        depthBuckets.get(d)!.push(node);
      }

      const sortedDepths = Array.from(depthBuckets.keys()).sort((a, b) => a - b);
      let maxCols = 1;
      for (const d of sortedDepths) {
        const rowNodes = depthBuckets.get(d)!;
        rowNodes.sort((a, b) => String(a.data?.label ?? "").localeCompare(String(b.data?.label ?? "")));
        if (rowNodes.length > maxCols) maxCols = rowNodes.length;
      }

      const groupContentWidth = maxCols * NODE_W + (maxCols - 1) * LEVEL_NODE_GAP;
      const groupLeft = cursorX;

      for (const d of sortedDepths) {
        const rowY = levelBaseY + (d - 1) * (NODE_H + LEVEL_ROW_GAP);
        const rowNodes = depthBuckets.get(d)!;
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
          label: mrp, count: groupNodesRaw.length, dimmed: isMuted,
          groupAccent: colors.accent, groupBorderColor: colors.border,
          groupFill: colors.fill, groupInset: `inset 0 0 0 1px ${colors.inset}`,
        },
        draggable: false, selectable: false, connectable: false, focusable: false,
        zIndex: 0,
        style: { width: maxX - minX + GROUP_PAD_X * 2, height: maxY - minY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM },
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
        mrpColor: rootColors.accent, dimmed: rootMuted,
        mrpController: rootMrpLabel, materialType: rootMaterialType,
      };

      groupNodes.push({
        id: `mrp:root:${rootMrpLabel}`,
        type: "mrpGroup",
        position: { x: rootNode.position.x - GROUP_PAD_X, y: rootNode.position.y - GROUP_PAD_TOP },
        data: {
          label: rootMrpLabel, count: 1, metaText: "Root material", dimmed: rootMuted,
          groupAccent: rootColors.accent, groupBorderColor: rootColors.border,
          groupFill: rootColors.fill, groupInset: `inset 0 0 0 1px ${rootColors.inset}`,
        },
        draggable: false, selectable: false, connectable: false, focusable: false,
        zIndex: 1,
        style: { width: NODE_W + GROUP_PAD_X * 2, height: NODE_H + GROUP_PAD_TOP + GROUP_PAD_BOTTOM },
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
        style: { stroke: color, strokeWidth: isDimmed ? 1.25 : 1.65, opacity: isDimmed ? 0.24 : 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });

    const mrpLegend = Array.from(legendCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({
        label, count,
        color: (colorByLabel.get(label) ?? getColorForGroup(0)).accent,
        chipFill: (colorByLabel.get(label) ?? getColorForGroup(0)).chipFill,
        active: !inactiveMrps.includes(label),
      }));

    return { nodes: [...groupNodes, ...nodeArr], edges: styledEdges, tooLarge, mrpLegend };
  }, [items, committed, rootMrpLabel, rootMaterialType, inactiveMrps, selectedNode]);

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
    const trimmed = searchId.trim();
    setCommitted(trimmed);
    setSelectedNode(null);
    setScrapChainFor(null);
    navigate(`/bom/${trimmed}`, { replace: true });
  }, [searchId, navigate]);

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type !== "bomNode") return;
    const d = node.data as Record<string, unknown>;
    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
      return;
    }
    setSelectedNode({
      id:              node.id,
      description:     d.description as string | null ?? null,
      materialType:    d.materialType as string | null ?? null,
      mrpController:   d.mrpController as string | null ?? null,
      requiredQty:     Number(d.requiredQty ?? 0),
      requiredUnit:    String(d.requiredUnit ?? ""),
      totalMachineMin: Number(d.totalMachineMin ?? 0),
      totalLaborMin:   Number(d.totalLaborMin ?? 0),
    });
  }, [selectedNode]);

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
            className="btn btn-ghost"
            onClick={() => setViewMode(viewMode === "graph" ? "table" : "graph")}
          >
            {viewMode === "graph" ? "Table View" : "Graph View"}
          </button>
        </div>
        {committed && (
          <div style={{ marginTop: ".65rem", fontSize: ".82rem", color: "var(--text-muted)", display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
            <span>
              Description: <strong style={{ color: "var(--text)" }}>{rootMaterialDescription}</strong>
            </span>
            <span>
              MRP: <strong style={{ color: "var(--text)" }}>{rootMrpLabel}</strong>
            </span>
            {items.length > 0 && (
              <span>
                {items.length} rows · click a node to see time details
              </span>
            )}
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
                      display: "inline-flex", alignItems: "center", gap: ".4rem",
                      borderRadius: 999,
                      border: `1px solid ${entry.active ? `${entry.color}aa` : "var(--border)"}`,
                      background: entry.active ? entry.chipFill : "rgba(255,255,255,.03)",
                      color: entry.active ? "var(--text)" : "var(--text-muted)",
                      padding: ".28rem .62rem", cursor: "pointer", fontSize: ".8rem",
                      outline: "none", boxShadow: "none", appearance: "none", WebkitAppearance: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: 999,
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
          <div className="bom-graph-wrap" style={{ position: "relative" }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              minZoom={0.1}
              onNodeClick={handleNodeClick}
            >
              <Background color="var(--border)" gap={24} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  const d = node.data as Record<string, unknown>;
                  if (Boolean(d?.dimmed)) return "#4b4f62";
                  if (node.type === "mrpGroup") return String(d?.groupAccent ?? "#2e3250");
                  return String(d?.mrpColor ?? "var(--accent)");
                }}
                maskColor="rgba(15,17,23,.7)"
              />
            </ReactFlow>

            {selectedNode && (
              <NodeDetailPanel
                node={selectedNode}
                items={items}
                onClose={() => setSelectedNode(null)}
                onNavigate={() => navigate(`/materials/${selectedNode.id}`)}
                onViewScrap={() => {
                  setScrapChainFor(selectedNode.id);
                  setSelectedNode(null);
                }}
              />
            )}
          </div>
        </>
      )}

      {!loading && items.length > 0 && viewMode === "table" && (
        <div className="card">
          <div style={{ marginBottom: ".5rem", color: "var(--text-muted)", fontSize: ".85rem" }}>
            {items.length} BOM rows — click a row to view details
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Depth</th><th>Parent</th><th>Component</th><th>Description</th>
                  <th>Type</th><th>MRP</th><th>Qty/Parent</th><th>Total Qty</th>
                  <th>Machine/unit (min)</th><th>Machine total (min)</th>
                  <th>Labor/unit (min)</th><th>Labor total (min)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const perUnitMachine = it.totalQuantity > 0 ? it.totalMachineMin / it.totalQuantity : 0;
                  const perUnitLabor   = it.totalQuantity > 0 ? it.totalLaborMin   / it.totalQuantity : 0;
                  return (
                    <tr
                      key={i}
                      className="clickable"
                      onClick={() => setSelectedNode({
                        id: it.component, description: it.description ?? null,
                        materialType: it.materialType ?? null, mrpController: it.mrpController ?? null,
                        requiredQty: it.totalQuantity, requiredUnit: it.unit,
                        totalMachineMin: it.totalMachineMin, totalLaborMin: it.totalLaborMin,
                      })}
                    >
                      <td style={{ fontFamily: "var(--mono)" }}>{it.depth}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{it.parent}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{it.component}</td>
                      <td title={it.description ?? ""}>{it.description ?? "—"}</td>
                      <td><TypeBadge type={it.materialType} /></td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".78rem" }}>{it.mrpController ?? "—"}</td>
                      <td>{it.qtyPerParent.toFixed(3)}</td>
                      <td>{it.totalQuantity.toFixed(3)}</td>
                      <td>{perUnitMachine > 0 ? perUnitMachine.toFixed(2) : "—"}</td>
                      <td>{it.totalMachineMin > 0 ? it.totalMachineMin.toFixed(2) : "—"}</td>
                      <td>{perUnitLabor   > 0 ? perUnitLabor.toFixed(2)   : "—"}</td>
                      <td>{it.totalLaborMin   > 0 ? it.totalLaborMin.toFixed(2)   : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Node detail panel for table view */}
      {selectedNode && viewMode === "table" && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <NodeDetailPanel
            node={selectedNode}
            items={items}
            onClose={() => setSelectedNode(null)}
            onNavigate={() => navigate(`/materials/${selectedNode.id}`)}
            onViewScrap={() => {
              setScrapChainFor(selectedNode.id);
              setSelectedNode(null);
            }}
          />
        </div>
      )}

      {/* Scrap chain panel */}
      {scrapChainFor && (
        <ScrapChainPanel materialId={scrapChainFor} onClose={() => setScrapChainFor(null)} />
      )}
    </>
  );
}
