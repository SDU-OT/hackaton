import { useState, useRef } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_IMPORTED_DATASETS, GET_DB_TABLES, IMPORT_DATASET, REMOVE_DATASET } from "../graphql/queries";
import type { ImportedDataset, DbTable } from "../graphql/types";

const TARGET_TABLES = [
  { value: "production_orders", label: "Production Orders" },
  { value: "scrap_records",     label: "Scrap Records" },
];

const PROD_ORDER_MAPPING: Record<string, string> = {
  "Material Number":           "material",
  "Order quantity (GMEIN)":    "order_qty",
  "Confirmed scrap (GMEIN)":   "scrap_qty",
  "Quantity Delivered (GMEIN)":"delivered_qty",
  "Basic start date":          "start_date",
  "Basic finish date":         "finish_date",
  "Order Type":                "order_type",
  "MRP controller":            "mrp_controller",
  "System Status":             "sys_status",
  "Material description":      "mat_description",
};

const SCRAP_MAPPING: Record<string, string> = {
  "D[Plnt]":                  "plant",
  "D[Work ctr]":              "work_center",
  "D[Material]":              "material",
  "D[Material Description]":  "material_desc",
  "D[Order]":                 "order_no",
  "D[Operation Qty]":         "operation_qty",
  "D[Confirmed yield]":       "confirmed_yield",
  "D[Confirmed scrap]":       "confirmed_scrap",
  "D[Scrap Quantity Final]":  "scrap_qty_final",
  "D[Scrap Cost]":            "scrap_cost",
  "D[Standard price]":        "standard_price",
  "D[Crcy]":                  "currency",
  "D[IssueDate]":             "issue_date",
  "D[Cause]":                 "cause",
  "D[BU]":                    "bu",
};

const PRESET_MAPPINGS: Record<string, Record<string, string>> = {
  production_orders: PROD_ORDER_MAPPING,
  scrap_records:     SCRAP_MAPPING,
};

interface ImportDatasetMutationData {
  importDataset: { name: string; tableName: string; rowCount: number };
}
interface ImportDatasetMutationVars {
  name: string; csvContent: string; targetTable: string; columnMapping: string;
}
interface RemoveDatasetMutationData { removeDataset: boolean }
interface RemoveDatasetMutationVars { name: string }

export default function DataManagement() {
  const [importName, setImportName]       = useState("");
  const [targetTable, setTargetTable]     = useState("production_orders");
  const [csvContent, setCsvContent]       = useState<string | null>(null);
  const [fileName, setFileName]           = useState<string | null>(null);
  const [importError, setImportError]     = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [removing, setRemoving]           = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: datasetsData, loading: datasetsLoading, refetch: refetchDatasets } =
    useQuery<{ importedDatasets: ImportedDataset[] }>(GET_IMPORTED_DATASETS);

  const { data: tablesData } = useQuery<{ dbTables: DbTable[] }>(GET_DB_TABLES);

  const [importDataset, { loading: importing }] = useMutation<
    ImportDatasetMutationData, ImportDatasetMutationVars
  >(IMPORT_DATASET, {
    onCompleted: (d) => {
      setImportSuccess(
        `Imported "${d.importDataset.name}" → ${d.importDataset.tableName}: ${d.importDataset.rowCount.toLocaleString()} rows`
      );
      setImportError(null);
      setImportName("");
      setCsvContent(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      refetchDatasets();
    },
    onError: (e) => { setImportError(e.message); setImportSuccess(null); },
  });

  const [removeDataset, { loading: removingMutation }] = useMutation<
    RemoveDatasetMutationData, RemoveDatasetMutationVars
  >(REMOVE_DATASET, {
    onCompleted: () => { setRemoving(null); refetchDatasets(); },
  });

  const datasets = datasetsData?.importedDatasets ?? [];
  const tables   = tablesData?.dbTables ?? [];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!importName) setImportName(file.name.replace(/\.csv$/i, ""));
    const reader = new FileReader();
    reader.onload = (ev) => setCsvContent(ev.target?.result as string);
    reader.readAsText(file);
  }

  function doImport() {
    if (!csvContent || !importName) return;
    const mapping = PRESET_MAPPINGS[targetTable] ?? {};
    importDataset({
      variables: { name: importName, csvContent, targetTable, columnMapping: JSON.stringify(mapping) },
    });
  }

  function doRemove(name: string) {
    setRemoving(name);
    removeDataset({ variables: { name } });
  }

  return (
    <div className="page-inner">
      <h1>Data Upload</h1>

      {/* Import form */}
      <div className="card" style={{ marginBottom: 24, maxWidth: 640 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>Import CSV Dataset</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: 6 }}>
              Dataset name
            </label>
            <input
              type="text"
              style={{ width: "100%" }}
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="e.g. production_orders_2025"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: 6 }}>
              Target table
            </label>
            <select value={targetTable} onChange={(e) => setTargetTable(e.target.value)} style={{ width: "100%" }}>
              {TARGET_TABLES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: 6 }}>
              CSV file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ fontSize: 14, color: "var(--text-body)", padding: "8px 0" }}
            />
            {fileName && (
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                {fileName} loaded
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, color: "var(--text-secondary)", background: "var(--bg-section)", padding: "10px 14px", borderLeft: "3px solid var(--border)" }}>
            Column mapping is applied automatically for <strong>Production Orders</strong> and <strong>Scrap Records</strong> presets. Export your .xlsx to CSV first, then import here.
          </div>

          {importError   && <div style={{ color: "var(--red)", fontSize: 14 }}>{importError}</div>}
          {importSuccess && <div style={{ color: "var(--status-green)", fontSize: 14 }}>{importSuccess}</div>}

          <div>
            <button
              className="btn"
              onClick={doImport}
              disabled={importing || !csvContent || !importName}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      </div>

      {/* Imported datasets */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18 }}>Imported Datasets</h2>
        {datasetsLoading && <div style={{ color: "var(--text-secondary)" }}>Loading…</div>}
        {!datasetsLoading && datasets.length === 0 && (
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            No datasets imported yet.
          </div>
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
                    <td className="mono">{ds.name}</td>
                    <td style={{ fontSize: 13 }}>{ds.sourceFile}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{ds.tableName}</td>
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
              <div
                key={t.name}
                style={{
                  background: "var(--bg-section)",
                  border: "1px solid var(--border)",
                  padding: "6px 12px",
                  fontSize: 13,
                }}
              >
                <span style={{ fontFamily: "Consolas, Menlo, monospace", color: "var(--text-body)" }}>{t.name}</span>
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
