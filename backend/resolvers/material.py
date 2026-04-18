from db import query


def search_materials(search_query: str, limit: int = 20, offset: int = 0):
    rows = query("""
        SELECT
            mm.material, mm.description, mm.material_type, mm.material_group,
            mm.status, mm.weight_kg, mm.plant, mm.mrp_controller,
            EXISTS(SELECT 1 FROM bom WHERE material = mm.material LIMIT 1)    AS has_bom,
            EXISTS(SELECT 1 FROM routing WHERE material = mm.material LIMIT 1) AS has_routing
        FROM material_master mm
        WHERE mm.material ILIKE '%' || ? || '%'
           OR mm.description ILIKE '%' || ? || '%'
        ORDER BY
            CASE WHEN mm.material = ? THEN 0
                 WHEN mm.material ILIKE ? || '%' THEN 1
                 ELSE 2 END,
            mm.material
        LIMIT ? OFFSET ?
    """, [search_query, search_query, search_query, search_query, limit, offset])

    count_rows = query("""
        SELECT COUNT(*) FROM material_master mm
        WHERE mm.material ILIKE '%' || ? || '%'
           OR mm.description ILIKE '%' || ? || '%'
    """, [search_query, search_query])

    total = count_rows[0][0] if count_rows else 0
    return {"items": [_row_to_material(r) for r in rows], "total": total}


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


def get_final_products(limit: int = 50, offset: int = 0, search: str = ""):
    where_extra = ""
    params_count = []
    params_rows = []
    if search:
        where_extra = " AND (mm.material ILIKE '%' || ? || '%' OR mm.description ILIKE '%' || ? || '%')"
        params_count = [search, search]
        params_rows  = [search, search]

    total_rows = query(
        f"SELECT COUNT(*) FROM material_master WHERE material_type = 'ZFRT'{where_extra}",
        params_count if params_count else None,
    )
    total = int(total_rows[0][0]) if total_rows else 0

    rows = query(f"""
        SELECT
            mm.material,
            mm.description,
            mm.material_type,
            mm.status,
            COALESCE(s.total_ordered,   0) AS total_ordered,
            COALESCE(s.total_scrap,     0) AS total_scrap,
            COALESCE(s.scrap_rate_pct,  0) AS scrap_rate_pct,
            COALESCE(ra.op_count,       0) AS routing_op_count
        FROM material_master mm
        LEFT JOIN scrap_agg s    ON s.material = LTRIM(mm.material, '0')
        LEFT JOIN routing_agg ra ON ra.material = mm.material
        WHERE mm.material_type = 'ZFRT'{where_extra}
        ORDER BY s.scrap_rate_pct DESC NULLS LAST
        LIMIT ? OFFSET ?
    """, (params_rows + [limit, offset]) if params_rows else [limit, offset])

    return {"items": [_row_to_final_product(r) for r in rows], "total": total}


def get_raw_materials(limit: int = 50, offset: int = 0, search: str = ""):
    where_extra = ""
    params_count = []
    params_rows  = []
    if search:
        where_extra = " AND (rm.material ILIKE '%' || ? || '%' OR mm.description ILIKE '%' || ? || '%')"
        params_count = [search, search]
        params_rows  = [search, search]

    total_rows = query(
        f"SELECT COUNT(*) FROM raw_materials rm LEFT JOIN material_master mm ON mm.material = rm.material WHERE 1=1{where_extra}",
        params_count if params_count else None,
    )
    total = int(total_rows[0][0]) if total_rows else 0

    rows = query(f"""
        SELECT
            rm.material,
            mm.description,
            mm.material_type,
            rm.used_in_bom_count
        FROM raw_materials rm
        LEFT JOIN material_master mm ON mm.material = rm.material
        WHERE 1=1{where_extra}
        ORDER BY rm.used_in_bom_count DESC
        LIMIT ? OFFSET ?
    """, (params_rows + [limit, offset]) if params_rows else [limit, offset])

    return {"items": [_row_to_raw_material(r) for r in rows], "total": total}


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


def _row_to_final_product(r):
    return {
        "material":        str(r[0]) if r[0] is not None else "",
        "description":     str(r[1]) if r[1] is not None else None,
        "material_type":   str(r[2]) if r[2] is not None else None,
        "status":          str(r[3]) if r[3] is not None else None,
        "total_ordered":   int(r[4]) if r[4] is not None else 0,
        "total_scrap":     int(r[5]) if r[5] is not None else 0,
        "scrap_rate_pct":  float(r[6]) if r[6] is not None else 0.0,
        "routing_op_count":int(r[7]) if r[7] is not None else 0,
    }


def _row_to_raw_material(r):
    return {
        "material":          str(r[0]) if r[0] is not None else "",
        "description":       str(r[1]) if r[1] is not None else None,
        "material_type":     str(r[2]) if r[2] is not None else None,
        "used_in_bom_count": int(r[3]) if r[3] is not None else 0,
    }
