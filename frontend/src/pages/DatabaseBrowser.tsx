import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_DB_TABLES, GET_TABLE_PREVIEW } from "../graphql/queries";
import type { DbTable, TablePreview } from "../graphql/types";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;

export default function DatabaseBrowser() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const { data: tablesData, loading: tablesLoading } = useQuery<{ dbTables: DbTable[] }>(GET_DB_TABLES);

  const { data: previewData, loading: previewLoading } = useQuery<{ tablePreview: TablePreview }>(
    GET_TABLE_PREVIEW,
    {
      variables: { tableName: selectedTable, limit: PAGE_SIZE, offset },
      skip: !selectedTable,
    }
  );

  const tables = tablesData?.dbTables ?? [];
  const preview = previewData?.tablePreview;

  function selectTable(name: string) {
    setSelectedTable(name);
    setOffset(0);
  }

  return (
    <>
      <div className="page-header"><h1>Database Browser</h1></div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {/* Table list */}
        <div className="card" style={{ minWidth: 220, flexShrink: 0 }}>
          <h3 style={{ marginBottom: ".8rem", fontSize: ".88rem", color: "var(--text-muted)" }}>Tables</h3>
          {tablesLoading && <div className="spinner" style={{ fontSize: ".85rem" }}>Loading…</div>}
          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => selectTable(t.name)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: ".45rem .6rem",
                marginBottom: ".25rem",
                borderRadius: 6,
                border: "1px solid",
                borderColor: selectedTable === t.name ? "var(--accent)" : "transparent",
                background: selectedTable === t.name ? "rgba(var(--accent-rgb),.08)" : "transparent",
                color: selectedTable === t.name ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
                fontSize: ".82rem",
                textAlign: "left",
                gap: ".5rem",
              }}
            >
              <span style={{ fontFamily: "var(--mono)" }}>{t.name}</span>
              <span
                style={{
                  background: "var(--surface-alt)",
                  color: "var(--text-muted)",
                  borderRadius: 999,
                  padding: ".1rem .45rem",
                  fontSize: ".75rem",
                  whiteSpace: "nowrap",
                }}
              >
                {t.rowCount.toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        {/* Preview panel */}
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          {!selectedTable && (
            <div style={{ color: "var(--text-muted)", fontSize: ".9rem", textAlign: "center", padding: "2rem" }}>
              Select a table on the left to preview its data.
            </div>
          )}

          {selectedTable && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: ".8rem" }}>
                <h3 style={{ fontFamily: "var(--mono)", margin: 0 }}>{selectedTable}</h3>
                {preview && (
                  <span style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>
                    {preview.total.toLocaleString()} rows · {preview.columns.length} columns
                  </span>
                )}
              </div>

              {previewLoading && <div className="spinner">Loading…</div>}

              {preview && !previewLoading && (
                <>
                  <div className="data-table-wrap">
                    <table className="data-table" style={{ fontSize: ".75rem" }}>
                      <thead>
                        <tr>
                          {preview.columns.map((col) => (
                            <th key={col} style={{ whiteSpace: "nowrap" }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                title={cell}
                                style={{
                                  maxWidth: 200,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontFamily: "var(--mono)",
                                }}
                              >
                                {cell || <span style={{ color: "var(--text-muted)" }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: ".8rem" }}>
                    <Pagination
                      offset={offset}
                      pageSize={PAGE_SIZE}
                      total={preview.total}
                      onPage={setOffset}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
