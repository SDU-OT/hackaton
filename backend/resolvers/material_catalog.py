from typing import Optional
from db import query


_SORTABLE = {
    "material":             "material",
    "description":          "description",
    "mrp_controller":       "mrp_controller",
    "material_type":        "material_type",
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
    min_total_orders: Optional[float] = None,
    max_total_orders: Optional[float] = None,
    min_units_produced: Optional[float] = None,
    max_units_produced: Optional[float] = None,
    min_avg_throughput: Optional[float] = None,
    max_avg_throughput: Optional[float] = None,
    min_scrap_rate: Optional[float] = None,
    max_scrap_rate: Optional[float] = None,
    min_scrap_cost: Optional[float] = None,
    max_scrap_cost: Optional[float] = None,
    limit: int = 50,
    offset: int = 0,
):
    pattern = f"%{search}%" if search else "%"
    use_date_filter = bool(date_from or date_to)
    order_col = _SORTABLE.get(sort_by, "material")
    order_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"
    type_filter = (material_type or "").strip()

    where_clauses = ["(mm.material ILIKE ? OR mm.description ILIKE ?)"]
    where_params: list = [pattern, pattern]
    if type_filter:
        where_clauses.append("mm.material_type = ?")
        where_params.append(type_filter)
    if mrp_controller:
        where_clauses.append("mm.mrp_controller = ?")
        where_params.append(mrp_controller)
    where_sql = " AND ".join(where_clauses)

    # Post-aggregation range filters (applied in outer wrapper query)
    _range_pairs = [
        (min_total_orders,   "total_ordered",        ">="),
        (max_total_orders,   "total_ordered",        "<="),
        (min_units_produced, "total_units_produced",  ">="),
        (max_units_produced, "total_units_produced",  "<="),
        (min_avg_throughput, "avg_throughput_min",    ">="),
        (max_avg_throughput, "avg_throughput_min",    "<="),
        (min_scrap_rate,     "scrap_rate_pct",        ">="),
        (max_scrap_rate,     "scrap_rate_pct",        "<="),
        (min_scrap_cost,     "total_scrap_cost",      ">="),
        (max_scrap_cost,     "total_scrap_cost",      "<="),
    ]
    range_clauses = [f"{col} {op} ?" for val, col, op in _range_pairs if val is not None]
    range_params  = [val             for val, col, op in _range_pairs if val is not None]
    use_range_filter = bool(range_clauses)

    if use_date_filter:
        inner_sql = f"""
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
        """
        inner_params = [date_from, date_from, date_to, date_to] + where_params
    else:
        inner_sql = f"""
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
        """
        inner_params = where_params

    if use_range_filter:
        range_where = " AND ".join(range_clauses)
        count_sql = f"SELECT COUNT(*) FROM ({inner_sql}) _sub WHERE {range_where}"
        main_sql = f"""
            SELECT * FROM ({inner_sql}) _sub
            WHERE {range_where}
            ORDER BY {order_col} {order_dir} NULLS LAST
            LIMIT ? OFFSET ?
        """
        count_params = inner_params + range_params
        params = inner_params + range_params
    else:
        # Fast count: all joins are LEFT JOINs so no rows are filtered out
        count_sql = f"SELECT COUNT(*) FROM material_master mm WHERE {where_sql}"
        main_sql = f"""
            SELECT * FROM ({inner_sql}) _sub
            ORDER BY {order_col} {order_dir} NULLS LAST
            LIMIT ? OFFSET ?
        """
        count_params = where_params
        params = inner_params

    total_rows = query(count_sql, count_params)
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
