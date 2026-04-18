from db import query


def get_routing(material_id: str):
    mid = (material_id or "").strip()
    rows = query("""
        SELECT
            material, sequence, description, wc_id, work_center, crtl_key,
            machine_min, labor_min, setup_min, machine_unit, labor_unit, setup_unit
        FROM routing
        WHERE material = ?
           OR LTRIM(material, '0') = LTRIM(?, '0')
        ORDER BY sequence
    """, [mid, mid])
    return [_row_to_op(r) for r in rows]


def _row_to_op(r):
    return {
        "material":     str(r[0])   if r[0] is not None else "",
        "sequence":     int(r[1])   if r[1] is not None else 0,
        "description":  str(r[2])   if r[2] is not None else None,
        "wc_id":        str(r[3])   if r[3] is not None else None,
        "work_center":  str(r[4])   if r[4] is not None else None,
        "crtl_key":     str(r[5])   if r[5] is not None else None,
        "machine_min":  float(r[6]) if r[6] is not None else None,
        "labor_min":    float(r[7]) if r[7] is not None else None,
        "setup_min":    float(r[8]) if r[8] is not None else None,
        "machine_unit": str(r[9])   if r[9] is not None else None,
        "labor_unit":   str(r[10])  if r[10] is not None else None,
        "setup_unit":   str(r[11])  if r[11] is not None else None,
    }
