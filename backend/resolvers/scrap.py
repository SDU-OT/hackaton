from db import query
from resolvers import bom as bom_res


# Extract the first 4-digit year from a free-form date string (e.g. 2025-01-31, 31.01.2025).
_YEAR_FROM_ISSUE_DATE = "TRY_CAST(REGEXP_EXTRACT(CAST(issue_date AS VARCHAR), '(19|20)[0-9]{2}', 0) AS INTEGER)"


def _node_label(material_id: str, description) -> str:
    material_id = str(material_id).strip()
    if description is None:
        return material_id[:58]

    desc = str(description).strip()
    if not desc:
        return material_id[:58]

    if desc.lower().startswith(material_id.lower()):
        label = desc
    else:
        label = f"{material_id} - {desc}"
    return label[:58]


def _material_description(material_id: str, cache: dict) -> str | None:
    key = str(material_id).strip()
    if key in cache:
        return cache[key]

    rows = query("""
        SELECT description FROM material_master
        WHERE material = ? OR LTRIM(material,'0') = LTRIM(?,'0')
        LIMIT 1
    """, [key, key])
    desc = str(rows[0][0]).strip() if rows and rows[0][0] else None
    cache[key] = desc
    return desc


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

# Year-filtered query goes straight to scrap_records (scrap_agg is aggregated without year)
_SCRAP_YEAR_CTE = f"""
    WITH yr AS (
        SELECT
            TRIM(CAST(material AS VARCHAR)) AS material,
            LTRIM(TRIM(CAST(material AS VARCHAR)), '0') AS material_norm,
            SUM(COALESCE(operation_qty,   0)) AS total_ordered,
            SUM(COALESCE(scrap_qty_final, 0)) AS total_scrap,
            SUM(COALESCE(confirmed_yield, 0)) AS total_delivered,
            AVG(NULLIF(standard_price, 0))    AS avg_std_price,
            SUM(COALESCE(scrap_cost, 0))      AS total_scrap_cost
        FROM scrap_records
        WHERE {_YEAR_FROM_ISSUE_DATE} = ?
          AND material IS NOT NULL AND TRIM(CAST(material AS VARCHAR)) != ''
        GROUP BY TRIM(CAST(material AS VARCHAR))
    )
    SELECT
        yr.material,
        COALESCE(mm.description, mm2.description) AS description,
        COALESCE(mm.material_type, mm2.material_type) AS material_type,
        CAST(yr.total_ordered   AS BIGINT) AS total_ordered,
        CAST(yr.total_scrap     AS BIGINT) AS total_scrap,
        CAST(yr.total_delivered AS BIGINT) AS total_delivered,
        CASE WHEN yr.total_ordered > 0
             THEN yr.total_scrap::DOUBLE / yr.total_ordered * 100.0
             ELSE 0.0
        END AS scrap_rate_pct,
        yr.avg_std_price,
        yr.total_scrap_cost
    FROM yr
    LEFT JOIN material_master mm  ON mm.material = yr.material
    LEFT JOIN material_master mm2 ON mm2.material = yr.material_norm AND mm.material IS NULL
"""


def get_scrap_years() -> list:
    """Return sorted list of distinct years present in scrap_records.issue_date."""
    rows = query(f"""
        SELECT DISTINCT
            {_YEAR_FROM_ISSUE_DATE} AS yr
        FROM scrap_records
        WHERE issue_date IS NOT NULL
          AND {_YEAR_FROM_ISSUE_DATE} IS NOT NULL
        ORDER BY yr DESC
    """)
    return [int(r[0]) for r in rows if r[0] is not None]


def get_scrap_stats(limit: int = 100, offset: int = 0, year: int = None):
    if year is not None:
        rows = query(f"""
            {_SCRAP_YEAR_CTE}
            ORDER BY scrap_rate_pct DESC, yr.total_scrap DESC
            LIMIT ? OFFSET ?
        """, [year, limit, offset])
    else:
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


def get_aggregate_scrap_sankey(year: int = None):
    """
    Build a Sankey of material flows caused by scrap.
    Uses BOM explosion parent→child edges multiplied by total_scrap per material.
    Supports optional year filter via scrap_records.issue_date.
    """
    if year is not None:
        scrap_rows = query(f"""
            SELECT
                TRIM(CAST(material AS VARCHAR)) AS material,
                SUM(COALESCE(scrap_qty_final, 0)) AS total_scrap
            FROM scrap_records
            WHERE {_YEAR_FROM_ISSUE_DATE} = ?
              AND material IS NOT NULL AND TRIM(CAST(material AS VARCHAR)) != ''
            GROUP BY TRIM(CAST(material AS VARCHAR))
            HAVING SUM(COALESCE(scrap_qty_final, 0)) > 0
            ORDER BY total_scrap DESC
            LIMIT 15
        """, [year])
    else:
        scrap_rows = query("""
            SELECT material, total_scrap
            FROM scrap_agg
            WHERE total_scrap > 0
            ORDER BY total_scrap DESC
            LIMIT 15
        """)

    if not scrap_rows:
        return {"nodes": [], "links": []}

    link_map: dict = {}   # (source_id, target_id) -> cumulative wasted qty
    node_labels: dict = {}  # material_id -> display label
    desc_cache: dict[str, str | None] = {}

    for material, total_scrap in scrap_rows:
        material = str(material)
        total_scrap = float(total_scrap) if total_scrap else 0.0
        if total_scrap <= 0:
            continue

        # Root material label
        root_desc = _material_description(material, desc_cache)
        root_label = _node_label(material, root_desc)
        node_labels[material] = root_label

        # Explode BOM (depth-limited for performance)
        explosion = bom_res.explode(material, 1.0, max_depth=3)
        if not explosion:
            continue

        # Build component→description map from the explosion
        comp_desc = {material: root_label}
        for item in explosion:
            comp = str(item["component"])
            desc = item.get("description") or _material_description(comp, desc_cache)
            comp_desc[comp] = _node_label(comp, desc)

        # Accumulate parent→child flow edges
        for item in explosion:
            parent_id = str(item["parent"])
            child_id  = str(item["component"])
            wasted    = float(item["total_quantity"] or 0) * total_scrap

            if wasted <= 0:
                continue

            node_labels.setdefault(
                parent_id,
                comp_desc.get(parent_id, _node_label(parent_id, _material_description(parent_id, desc_cache))),
            )
            node_labels.setdefault(
                child_id,
                comp_desc.get(child_id, _node_label(child_id, _material_description(child_id, desc_cache))),
            )

            key = (parent_id, child_id)
            link_map[key] = link_map.get(key, 0.0) + wasted

    if not link_map:
        return {"nodes": [], "links": []}

    # Deduplicate nodes
    node_ids    = sorted(node_labels.keys())
    node_index  = {nid: i for i, nid in enumerate(node_ids)}
    nodes       = [{"id": nid, "label": node_labels[nid], "value": 0.0} for nid in node_ids]

    # Build links; accumulate outgoing flow on source node
    links = []
    for (source, target), value in link_map.items():
        if source not in node_index or target not in node_index:
            continue
        links.append({"source": source, "target": target, "value": round(value, 4)})
        nodes[node_index[source]]["value"] += value

    # Keep top 300 links for readability; prune orphan nodes
    links.sort(key=lambda l: l["value"], reverse=True)
    links = links[:300]

    used  = {l["source"] for l in links} | {l["target"] for l in links}
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
