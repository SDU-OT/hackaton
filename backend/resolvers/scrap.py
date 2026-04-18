from db import query


def get_scrap_stats(limit: int = 100, offset: int = 0):
    rows = query("""
        SELECT
            s.material, mm.description, mm.material_type,
            s.total_ordered, s.total_scrap, s.total_delivered, s.scrap_rate_pct
        FROM scrap_agg s
        LEFT JOIN material_master mm
            ON mm.material = LPAD(s.material, LENGTH(mm.material), '0')
            OR mm.material = s.material
        WHERE s.total_ordered > 0
        ORDER BY s.scrap_rate_pct DESC
        LIMIT ? OFFSET ?
    """, [limit, offset])
    return [_row(r) for r in rows]


def get_material_scrap(material_id: str):
    # Try both padded and raw forms
    rows = query("""
        SELECT
            s.material, mm.description, mm.material_type,
            s.total_ordered, s.total_scrap, s.total_delivered, s.scrap_rate_pct
        FROM scrap_agg s
        LEFT JOIN material_master mm
            ON mm.material = LPAD(s.material, LENGTH(mm.material), '0')
            OR mm.material = s.material
        WHERE s.material = LTRIM(?, '0') OR s.material = ?
        LIMIT 1
    """, [material_id, material_id])
    if not rows:
        return None
    return _row(rows[0])


def _row(r):
    return {
        "material":       str(r[0])   if r[0] is not None else "",
        "description":    str(r[1])   if r[1] is not None else None,
        "material_type":  str(r[2])   if r[2] is not None else None,
        "total_ordered":  int(r[3])   if r[3] is not None else 0,
        "total_scrap":    int(r[4])   if r[4] is not None else 0,
        "total_delivered":int(r[5])   if r[5] is not None else 0,
        "scrap_rate_pct": float(r[6]) if r[6] is not None else 0.0,
    }
