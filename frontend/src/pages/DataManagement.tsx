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

  const { data: tablesData } =
    useQuery<{ dbTables: DbTable[] }>(GET_DB_TABLES);

  const [importDataset, { loading: importing }] = useMutation(IMPORT_DATASET, {
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
    onError: (e) => {
      setImportError(e.message);
      setImportSuccess(null);
    },
  });

  const [removeDataset, { loading: removingMutation }] = useMutation(REMOVE_DATASET, {
    onCompleted: () => {
      setRemoving(null);
      refetchDatasets();
    },
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
      variables: {
        name:          importName,
        csvContent,
        targetTable,
        columnMapping: JSON.stringify(mapping),
      },
    });
  }

  function doRemove(name: string) {
    setRemoving(name);
    removeDataset({ variables: { name } });
  }

  return (
    <>
      <div className="page-header"><h1>Data Management</h1></div>

      {/* Import form */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>Import CSV Dataset</h3>
        <div style={{ display: "grid", gap: ".8rem", maxWidth: 540 }}>
          <div>
            <label style={{ display: "block", fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".3rem" }}>
              Dataset name
            </label>
            <input
              className="input"
              style={{ width: "100%" }}
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="e.g. production_orders_2025"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".3rem" }}>
              Target table
            </label>
            <select
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              style={{
                background: "var(--surface-alt)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: ".45rem .6rem",
                width: "100%",
              }}
            >
              {TARGET_TABLES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".3rem" }}>
              CSV file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ fontSize: ".85rem", color: "var(--text)" }}
            />
            {fileName && (
              <div style={{ marginTop: ".3rem", fontSize: ".78rem", color: "var(--text-muted)" }}>
                {fileName} loaded
              </div>
            )}
          </div>

          <div style={{ fontSize: ".78rem", color: "var(--text-muted)", background: "var(--surface-alt)", padding: ".6rem .8rem", borderRadius: 6 }}>
            Column mapping applied automatically for <strong>Production Orders</strong> and <strong>Scrap Records</strong> presets.
            Export your xlsx to CSV first, then import here.
          </div>

          {importError   && <div style={{ color: "var(--red)", fontSize: ".85rem" }}>{importError}</div>}
          {importSuccess && <div style={{ color: "var(--green, #4ade80)", fontSize: ".85rem" }}>{importSuccess}</div>}

          <button
            className="btn btn-primary"
            style={{ alignSelf: "flex-start" }}
            onClick={doImport}
            disabled={importing || !csvContent || !importName}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      {/* Imported datasets */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: ".8rem" }}>Imported Datasets</h3>
        {datasetsLoading && <div className="spinner">Loading…</div>}
        {!datasetsLoading && datasets.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: ".88rem" }}>
            No datasets imported yet. Auto-import (DEV_AUTO_IMPORT=1) loads Scrap.xlsx automatically in dev mode.
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
                  <th>Rows</th>
                  <th>Imported at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((ds) => (
                  <tr key={ds.name}>
                    <td style={{ fontFamily: "var(--mono)" }}>{ds.name}</td>
                    <td style={{ fontSize: ".8rem" }}>{ds.sourceFile}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{ds.tableName}</td>
                    <td>{ds.rowCount.toLocaleString()}</td>
                    <td style={{ fontSize: ".78rem", color: "var(--text-muted)" }}>{ds.importedAt}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: ".78rem", color: "var(--red)", borderColor: "var(--red)" }}
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
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: ".8rem" }}>All Database Tables</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          {tables.map((t) => (
            <div
              key={t.name}
              style={{
                background: "var(--surface-alt)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: ".4rem .7rem",
                fontSize: ".8rem",
              }}
            >
              <span style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{t.name}</span>
              <span style={{ color: "var(--text-muted)", marginLeft: ".4rem" }}>
                {t.rowCount.toLocaleString()} rows
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
