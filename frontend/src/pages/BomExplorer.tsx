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
  type Node,
  type Edge,
  type EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { GET_BOM_EXPLOSION, GET_MATERIAL, GET_SCRAP_CHAIN } from "../graphql/queries";
import type { BomExplosionItem, ScrapChainItem } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W              = 200;
const NODE_H              = 72;
const GROUP_PAD_X         = 32;
const GROUP_PAD_TOP       = 29;
const GROUP_PAD_BOTTOM    = GROUP_PAD_TOP + Math.round(NODE_H * 0.40);
const GROUP_COLUMN_GAP    = 200;
const LEVEL_ROW_GAP       = 180;
const LEVEL_NODE_GAP      = 60;
const MAX_NODES           = 600;
const ROOT_TO_BUS_GAP     = 200;
const BUS_TO_MATERIAL_GAP = 102;

// ── Utilities ─────────────────────────────────────────────────────────────────

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
    accent:   `hsl(${hue}, 78%, 56%)`,
    border:   `hsla(${hue}, 80%, 56%, 0.52)`,
    fill:     `hsla(${hue}, 85%, 54%, 0.12)`,
    inset:    `hsla(${hue}, 88%, 58%, 0.26)`,
    chipFill: `hsla(${hue}, 85%, 54%, 0.2)`,
  };
}

// Orthogonal path: only horizontal + vertical segments, one 90-degree bend at midY
function orthogonalPath(sx: number, sy: number, tx: number, ty: number): string {
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}

// ── Node components ───────────────────────────────────────────────────────────

function BomNodeComponent({ data }: { data: Record<string, unknown> }) {
  const totalMachine = data.totalMachineMin as number;
  const totalLabor   = data.totalLaborMin   as number;
  const total        = totalMachine + totalLabor || 1;
  const machW        = Math.round((totalMachine / total) * 100);
  const labW         = Math.round((totalLabor   / total) * 100);
  const mrpColor     = typeof data.mrpColor === "string" ? data.mrpColor : "";
  const dimmed       = Boolean(data.dimmed);
  const requiredQty  = Number(data.requiredQty ?? 0);
  const actualRequiredQty = Number(data.actualRequiredQty ?? requiredQty);
  const requiredUnit = String(data.requiredUnit ?? "").trim();
  const scrapRatePct = Number(data.scrapRatePct ?? 0);
  const requiredText = Number.isFinite(requiredQty)
    ? requiredQty.toFixed(requiredQty % 1 === 0 ? 0 : 3)
    : "0";
  const actualRequiredText = Number.isFinite(actualRequiredQty)
    ? actualRequiredQty.toFixed(actualRequiredQty % 1 === 0 ? 0 : 3)
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
        width: NODE_W,
        minHeight: NODE_H,
        fontSize: ".72rem",
        ...colorStyle,
        opacity: dimmed ? 0.28 : 1,
        filter: dimmed ? "saturate(0.22)" : "none",
        transition: "opacity .15s ease, filter .15s ease",
        outline: selected ? "2px solid var(--accent)" : undefined,
        outlineOffset: selected ? 2 : undefined,
      }}
    >
      <Handle type="target" position={Position.Top}    className="bom-handle" />
      <div className="node-id">{data.label as string}</div>
      <div className="node-desc" title={data.description as string}>
        {data.description as string || "-"}
      </div>
      {requiredQty > 0 && (
        <div className="node-qty" title="Total required quantity for this BOM explosion">
          Ideal Quantity : {requiredText} {requiredUnit}
        </div>
      )}
      {actualRequiredQty > 0 && (
        <div className="node-qty" title="Scrap-adjusted production quantity needed" style={{ color: "var(--red)", fontWeight: 600 }}>
          Actual Quantity : {actualRequiredText} {requiredUnit}
          {scrapRatePct > 0 ? ` (${scrapRatePct.toFixed(1)}% scrap)` : ""}
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
  const accent = typeof data.groupAccent      === "string" ? data.groupAccent      : "#93c5fd";
  const border = typeof data.groupBorderColor === "string" ? data.groupBorderColor : "rgba(147,197,253,.4)";
  const fill   = typeof data.groupFill        === "string" ? data.groupFill        : "transparent";
  const inset  = typeof data.groupInset       === "string" ? data.groupInset       : "none";

  return (
    <div
      className="mrp-group-node"
      style={{
        width: "100%",
        height: "100%",
        border: `1.5px solid ${border}`,
        borderRadius: 14,
        background: fill,
        boxShadow: inset,
        opacity: Boolean(data.dimmed) ? 0.28 : 1,
        filter: Boolean(data.dimmed) ? "saturate(0.22)" : "none",
        transition: "opacity .15s ease, filter .15s ease",
        position: "relative",
      }}
    >
      <div style={{
        position: "absolute", top: 8, right: 12,
        fontSize: ".7rem", fontWeight: 700, color: accent, letterSpacing: ".06em",
        textTransform: "uppercase", lineHeight: 1,
      }}>
        MRP {String(data.label ?? "")}
      </div>
      <div style={{
        position: "absolute", top: 22, right: 12,
        fontSize: ".65rem", color: accent, opacity: 0.7,
      }}>
        {metaText}
      </div>
    </div>
  );
}

// Depth-level dotted separator — a thin dashed horizontal line inside an MRP group
function DepthSeparatorComponent() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderTop: "1px dashed rgba(147,197,253,0.25)",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Edge component ────────────────────────────────────────────────────────────

function BomEdge({
  id, sourceX, sourceY, targetX, targetY,
  markerEnd, style, label,
}: EdgeProps) {
  const edgeLabel = String(label ?? "").trim();
  const edgePath  = orthogonalPath(sourceX, sourceY, targetX, targetY);
  const labelX    = (sourceX + targetX) / 2;
  const labelY    = (sourceY + targetY) / 2;

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

const nodeTypes = {
  bomNode:        BomNodeComponent,
  mrpGroup:       MrpGroupNodeComponent,
  depthSeparator: DepthSeparatorComponent,
};
const edgeTypes = { bomEdge: BomEdge };

// ── Side-panel types ──────────────────────────────────────────────────────────

interface SelectedNodeData {
  id: string;
  description: string | null;
  materialType: string | null;
  mrpController: string | null;
  requiredQty: number;
  actualRequiredQty: number;
  scrapRatePct: number;
  requiredUnit: string;
  totalMachineMin: number;
  totalLaborMin: number;
}

function NodeDetailPanel({
  node, items, onClose, onNavigate, onViewScrap,
}: {
  node: SelectedNodeData;
  items: BomExplosionItem[];
  onClose: () => void;
  onNavigate: () => void;
  onViewScrap: () => void;
}) {
  const itemData = items.find((i) => i.component === node.id);
  const perUnitMachine = itemData && itemData.totalQuantity > 0
    ? itemData.totalMachineMin / itemData.totalQuantity : 0;
  const perUnitLabor = itemData && itemData.totalQuantity > 0
    ? itemData.totalLaborMin / itemData.totalQuantity : 0;

  return (
    <div
      style={{
        position: "absolute", top: 12, right: 12, width: 290, zIndex: 100,
        background: "var(--white)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--red)",
        padding: "1rem",
        boxShadow: "0 4px 16px rgba(0,0,0,.10)",
        fontSize: ".82rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".6rem" }}>
        <div>
          <div style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--red)", marginBottom: ".2rem" }}>
            Component
          </div>
          <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: ".95rem", color: "var(--text-heading)" }}>{node.id}</div>
          <div style={{ color: "var(--text-secondary)", marginTop: ".15rem", fontSize: ".8rem" }}>{node.description ?? "—"}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: "0 .2rem" }}
        >×</button>
      </div>

      {node.materialType && (
        <div style={{ marginBottom: ".7rem" }}><TypeBadge type={node.materialType} /></div>
      )}

      <div style={{ background: "var(--bg-section)", padding: ".6rem .75rem", marginBottom: ".75rem" }}>
        <div style={{ display: "grid", gap: ".35rem" }}>
          <Row label="MRP Controller" value={node.mrpController ?? "—"} />
          <Row label="Planned Qty"    value={`${node.requiredQty.toFixed(node.requiredQty % 1 === 0 ? 0 : 4)} ${node.requiredUnit}`} />
          <Row label="Scrap Rate"     value={`${node.scrapRatePct.toFixed(2)}%`} />
          <Row label="Actual Qty"     value={`${node.actualRequiredQty.toFixed(node.actualRequiredQty % 1 === 0 ? 0 : 4)} ${node.requiredUnit}`} strong valueColor="var(--red)" />
        </div>
      </div>

      <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-secondary)", marginBottom: ".4rem" }}>
        Routing Time
      </div>
      <div style={{ display: "grid", gap: ".3rem", marginBottom: ".85rem" }}>
        <Row label="Machine / unit"        value={formatMin(perUnitMachine)} accent />
        <Row label="Machine × qty"         value={formatMin(node.totalMachineMin)} accent />
        <Row label="Labor / unit"          value={formatMin(perUnitLabor)} />
        <Row label="Labor × qty"           value={formatMin(node.totalLaborMin)} />
        <Row label="Total"                 value={formatMin(node.totalMachineMin + node.totalLaborMin)} strong />
      </div>

      <div style={{ display: "flex", gap: ".5rem", borderTop: "1px solid var(--border)", paddingTop: ".6rem" }}>
        <button className="btn btn-ghost" style={{ fontSize: ".75rem", padding: ".35rem .75rem" }} onClick={onNavigate}>Material detail →</button>
        <button className="btn btn-ghost" style={{ fontSize: ".75rem", padding: ".35rem .75rem" }} onClick={onViewScrap}>Scrap chain →</button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  strong,
  valueColor,
}: {
  label: string;
  value: string;
  accent?: boolean;
  strong?: boolean;
  valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontWeight: strong ? 700 : undefined,
          color: valueColor ?? (accent ? "var(--accent)" : "var(--text)"),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ScrapChainPanel({ materialId, onClose }: { materialId: string; onClose: () => void }) {
  const { data, loading } = useQuery<{ scrapChain: ScrapChainItem[] }>(GET_SCRAP_CHAIN, { variables: { materialId } });
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

// ── Main component ────────────────────────────────────────────────────────────

export default function BomExplorer() {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchId,    setSearchId]    = useState(paramId ?? "");
  const [committed,   setCommitted]   = useState(paramId ?? "");
  const [depth,       setDepth]       = useState(5);
  const [viewMode,    setViewMode]    = useState<"graph" | "table">("graph");
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
    material: { mrpController?: string | null; materialType?: string | null; description?: string | null } | null;
  }>(GET_MATERIAL, { variables: { materialId: rootMaterialId }, skip: !rootMaterialId });

  const rootMrpController       = rootMaterialData?.material?.mrpController;
  const rootMaterialType        = rootMaterialData?.material?.materialType ?? null;
  const rootMaterialDescription = rootMaterialData?.material?.description?.trim() || "—";
  const rootMrpLabel            = getMrpLabel(rootMrpController);

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
    const nodeMap  = new Map<string, Node>();
    const edgeSeen = new Set<string>();
    const edgeList: Edge[] = [];

    // Build root node
    nodeMap.set(effectiveRootId, {
      id: effectiveRootId, type: "bomNode",
      data: {
        label: effectiveRootId, isRoot: true, mrpController: rootMrpLabel,
        materialType: rootMaterialType, requiredQty: 1, requiredUnit: "PC",
        actualRequiredQty: 1, scrapRatePct: 0,
        totalMachineMin: 0, totalLaborMin: 0,
        selected: selectedNode?.id === effectiveRootId,
      },
      position: { x: 0, y: 0 }, zIndex: 2,
    });

    // Accumulate component nodes (aggregate quantities across BOM paths)
    for (const item of items) {
      const existingNode = nodeMap.get(item.component);
      if (!existingNode) {
        nodeMap.set(item.component, {
          id: item.component, type: "bomNode",
          data: {
            label: item.component, description: item.description,
            materialType: item.materialType, mrpController: item.mrpController,
            depth: item.depth, isRoot: false,
            requiredQty: item.totalQuantity, requiredUnit: item.unit,
            actualRequiredQty: item.adjustedTotalQuantity,
            scrapRatePct: Number(item.scrapRatePct ?? 0),
            totalMachineMin: item.totalMachineMin, totalLaborMin: item.totalLaborMin,
            selected: selectedNode?.id === item.component,
          },
          position: { x: 0, y: 0 }, zIndex: 2,
        });
      } else {
        const currentData = existingNode.data as Record<string, unknown>;
        const prevQty     = Number(currentData.requiredQty ?? 0);
        const prevUnit    = String(currentData.requiredUnit ?? "").trim();
        const nextUnitRaw = String(item.unit ?? "").trim();
        const nextUnit    = prevUnit && nextUnitRaw && prevUnit !== nextUnitRaw
          ? "mixed" : (prevUnit || nextUnitRaw);
        existingNode.data = {
          ...currentData,
          requiredQty:     (Number.isFinite(prevQty) ? prevQty : 0) + item.totalQuantity,
          requiredUnit:    nextUnit,
          actualRequiredQty: Number(currentData.actualRequiredQty ?? 0) + item.adjustedTotalQuantity,
          scrapRatePct: Number(currentData.scrapRatePct ?? item.scrapRatePct ?? 0),
          totalMachineMin: Number(currentData.totalMachineMin ?? 0) + item.totalMachineMin,
          totalLaborMin:   Number(currentData.totalLaborMin   ?? 0) + item.totalLaborMin,
          selected:        selectedNode?.id === item.component,
        };
      }
    }

    const tooLarge   = nodeMap.size > MAX_NODES;
    const nodeArr    = Array.from(nodeMap.values()).slice(0, MAX_NODES);
    const visibleIds = new Set(nodeArr.map((n) => n.id));
    const rootNode   = nodeArr.find((n) => n.data?.isRoot);
    const nonRootNodes = nodeArr.filter((n) => !n.data?.isRoot);

    // Group non-root nodes by MRP
    const groupBuckets = new Map<string, Node[]>();
    for (const node of nonRootNodes) {
      const mrp = getMrpLabel(node.data?.mrpController);
      if (!groupBuckets.has(mrp)) groupBuckets.set(mrp, []);
      groupBuckets.get(mrp)!.push(node);
    }

    const sortedGroups = Array.from(groupBuckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Assign colors
    const allLabels = Array.from(new Set([...sortedGroups.map(([l]) => l), rootMrpLabel])).sort();
    const colorByLabel = new Map<string, ReturnType<typeof getColorForGroup>>();
    for (let i = 0; i < allLabels.length; i++) colorByLabel.set(allLabels[i], getColorForGroup(i));

    const legendCounts = new Map<string, number>();
    for (const [label, nodesInGroup] of sortedGroups) legendCounts.set(label, nodesInGroup.length);
    legendCounts.set(rootMrpLabel, (legendCounts.get(rootMrpLabel) ?? 0) + 1);

    // Position nodes and build structural nodes/edges
    const groupNodes: Node[] = [];
    let cursorX    = 0;
    const levelBaseY = ROOT_TO_BUS_GAP + BUS_TO_MATERIAL_GAP;

    for (let index = 0; index < sortedGroups.length; index++) {
      const [mrp, groupNodesRaw] = sortedGroups[index];
      if (!groupNodesRaw.length) continue;

      const colors  = colorByLabel.get(mrp) ?? getColorForGroup(index);
      const isMuted = inactiveMrps.includes(mrp);

      // Bucket by depth
      const depthBuckets = new Map<number, Node[]>();
      for (const node of groupNodesRaw) {
        const nd = Number.isFinite(Number(node.data?.depth)) && Number(node.data?.depth) > 0
          ? Number(node.data?.depth) : 1;
        if (!depthBuckets.has(nd)) depthBuckets.set(nd, []);
        depthBuckets.get(nd)!.push(node);
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

      // Position material nodes
      for (const d of sortedDepths) {
        const rowY     = levelBaseY + (d - 1) * (NODE_H + LEVEL_ROW_GAP);
        const rowNodes = depthBuckets.get(d)!;
        const rowWidth = rowNodes.length * NODE_W + (rowNodes.length - 1) * LEVEL_NODE_GAP;
        const rowOffset = (groupContentWidth - rowWidth) / 2;
        for (let col = 0; col < rowNodes.length; col++) {
          rowNodes[col].position = {
            x: groupLeft + rowOffset + col * (NODE_W + LEVEL_NODE_GAP),
            y: rowY,
          };
          rowNodes[col].data = { ...rowNodes[col].data, mrpColor: colors.accent, dimmed: isMuted };
        }
      }

      // Depth-level dotted separators between adjacent depth rows
      for (let di = 0; di < sortedDepths.length - 1; di++) {
        const currentD = sortedDepths[di];
        const rowEndY  = levelBaseY + (currentD - 1) * (NODE_H + LEVEL_ROW_GAP) + NODE_H;
        const sepY     = rowEndY + LEVEL_ROW_GAP / 2 - 1;
        groupNodes.push({
          id: `sep:${mrp}:d${currentD}`,
          type: "depthSeparator",
          position: { x: groupLeft - GROUP_PAD_X, y: sepY },
          data: {},
          draggable: false, selectable: false, connectable: false, focusable: false,
          zIndex: 1,
          style: { width: groupContentWidth + GROUP_PAD_X * 2, height: 2 },
        });
      }

      // MRP group container
      const minY = Math.min(...groupNodesRaw.map((n) => n.position.y));
      const maxY = Math.max(...groupNodesRaw.map((n) => n.position.y + NODE_H));
      groupNodes.push({
        id: `mrp:${mrp}`, type: "mrpGroup",
        position: { x: groupLeft - GROUP_PAD_X, y: minY - GROUP_PAD_TOP },
        data: {
          label: mrp, count: groupNodesRaw.length, dimmed: isMuted,
          groupAccent: colors.accent, groupBorderColor: colors.border,
          groupFill: colors.fill, groupInset: `inset 0 0 0 1px ${colors.inset}`,
        },
        draggable: false, selectable: false, connectable: false, focusable: false,
        zIndex: 0,
        style: {
          width:  groupContentWidth + GROUP_PAD_X * 2,
          height: (maxY - minY) + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
        },
      });

      // Only advance cursor for active (non-muted) groups
      if (!isMuted) {
        cursorX += groupContentWidth + GROUP_PAD_X * 2 + GROUP_COLUMN_GAP;
      }
    }

    if (rootNode) {
      const totalWidth = cursorX > 0 ? cursorX - GROUP_COLUMN_GAP : NODE_W;
      rootNode.position = { x: Math.max(0, totalWidth / 2 - NODE_W / 2), y: 0 };

      const rootColors = colorByLabel.get(rootMrpLabel) ?? getColorForGroup(0);
      const rootMuted  = inactiveMrps.includes(rootMrpLabel);
      rootNode.data = {
        ...rootNode.data, mrpColor: rootColors.accent, dimmed: rootMuted,
        mrpController: rootMrpLabel, materialType: rootMaterialType,
      };

      // Root MRP group container
      groupNodes.push({
        id: `mrp:root:${rootMrpLabel}`, type: "mrpGroup",
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

    // Parent -> component flow edges (actual BOM connections)
    for (const item of items) {
      const sourceId = item.parent;
      const targetId = item.component;
      if (!visibleIds.has(sourceId) || !visibleIds.has(targetId)) continue;

      const sourceMrp = getMrpLabel(nodeMap.get(sourceId)?.data?.mrpController);
      const targetMrp = getMrpLabel(nodeMap.get(targetId)?.data?.mrpController ?? item.mrpController);
      const isMuted = inactiveMrps.includes(sourceMrp) || inactiveMrps.includes(targetMrp);

      const edgeKey = `flow:${sourceId}->${targetId}`;
      if (!edgeSeen.has(edgeKey)) {
        edgeSeen.add(edgeKey);
        edgeList.push({
          id: edgeKey,
          source: sourceId,
          target: targetId,
          type: "bomEdge",
          data: { edgeType: "material-flow", sourceMrp, targetMrp, isMuted },
        });
      }
    }

    // Style edges
    const styledEdges = edgeList.map((edge) => {
      const edgeData = (edge.data ?? {}) as Record<string, unknown>;
      const edgeType = String(edgeData.edgeType ?? "bus-material");
      const mrpKey   = String(edgeData.mrp ?? "");
      const mrpColors = colorByLabel.get(mrpKey) ?? getColorForGroup(0);

      const flowSourceMrp = String(edgeData.sourceMrp ?? "");
      const flowTargetMrp = String(edgeData.targetMrp ?? "");
      const flowMuted = inactiveMrps.includes(flowSourceMrp) || inactiveMrps.includes(flowTargetMrp);

      const isMuted = edgeType === "material-flow"
        ? (Boolean(edgeData.isMuted) || flowMuted)
        : (Boolean(edgeData.isMuted) || inactiveMrps.includes(mrpKey));

      const isMaterialFlow = edgeType === "material-flow";
      const flowColor = colorByLabel.get(flowTargetMrp)?.accent ?? "#1f2937";
      const color = isMuted ? "#4b4f62"
        : isMaterialFlow ? flowColor
        : mrpColors.accent;

      return {
        ...edge,
        animated: !isMuted && isMaterialFlow,
        style: {
          stroke: color,
          strokeWidth: isMuted ? 1.25 : isMaterialFlow ? 1.8 : 1.5,
          opacity: isMuted ? 0.24 : isMaterialFlow ? 0.72 : 0.85,
          strokeDasharray: isMaterialFlow ? "4 4" : undefined,
          strokeLinecap: isMaterialFlow ? ("round" as const) : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });

    const mrpLegend = Array.from(legendCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({
        label, count,
        color:    (colorByLabel.get(label) ?? getColorForGroup(0)).accent,
        chipFill: (colorByLabel.get(label) ?? getColorForGroup(0)).chipFill,
        active:   !inactiveMrps.includes(label),
      }));

    return { nodes: [...groupNodes, ...nodeArr], edges: styledEdges, tooLarge, mrpLegend };
  }, [items, committed, rootMrpLabel, rootMaterialType, inactiveMrps, selectedNode]);

  useEffect(() => {
    setInactiveMrps((prev) => {
      const labels = new Set(mrpLegend.map((e) => e.label));
      const next = prev.filter((l) => labels.has(l));
      return next.length === prev.length ? prev : next;
    });
  }, [mrpLegend]);

  const toggleMrp = useCallback((label: string) => {
    setInactiveMrps((prev) => prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label]);
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
    if (selectedNode?.id === node.id) { setSelectedNode(null); return; }
    setSelectedNode({
      id:              node.id,
      description:     d.description  as string | null ?? null,
      materialType:    d.materialType as string | null ?? null,
      mrpController:   d.mrpController as string | null ?? null,
      requiredQty:     Number(d.requiredQty ?? 0),
      actualRequiredQty: Number(d.actualRequiredQty ?? d.requiredQty ?? 0),
      scrapRatePct:    Number(d.scrapRatePct ?? 0),
      requiredUnit:    String(d.requiredUnit ?? ""),
      totalMachineMin: Number(d.totalMachineMin ?? 0),
      totalLaborMin:   Number(d.totalLaborMin   ?? 0),
    });
  }, [selectedNode]);

  const hasCommitted = Boolean(committed);

  return (
    <div className="page">
      <div className="page-inner">

        {/* ── Page header ── */}
        <div className="material-detail-header" style={{ marginBottom: "1.5rem" }}>
          <div className="material-detail-kicker">Bill of Materials</div>
          <div className="material-detail-title-row">
            <h1 className="material-detail-title" style={{ fontSize: "1.5rem" }}>
              {hasCommitted ? rootMaterialId : "BOM Explorer"}
            </h1>
          </div>
          {hasCommitted && rootMaterialDescription !== "—" && (
            <p className="material-detail-subtitle">{rootMaterialDescription}</p>
          )}
          {!hasCommitted && (
            <p className="material-detail-subtitle">
              Enter a material ID to explode its bill of materials and visualise component dependencies.
            </p>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              placeholder="Material ID…"
              style={{ flex: "1 1 180px", height: 40, padding: "0 12px", fontSize: 14, border: "1px solid var(--border)", fontFamily: "inherit" }}
            />
            <button className="btn" style={{ height: 40, padding: "0 20px" }} onClick={commit}>Load</button>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: ".82rem", color: "var(--text-secondary)" }}>Depth</span>
              <input
                type="range" min={1} max={15} value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                style={{ width: 90 }}
              />
              <span style={{ fontWeight: 700, fontFamily: "var(--mono)", fontSize: ".88rem", color: "var(--text-heading)", minWidth: "1.5ch" }}>{depth}</span>
            </div>
            <button className="btn btn-ghost" style={{ height: 40 }} onClick={() => setViewMode(viewMode === "graph" ? "table" : "graph")}>
              {viewMode === "graph" ? "Table View" : "Graph View"}
            </button>
          </div>
          {hasCommitted && (
            <div style={{ marginTop: ".65rem", paddingTop: ".65rem", borderTop: "1px solid var(--border)", fontSize: ".82rem", color: "var(--text-secondary)", display: "flex", gap: "1.4rem", flexWrap: "wrap" }}>
              <span>MRP: <strong style={{ color: "var(--text-heading)" }}>{rootMrpLabel}</strong></span>
              {items.length > 0 && (
                <span>{items.length} BOM rows · click a node for details</span>
              )}
            </div>
          )}
        </div>

        {tooLarge && (
          <div className="card" style={{ borderLeft: "4px solid var(--status-amber)", background: "#fffbf0", marginBottom: "1rem", fontSize: ".85rem", color: "var(--text-body)" }}>
            BOM has {items.length} nodes — showing first {MAX_NODES}. Reduce depth or switch to Table View.
          </div>
        )}

        {loading && <div className="spinner">Exploding BOM…</div>}
        {error   && <div className="card" style={{ borderLeft: "4px solid var(--red)", color: "var(--red)", fontSize: ".85rem" }}>{error.message}</div>}

        {!loading && hasCommitted && items.length === 0 && (
          <div className="card" style={{ color: "var(--text-secondary)", fontSize: ".9rem" }}>
            No BOM found for <strong style={{ fontFamily: "var(--mono)" }}>{committed}</strong>.
          </div>
        )}

        {/* ── Graph view ── */}
        {!loading && items.length > 0 && viewMode === "graph" && (
          <>
            {mrpLegend.length > 0 && (
              <div className="card" style={{ paddingTop: ".75rem", paddingBottom: ".75rem", marginBottom: "1rem" }}>
                <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-secondary)", marginBottom: ".5rem" }}>
                  MRP Controllers — click to toggle
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem .6rem", alignItems: "center" }}>
                  {mrpLegend.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => toggleMrp(entry.label)}
                      aria-pressed={entry.active}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: ".35rem",
                        border: `1.5px solid ${entry.active ? entry.color : "var(--border)"}`,
                        background: entry.active ? entry.chipFill : "transparent",
                        color: entry.active ? "var(--text-body)" : "var(--text-secondary)",
                        padding: ".28rem .65rem", cursor: "pointer", fontSize: ".8rem",
                        fontFamily: "inherit", outline: "none",
                      }}
                    >
                      <span style={{
                        width: 8, height: 8,
                        background: entry.active ? entry.color : "var(--border)",
                        display: "inline-block", flexShrink: 0,
                      }} />
                      <strong>{entry.label}</strong>
                      <span style={{ opacity: .7 }}>({entry.count})</span>
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
                    if (Boolean(d?.dimmed)) return "var(--border)";
                    if (node.type === "mrpGroup") return String(d?.groupAccent ?? "var(--accent)");
                    return String(d?.mrpColor ?? "var(--accent)");
                  }}
                  maskColor="rgba(245,245,245,0.75)"
                />
              </ReactFlow>

              {selectedNode && (
                <NodeDetailPanel
                  node={selectedNode}
                  items={items}
                  onClose={() => setSelectedNode(null)}
                  onNavigate={() => navigate(`/materials/${selectedNode.id}`)}
                  onViewScrap={() => { setScrapChainFor(selectedNode.id); setSelectedNode(null); }}
                />
              )}
            </div>
          </>
        )}

        {/* ── Table view ── */}
        {!loading && items.length > 0 && viewMode === "table" && (
          <div className="card">
            <div style={{ marginBottom: ".75rem", color: "var(--text-secondary)", fontSize: ".85rem" }}>
              {items.length} BOM rows
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Depth</th><th>Parent</th><th>Component</th><th>Description</th>
                    <th>Type</th><th>MRP</th><th>Qty/Parent</th><th>Planned Qty</th>
                    <th>Scrap %</th><th>Actual Qty</th>
                    <th>Machine/unit</th><th>Machine total</th>
                    <th>Labor/unit</th><th>Labor total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const perUnitMachine = it.totalQuantity > 0 ? it.totalMachineMin / it.totalQuantity : 0;
                    const perUnitLabor   = it.totalQuantity > 0 ? it.totalLaborMin   / it.totalQuantity : 0;
                    const depthColors = ["#EFF3FA", "#EFF8F2", "#FAF5EC", "#FAF0F6", "#EFF8F8"];
                    const depthBorderColors = ["#2D4A8A", "#27AE60", "#7A5C20", "#8A2D5A", "#2D6A6A"];
                    const di = (it.depth - 1) % depthColors.length;
                    return (
                      <tr
                        key={i}
                        style={{
                          background: depthColors[di],
                          borderLeft: `3px solid ${depthBorderColors[di]}`,
                        }}
                      >
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{it.depth}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem", color: "var(--text-secondary)" }}>{it.parent}</td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{it.component}</td>
                        <td title={it.description ?? ""}>{it.description ?? "—"}</td>
                        <td><TypeBadge type={it.materialType} /></td>
                        <td style={{ fontFamily: "var(--mono)", fontSize: ".78rem" }}>{it.mrpController ?? "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{it.qtyPerParent.toFixed(3)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{it.totalQuantity.toFixed(3)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{(it.scrapRatePct ?? 0).toFixed(2)}%</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--red)", fontWeight: 700 }}>{it.adjustedTotalQuantity.toFixed(3)}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{perUnitMachine > 0 ? perUnitMachine.toFixed(2) : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{it.totalMachineMin > 0 ? it.totalMachineMin.toFixed(2) : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{perUnitLabor   > 0 ? perUnitLabor.toFixed(2)   : "—"}</td>
                        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{it.totalLaborMin   > 0 ? it.totalLaborMin.toFixed(2)   : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {scrapChainFor && (
          <ScrapChainPanel materialId={scrapChainFor} onClose={() => setScrapChainFor(null)} />
        )}

      </div>
    </div>
  );
}
