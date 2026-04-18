from db import query


_SORTABLE = {
    "material":             "mm.material",
    "description":          "mm.description",
    "mrp_controller":       "mm.mrp_controller",
    "material_type":        "mm.material_type",
    "total_ordered":        "total_ordered",
    "total_units_produced": "total_units_produced",
    "scrap_rate_pct":       "scrap_rate_pct",
    "total_scrap_cost":     "total_scrap_cost",
    "avg_throughput_min":   "avg_throughput_min",
}


def get_material_catalog(
    search: str = "",
    material_type: str = "",
    mrp_controller: str = "",
    date_from: str = "",
    date_to: str = "",
    sort_by: str = "material",
    sort_dir: str = "asc",
    limit: int = 50,
    offset: int = 0,
):
    pattern = f"%{search}%" if search else "%"
    use_date_filter = bool(date_from or date_to)
    order_col = _SORTABLE.get(sort_by, "mm.material")
    order_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    # WHERE clauses applied to material_master
    where_clauses = ["(mm.material ILIKE ? OR mm.description ILIKE ?)"]
    where_params: list = [pattern, pattern]
    if material_type:
        where_clauses.append("mm.material_type = ?")
        where_params.append(material_type)
    if mrp_controller:
        where_clauses.append("mm.mrp_controller = ?")
        where_params.append(mrp_controller)
    where_sql = " AND ".join(where_clauses)

    # Fast count — no joins needed (all are LEFT JOINs that don't filter rows)
    count_sql = f"""
        SELECT COUNT(*) FROM material_master mm WHERE {where_sql}
    """

    if use_date_filter:
        # Aggregate directly from scrap_records with date filter.
        # scrap_records.material is already leading-zero-stripped.
        # Normalize mm.material the same way so we can equijoin.
        main_sql = f"""
            WITH date_scrap AS (
                SELECT
                    material,
                    CAST(SUM(operation_qty)   AS BIGINT) AS total_ordered,
                    CAST(SUM(confirmed_yield) AS BIGINT) AS total_delivered,
                    CAST(SUM(scrap_qty_final) AS BIGINT) AS total_scrap,
                    SUM(scrap_cost)                      AS total_scrap_cost
                FROM scrap_records
                WHERE (? = '' OR TRY_CAST(issue_date AS DATE) >= TRY_CAST(? AS DATE))
                  AND (? = '' OR TRY_CAST(issue_date AS DATE) <= TRY_CAST(? AS DATE))
                GROUP BY material
            ),
            mm_norm AS (
                SELECT *, LTRIM(material, '0') AS norm
                FROM material_master mm
                WHERE {where_sql}
            )
            SELECT
                mm.material,
                mm.description,
                mm.mrp_controller,
                mm.material_type,
                COALESCE(ds.total_ordered,   0) AS total_ordered,
                COALESCE(ds.total_delivered, 0) AS total_units_produced,
                CASE WHEN COALESCE(ds.total_ordered, 0) > 0
                     THEN 100.0 * COALESCE(ds.total_scrap, 0)::DOUBLE / ds.total_ordered
                     ELSE NULL END AS scrap_rate_pct,
                ds.total_scrap_cost,
                (COALESCE(ra.total_machine_min, 0) + COALESCE(ra.total_labor_min, 0))
                    / NULLIF(ra.op_count, 0) AS avg_throughput_min
            FROM mm_norm mm
            LEFT JOIN date_scrap ds ON ds.material = mm.norm
            LEFT JOIN routing_agg ra ON ra.material_norm = mm.norm
            ORDER BY {order_col} {order_dir} NULLS LAST
            LIMIT ? OFFSET ?
        """
        # params: date CTE params, then WHERE params, then LIMIT/OFFSET
        params = [date_from, date_from, date_to, date_to] + where_params
    else:
        # Use pre-aggregated scrap_agg (fast path).
        # scrap_agg.material is already stripped; routing_agg.material_norm is stripped.
        # Normalize mm.material once in a CTE so both joins are equijoins.
        main_sql = f"""
            WITH mm_norm AS (
                SELECT *, LTRIM(material, '0') AS norm
                FROM material_master mm
                WHERE {where_sql}
            )
            SELECT
                mm.material,
                mm.description,
                mm.mrp_controller,
                mm.material_type,
                COALESCE(sa.total_ordered,   0) AS total_ordered,
                COALESCE(sa.total_delivered, 0) AS total_units_produced,
                CASE WHEN COALESCE(sa.total_ordered, 0) > 0
                     THEN sa.scrap_rate_pct
                     ELSE NULL END AS scrap_rate_pct,
                sa.total_scrap_cost,
                (COALESCE(ra.total_machine_min, 0) + COALESCE(ra.total_labor_min, 0))
                    / NULLIF(ra.op_count, 0) AS avg_throughput_min
            FROM mm_norm mm
            LEFT JOIN scrap_agg sa  ON sa.material      = mm.norm
            LEFT JOIN routing_agg ra ON ra.material_norm = mm.norm
            ORDER BY {order_col} {order_dir} NULLS LAST
            LIMIT ? OFFSET ?
        """
        params = where_params

    total_rows = query(count_sql, where_params)
    total = int(total_rows[0][0]) if total_rows else 0

    rows = query(main_sql, params + [limit, offset])

    return {
        "rows": [_row(r) for r in rows],
        "total": total,
    }


def _row(r):
    return {
        "material":             str(r[0])   if r[0] is not None else "",
        "description":          str(r[1])   if r[1] is not None else None,
        "mrp_controller":       str(r[2])   if r[2] is not None else None,
        "material_type":        str(r[3])   if r[3] is not None else None,
        "total_ordered":        int(r[4])   if r[4] is not None else None,
        "total_units_produced": int(r[5])   if r[5] is not None else None,
        "scrap_rate_pct":       float(r[6]) if r[6] is not None else None,
        "total_scrap_cost":     float(r[7]) if r[7] is not None else None,
        "avg_throughput_min":   float(r[8]) if r[8] is not None else None,
    }
