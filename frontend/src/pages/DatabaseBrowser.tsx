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
    <div className="db-layout">
      {/* Sidebar */}
      <aside className="db-sidebar">
        <div style={{ padding: "20px 16px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Tables
        </div>
        {tablesLoading && (
          <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-secondary)" }}>Loading…</div>
        )}
        {tables.map((t) => (
          <div
            key={t.name}
            className={`db-table-item${selectedTable === t.name ? " active" : ""}`}
            onClick={() => selectTable(t.name)}
          >
            <div style={{ fontFamily: "Consolas, Menlo, monospace", fontSize: 13 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
              {t.rowCount.toLocaleString()} rows
            </div>
          </div>
        ))}
      </aside>

      {/* Main panel */}
      <div className="db-main">
        <h1 style={{ margin: "0 0 24px" }}>Database Browser</h1>

        {!selectedTable && (
          <div className="empty-state">Select a table on the left to preview its data.</div>
        )}

        {selectedTable && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontFamily: "Consolas, Menlo, monospace", fontSize: 20 }}>
                {selectedTable}
              </h2>
              {preview && (
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  {preview.total.toLocaleString()} rows · {preview.columns.length} columns
                </span>
              )}
            </div>

            {previewLoading && (
              <div style={{ color: "var(--text-secondary)", padding: "32px 0" }}>Loading…</div>
            )}

            {preview && !previewLoading && (
              <>
                <div className="data-table-wrap">
                  <table className="data-table" style={{ fontSize: 13 }}>
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
                                fontFamily: "Consolas, Menlo, monospace",
                                fontSize: 12,
                              }}
                            >
                              {cell || <span style={{ color: "var(--text-secondary)" }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination offset={offset} pageSize={PAGE_SIZE} total={preview.total} onPage={setOffset} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
