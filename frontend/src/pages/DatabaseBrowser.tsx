import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  GET_DB_TABLES,
  GET_TABLE_PREVIEW,
  DELETE_TABLE_ROW,
  INSERT_TABLE_ROW,
} from "../graphql/queries";
import type { DbTable, TablePreview } from "../graphql/types";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;
const USER_TABLES = new Set(["production_orders", "scrap_records"]);

export default function DatabaseBrowser() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [offset, setOffset]               = useState(0);
  const [search, setSearch]               = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [sortCol, setSortCol]             = useState("");
  const [sortDir, setSortDir]             = useState<"asc" | "desc">("asc");
  const [addingRow, setAddingRow]         = useState(false);
  const [newRowValues, setNewRowValues]   = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: tablesData, loading: tablesLoading } =
    useQuery<{ dbTables: DbTable[] }>(GET_DB_TABLES);

  const { data: previewData, loading: previewLoading, refetch } =
    useQuery<{ tablePreview: TablePreview }>(GET_TABLE_PREVIEW, {
      variables: {
        tableName: selectedTable,
        limit: PAGE_SIZE,
        offset,
        search: committedSearch,
        sortCol,
        sortDir,
      },
      skip: !selectedTable,
    });

  const [deleteRow, { loading: deleting }] = useMutation(DELETE_TABLE_ROW, {
    onCompleted: () => { setDeleteConfirm(null); refetch(); },
  });

  const [insertRow, { loading: inserting }] = useMutation(INSERT_TABLE_ROW, {
    onCompleted: () => { setAddingRow(false); setNewRowValues({}); refetch(); },
  });

  const tables  = tablesData?.dbTables ?? [];
  const preview = previewData?.tablePreview;
  const isUserTable = selectedTable ? USER_TABLES.has(selectedTable) : false;

  function selectTable(name: string) {
    setSelectedTable(name);
    setOffset(0);
    setSearch("");
    setCommittedSearch("");
    setSortCol("");
    setSortDir("asc");
    setAddingRow(false);
    setNewRowValues({});
    setDeleteConfirm(null);
  }

  const handleSort = useCallback((col: string) => {
    if (col === sortCol) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setOffset(0);
  }, [sortCol]);

  function commitSearch() {
    setCommittedSearch(search);
    setOffset(0);
  }

  function startAddRow() {
    const empty: Record<string, string> = {};
    preview?.columns.forEach(c => { empty[c] = ""; });
    setNewRowValues(empty);
    setAddingRow(true);
  }

  function doInsert() {
    if (!selectedTable) return;
    insertRow({
      variables: {
        tableName: selectedTable,
        valuesJson: JSON.stringify(newRowValues),
      },
    });
  }

  function doDelete(rowId: number) {
    if (!selectedTable) return;
    deleteRow({ variables: { tableName: selectedTable, rowId } });
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (col !== sortCol) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: "var(--red)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="db-layout">
      {/* Sidebar */}
      <aside className="db-sidebar">
        <div className="db-sidebar-label">Tables</div>
        {tablesLoading && <div className="db-sidebar-empty">Loading…</div>}
        {tables.map((t) => (
          <div
            key={t.name}
            className={`db-table-item${selectedTable === t.name ? " active" : ""}`}
            onClick={() => selectTable(t.name)}
          >
            <div className="db-table-name">{t.name}</div>
            <div className="db-table-meta">{t.rowCount.toLocaleString()} rows</div>
            {USER_TABLES.has(t.name) && <span className="db-editable-badge">editable</span>}
          </div>
        ))}
      </aside>

      {/* Main panel */}
      <div className="db-main">
        <h1 style={{ margin: "0 0 20px" }}>Database Browser</h1>

        {!selectedTable && (
          <p className="empty-state">Select a table on the left to preview its data.</p>
        )}

        {selectedTable && (
          <>
            {/* Toolbar */}
            <div className="db-toolbar">
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: 1, minWidth: 0 }}>
                <h2 className="db-table-title">{selectedTable}</h2>
                {preview && (
                  <span className="db-table-stats">
                    {preview.total.toLocaleString()} {committedSearch ? "matching" : ""} rows · {preview.columns.length} cols
                  </span>
                )}
              </div>

              <div className="db-toolbar-right">
                {/* Search */}
                <div className="db-search-wrap">
                  <input
                    className="db-search-input"
                    type="text"
                    placeholder="Search all columns…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitSearch()}
                  />
                  <button className="db-search-btn" onClick={commitSearch}>Search</button>
                  {committedSearch && (
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }}
                      onClick={() => { setSearch(""); setCommittedSearch(""); setOffset(0); }}>
                      Clear
                    </button>
                  )}
                </div>

                {isUserTable && !addingRow && (
                  <button className="btn" style={{ fontSize: 13 }} onClick={startAddRow}>
                    + Add Row
                  </button>
                )}
              </div>
            </div>

            {previewLoading && <p style={{ color: "var(--text-secondary)", padding: "24px 0" }}>Loading…</p>}

            {/* Add row form */}
            {addingRow && preview && (
              <div className="db-add-row-form">
                <p className="db-add-row-title">New Row</p>
                <div className="db-add-row-fields">
                  {preview.columns.map((col) => (
                    <div key={col} className="db-add-row-field">
                      <label className="db-add-row-label">{col}</label>
                      <input
                        className="db-add-row-input"
                        type="text"
                        placeholder={col}
                        value={newRowValues[col] ?? ""}
                        onChange={(e) => setNewRowValues(prev => ({ ...prev, [col]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={doInsert} disabled={inserting}>
                    {inserting ? "Inserting…" : "Insert Row"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setAddingRow(false); setNewRowValues({}); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {preview && !previewLoading && (
              <>
                <div className="data-table-wrap">
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        {preview.columns.map((col) => (
                          <th
                            key={col}
                            style={{ whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                            onClick={() => handleSort(col)}
                          >
                            {col}<SortIcon col={col} />
                          </th>
                        ))}
                        {isUserTable && <th style={{ width: 40 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => {
                        const rowId = preview.rowIds[i];
                        const isDeleting = deleteConfirm === rowId && deleting;
                        return (
                          <tr key={rowId}>
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
                            {isUserTable && (
                              <td style={{ textAlign: "center", padding: "0 4px" }}>
                                {deleteConfirm === rowId ? (
                                  <span style={{ display: "flex", gap: 4 }}>
                                    <button
                                      className="db-del-confirm"
                                      onClick={() => doDelete(rowId)}
                                      disabled={isDeleting}
                                      title="Confirm delete"
                                    >✓</button>
                                    <button
                                      className="db-del-cancel"
                                      onClick={() => setDeleteConfirm(null)}
                                      title="Cancel"
                                    >✕</button>
                                  </span>
                                ) : (
                                  <button
                                    className="db-del-btn"
                                    onClick={() => setDeleteConfirm(rowId)}
                                    title="Delete row"
                                  >×</button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {preview.rows.length === 0 && (
                        <tr>
                          <td colSpan={preview.columns.length + (isUserTable ? 1 : 0)}
                            style={{ textAlign: "center", color: "var(--text-secondary)", padding: "32px" }}>
                            {committedSearch ? `No rows match "${committedSearch}"` : "Table is empty"}
                          </td>
                        </tr>
                      )}
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
