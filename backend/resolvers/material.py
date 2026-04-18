from db import query


def search_materials(
    search_query: str = "",
    limit: int = 20,
    offset: int = 0,
    material_type: str = "",
    mrp_controller: str = "",
):
    search_term = (search_query or "").strip()
    type_filter = (material_type or "").strip()
    mrp_filter = (mrp_controller or "").strip()

    where_clauses = []
    where_params = []

    if search_term:
        where_clauses.append("mm.material ILIKE '%' || ? || '%'")
        where_params.append(search_term)

    if type_filter:
        where_clauses.append("mm.material_type = ?")
        where_params.append(type_filter)

    if mrp_filter:
        where_clauses.append("mm.mrp_controller = ?")
        where_params.append(mrp_filter)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    if search_term:
        order_sql = """
            ORDER BY
                CASE WHEN mm.material = ? THEN 0
                     WHEN mm.material ILIKE ? || '%' THEN 1
                     ELSE 2 END,
                mm.material
        """
        order_params = [search_term, search_term]
    else:
        order_sql = "ORDER BY mm.material"
        order_params = []

    rows = query(f"""
        SELECT
            mm.material, mm.description, mm.material_type, mm.material_group,
            mm.status, mm.weight_kg, mm.plant, mm.mrp_controller,
            EXISTS(SELECT 1 FROM bom WHERE material = mm.material LIMIT 1)    AS has_bom,
            EXISTS(SELECT 1 FROM routing WHERE material = mm.material LIMIT 1) AS has_routing
        FROM material_master mm
        {where_sql}
        {order_sql}
        LIMIT ? OFFSET ?
    """, where_params + order_params + [limit, offset])

    count_rows = query(f"""
        SELECT COUNT(*)
        FROM material_master mm
        {where_sql}
    """, where_params if where_params else None)

    total = count_rows[0][0] if count_rows else 0
    return {"items": [_row_to_material(r) for r in rows], "total": total}


def get_material_catalog_filters():
    type_rows = query("""
        SELECT DISTINCT material_type
        FROM material_master
        WHERE material_type IS NOT NULL
          AND TRIM(material_type) != ''
        ORDER BY material_type
    """)

    mrp_rows = query("""
        SELECT DISTINCT mrp_controller
        FROM material_master
        WHERE mrp_controller IS NOT NULL
          AND TRIM(mrp_controller) != ''
        ORDER BY mrp_controller
    """)

    return {
        "material_types": [str(r[0]) for r in type_rows],
        "mrp_controllers": [str(r[0]) for r in mrp_rows],
    }


def get_material(material_id: str):
    rows = query("""
        SELECT
            mm.material, mm.description, mm.material_type, mm.material_group,
            mm.status, mm.weight_kg, mm.plant, mm.mrp_controller,
            EXISTS(SELECT 1 FROM bom WHERE material = mm.material LIMIT 1)    AS has_bom,
            EXISTS(SELECT 1 FROM routing WHERE material = mm.material LIMIT 1) AS has_routing
        FROM material_master mm
        WHERE mm.material = ?
        LIMIT 1
    """, [material_id])
    if not rows:
        return None
    return _row_to_material(rows[0])


def _row_to_material(r):
    return {
        "material":       str(r[0]) if r[0] is not None else "",
        "description":    str(r[1]) if r[1] is not None else None,
        "material_type":  str(r[2]) if r[2] is not None else None,
        "material_group": str(r[3]) if r[3] is not None else None,
        "status":         str(r[4]) if r[4] is not None else None,
        "weight_kg":      float(r[5]) if r[5] is not None else None,
        "plant":          str(r[6]) if r[6] is not None else None,
        "mrp_controller": str(r[7]) if r[7] is not None else None,
        "has_bom":        bool(r[8]),
        "has_routing":    bool(r[9]),
    }
