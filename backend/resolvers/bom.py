from db import query
from collections import defaultdict


def resolve_material_id(material_id: str):
    mid = (material_id or "").strip()
    if not mid:
        return None

    exact = query("SELECT material FROM bom WHERE material = ? LIMIT 1", [mid])
    if exact:
        return str(exact[0][0])

    normalized = query("""
        SELECT material
        FROM bom
        WHERE LTRIM(material, '0') = LTRIM(?, '0')
        ORDER BY LENGTH(material) DESC, material
        LIMIT 1
    """, [mid])
    if normalized:
        return str(normalized[0][0])

    return None


def get_children(material_id: str):
    resolved_id = resolve_material_id(material_id) or (material_id or "").strip()
    rows = query("""
        SELECT
            b.component,
            mm.description,
            mm.material_type,
            mm.status,
            b.unit,
            b.quantity,
            b.item_category,
            EXISTS(SELECT 1 FROM bom sub WHERE sub.material = b.component LIMIT 1) AS has_children
        FROM bom b
        LEFT JOIN material_master mm ON mm.material = b.component
        WHERE b.material = ?
        ORDER BY b.component
    """, [resolved_id])
    return [_row_to_bom_item(resolved_id, r) for r in rows]


def explode(material_id: str, quantity: float, max_depth: int = 10):
    resolved_id = resolve_material_id(material_id) or (material_id or "").strip()
    max_depth = max(1, int(max_depth or 1))
    requested_qty = float(quantity if quantity is not None else 1.0)

    # Frontier-based BFS to avoid DuckDB recursive CTE crashes on certain trees.
    items = []
    frontier = [{
        "material":     resolved_id,
        "total_factor": requested_qty,
        "depth":        0,
        "path":         [resolved_id],
    }]

    while frontier:
        by_parent = _get_bom_children_for_parents([f["material"] for f in frontier])
        next_frontier = []

        for f in frontier:
            children = by_parent.get(f["material"], [])
            for child in children:
                component      = child["component"]
                qty_per_parent = float(child["quantity"] if child["quantity"] is not None else 0.0)

                if f["depth"] > 0 and component in f["path"]:
                    continue

                total_quantity = f["total_factor"] * qty_per_parent
                row_path       = f["path"] if f["depth"] == 0 else (f["path"] + [f["material"]])
                next_depth     = f["depth"] + 1

                items.append({
                    "parent":            f["material"],
                    "component":         component,
                    "description":       None,
                    "material_type":     None,
                    "material_group":    None,
                    "mrp_controller":    None,
                    "unit":              child["unit"] or "",
                    "qty_per_parent":    qty_per_parent,
                    "total_quantity":    total_quantity,
                    "depth":             next_depth,
                    "path_str":          " > ".join(row_path),
                    "total_machine_min": 0.0,
                    "total_labor_min":   0.0,
                })

                if next_depth < max_depth:
                    next_frontier.append({
                        "material":     component,
                        "total_factor": total_quantity,
                        "depth":        next_depth,
                        "path":         row_path,
                    })

        frontier = next_frontier

    items.sort(key=lambda r: (r["depth"], r["parent"], r["component"]))

    component_ids = sorted({it["component"] for it in items if it.get("component")})
    material_meta = _get_material_meta(component_ids)
    routing_map   = _get_routing_totals(component_ids)
    mrp_map       = _get_mrp_fallbacks(component_ids)

    for it in items:
        meta = material_meta.get(it["component"])
        if meta:
            it["description"]   = meta.get("description")
            it["material_type"] = meta.get("material_type")
            it["material_group"] = meta.get("material_group")
            if meta.get("mrp_controller"):
                it["mrp_controller"] = meta.get("mrp_controller")

        if not (it.get("mrp_controller") or "").strip():
            it["mrp_controller"] = mrp_map.get(_norm(it["component"]))

        machine_per_unit, labor_per_unit = routing_map.get(it["component"], (0.0, 0.0))
        it["total_machine_min"] = machine_per_unit * it["total_quantity"]
        it["total_labor_min"]   = labor_per_unit   * it["total_quantity"]

    return items


def get_scrap_chain(material_id: str):
    """
    Explode the BOM for material_id and multiply component quantities by the
    total scrap quantity recorded in scrap_agg.  Returns a list of items showing
    how many of each sub-component were wasted due to scrap of this material.
    """
    # Get total scrap for this material
    scrap_rows = query("""
        SELECT total_scrap FROM scrap_agg
        WHERE material = ? OR material_norm = ?
        LIMIT 1
    """, [material_id, _norm(material_id)])

    if not scrap_rows or not scrap_rows[0][0]:
        return []

    total_scrap = float(scrap_rows[0][0])
    if total_scrap <= 0:
        return []

    explosion = explode(material_id, 1.0, max_depth=10)
    if not explosion:
        return []

    # Fetch standard prices for all components in one query
    component_ids = sorted({it["component"] for it in explosion if it.get("component")})
    price_map = _get_standard_prices(component_ids)

    result = []
    for item in explosion:
        machine_per_unit = item["total_machine_min"] / item["total_quantity"] if item["total_quantity"] else 0.0
        labor_per_unit   = item["total_labor_min"]   / item["total_quantity"] if item["total_quantity"] else 0.0
        wasted_qty       = item["total_quantity"] * total_scrap
        std_price        = price_map.get(item["component"]) or price_map.get(_norm(item["component"]))

        result.append({
            "component":             item["component"],
            "description":           item["description"],
            "depth":                 item["depth"],
            "path_str":              item["path_str"],
            "qty_per_scrapped_unit": item["total_quantity"],
            "total_qty_wasted":      wasted_qty,
            "machine_min_wasted":    machine_per_unit * wasted_qty,
            "labor_min_wasted":      labor_per_unit   * wasted_qty,
            "estimated_cost":        (std_price * wasted_qty) if std_price is not None else None,
        })

    return result


def _get_standard_prices(materials: list) -> dict:
    """Return {material_id: avg_std_price} from scrap_agg, keyed by both raw and norm IDs."""
    if not materials:
        return {}
    norms = sorted({_norm(m) for m in materials if m})
    placeholders_raw  = ",".join(["?"] * len(materials))
    placeholders_norm = ",".join(["?"] * len(norms))
    try:
        rows = query(f"""
            SELECT material, material_norm, avg_std_price
            FROM scrap_agg
            WHERE avg_std_price IS NOT NULL AND avg_std_price > 0
              AND (material IN ({placeholders_raw}) OR material_norm IN ({placeholders_norm}))
        """, list(materials) + list(norms))
    except Exception:
        return {}
    out = {}
    for material, material_norm, price in rows:
        val = float(price) if price is not None else None
        if material:
            out[str(material)] = val
        if material_norm:
            out[str(material_norm)] = val
    return out


def _get_routing_totals(materials):
    """
    Return {material_id: (machine_min_per_unit, labor_min_per_unit)}.
    Keyed by both the raw ID and the normalized (leading-zero-stripped) ID so
    callers don't need to worry about zero-padding mismatches between BOM and routing.
    """
    if not materials:
        return {}

    # Collect all normalized IDs to query against both columns in routing_agg
    norms = sorted({_norm(m) for m in materials if m})

    placeholders_raw  = ",".join(["?"] * len(materials))
    placeholders_norm = ",".join(["?"] * len(norms))

    rows = query(f"""
        SELECT material, material_norm, total_machine_min, total_labor_min
        FROM routing_agg
        WHERE material IN ({placeholders_raw})
           OR material_norm IN ({placeholders_norm})
    """, list(materials) + list(norms))

    out = {}
    for material, material_norm, machine_min, labor_min in rows:
        val = (
            float(machine_min) if machine_min is not None else 0.0,
            float(labor_min)   if labor_min   is not None else 0.0,
        )
        # Register under both forms so lookups succeed regardless of zero-padding
        if material:
            out[str(material)] = val
        if material_norm:
            out[str(material_norm)] = val

    return out


def _get_bom_children_for_parents(parents):
    out = defaultdict(list)
    parent_ids = sorted({(p or "").strip() for p in parents if (p or "").strip()})
    if not parent_ids:
        return out

    for chunk in _chunked(parent_ids, 700):
        placeholders = ",".join(["?"] * len(chunk))
        rows = query(f"""
            SELECT material, component, unit, quantity
            FROM bom
            WHERE material IN ({placeholders})
        """, chunk)
        for material, component, unit, quantity in rows:
            out[str(material)].append({
                "component": str(component) if component is not None else "",
                "unit":      str(unit)      if unit      is not None else "",
                "quantity":  float(quantity) if quantity  is not None else 0.0,
            })
    return out


def _get_material_meta(materials):
    out = {}
    material_ids = sorted({(m or "").strip() for m in materials if (m or "").strip()})
    if not material_ids:
        return out

    for chunk in _chunked(material_ids, 700):
        placeholders = ",".join(["?"] * len(chunk))
        rows = query(f"""
            SELECT
                material, description, material_type, material_group,
                NULLIF(TRIM(mrp_controller), '') AS mrp_controller
            FROM material_master
            WHERE material IN ({placeholders})
        """, chunk)
        for material, description, material_type, material_group, mrp_controller in rows:
            out[str(material)] = {
                "description":    str(description)    if description    is not None else None,
                "material_type":  str(material_type)  if material_type  is not None else None,
                "material_group": str(material_group) if material_group is not None else None,
                "mrp_controller": str(mrp_controller) if mrp_controller is not None else None,
            }
    return out


def _get_mrp_fallbacks(materials):
    normalized = sorted({_norm(m) for m in materials if m})
    if not normalized:
        return {}

    placeholders = ",".join(["?"] * len(normalized))
    try:
        rows = query(f"""
            SELECT material, mrp_controller
            FROM production_mrp
            WHERE material IN ({placeholders})
        """, normalized)
    except Exception:
        return {}

    out = {}
    for material, mrp_controller in rows:
        key = _norm(str(material) if material is not None else "")
        if key and mrp_controller is not None and str(mrp_controller).strip():
            out[key] = str(mrp_controller)
    return out


def _norm(value: str) -> str:
    return (value or "").strip().lstrip("0") or "0"


def _chunked(values, size):
    for i in range(0, len(values), size):
        yield values[i:i + size]


def _row_to_bom_item(parent: str, r):
    return {
        "parent":        parent,
        "component":     str(r[0]) if r[0] is not None else "",
        "description":   str(r[1]) if r[1] is not None else None,
        "material_type": str(r[2]) if r[2] is not None else None,
        "status":        str(r[3]) if r[3] is not None else None,
        "unit":          str(r[4]) if r[4] is not None else "",
        "quantity":      float(r[5]) if r[5] is not None else 0.0,
        "item_category": str(r[6]) if r[6] is not None else "",
        "has_children":  bool(r[7]),
    }
