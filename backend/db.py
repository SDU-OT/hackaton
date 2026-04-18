import os
import threading
import duckdb
import pandas as pd

CSV_DIR = os.path.join(os.path.dirname(__file__), "..")
BOM_CSV = os.path.join(CSV_DIR, "Bill_of_material_SRP100_1201.csv")
MM_CSV  = os.path.join(CSV_DIR, "Material_Master_SRP100_1201.csv")
ROU_CSV = os.path.join(CSV_DIR, "Routing_SRP100_1201.csv")
PROD_XL = os.path.join(CSV_DIR, "Production orders 2025.xlsx")
COOIS_XL = os.path.join(CSV_DIR, "COOIS 2025.XLSX")

_conn = None
_lock = threading.Lock()


def get_conn():
    global _conn
    if _conn is None:
        print("Initializing DuckDB...")
        _conn = duckdb.connect(database=":memory:", read_only=False)
        _init(conn=_conn)
        print("DuckDB ready.")
    return _conn


def query(sql: str, params=None):
    conn = get_conn()
    with _lock:
        if params:
            return conn.execute(sql, params).fetchall()
        return conn.execute(sql).fetchall()


def query_df(sql: str, params=None):
    conn = get_conn()
    with _lock:
        if params:
            return conn.execute(sql, params).df()
        return conn.execute(sql).df()


def _init(conn):
    _create_views(conn)
    _load_excel(conn)
    _materialize(conn)


def _create_views(conn):
    print("  Creating CSV views...")
    conn.execute(f"""
        CREATE OR REPLACE VIEW bom AS
        SELECT
            CAST(Material   AS VARCHAR) AS material,
            CAST(Plant      AS VARCHAR) AS plant,
            CAST(Component  AS VARCHAR) AS component,
            CAST(ItemCategory AS VARCHAR) AS item_category,
            CAST(Unit       AS VARCHAR) AS unit,
            TRY_CAST(REPLACE(CAST(Quantity AS VARCHAR), ',', '.') AS DOUBLE) AS quantity
        FROM read_csv_auto('{BOM_CSV}', header=true, ignore_errors=true)
        WHERE Component IS NOT NULL AND TRIM(CAST(Component AS VARCHAR)) != ''
    """)

    conn.execute(f"""
        CREATE OR REPLACE VIEW material_master AS
        SELECT
            CAST(Material     AS VARCHAR) AS material,
            CAST(CreatedOn    AS VARCHAR) AS created_on,
            CAST(MaterialType AS VARCHAR) AS material_type,
            CAST(Industry     AS VARCHAR) AS industry,
            TRY_CAST(REPLACE(REPLACE(CAST(Weight AS VARCHAR), '"', ''), ',', '.') AS DOUBLE) AS weight_kg,
            CAST(OldMaterial  AS VARCHAR) AS old_material,
            CAST(MaterialGroup AS VARCHAR) AS material_group,
            CAST(Description  AS VARCHAR) AS description,
            CAST(Plant        AS VARCHAR) AS plant,
            CAST(Status       AS VARCHAR) AS status
        FROM read_csv_auto('{MM_CSV}', header=true, ignore_errors=true)
    """)

    conn.execute(f"""
        CREATE OR REPLACE VIEW routing AS
        SELECT
            CAST(material   AS VARCHAR) AS material,
            CAST(plant      AS VARCHAR) AS plant,
            TRY_CAST(sequence AS INTEGER) AS sequence,
            CAST(description AS VARCHAR) AS description,
            CAST(wc_id      AS VARCHAR) AS wc_id,
            CAST(crtl_key   AS VARCHAR) AS crtl_key,
            CAST(MUn        AS VARCHAR) AS machine_unit,
            CAST(LUn        AS VARCHAR) AS labor_unit,
            CAST(SUn        AS VARCHAR) AS setup_unit,
            TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE) AS machine_raw,
            TRY_CAST(REPLACE(CAST(Labor   AS VARCHAR), ',', '.') AS DOUBLE) AS labor_raw,
            TRY_CAST(REPLACE(CAST(Setup   AS VARCHAR), ',', '.') AS DOUBLE) AS setup_raw,
            CASE
                WHEN UPPER(TRIM(CAST(MUn AS VARCHAR))) = 'H'
                THEN TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN UPPER(TRIM(CAST(MUn AS VARCHAR))) = 'MIN'
                THEN TRY_CAST(REPLACE(CAST(Machine AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS machine_min,
            CASE
                WHEN UPPER(TRIM(CAST(LUn AS VARCHAR))) = 'H'
                THEN TRY_CAST(REPLACE(CAST(Labor AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN UPPER(TRIM(CAST(LUn AS VARCHAR))) = 'MIN'
                THEN TRY_CAST(REPLACE(CAST(Labor AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS labor_min,
            CASE
                WHEN UPPER(TRIM(CAST(SUn AS VARCHAR))) = 'H'
                THEN TRY_CAST(REPLACE(CAST(Setup AS VARCHAR), ',', '.') AS DOUBLE) * 60.0
                WHEN UPPER(TRIM(CAST(SUn AS VARCHAR))) = 'MIN'
                THEN TRY_CAST(REPLACE(CAST(Setup AS VARCHAR), ',', '.') AS DOUBLE)
                ELSE NULL
            END AS setup_min,
            CAST(WC AS VARCHAR) AS work_center
        FROM read_csv_auto('{ROU_CSV}', header=true, ignore_errors=true)
    """)


def _load_excel(conn):
    print("  Loading Excel production order data...")
    try:
        prod  = pd.read_excel(PROD_XL, engine="openpyxl")
        coois = pd.read_excel(COOIS_XL, engine="openpyxl")
        combined = pd.concat([prod, coois], ignore_index=True)
        combined = combined.rename(columns={
            "Material Number":          "material",
            "Order quantity (GMEIN)":   "order_qty",
            "Confirmed scrap (GMEIN)":  "scrap_qty",
            "Quantity Delivered (GMEIN)":"delivered_qty",
            "Basic start date":         "start_date",
            "Basic finish date":        "finish_date",
            "Order Type":               "order_type",
            "System Status":            "sys_status",
            "Material description":     "mat_description",
        })
        combined["material"] = combined["material"].astype(str).str.strip().str.lstrip("0")
        # also keep zero-padded version for joining — we'll handle in scrap_agg
        conn.register("_prod_raw", combined)
        conn.execute("""
            CREATE OR REPLACE TABLE production_orders AS
            SELECT
                material,
                COALESCE(order_qty, 0)    AS order_qty,
                COALESCE(scrap_qty, 0)    AS scrap_qty,
                COALESCE(delivered_qty, 0) AS delivered_qty,
                start_date,
                finish_date,
                order_type,
                sys_status,
                mat_description
            FROM _prod_raw
        """)
        print(f"  Loaded {len(combined)} production order rows.")
    except Exception as e:
        print(f"  WARNING: Could not load Excel data: {e}")
        conn.execute("""
            CREATE OR REPLACE TABLE production_orders (
                material VARCHAR, order_qty INTEGER, scrap_qty INTEGER,
                delivered_qty INTEGER, start_date VARCHAR, finish_date VARCHAR,
                order_type VARCHAR, sys_status VARCHAR, mat_description VARCHAR
            )
        """)


def _materialize(conn):
    print("  Materializing routing aggregates...")
    conn.execute("""
        CREATE OR REPLACE TABLE routing_agg AS
        SELECT
            material,
            SUM(COALESCE(machine_min, 0)) AS total_machine_min,
            SUM(COALESCE(labor_min,   0)) AS total_labor_min,
            SUM(COALESCE(setup_min,   0)) AS total_setup_min,
            COUNT(*) AS op_count
        FROM routing
        GROUP BY material
    """)

    print("  Materializing scrap aggregates...")
    # production_orders material may lack leading zeros; join via lstrip matching
    conn.execute("""
        CREATE OR REPLACE TABLE scrap_agg AS
        SELECT
            material,
            SUM(order_qty)    AS total_ordered,
            SUM(scrap_qty)    AS total_scrap,
            SUM(delivered_qty) AS total_delivered,
            CASE WHEN SUM(order_qty) > 0
                 THEN SUM(scrap_qty)::DOUBLE / SUM(order_qty) * 100.0
                 ELSE 0.0
            END AS scrap_rate_pct
        FROM production_orders
        WHERE order_qty > 0
        GROUP BY material
    """)

    print("  Materializing raw materials set...")
    conn.execute("""
        CREATE OR REPLACE TABLE raw_materials AS
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
