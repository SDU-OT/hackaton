import os
import sys

from flask import Flask, request, jsonify
from flask_cors import CORS
from strawberry.flask.views import GraphQLView


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


from schema import schema


def _assert_expected_schema(active_schema):
    # Guard against accidentally serving an older schema contract.
    sdl = active_schema.as_str()
    required_tokens = ("materialType", "mrpController", "materialCatalogFilters")
    missing = [token for token in required_tokens if token not in sdl]
    if missing:
        raise RuntimeError(
            "Loaded GraphQL schema is missing expected fields/args: " + ", ".join(missing)
        )


_assert_expected_schema(schema)

app = Flask(__name__)
CORS(app)

app.add_url_rule(
    "/graphql",
    view_func=GraphQLView.as_view("graphql_view", schema=schema),
)

# Column mappings for each target table (SAP export column names → DB column names)
_UPLOAD_MAPPINGS = {
    "production_orders": {
        "Material Number":            "material",
        "Order quantity (GMEIN)":     "order_qty",
        "Confirmed scrap (GMEIN)":    "scrap_qty",
        "Quantity Delivered (GMEIN)": "delivered_qty",
        "MRP controller":             "mrp_controller",
        "Basic start date":           "start_date",
        "Basic finish date":          "finish_date",
        "Order Type":                 "order_type",
        "System Status":              "sys_status",
        "Material description":       "mat_description",
    },
    "scrap_records": {
        "Plnt":                 "plant",
        "Plant":                "plant",
        "Work ctr":             "work_center",
        "Material":             "material",
        "Material Description": "material_desc",
        "Order":                "order_no",
        "Operation Qty":        "operation_qty",
        "Confirmed yield":      "confirmed_yield",
        "Confirmed scrap":      "confirmed_scrap",
        "Scrap Quantity Final":  "scrap_qty_final",
        "Scrap Cost":           "scrap_cost",
        "Standard price":       "standard_price",
        "Crcy":                 "currency",
        "Currency":             "currency",
        "IssueDate":            "issue_date",
        "Cause":                "cause",
        "BU":                   "bu",
        # D[...] wrapped variants from SAP exports
        "D[Plnt]":                  "plant",
        "D[Work ctr]":              "work_center",
        "D[Material]":              "material",
        "D[Material Description]":  "material_desc",
        "D[Order]":                 "order_no",
        "D[Operation Qty]":         "operation_qty",
        "D[Confirmed yield]":       "confirmed_yield",
        "D[Confirmed scrap]":       "confirmed_scrap",
        "D[Scrap Quantity Final]":   "scrap_qty_final",
        "D[Scrap Cost]":            "scrap_cost",
        "D[Standard price]":        "standard_price",
        "D[Crcy]":                  "currency",
        "D[IssueDate]":             "issue_date",
        "D[Cause]":                 "cause",
        "D[BU]":                    "bu",
    },
}


@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Accept CSV or Excel file upload for production_orders or scrap_records."""
    import pandas as pd
    import db as _db

    file = request.files.get("file")
    name = request.form.get("name", "upload").strip() or "upload"
    target_table = request.form.get("target_table", "production_orders")

    if not file:
        return jsonify({"error": "No file provided"}), 400
    if target_table not in _db.USER_TABLES:
        return jsonify({"error": f"target_table must be one of {sorted(_db.USER_TABLES)}"}), 400

    try:
        filename = file.filename or ""
        if filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(file.stream, engine="openpyxl")
        else:
            df = pd.read_csv(file.stream)

        # Apply column mapping
        mapping = _UPLOAD_MAPPINGS.get(target_table, {})
        df = df.rename(columns={k: v for k, v in mapping.items() if k in df.columns})

        schema_cols = _db._get_table_columns(_db.get_conn(), target_table)
        for col in schema_cols:
            if col not in df.columns:
                df[col] = None
        df = df[[c for c in schema_cols if c in df.columns]].copy()

        # Normalise material ID
        if "material" in df.columns:
            df["material"] = df["material"].astype(str).str.strip().str.lstrip("0")
            df.loc[df["material"] == "", "material"] = "0"

        # Coerce numerics
        numeric_cols = {
            "production_orders": ["order_qty", "scrap_qty", "delivered_qty"],
            "scrap_records": ["operation_qty", "confirmed_yield", "confirmed_scrap",
                              "scrap_qty_final", "scrap_cost", "standard_price"],
        }.get(target_table, [])
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Convert date columns
        date_cols = {
            "production_orders": ["start_date", "finish_date"],
            "scrap_records": ["issue_date"],
        }.get(target_table, [])
        for col in date_cols:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")

        conn = _db.get_conn()
        with _db._lock:
            conn.execute(f'DELETE FROM "{target_table}"')
            conn.register("_upload_tmp", df)
            conn.execute(f'INSERT INTO "{target_table}" SELECT * FROM _upload_tmp')
            row_count = conn.execute(f'SELECT COUNT(*) FROM "{target_table}"').fetchone()[0]
            conn.execute("""
                INSERT OR REPLACE INTO imported_datasets(name, source_file, table_name, row_count, imported_at)
                VALUES (?, ?, ?, ?, NOW())
            """, [name, filename, target_table, row_count])
            if target_table == "production_orders":
                _db._materialize(conn)

        return jsonify({"name": name, "table_name": target_table, "row_count": int(row_count)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=False, port=5000, threaded=False)
