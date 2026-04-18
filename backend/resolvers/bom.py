from db import query


def get_children(material_id: str):
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
    """, [material_id])
    return [_row_to_bom_item(material_id, r) for r in rows]


def explode(material_id: str, quantity: float, max_depth: int = 10):
    rows = query("""
        WITH RECURSIVE bom_explosion AS (
            SELECT
                b.material      AS parent,
                b.component,
                b.unit,
                b.quantity      AS qty_per_parent,
                CAST(? AS DOUBLE) * b.quantity AS total_quantity,
                1               AS depth,
                [b.material]    AS path
            FROM bom b
            WHERE b.material = ?

            UNION ALL

            SELECT
                b.material      AS parent,
                b.component,
                b.unit,
                b.quantity      AS qty_per_parent,
                e.total_quantity * b.quantity AS total_quantity,
                e.depth + 1     AS depth,
                array_append(e.path, b.material) AS path
            FROM bom b
            INNER JOIN bom_explosion e ON b.material = e.component
            WHERE e.depth < ?
              AND NOT array_contains(e.path, b.component)
        )
        SELECT
            be.parent,
            be.component,
            mm.description,
            mm.material_type,
            be.unit,
            be.qty_per_parent,
            be.total_quantity,
            be.depth,
            array_to_string(be.path, ' > ') AS path_str,
            COALESCE(ra.total_machine_min, 0) * be.total_quantity AS total_machine_min,
            COALESCE(ra.total_labor_min,   0) * be.total_quantity AS total_labor_min
        FROM bom_explosion be
        LEFT JOIN material_master mm ON mm.material = be.component
        LEFT JOIN routing_agg ra     ON ra.material = be.component
        ORDER BY be.depth, be.parent, be.component
    """, [quantity, material_id, max_depth])
    return [_row_to_explosion_item(r) for r in rows]


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
        "unit":              str(r[4]) if r[4] is not None else "",
        "qty_per_parent":    float(r[5]) if r[5] is not None else 0.0,
        "total_quantity":    float(r[6]) if r[6] is not None else 0.0,
        "depth":             int(r[7])   if r[7] is not None else 0,
        "path_str":          str(r[8])   if r[8] is not None else "",
        "total_machine_min": float(r[9])  if r[9] is not None else 0.0,
        "total_labor_min":   float(r[10]) if r[10] is not None else 0.0,
    }
