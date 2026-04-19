from db import query


def get_mrp_controllers() -> list[str]:
    rows = query("""
        SELECT DISTINCT mrp_controller
        FROM material_master
        WHERE mrp_controller IS NOT NULL AND TRIM(mrp_controller) != ''
        UNION
        SELECT DISTINCT mrp_controller
        FROM production_orders
        WHERE mrp_controller IS NOT NULL AND TRIM(mrp_controller) != ''
        ORDER BY 1
    """)
    return [str(r[0]) for r in rows]


def _scalar(sql: str, params=None):
    rows = query(sql, params or [])
    if rows and rows[0][0] is not None:
        return rows[0][0]
    return 0


def _date_filter_prod(date_from: str, date_to: str) -> tuple[str, list]:
    """Return (extra_sql_clause, params) for production_orders date range."""
    clauses, params = [], []
    if date_from:
        clauses.append("AND TRY_CAST(start_date AS DATE) >= TRY_CAST(? AS DATE)")
        params.append(date_from)
    if date_to:
        clauses.append("AND TRY_CAST(start_date AS DATE) <= TRY_CAST(? AS DATE)")
        params.append(date_to)
    return " ".join(clauses), params


def _date_filter_scrap(date_from: str, date_to: str) -> tuple[str, list]:
    """Return (extra_sql_clause, params) for scrap_records date range."""
    clauses, params = [], []
    if date_from:
        clauses.append("AND TRY_CAST(issue_date AS DATE) >= TRY_CAST(? AS DATE)")
        params.append(date_from)
    if date_to:
        clauses.append("AND TRY_CAST(issue_date AS DATE) <= TRY_CAST(? AS DATE)")
        params.append(date_to)
    return " ".join(clauses), params


def _clippy_insights(mrp_controller, kpi, time_series, work_center_scrap, top_cost):
    insights = []

    global_rate = float(_scalar(
        "SELECT CASE WHEN SUM(order_qty)>0 THEN 100.0*SUM(scrap_qty)/SUM(order_qty) ELSE 0 END "
        "FROM production_orders WHERE COALESCE(order_qty,0) > 0"
    ))

    scrap_rate = kpi["scrap_rate_pct"]
    if scrap_rate > 0 and global_rate > 0 and scrap_rate > global_rate * 1.1:
        focus = top_cost[0]["material"] if top_cost else "unknown material"
        severity = "critical" if scrap_rate > global_rate * 1.5 else "warning"
        insights.append({
            "type": "high_scrap_rate",
            "message": (
                f"Scrap rate at {scrap_rate:.1f}% is above plant average "
                f"({global_rate:.1f}%) — focus on material {focus}"
            ),
            "severity": severity,
        })
    elif scrap_rate > 0 and global_rate > 0:
        insights.append({
            "type": "scrap_rate_ok",
            "message": (
                f"Scrap rate at {scrap_rate:.1f}% is within plant average ({global_rate:.1f}%)"
            ),
            "severity": "info",
        })

    if time_series:
        peak = max(time_series, key=lambda x: x["units_produced"])
        insights.append({
            "type": "seasonal_peak",
            "message": f"Production peaked in {peak['month']} — plan capacity accordingly",
            "severity": "info",
        })
        low = min(time_series, key=lambda x: x["units_produced"])
        if low["month"] != peak["month"]:
            insights.append({
                "type": "seasonal_low",
                "message": f"Lowest output was in {low['month']} — review scheduling or demand signals",
                "severity": "info",
            })

    if top_cost:
        m = top_cost[0]
        cost = m["total_scrap_cost"]
        if cost > 0:
            insights.append({
                "type": "top_money_loser",
                "message": (
                    f"Material {m['material']} is responsible for "
                    f"kr. {cost:,.0f} in scrap costs"
                    + (f" — {m['description']}" if m.get("description") else "")
                ),
                "severity": "warning",
            })

    total_scrap_cost = kpi["total_scrap_cost"]
    if work_center_scrap and total_scrap_cost > 0:
        top_wc = work_center_scrap[0]
        pct = top_wc["scrap_cost"] / total_scrap_cost * 100
        severity = "warning" if pct > 40 else "info"
        insights.append({
            "type": "wc_hotspot",
            "message": (
                f"Work center {top_wc['work_center']} generates "
                f"{pct:.0f}% of all scrap cost "
                f"(kr. {top_wc['scrap_cost']:,.0f})"
            ),
            "severity": severity,
        })

    return insights


def get_mrp_report(mrp_controller: str, date_from: str = "", date_to: str = "") -> dict:
    prod_df, prod_params = _date_filter_prod(date_from, date_to)
    scrap_df, scrap_params = _date_filter_scrap(date_from, date_to)

    # KPI scalars from production_orders
    kpi_rows = query(f"""
        SELECT
            COALESCE(SUM(order_qty), 0)   AS total_units,
            COALESCE(SUM(scrap_qty), 0)   AS total_scrap,
            CASE WHEN SUM(order_qty) > 0
                 THEN 100.0 * SUM(scrap_qty) / SUM(order_qty)
                 ELSE 0.0
            END AS scrap_rate
        FROM production_orders
        WHERE mrp_controller = ?
          AND COALESCE(order_qty, 0) > 0
          {prod_df}
    """, [mrp_controller] + prod_params)

    kpi_row = kpi_rows[0] if kpi_rows else (0, 0, 0.0)
    total_units = float(kpi_row[0]) if kpi_row[0] is not None else 0.0
    total_scrap = float(kpi_row[1]) if kpi_row[1] is not None else 0.0
    scrap_rate  = float(kpi_row[2]) if kpi_row[2] is not None else 0.0

    has_production_data = total_units > 0

    # Total scrap cost from scrap_records filtered by MRP controller materials and date
    cost_rows = query(f"""
        SELECT COALESCE(SUM(sr.scrap_cost), 0.0)
        FROM scrap_records sr
        WHERE LTRIM(TRIM(CAST(sr.material AS VARCHAR)), '0') IN (
            SELECT LTRIM(material, '0')
            FROM material_master
            WHERE mrp_controller = ?
              AND material IS NOT NULL
        )
        {scrap_df}
    """, [mrp_controller] + scrap_params)
    total_scrap_cost = float(cost_rows[0][0]) if cost_rows and cost_rows[0][0] is not None else 0.0

    kpi = {
        "total_units_produced": total_units,
        "total_scrap_units":    total_scrap,
        "scrap_rate_pct":       scrap_rate,
        "total_scrap_cost":     total_scrap_cost,
    }

    # Monthly time series with scrap_rate
    ts_rows = query(f"""
        SELECT
            STRFTIME(TRY_CAST(start_date AS DATE), '%Y-%m') AS month,
            COALESCE(SUM(order_qty), 0)                     AS units_produced,
            COALESCE(SUM(scrap_qty), 0)                     AS scrap_units,
            CASE WHEN SUM(order_qty) > 0
                 THEN 100.0 * SUM(scrap_qty) / SUM(order_qty)
                 ELSE 0.0
            END AS scrap_rate_pct
        FROM production_orders
        WHERE mrp_controller = ?
          AND TRY_CAST(start_date AS DATE) IS NOT NULL
          AND COALESCE(order_qty, 0) > 0
          {prod_df}
        GROUP BY 1
        ORDER BY 1
    """, [mrp_controller] + prod_params)

    time_series = [
        {
            "month":          str(r[0]),
            "units_produced": float(r[1]) if r[1] is not None else 0.0,
            "scrap_units":    float(r[2]) if r[2] is not None else 0.0,
            "scrap_rate_pct": float(r[3]) if r[3] is not None else 0.0,
        }
        for r in ts_rows
    ]

    # Work center scrap cost filtered by date
    wc_rows = query(f"""
        SELECT
            COALESCE(TRIM(work_center), 'Unknown') AS work_center,
            COALESCE(SUM(scrap_cost), 0.0)         AS scrap_cost,
            COALESCE(SUM(scrap_qty_final), 0)      AS scrap_units
        FROM scrap_records
        WHERE LTRIM(TRIM(CAST(material AS VARCHAR)), '0') IN (
            SELECT LTRIM(material, '0')
            FROM material_master
            WHERE mrp_controller = ?
              AND material IS NOT NULL
        )
          AND work_center IS NOT NULL AND TRIM(work_center) != ''
          {scrap_df}
        GROUP BY 1
        ORDER BY scrap_cost DESC
        LIMIT 15
    """, [mrp_controller] + scrap_params)

    work_center_scrap = [
        {
            "work_center": str(r[0]),
            "scrap_cost":  float(r[1]) if r[1] is not None else 0.0,
            "scrap_units": int(r[2])   if r[2] is not None else 0,
        }
        for r in wc_rows
    ]

    # Top 10 materials by quantity with scrap_rate
    qty_rows = query(f"""
        SELECT
            LTRIM(po.material, '0')                                  AS material,
            COALESCE(mm.description, po.mat_description)             AS description,
            COALESCE(SUM(po.order_qty), 0)                           AS total_qty,
            COALESCE(SUM(po.scrap_qty), 0)                           AS scrap_qty,
            CASE WHEN SUM(po.order_qty) > 0
                 THEN 100.0 * SUM(po.scrap_qty) / SUM(po.order_qty)
                 ELSE 0.0
            END AS scrap_rate_pct
        FROM production_orders po
        LEFT JOIN material_master mm
            ON LTRIM(mm.material, '0') = LTRIM(po.material, '0')
        WHERE po.mrp_controller = ?
          AND COALESCE(po.order_qty, 0) > 0
          {prod_df}
        GROUP BY 1, 2
        ORDER BY total_qty DESC
        LIMIT 10
    """, [mrp_controller] + prod_params)

    top_materials_by_qty = [
        {
            "material":       str(r[0]),
            "description":    str(r[1]) if r[1] else None,
            "total_qty":      float(r[2]) if r[2] is not None else 0.0,
            "scrap_qty":      float(r[3]) if r[3] is not None else 0.0,
            "scrap_rate_pct": float(r[4]) if r[4] is not None else 0.0,
        }
        for r in qty_rows
    ]

    # Top 10 materials by scrap cost filtered by date
    cost_mat_rows = query(f"""
        SELECT
            LTRIM(TRIM(CAST(sr.material AS VARCHAR)), '0')   AS material,
            COALESCE(mm.description, sr.material_desc)       AS description,
            COALESCE(SUM(sr.scrap_cost), 0.0)                AS total_scrap_cost,
            COALESCE(SUM(sr.scrap_qty_final), 0)             AS scrap_units
        FROM scrap_records sr
        LEFT JOIN material_master mm
            ON LTRIM(mm.material, '0') = LTRIM(TRIM(CAST(sr.material AS VARCHAR)), '0')
        WHERE LTRIM(TRIM(CAST(sr.material AS VARCHAR)), '0') IN (
            SELECT LTRIM(material, '0')
            FROM material_master
            WHERE mrp_controller = ?
              AND material IS NOT NULL
        )
        {scrap_df}
        GROUP BY 1, 2
        ORDER BY total_scrap_cost DESC
        LIMIT 10
    """, [mrp_controller] + scrap_params)

    top_materials_by_cost = [
        {
            "material":         str(r[0]),
            "description":      str(r[1]) if r[1] else None,
            "total_scrap_cost": float(r[2]) if r[2] is not None else 0.0,
            "scrap_units":      int(r[3])   if r[3] is not None else 0,
        }
        for r in cost_mat_rows
    ]

    clippy_insights = _clippy_insights(
        mrp_controller, kpi, time_series, work_center_scrap, top_materials_by_cost
    )

    return {
        "mrp_controller":        mrp_controller,
        "has_production_data":   has_production_data,
        **kpi,
        "time_series":           time_series,
        "work_center_scrap":     work_center_scrap,
        "top_materials_by_qty":  top_materials_by_qty,
        "top_materials_by_cost": top_materials_by_cost,
        "clippy_insights":       clippy_insights,
    }
