from db import query
from resolvers import bom as bom_res


_SCRAP_SELECT = """
    SELECT
        s.material,
        COALESCE(mm.description, mm2.description) AS description,
        COALESCE(mm.material_type, mm2.material_type) AS material_type,
        CAST(s.total_ordered   AS BIGINT) AS total_ordered,
        CAST(s.total_scrap     AS BIGINT) AS total_scrap,
        CAST(s.total_delivered AS BIGINT) AS total_delivered,
        s.scrap_rate_pct,
        s.avg_std_price,
        s.total_scrap_cost
    FROM scrap_agg s
    LEFT JOIN material_master mm  ON mm.material = s.material
    LEFT JOIN material_master mm2 ON mm2.material = s.material_norm AND mm.material IS NULL
"""


def get_scrap_stats(limit: int = 100, offset: int = 0):
    rows = query(f"""
        {_SCRAP_SELECT}
        WHERE s.total_ordered > 0
        ORDER BY s.scrap_rate_pct DESC
        LIMIT ? OFFSET ?
    """, [limit, offset])
    return [_row(r) for r in rows]


def get_material_scrap(material_id: str):
    rows = query(f"""
        {_SCRAP_SELECT}
        WHERE s.material = LTRIM(?, '0') OR s.material = ?
        LIMIT 1
    """, [material_id, material_id])
    if not rows:
        return None
    return _row(rows[0])


def get_scrap_chain(material_id: str):
    return bom_res.get_scrap_chain(material_id)


def get_aggregate_scrap_sankey():
    """
    Build a Sankey of material flows caused by scrap.
    Each scrapped material's BOM is exploded and quantities are multiplied by
    its total_scrap.  Parent→child flows are summed across all scrapped materials.
    Returns {nodes: [...], links: [...]} for Recharts Sankey.
    """
    # Get all materials with recorded scrap
    scrap_rows = query("""
        SELECT material, material_norm, total_scrap
        FROM scrap_agg
        WHERE total_scrap > 0
        ORDER BY total_scrap DESC
        LIMIT 200
    """)

    if not scrap_rows:
        return {"nodes": [], "links": []}

    link_map: dict = {}  # (source, target) -> value
    node_labels: dict = {}  # material_id -> label

    for material, material_norm, total_scrap in scrap_rows:
        total_scrap = float(total_scrap) if total_scrap else 0.0
        if total_scrap <= 0:
            continue

        # Get description for the scrapped material
        mm = query("""
            SELECT description FROM material_master
            WHERE material = ? OR LTRIM(material,'0') = ?
            LIMIT 1
        """, [material, material_norm or material])
        label = (str(mm[0][0]) if mm and mm[0][0] else material)[:40]
        node_labels[material] = label

        # Explode BOM one level (depth=1) for performance; full tree gets too large
        children = query("""
            SELECT b.component, mm.description, b.quantity
            FROM bom b
            LEFT JOIN material_master mm ON mm.material = b.component
            WHERE b.material = ? OR b.material = LPAD(?, LENGTH(b.material), '0')
        """, [material, material])

        for comp, desc, qty in children:
            if not comp or not qty:
                continue
            qty = float(qty)
            wasted = qty * total_scrap
            comp_label = (str(desc) if desc else str(comp))[:40]
            node_labels[str(comp)] = comp_label
            key = (material, str(comp))
            link_map[key] = link_map.get(key, 0.0) + wasted

    # Build nodes list (deduplicated)
    node_ids = sorted(node_labels.keys())
    node_index = {nid: i for i, nid in enumerate(node_ids)}
    nodes = [{"id": nid, "label": node_labels[nid], "value": 0.0} for nid in node_ids]

    # Accumulate node values (sum of outgoing flows)
    links = []
    for (source, target), value in link_map.items():
        if source not in node_index or target not in node_index:
            continue
        links.append({"source": source, "target": target, "value": round(value, 4)})
        nodes[node_index[source]]["value"] += value

    # Sort links by value desc, keep top 500 for readability
    links.sort(key=lambda l: l["value"], reverse=True)
    links = links[:500]

    # Only keep nodes that appear in the final links
    used = {l["source"] for l in links} | {l["target"] for l in links}
    nodes = [n for n in nodes if n["id"] in used]

    return {"nodes": nodes, "links": links}


def _row(r):
    return {
        "material":         str(r[0])   if r[0] is not None else "",
        "description":      str(r[1])   if r[1] is not None else None,
        "material_type":    str(r[2])   if r[2] is not None else None,
        "total_ordered":    int(r[3])   if r[3] is not None else 0,
        "total_scrap":      int(r[4])   if r[4] is not None else 0,
        "total_delivered":  int(r[5])   if r[5] is not None else 0,
        "scrap_rate_pct":   float(r[6]) if r[6] is not None else 0.0,
        "avg_std_price":    float(r[7]) if r[7] is not None else None,
        "total_scrap_cost": float(r[8]) if r[8] is not None else None,
    }
