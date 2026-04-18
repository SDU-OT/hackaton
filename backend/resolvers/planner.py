from collections import defaultdict
from resolvers import bom as bom_resolver
from resolvers import material as mat_resolver


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

    root = mat_resolver.get_material(material_id)
    return {
        "root_material":       material_id,
        "root_description":    root["description"] if root else None,
        "requested_quantity":  quantity,
        "components":          components,
        "total_machine_min":   total_machine,
        "total_labor_min":     total_labor,
        "max_depth_reached":   max_depth_seen,
    }
