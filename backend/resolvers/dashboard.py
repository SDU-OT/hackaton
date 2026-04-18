from db import query


def get_stats():
    counts = query("""
        SELECT
            (SELECT COUNT(*) FROM material_master)        AS total_materials,
            (SELECT COUNT(DISTINCT material) FROM bom)    AS materials_with_bom,
            (SELECT COUNT(DISTINCT material) FROM routing) AS materials_with_routing,
            (SELECT COUNT(*) FROM bom)                    AS total_bom_rows
    """)
    row = counts[0]

    type_dist = query("""
        SELECT material_type, COUNT(*) AS cnt
        FROM material_master
        WHERE material_type IS NOT NULL
        GROUP BY material_type
        ORDER BY cnt DESC
        LIMIT 20
    """)

    top_complex = query("""
        SELECT b.material, mm.description, COUNT(*) AS component_count
        FROM bom b
        LEFT JOIN material_master mm ON mm.material = b.material
        GROUP BY b.material, mm.description
        ORDER BY component_count DESC
        LIMIT 15
    """)

    top_scrap = query("""
        SELECT s.material, mm.description, s.total_ordered, s.total_scrap, s.scrap_rate_pct
        FROM scrap_agg s
        LEFT JOIN material_master mm ON mm.material = s.material
        WHERE s.total_ordered > 0
        ORDER BY s.scrap_rate_pct DESC
        LIMIT 15
    """)

    return {
        "total_materials":        int(row[0]) if row[0] is not None else 0,
        "materials_with_bom":     int(row[1]) if row[1] is not None else 0,
        "materials_with_routing": int(row[2]) if row[2] is not None else 0,
        "total_bom_rows":         int(row[3]) if row[3] is not None else 0,
        "type_distribution": [
            {"material_type": str(r[0]), "count": int(r[1])} for r in type_dist
        ],
        "top_complex_materials": [
            {
                "material":        str(r[0]),
                "description":     str(r[1]) if r[1] else None,
                "component_count": int(r[2]),
            } for r in top_complex
        ],
        "top_scrap_materials": [
            {
                "material":       str(r[0]),
                "description":    str(r[1]) if r[1] else None,
                "total_ordered":  int(r[2]),
                "total_scrap":    int(r[3]),
                "scrap_rate_pct": float(r[4]),
            } for r in top_scrap
        ],
    }
