import { useState, useRef } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_IMPORTED_DATASETS, GET_DB_TABLES, REMOVE_DATASET } from "../graphql/queries";
import type { ImportedDataset, DbTable } from "../graphql/types";

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef { db: string; label: string; required?: boolean; example: string; }

const PROD_COLS: ColDef[] = [
  { db: "material",        label: "Material Number",            required: true,  example: "11018082" },
  { db: "mrp_controller",  label: "MRP controller",             required: true,  example: "YKV" },
  { db: "order_qty",       label: "Order quantity (GMEIN)",     required: true,  example: "200" },
  { db: "scrap_qty",       label: "Confirmed scrap (GMEIN)",    required: false, example: "5" },
  { db: "delivered_qty",   label: "Quantity Delivered (GMEIN)", required: false, example: "195" },
  { db: "start_date",      label: "Basic start date",           required: false, example: "2025-01-15" },
  { db: "finish_date",     label: "Basic finish date",          required: false, example: "2025-01-22" },
  { db: "order_type",      label: "Order Type",                 required: false, example: "ZP02" },
  { db: "sys_status",      label: "System Status",              required: false, example: "CLSD CNF DLV" },
  { db: "mat_description", label: "Material description",       required: false, example: "OMTS 200 HYDRAULIC MOTOR" },
];

const SCRAP_COLS: ColDef[] = [
  { db: "material",       label: "Material",             required: true,  example: "11018082" },
  { db: "scrap_cost",     label: "Scrap Cost",           required: true,  example: "1450.00" },
  { db: "scrap_qty_final",label: "Scrap Quantity Final", required: true,  example: "3" },
  { db: "issue_date",     label: "IssueDate",            required: true,  example: "2025-03-10" },
  { db: "plant",          label: "Plnt",                 required: false, example: "1201" },
  { db: "work_center",    label: "Work ctr",             required: false, example: "WC1234" },
  { db: "material_desc",  label: "Material Description", required: false, example: "HYDRAULIC MOTOR" },
  { db: "order_no",       label: "Order",                required: false, example: "59657789" },
  { db: "operation_qty",  label: "Operation Qty",        required: false, example: "200" },
  { db: "confirmed_yield",label: "Confirmed yield",      required: false, example: "197" },
  { db: "confirmed_scrap",label: "Confirmed scrap",      required: false, example: "3" },
  { db: "standard_price", label: "Standard price",       required: false, example: "483.33" },
  { db: "currency",       label: "Crcy",                 required: false, example: "DKK" },
  { db: "cause",          label: "Cause",                required: false, example: "M01" },
  { db: "bu",             label: "BU",                   required: false, example: "Drives" },
];

const TABLE_COLS: Record<string, ColDef[]> = {
  production_orders: PROD_COLS,
  scrap_records:     SCRAP_COLS,
};

const TARGET_TABLES = [
  { value: "production_orders", label: "Production Orders" },
  { value: "scrap_records",     label: "Scrap Records" },
];

interface RemoveDatasetMutationData { removeDataset: boolean }
interface RemoveDatasetMutationVars { name: string }

// ── Component ────────────────────────────────────────────────────────────────

export default function DataManagement() {
  const [importName, setImportName]       = useState("");
  const [targetTable, setTargetTable]     = useState("production_orders");
  const [file, setFile]                   = useState<File | null>(null);
  const [detectedCols, setDetectedCols]   = useState<string[]>([]);
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [removing, setRemoving]           = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: datasetsData, loading: datasetsLoading, refetch: refetchDatasets } =
    useQuery<{ importedDatasets: ImportedDataset[] }>(GET_IMPORTED_DATASETS);

  const { data: tablesData } = useQuery<{ dbTables: DbTable[] }>(GET_DB_TABLES);

  const [removeDataset, { loading: removingMutation }] = useMutation<
    RemoveDatasetMutationData, RemoveDatasetMutationVars
  >(REMOVE_DATASET, {
    onCompleted: () => { setRemoving(null); refetchDatasets(); },
  });

  const datasets = datasetsData?.importedDatasets ?? [];
  const tables   = tablesData?.dbTables ?? [];
  const cols     = TABLE_COLS[targetTable] ?? [];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setDetectedCols([]);
    setUploadError(null);
    setUploadSuccess(null);
    if (!importName) setImportName(f.name.replace(/\.(csv|xlsx?)$/i, ""));

    // Detect columns from CSV header (peek first line)
    if (f.name.toLowerCase().endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const firstLine = text.split("\n")[0];
        const cols = firstLine.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        setDetectedCols(cols);
      };
      reader.readAsText(f.slice(0, 4096));
    }
    // For xlsx we can't peek easily without a parser library — just show the expected columns
  }

  async function doUpload() {
    if (!file || !importName) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", importName);
    formData.append("target_table", targetTable);

    try {
      const res = await fetch("http://localhost:5000/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Upload failed");
      } else {
        setUploadSuccess(
          `Imported "${json.name}" → ${json.table_name}: ${json.row_count.toLocaleString()} rows`
        );
        setImportName("");
        setFile(null);
        setDetectedCols([]);
        if (fileRef.current) fileRef.current.value = "";
        refetchDatasets();
      }
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }

  function doRemove(name: string) {
    setRemoving(name);
    removeDataset({ variables: { name } });
  }

  // Compute column mapping status
  const mappedCols = new Set<string>();
  if (detectedCols.length > 0) {
    const mapping: Record<string, string> = targetTable === "production_orders"
      ? { "Material Number": "material", "Order quantity (GMEIN)": "order_qty", "Confirmed scrap (GMEIN)": "scrap_qty",
          "Quantity Delivered (GMEIN)": "delivered_qty", "MRP controller": "mrp_controller",
          "Basic start date": "start_date", "Basic finish date": "finish_date",
          "Order Type": "order_type", "System Status": "sys_status", "Material description": "mat_description" }
      : { "Material": "material", "Plnt": "plant", "Work ctr": "work_center",
          "Material Description": "material_desc", "Order": "order_no", "Operation Qty": "operation_qty",
          "Confirmed yield": "confirmed_yield", "Confirmed scrap": "confirmed_scrap",
          "Scrap Quantity Final": "scrap_qty_final", "Scrap Cost": "scrap_cost",
          "Standard price": "standard_price", "Crcy": "currency", "IssueDate": "issue_date",
          "Cause": "cause", "BU": "bu" };
    detectedCols.forEach(c => {
      const mapped = mapping[c] ?? (cols.find(d => d.db === c) ? c : null);
      if (mapped) mappedCols.add(mapped);
    });
  }

  return (
    <div className="page-inner">
      <h1>Data Upload</h1>

      {/* Import form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>Import Dataset</h2>
        <div className="upload-layout">
          {/* Left: form */}
          <div className="upload-form">
            <div className="upload-field">
              <label className="upload-label">Dataset name</label>
              <input
                type="text"
                style={{ width: "100%", boxSizing: "border-box" }}
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. production_orders_2025"
              />
            </div>

            <div className="upload-field">
              <label className="upload-label">Target table</label>
              <select
                value={targetTable}
                onChange={(e) => { setTargetTable(e.target.value); setDetectedCols([]); }}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                {TARGET_TABLES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="upload-field">
              <label className="upload-label">File (.csv or .xlsx)</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFile}
                style={{ fontSize: 14, color: "var(--text-body)", padding: "8px 0" }}
              />
              {file && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                  {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>

            {uploadError   && <div className="upload-msg upload-msg-error">{uploadError}</div>}
            {uploadSuccess && <div className="upload-msg upload-msg-success">{uploadSuccess}</div>}

            <button
              className="btn"
              onClick={doUpload}
              disabled={uploading || !file || !importName}
            >
              {uploading ? "Uploading…" : "Upload & Import"}
            </button>
          </div>

          {/* Right: column reference */}
          <div className="upload-cols-panel">
            <p className="upload-cols-title">
              Expected columns for <strong>{TARGET_TABLES.find(t => t.value === targetTable)?.label}</strong>
            </p>
            <div className="upload-cols-table-wrap">
              <table className="upload-cols-table">
                <thead>
                  <tr>
                    <th>DB Column</th>
                    <th>Excel / CSV Header</th>
                    <th style={{ textAlign: "center" }}>Req.</th>
                    {detectedCols.length > 0 && <th style={{ textAlign: "center" }}>Found</th>}
                  </tr>
                </thead>
                <tbody>
                  {cols.map((col) => {
                    const found = detectedCols.length > 0 ? mappedCols.has(col.db) : null;
                    return (
                      <tr key={col.db}>
                        <td style={{ fontFamily: "Consolas, monospace", fontSize: 11 }}>{col.db}</td>
                        <td style={{ fontSize: 12 }}>{col.label}</td>
                        <td style={{ textAlign: "center", fontSize: 12 }}>
                          {col.required ? <span style={{ color: "var(--red)", fontWeight: 700 }}>✱</span> : ""}
                        </td>
                        {detectedCols.length > 0 && (
                          <td style={{ textAlign: "center", fontSize: 12 }}>
                            {found === true
                              ? <span style={{ color: "var(--status-green)", fontWeight: 700 }}>✓</span>
                              : found === false
                              ? <span style={{ color: col.required ? "var(--red)" : "var(--text-secondary)" }}>—</span>
                              : null}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0" }}>
              Column mapping is applied automatically. Additional columns are ignored.
            </p>
          </div>
        </div>
      </div>

      {/* Imported datasets */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>Imported Datasets</h2>
        {datasetsLoading && <div style={{ color: "var(--text-secondary)" }}>Loading…</div>}
        {!datasetsLoading && datasets.length === 0 && (
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>No datasets imported yet.</div>
        )}
        {datasets.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source file</th>
                  <th>Target table</th>
                  <th className="num">Rows</th>
                  <th>Imported at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds) => (
                  <tr key={ds.name}>
                    <td style={{ fontFamily: "Consolas, monospace", fontSize: 13 }}>{ds.name}</td>
                    <td style={{ fontSize: 13 }}>{ds.sourceFile}</td>
                    <td style={{ fontFamily: "Consolas, monospace", fontSize: 13 }}>{ds.tableName}</td>
                    <td className="num">{ds.rowCount.toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ds.importedAt}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "4px 12px", color: "var(--red)", borderColor: "var(--red)" }}
                        onClick={() => doRemove(ds.name)}
                        disabled={removingMutation && removing === ds.name}
                      >
                        {removingMutation && removing === ds.name ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DB table overview */}
      {tables.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Database Tables</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tables.map((t) => (
              <div key={t.name} style={{
                background: "var(--bg-section)", border: "1px solid var(--border)",
                padding: "6px 12px", fontSize: 13,
              }}>
                <span style={{ fontFamily: "Consolas, monospace" }}>{t.name}</span>
                <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>
                  {t.rowCount.toLocaleString()} rows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
