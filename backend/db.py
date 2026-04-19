import os
import threading
import duckdb
import pandas as pd

def _is_lfs_pointer(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(50).startswith(b"version https://git-lfs.github.com")
    except OSError:
        return False


_BASE = os.path.dirname(__file__)
CSV_DIR = os.path.join(_BASE, "..")
_BOM_PRIMARY = os.path.join(CSV_DIR, "Bill_of_material_SRP100_1201.csv")
_BOM_CLEAN   = os.path.join(CSV_DIR, "Bill_of_Material_clean.csv")
BOM_CSV = _BOM_CLEAN if _is_lfs_pointer(_BOM_PRIMARY) else _BOM_PRIMARY
MM_CSV   = os.path.join(CSV_DIR, "Material_Master_SRP100_1201.csv")
ROU_CSV  = os.path.join(CSV_DIR, "Routing_SRP100_1201.csv")
SCRAP_XL = os.path.join(CSV_DIR, "Scrap.xlsx")
PROD_XL  = os.path.join(CSV_DIR, "Production orders 2025.xlsx")
DB_PATH  = os.path.join(_BASE, "hackaton.db")

# Set FORCE_RELOAD=1 to drop and reload all core tables from CSV on startup.
# Set DEV_AUTO_IMPORT=1 to auto-load Scrap.xlsx into scrap_records on startup.
FORCE_RELOAD    = os.environ.get("FORCE_RELOAD", "0") == "1"
DEV_AUTO_IMPORT = os.environ.get("DEV_AUTO_IMPORT", "0") == "1"

_conn = None
_lock = threading.Lock()

# Tables we manage; used for the whitelist in table_preview.
CORE_TABLES = {"material_master", "bom", "routing"}
AGG_TABLES  = {"routing_agg", "scrap_agg", "production_mrp", "raw_materials"}
USER_TABLES = {"production_orders", "scrap_records"}
META_TABLES = {"imported_datasets"}
ALL_MANAGED = CORE_TABLES | AGG_TABLES | USER_TABLES | META_TABLES


def get_conn():
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                print("Initializing DuckDB...")
                new_conn = duckdb.connect(database=DB_PATH, read_only=False)
                try:
                    _init(new_conn)
                except Exception:
                    try:
                        new_conn.close()
                    finally:
                        _conn = None
                    raise
                _conn = new_conn
                print("DuckDB ready.")
    return _conn


def query(sql: str, params=None):
    for attempt in range(2):
        conn = get_conn()
        with _lock:
            try:
                if params:
                    return conn.execute(sql, params).fetchall()
                return conn.execute(sql).fetchall()
            except Exception as e:
                if attempt == 0 and _is_recoverable(e):
                    print("Recovering DuckDB connection...")
                    _reset_conn_locked()
                    continue
                raise


def query_df(sql: str, params=None):
    for attempt in range(2):
        conn = get_conn()
        with _lock:
            try:
                if params:
                    return conn.execute(sql, params).df()
                return conn.execute(sql).df()
            except Exception as e:
                if attempt == 0 and _is_recoverable(e):
                    print("Recovering DuckDB connection...")
                    _reset_conn_locked()
                    continue
                raise


def _is_recoverable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        isinstance(exc, (duckdb.InternalException, duckdb.FatalException))
        or "database has been invalidated" in msg
        or "attempted to dereference shared_ptr that is null" in msg
    )


def _reset_conn_locked():
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
    _conn = None


# ── Startup initialization ────────────────────────────────────────────────────

def _init(conn):
    _create_meta_table(conn)
    _ensure_user_tables(conn)

    core_loaded = _core_tables_exist(conn)
    if FORCE_RELOAD or not core_loaded:
        print("  Loading core CSV tables (this may take a while for large files)...")
        _load_core_tables(conn)
    else:
        print("  Core tables already loaded. Skipping CSV import (set FORCE_RELOAD=1 to reload).")

    # Always load Scrap.xlsx if available and scrap_records is empty
    _load_scrap_xlsx(conn)

    # Always load Production orders xlsx if available and production_orders is empty
    _load_production_orders_xlsx(conn)

    _materialize(conn)


def _core_tables_exist(conn) -> bool:
    rows = conn.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'main'
          AND table_name IN ('material_master', 'bom', 'routing')
    """).fetchone()
    return rows and rows[0] == 3


def _create_meta_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS imported_datasets (
            name        VARCHAR PRIMARY KEY,
            source_file VARCHAR,
            table_name  VARCHAR,
            row_count   BIGINT,
            imported_at TIMESTAMP DEFAULT NOW()
        )
    """)


def _ensure_user_tables(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS production_orders (
            material        VARCHAR,
            order_qty       DOUBLE,
            scrap_qty       DOUBLE,
            delivered_qty   DOUBLE,
            mrp_controller  VARCHAR,
            start_date      VARCHAR,
            finish_date     VARCHAR,
            order_type      VARCHAR,
            sys_status      VARCHAR,
            mat_description VARCHAR
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scrap_records (
            plant           VARCHAR,
            work_center     VARCHAR,
            material        VARCHAR,
            material_desc   VARCHAR,
            order_no        VARCHAR,
            operation_qty   DOUBLE,
            confirmed_yield DOUBLE,
            confirmed_scrap DOUBLE,
            scrap_qty_final DOUBLE,
            scrap_cost      DOUBLE,
            standard_price  DOUBLE,
            currency        VARCHAR,
            issue_date      VARCHAR,
            cause           VARCHAR,
            bu              VARCHAR
        )
    """)


# ── Core table loading ────────────────────────────────────────────────────────

def _load_core_tables(conn):
    print("  Loading material_master...")
    conn.execute("DROP TABLE IF EXISTS material_master")
    conn.execute(f"""
        CREATE TABLE material_master AS
        SELECT
            CAST(Material      AS VARCHAR) AS material,
            CAST(CreatedOn     AS VARCHAR) AS created_on,
            CAST(MaterialType  AS VARCHAR) AS material_type,
            CAST(Industry      AS VARCHAR) AS industry,
            TRY_CAST(REPLACE(REPLACE(CAST(Weight AS VARCHAR), '"', ''), ',', '.') AS DOUBLE) AS weight_kg,
            CAST(OldMaterial   AS VARCHAR) AS old_material,
            CAST(MaterialGroup AS VARCHAR) AS material_group,
            CAST(Description   AS VARCHAR) AS description,
            CAST(Plant         AS VARCHAR) AS plant,
            CAST(Status        AS VARCHAR) AS status,
            CAST(PlannerGroup  AS VARCHAR) AS planner_group,
            CAST(MRPType       AS VARCHAR) AS mrp_type,
            CAST(MRPController AS VARCHAR) AS mrp_controller
        FROM read_csv_auto('{MM_CSV}', header=true, ignore_errors=true)
        WHERE Material IS NOT NULL AND TRIM(CAST(Material AS VARCHAR)) != ''
    """)
    mm_count = conn.execute("SELECT COUNT(*) FROM material_master").fetchone()[0]
    print(f"    material_master: {mm_count:,} rows")

    print("  Loading bom...")
    conn.execute("DROP TABLE IF EXISTS bom")
    conn.execute(f"""
        CREATE TABLE bom AS
        SELECT
            CAST(Material     AS VARCHAR) AS material,
            CAST(Plant        AS VARCHAR) AS plant,
            CAST(Component    AS VARCHAR) AS component,
            CAST(ItemCategory AS VARCHAR) AS item_category,
            CAST(Unit         AS VARCHAR) AS unit,
            TRY_CAST(REPLACE(CAST(Quantity AS VARCHAR), ',', '.') AS DOUBLE) AS quantity
        FROM read_csv_auto('{BOM_CSV}', header=true, ignore_errors=true)
        WHERE Component IS NOT NULL AND TRIM(CAST(Component AS VARCHAR)) != ''
    """)
    bom_count = conn.execute("SELECT COUNT(*) FROM bom").fetchone()[0]
    print(f"    bom: {bom_count:,} rows")

    print("  Loading routing...")
    conn.execute("DROP TABLE IF EXISTS routing")
    conn.execute(f"""
        CREATE TABLE routing AS
        SELECT
            CAST(material    AS VARCHAR) AS material,
            CAST(plant       AS VARCHAR) AS plant,
            TRY_CAST(sequence AS INTEGER) AS sequence,
            CAST(description AS VARCHAR) AS description,
            CAST(wc_id       AS VARCHAR) AS wc_id,
            CAST(crtl_key    AS VARCHAR) AS crtl_key,
            CAST(MUn         AS VARCHAR) AS machine_unit,
            CAST(LUn         AS VARCHAR) AS labor_unit,
            CAST(SUn         AS VARCHAR) AS setup_unit,
            TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE) AS machine_raw,
            TRY_CAST(REPLACE(CAST(Labor   AS VARCHAR), ',', '.') AS DOUBLE) AS labor_raw,
            TRY_CAST(REPLACE(CAST(Setup   AS VARCHAR), ',', '.') AS DOUBLE) AS setup_raw,
            CASE UPPER(TRIM(CAST(MUn AS VARCHAR)))
                WHEN 'H'   THEN TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN 'MIN' THEN TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS machine_min,
            CASE UPPER(TRIM(CAST(LUn AS VARCHAR)))
                WHEN 'H'   THEN TRY_CAST(REPLACE(CAST(Labor AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN 'MIN' THEN TRY_CAST(REPLACE(CAST(Labor AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS labor_min,
            CASE UPPER(TRIM(CAST(SUn AS VARCHAR)))
                WHEN 'H'   THEN TRY_CAST(REPLACE(CAST(Setup AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN 'MIN' THEN TRY_CAST(REPLACE(CAST(Setup AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS setup_min,
            CAST(WC AS VARCHAR) AS work_center
        FROM read_csv_auto('{ROU_CSV}', header=true, ignore_errors=true)
        WHERE material IS NOT NULL AND TRIM(CAST(material AS VARCHAR)) != ''
    """)
    rou_count = conn.execute("SELECT COUNT(*) FROM routing").fetchone()[0]
    print(f"    routing: {rou_count:,} rows")

    # Add index-like structures for common lookups
    conn.execute("CREATE INDEX IF NOT EXISTS bom_material_idx ON bom(material)")
    conn.execute("CREATE INDEX IF NOT EXISTS bom_component_idx ON bom(component)")
    conn.execute("CREATE INDEX IF NOT EXISTS routing_material_idx ON routing(material)")
    conn.execute("CREATE INDEX IF NOT EXISTS mm_material_idx ON material_master(material)")


# ── Aggregate materialization ─────────────────────────────────────────────────

def _materialize(conn):
    print("  Materializing routing aggregates (with ID normalization)...")
    conn.execute("DROP TABLE IF EXISTS routing_agg")
    conn.execute("""
        CREATE TABLE routing_agg AS
        SELECT
            material,
            LTRIM(material, '0') AS material_norm,
            SUM(COALESCE(machine_min, 0)) AS total_machine_min,
            SUM(COALESCE(labor_min,   0)) AS total_labor_min,
            SUM(COALESCE(setup_min,   0)) AS total_setup_min,
            COUNT(*) AS op_count
        FROM routing
        GROUP BY material
    """)

    print("  Materializing scrap aggregates (from scrap_records + production_orders)...")
    conn.execute("DROP TABLE IF EXISTS scrap_agg")
    conn.execute("""
        CREATE TABLE scrap_agg AS
        WITH from_scrap AS (
            -- Aggregate from Scrap.xlsx / imported scrap CSV (preferred source with cost data)
            SELECT
                TRIM(CAST(material AS VARCHAR)) AS material,
                LTRIM(TRIM(CAST(material AS VARCHAR)), '0') AS material_norm,
                SUM(COALESCE(operation_qty,   0)) AS total_ordered,
                SUM(COALESCE(scrap_qty_final, 0)) AS total_scrap,
                SUM(COALESCE(confirmed_yield, 0)) AS total_delivered,
                CASE WHEN SUM(COALESCE(operation_qty, 0)) > 0
                     THEN SUM(COALESCE(scrap_qty_final, 0))::DOUBLE
                          / SUM(COALESCE(operation_qty, 0)) * 100.0
                     ELSE 0.0
                END AS scrap_rate_pct,
                AVG(NULLIF(standard_price, 0)) AS avg_std_price,
                SUM(COALESCE(scrap_cost, 0))   AS total_scrap_cost
            FROM scrap_records
            WHERE material IS NOT NULL AND TRIM(CAST(material AS VARCHAR)) != ''
              AND COALESCE(operation_qty, 0) > 0
            GROUP BY TRIM(CAST(material AS VARCHAR))
        ),
        from_prod AS (
            -- Aggregate from imported production orders CSV
            SELECT
                material,
                LTRIM(material, '0') AS material_norm,
                SUM(order_qty)      AS total_ordered,
                SUM(scrap_qty)      AS total_scrap,
                SUM(delivered_qty)  AS total_delivered,
                CASE WHEN SUM(order_qty) > 0
                     THEN SUM(scrap_qty)::DOUBLE / SUM(order_qty) * 100.0
                     ELSE 0.0
                END AS scrap_rate_pct,
                NULL::DOUBLE AS avg_std_price,
                NULL::DOUBLE AS total_scrap_cost
            FROM production_orders
            WHERE order_qty > 0
            GROUP BY material
        ),
        combined AS (
            -- Prefer scrap_records when both exist for same material; fall back to prod orders
            SELECT * FROM from_scrap
            UNION ALL
            SELECT * FROM from_prod
            WHERE LTRIM(material, '0') NOT IN (SELECT material_norm FROM from_scrap)
        )
        SELECT
            material,
            material_norm,
            SUM(total_ordered)    AS total_ordered,
            SUM(total_scrap)      AS total_scrap,
            SUM(total_delivered)  AS total_delivered,
            CASE WHEN SUM(total_ordered) > 0
                 THEN SUM(total_scrap)::DOUBLE / SUM(total_ordered) * 100.0
                 ELSE 0.0
            END AS scrap_rate_pct,
            AVG(avg_std_price)    AS avg_std_price,
            SUM(total_scrap_cost) AS total_scrap_cost
        FROM combined
        GROUP BY material, material_norm
    """)

    print("  Materializing MRP controller mapping...")
    conn.execute("DROP TABLE IF EXISTS production_mrp")
    conn.execute("""
        CREATE TABLE production_mrp AS
        WITH mrp_counts AS (
            SELECT
                material,
                mrp_controller,
                COUNT(*) AS hits
            FROM production_orders
            WHERE material IS NOT NULL AND TRIM(material) != ''
              AND mrp_controller IS NOT NULL AND TRIM(mrp_controller) != ''
            GROUP BY material, mrp_controller
        ),
        mrp_ranked AS (
            SELECT material, mrp_controller, hits,
                   ROW_NUMBER() OVER (PARTITION BY material ORDER BY hits DESC, mrp_controller) AS rn
            FROM mrp_counts
        )
        SELECT material, mrp_controller FROM mrp_ranked WHERE rn = 1
    """)

    print("  Materializing raw materials set...")
    conn.execute("DROP TABLE IF EXISTS raw_materials")
    conn.execute("""
        CREATE TABLE raw_materials AS
        SELECT b.component AS material, COUNT(*) AS used_in_bom_count
        FROM bom b
        WHERE b.component NOT IN (
            SELECT DISTINCT material FROM bom WHERE material IS NOT NULL AND material != ''
        )
        AND b.component NOT IN (
            SELECT DISTINCT material FROM routing WHERE material IS NOT NULL AND material != ''
        )
        GROUP BY b.component
    """)

    print("  All materializations complete.")


# ── Scrap.xlsx loading ────────────────────────────────────────────────────────

def _load_scrap_xlsx(conn):
    """Load Scrap.xlsx into scrap_records. Skips if already populated."""
    count = conn.execute("SELECT COUNT(*) FROM scrap_records").fetchone()[0]
    if count > 0:
        print(f"  scrap_records already populated ({count:,} rows), skipping.")
        return
    if not os.path.exists(SCRAP_XL):
        print(f"  Scrap.xlsx not found at {SCRAP_XL}, scrap_records will be empty.")
        return
    try:
        print(f"  Loading {SCRAP_XL}...")
        df = pd.read_excel(SCRAP_XL, engine="openpyxl")

        # Columns arrive as  D[ColumnName]  — strip wrapper to get bare name
        df.columns = [_strip_d_bracket(c) for c in df.columns]

        rename_map = {
            "Plnt":                 "plant",
            "Work ctr":             "work_center",
            "Material":             "material",
            "Material Description": "material_desc",
            "Order":                "order_no",
            "Operation Qty":        "operation_qty",
            "Confirmed yield":      "confirmed_yield",
            "Confirmed scrap":      "confirmed_scrap",
            "Scrap Quantity Final": "scrap_qty_final",
            "Scrap Cost":           "scrap_cost",
            "Standard price":       "standard_price",
            "Crcy":                 "currency",
            "IssueDate":            "issue_date",
            "Cause":                "cause",
            "BU":                   "bu",
        }
        df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
        wanted = list(rename_map.values())
        for col in wanted:
            if col not in df.columns:
                df[col] = None
        df = df[wanted].copy()

        # Normalise material ID: strip leading zeros to match BOM/routing
        df["material"] = df["material"].astype(str).str.strip().str.lstrip("0")
        df.loc[df["material"] == "", "material"] = "0"

        # Coerce numeric columns
        for col in ["operation_qty", "confirmed_yield", "confirmed_scrap",
                    "scrap_qty_final", "scrap_cost", "standard_price"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        conn.execute("DELETE FROM scrap_records")
        conn.register("_scrap_raw", df)
        conn.execute("""
            INSERT INTO scrap_records
            SELECT plant, work_center, material, material_desc, order_no,
                   operation_qty, confirmed_yield, confirmed_scrap,
                   scrap_qty_final, scrap_cost, standard_price,
                   currency, CAST(issue_date AS VARCHAR), cause, bu
            FROM _scrap_raw
            WHERE material IS NOT NULL AND material != ''
        """)
        n = conn.execute("SELECT COUNT(*) FROM scrap_records").fetchone()[0]
        conn.execute("""
            INSERT OR REPLACE INTO imported_datasets(name, source_file, table_name, row_count, imported_at)
            VALUES ('scrap_records_auto', 'Scrap.xlsx', 'scrap_records', ?, NOW())
        """, [n])
        print(f"    scrap_records: {n:,} rows loaded.")
    except Exception as e:
        print(f"  WARNING: Could not load Scrap.xlsx: {e}")


def _load_production_orders_xlsx(conn):
    """Load Production orders 2025.xlsx into production_orders. Skips if already populated."""
    count = conn.execute("SELECT COUNT(*) FROM production_orders").fetchone()[0]
    if count > 0:
        print(f"  production_orders already populated ({count:,} rows), skipping.")
        return
    if not os.path.exists(PROD_XL):
        print(f"  Production orders xlsx not found at {PROD_XL}, production_orders will be empty.")
        return
    try:
        print(f"  Loading {PROD_XL}...")
        df = pd.read_excel(PROD_XL, engine="openpyxl")

        rename_map = {
            "Material Number":          "material",
            "Order quantity (GMEIN)":   "order_qty",
            "Confirmed scrap (GMEIN)":  "scrap_qty",
            "Quantity Delivered (GMEIN)": "delivered_qty",
            "MRP controller":           "mrp_controller",
            "Basic start date":         "start_date",
            "Basic finish date":        "finish_date",
            "Order Type":               "order_type",
            "System Status":            "sys_status",
            "Material description":     "mat_description",
        }
        df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
        schema_cols = ["material", "order_qty", "scrap_qty", "delivered_qty",
                       "mrp_controller", "start_date", "finish_date",
                       "order_type", "sys_status", "mat_description"]
        for col in schema_cols:
            if col not in df.columns:
                df[col] = None

        df = df[schema_cols].copy()

        # Normalise material ID: strip leading zeros
        df["material"] = df["material"].astype(str).str.strip().str.lstrip("0")
        df.loc[df["material"] == "", "material"] = "0"

        # Coerce numeric columns
        for col in ["order_qty", "scrap_qty", "delivered_qty"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Convert date columns to ISO strings
        for col in ["start_date", "finish_date"]:
            df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")

        df = df[df["order_qty"].notna() & (df["order_qty"] > 0)]

        conn.execute("DELETE FROM production_orders")
        conn.register("_prod_raw", df)
        conn.execute("""
            INSERT INTO production_orders
            SELECT material, order_qty, scrap_qty, delivered_qty,
                   mrp_controller, start_date, finish_date,
                   order_type, sys_status, mat_description
            FROM _prod_raw
            WHERE material IS NOT NULL AND material != ''
        """)
        n = conn.execute("SELECT COUNT(*) FROM production_orders").fetchone()[0]
        conn.execute("""
            INSERT OR REPLACE INTO imported_datasets(name, source_file, table_name, row_count, imported_at)
            VALUES ('production_orders_auto', 'Production orders 2025.xlsx', 'production_orders', ?, NOW())
        """, [n])
        print(f"    production_orders: {n:,} rows loaded.")
    except Exception as e:
        print(f"  WARNING: Could not load Production orders xlsx: {e}")


def _strip_d_bracket(col: str) -> str:
    """Strip the SAP export wrapper  D[ColumnName]  →  ColumnName."""
    col = col.strip()
    if col.startswith("D[") and col.endswith("]"):
        return col[2:-1]
    return col


# ── Data import / remove helpers (used by resolvers/data_manager.py) ──────────

def import_csv_to_table(name: str, csv_content: str, target_table: str, column_mapping: dict) -> dict:
    import tempfile, csv as csv_mod, io

    if target_table not in USER_TABLES:
        raise ValueError(f"Import target must be one of: {sorted(USER_TABLES)}")

    conn = get_conn()
    with _lock:
        # Write content to temp file for DuckDB read_csv_auto
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write(csv_content)
            tmp_path = f.name

        try:
            # Read with pandas for column mapping flexibility
            df = pd.read_csv(tmp_path)
            if column_mapping:
                df = df.rename(columns=column_mapping)

            schema_cols = _get_table_columns(conn, target_table)
            for col in schema_cols:
                if col not in df.columns:
                    df[col] = None
            df = df[[c for c in schema_cols if c in df.columns]]

            conn.register("_import_tmp", df)
            conn.execute(f"DELETE FROM {target_table}")
            conn.execute(f"INSERT INTO {target_table} SELECT * FROM _import_tmp")
            row_count = conn.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]

            conn.execute("""
                INSERT OR REPLACE INTO imported_datasets(name, source_file, table_name, row_count, imported_at)
                VALUES (?, ?, ?, ?, NOW())
            """, [name, name + ".csv", target_table, row_count])

            # Refresh aggregates that depend on this table
            if target_table == "production_orders":
                _materialize(conn)

            return {"name": name, "table_name": target_table, "row_count": row_count}
        finally:
            os.unlink(tmp_path)


def remove_dataset(name: str) -> bool:
    conn = get_conn()
    with _lock:
        rows = conn.execute(
            "SELECT table_name FROM imported_datasets WHERE name = ?", [name]
        ).fetchall()
        if not rows:
            return False
        target_table = rows[0][0]
        if target_table in USER_TABLES:
            conn.execute(f"DELETE FROM {target_table}")
        conn.execute("DELETE FROM imported_datasets WHERE name = ?", [name])
        if target_table == "production_orders":
            _materialize(conn)
        return True


def get_imported_datasets() -> list:
    rows = query("""
        SELECT name, source_file, table_name, row_count, CAST(imported_at AS VARCHAR)
        FROM imported_datasets ORDER BY imported_at DESC
    """)
    return [
        {"name": r[0], "source_file": r[1], "table_name": r[2],
         "row_count": int(r[3]) if r[3] else 0, "imported_at": str(r[4]) if r[4] else ""}
        for r in rows
    ]


def get_db_tables() -> list:
    rows = query("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    result = []
    for (tname,) in rows:
        count_rows = query(f"SELECT COUNT(*) FROM \"{tname}\"")
        count = int(count_rows[0][0]) if count_rows else 0
        col_rows = query(f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'main' AND table_name = ?
            ORDER BY ordinal_position
        """, [tname])
        columns = [str(r[0]) for r in col_rows]
        result.append({"name": tname, "row_count": count, "columns": columns})
    return result


def get_table_preview(table_name: str, limit: int = 100, offset: int = 0) -> dict:
    if table_name not in ALL_MANAGED:
        raise ValueError(f"Table '{table_name}' is not accessible via preview.")
    col_rows = query(f"""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'main' AND table_name = ?
        ORDER BY ordinal_position
    """, [table_name])
    columns = [str(r[0]) for r in col_rows]
    total_rows = query(f'SELECT COUNT(*) FROM "{table_name}"')
    total = int(total_rows[0][0]) if total_rows else 0
    rows = query(f'SELECT * FROM "{table_name}" LIMIT ? OFFSET ?', [limit, offset])
    serialized = [[str(v) if v is not None else "" for v in row] for row in rows]
    return {"table_name": table_name, "columns": columns, "rows": serialized, "total": total}


def _get_table_columns(conn, table_name: str) -> list:
    rows = conn.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'main' AND table_name = ?
        ORDER BY ordinal_position
    """, [table_name]).fetchall()
    return [r[0] for r in rows]
