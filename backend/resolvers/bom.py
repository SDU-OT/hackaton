from db import query
from collections import defaultdict


def resolve_material_id(material_id: str):
    mid = (material_id or "").strip()
    if not mid:
        return None

    exact = query("SELECT material FROM bom WHERE material = ? LIMIT 1", [mid])
    if exact:
        return str(exact[0][0])

    # Accept user input with or without leading zeros.
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

    # Avoid recursive SQL here due to DuckDB internal crashes on certain trees.
    items = []
    frontier = [{
        "material": resolved_id,
        "total_factor": requested_qty,
        "depth": 0,
        "path": [resolved_id],
    }]

    while frontier:
        by_parent = _get_bom_children_for_parents([f["material"] for f in frontier])
        next_frontier = []

        for f in frontier:
            children = by_parent.get(f["material"], [])
            for child in children:
                component = child["component"]
                qty_per_parent = float(child["quantity"] if child["quantity"] is not None else 0.0)

                # Mirror the recursive SQL cycle rule for recursive levels only.
                if f["depth"] > 0 and component in f["path"]:
                    continue

                total_quantity = f["total_factor"] * qty_per_parent
                row_path = f["path"] if f["depth"] == 0 else (f["path"] + [f["material"]])
                next_depth = f["depth"] + 1

                items.append({
                    "parent": f["material"],
                    "component": component,
                    "description": None,
                    "material_type": None,
                    "material_group": None,
                    "mrp_controller": None,
                    "unit": child["unit"] or "",
                    "qty_per_parent": qty_per_parent,
                    "total_quantity": total_quantity,
                    "depth": next_depth,
                    "path_str": " > ".join(row_path),
                    "total_machine_min": 0.0,
                    "total_labor_min": 0.0,
                })

                if next_depth < max_depth:
                    next_frontier.append({
                        "material": component,
                        "total_factor": total_quantity,
                        "depth": next_depth,
                        "path": row_path,
                    })

        frontier = next_frontier

    # Keep output deterministic and aligned with previous SQL ordering.
    items.sort(key=lambda r: (r["depth"], r["parent"], r["component"]))

    component_ids = sorted({it["component"] for it in items if it.get("component")})
    material_meta = _get_material_meta(component_ids)
    component_ids = sorted({it["component"] for it in items if it.get("component")})
    routing_map = _get_routing_totals(component_ids)
    mrp_map = _get_mrp_fallbacks(component_ids)

    for it in items:
        meta = material_meta.get(it["component"])
        if meta:
            it["description"] = meta.get("description")
            it["material_type"] = meta.get("material_type")
            it["material_group"] = meta.get("material_group")
            if meta.get("mrp_controller"):
                it["mrp_controller"] = meta.get("mrp_controller")

        if not (it.get("mrp_controller") or "").strip():
            it["mrp_controller"] = mrp_map.get(_normalize_material_id(it["component"]))

        machine_per_unit, labor_per_unit = routing_map.get(it["component"], (0.0, 0.0))
        it["total_machine_min"] = machine_per_unit * it["total_quantity"]
        it["total_labor_min"] = labor_per_unit * it["total_quantity"]

    return items


def _get_routing_totals(materials):
    if not materials:
        return {}

    placeholders = ",".join(["?"] * len(materials))

    # Keep routing aggregation out of the recursive CTE query to avoid DuckDB internal errors.
    rows = query(f"""
        SELECT material,
               COALESCE(total_machine_min, 0) AS total_machine_min,
               COALESCE(total_labor_min,   0) AS total_labor_min
        FROM routing_agg
        WHERE material IN ({placeholders})
    """, materials)

    out = {}
    for material, machine_min, labor_min in rows:
        out[str(material)] = (
            float(machine_min) if machine_min is not None else 0.0,
            float(labor_min) if labor_min is not None else 0.0,
        )
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
                "unit": str(unit) if unit is not None else "",
                "quantity": float(quantity) if quantity is not None else 0.0,
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
                material,
                description,
                material_type,
                material_group,
                NULLIF(TRIM(mrp_controller), '') AS mrp_controller
            FROM material_master
            WHERE material IN ({placeholders})
        """, chunk)
        for material, description, material_type, material_group, mrp_controller in rows:
            out[str(material)] = {
                "description": str(description) if description is not None else None,
                "material_type": str(material_type) if material_type is not None else None,
                "material_group": str(material_group) if material_group is not None else None,
                "mrp_controller": str(mrp_controller) if mrp_controller is not None else None,
            }
    return out


def _chunked(values, size):
    for i in range(0, len(values), size):
        yield values[i:i + size]


def _normalize_material_id(value: str):
    return (value or "").strip().lstrip("0") or "0"


def _get_mrp_fallbacks(materials):
    normalized = sorted({_normalize_material_id(m) for m in materials if m})
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
        # If production_mrp is unavailable, keep material-master-only MRP values.
        return {}

    out = {}
    for material, mrp_controller in rows:
        key = _normalize_material_id(str(material) if material is not None else "")
        if key and mrp_controller is not None and str(mrp_controller).strip():
            out[key] = str(mrp_controller)
    return out


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


def _row_to_explosion_item(r):
    return {
        "parent":            str(r[0]) if r[0] is not None else "",
        "component":         str(r[1]) if r[1] is not None else "",
        "description":       str(r[2]) if r[2] is not None else None,
        "material_type":     str(r[3]) if r[3] is not None else None,
        "material_group":    str(r[4]) if r[4] is not None else None,
        "mrp_controller":    str(r[5]) if r[5] is not None else None,
        "unit":              str(r[6]) if r[6] is not None else "",
        "qty_per_parent":    float(r[7]) if r[7] is not None else 0.0,
        "total_quantity":    float(r[8]) if r[8] is not None else 0.0,
        "depth":             int(r[9])   if r[9] is not None else 0,
        "path_str":          str(r[10])   if r[10] is not None else "",
        "total_machine_min": 0.0,
        "total_labor_min":   0.0,
    }
