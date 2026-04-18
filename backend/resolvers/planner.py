from collections import defaultdict
from resolvers import bom as bom_resolver
from resolvers import material as mat_resolver
from db import query


def _root_routing(material_id: str, quantity: float):
    rows = query("""
        SELECT total_machine_min, total_labor_min
        FROM routing_agg WHERE material = ?
    """, [material_id])
    if not rows or rows[0][0] is None:
        return 0.0, 0.0
    return float(rows[0][0]) * quantity, float(rows[0][1]) * quantity


def build_plan(material_id: str, quantity: float):
    explosion = bom_resolver.explode(material_id, quantity, max_depth=15)

    agg = defaultdict(lambda: {
        "total_quantity":    0.0,
        "total_machine_min": 0.0,
        "total_labor_min":   0.0,
        "depth":             0,
        "description":       None,
        "material_type":     None,
        "unit":              "",
    })

    max_depth_seen = 0
    for item in explosion:
        a = agg[item["component"]]
        a["total_quantity"]    += item["total_quantity"]
        a["total_machine_min"] += item["total_machine_min"]
        a["total_labor_min"]   += item["total_labor_min"]
        a["depth"]              = max(a["depth"], item["depth"])
        a["description"]        = item["description"]
        a["material_type"]      = item["material_type"]
        a["unit"]               = item["unit"]
        max_depth_seen          = max(max_depth_seen, item["depth"])

    # Include root material's own routing at depth 0
    root_machine, root_labor = _root_routing(material_id, quantity)
    root = mat_resolver.get_material(material_id)
    if root_machine > 0 or root_labor > 0:
        agg[material_id]["total_quantity"]    = quantity
        agg[material_id]["total_machine_min"] = root_machine
        agg[material_id]["total_labor_min"]   = root_labor
        agg[material_id]["depth"]             = 0
        agg[material_id]["description"]       = root["description"] if root else None
        agg[material_id]["material_type"]     = root.get("material_type") if root else None
        agg[material_id]["unit"]              = "PC"

    components = []
    for component, data in agg.items():
        components.append({
            "component":         component,
            "description":       data["description"],
            "material_type":     data["material_type"],
            "unit":              data["unit"],
            "total_quantity":    data["total_quantity"],
            "depth":             data["depth"],
            "total_machine_min": data["total_machine_min"],
            "total_labor_min":   data["total_labor_min"],
        })

    components.sort(key=lambda c: (c["depth"], c["component"]))

    total_machine = sum(c["total_machine_min"] for c in components)
    total_labor   = sum(c["total_labor_min"]   for c in components)

    return {
        "root_material":      material_id,
        "root_description":   root["description"] if root else None,
        "requested_quantity": quantity,
        "components":         components,
        "total_machine_min":  total_machine,
        "total_labor_min":    total_labor,
        "max_depth_reached":  max_depth_seen,
    }
