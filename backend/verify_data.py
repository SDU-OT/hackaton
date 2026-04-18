"""
Standalone data verification script.
Run: python verify_data.py
Connects to hackaton.db and checks that all 3 CSV files are fully loaded,
correctly parsed, and properly linked. Outputs PASS/WARN/FAIL per check.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import duckdb

DB_PATH = os.path.join(os.path.dirname(__file__), "hackaton.db")

PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"

results = []


def check(status, label, detail=""):
    symbol = {"PASS": "✓", "WARN": "!", "FAIL": "✗"}[status]
    color  = {"PASS": "\033[92m", "WARN": "\033[93m", "FAIL": "\033[91m"}[status]
    reset  = "\033[0m"
    print(f"  {color}[{symbol}] {status}{reset}  {label}")
    if detail:
        for line in detail.split("\n"):
            print(f"         {line}")
    results.append((status, label))


def main():
    if not os.path.exists(DB_PATH):
        print(f"\033[91m[✗] FAIL\033[0m  Database file not found: {DB_PATH}")
        print("      Run the backend server first to initialize the database.")
        sys.exit(1)

    conn = duckdb.connect(DB_PATH, read_only=True)
    print(f"\nVerifying data in {DB_PATH}\n{'─'*60}")

    # ── 1. Row counts ─────────────────────────────────────────────────────────
    print("\n[1] Row counts")

    def table_exists(name):
        r = conn.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema='main' AND table_name=?
        """, [name]).fetchone()
        return r and r[0] > 0

    for tname, min_rows, label in [
        ("material_master", 100_000, "material_master"),
        ("bom",             2_000_000, "bom"),
        ("routing",         3_000_000, "routing"),
    ]:
        if not table_exists(tname):
            check(FAIL, f"{label}: table does not exist")
            continue
        n = conn.execute(f"SELECT COUNT(*) FROM {tname}").fetchone()[0]
        if n >= min_rows:
            check(PASS, f"{label}: {n:,} rows")
        elif n > 0:
            check(WARN, f"{label}: only {n:,} rows (expected ≥ {min_rows:,})")
        else:
            check(FAIL, f"{label}: 0 rows — table is empty")

    # ── 2. Parse quality ──────────────────────────────────────────────────────
    print("\n[2] Parse quality")

    # material_master
    if table_exists("material_master"):
        null_mat = conn.execute("SELECT COUNT(*) FROM material_master WHERE material IS NULL OR TRIM(material)=''").fetchone()[0]
        null_desc = conn.execute("SELECT COUNT(*) FROM material_master WHERE description IS NULL").fetchone()[0]
        null_type = conn.execute("SELECT COUNT(*) FROM material_master WHERE material_type IS NULL").fetchone()[0]
        total_mm = conn.execute("SELECT COUNT(*) FROM material_master").fetchone()[0]

        if null_mat == 0:
            check(PASS, f"material_master: all {total_mm:,} rows have non-null material ID")
        else:
            check(FAIL, f"material_master: {null_mat:,} rows with NULL/empty material ID")

        if null_desc == 0:
            check(PASS, "material_master: all descriptions present")
        else:
            check(WARN, f"material_master: {null_desc:,} rows with NULL description ({null_desc/total_mm*100:.1f}%)")

        if null_type == 0:
            check(PASS, "material_master: all material_type values present")
        else:
            check(WARN, f"material_master: {null_type:,} rows with NULL material_type")

        types = conn.execute("""
            SELECT material_type, COUNT(*) AS n FROM material_master
            WHERE material_type IS NOT NULL GROUP BY material_type ORDER BY n DESC LIMIT 10
        """).fetchall()
        type_str = ", ".join(f"{t}={n:,}" for t, n in types)
        check(PASS, f"material_master type distribution: {type_str}")

    # bom
    if table_exists("bom"):
        null_comp = conn.execute("SELECT COUNT(*) FROM bom WHERE component IS NULL OR TRIM(component)=''").fetchone()[0]
        null_qty  = conn.execute("SELECT COUNT(*) FROM bom WHERE quantity IS NULL").fetchone()[0]
        neg_qty   = conn.execute("SELECT COUNT(*) FROM bom WHERE quantity IS NOT NULL AND quantity <= 0").fetchone()[0]
        total_bom = conn.execute("SELECT COUNT(*) FROM bom").fetchone()[0]

        if null_comp == 0:
            check(PASS, "bom: no NULL/empty component IDs")
        else:
            check(WARN, f"bom: {null_comp:,} rows with NULL/empty component")

        if null_qty == 0 and neg_qty == 0:
            check(PASS, "bom: all quantity values are valid positive numbers")
        else:
            details = []
            if null_qty:
                details.append(f"{null_qty:,} NULL quantities")
            if neg_qty:
                details.append(f"{neg_qty:,} zero/negative quantities")
            check(WARN, f"bom: quantity issues — {', '.join(details)}")

    # routing
    if table_exists("routing"):
        total_rou = conn.execute("SELECT COUNT(*) FROM routing").fetchone()[0]
        null_mach = conn.execute("SELECT COUNT(*) FROM routing WHERE machine_min IS NULL").fetchone()[0]
        null_lab  = conn.execute("SELECT COUNT(*) FROM routing WHERE labor_min IS NULL").fetchone()[0]
        units = conn.execute("""
            SELECT UPPER(TRIM(machine_unit)), COUNT(*) FROM routing
            WHERE machine_unit IS NOT NULL GROUP BY 1 ORDER BY 2 DESC
        """).fetchall()
        unit_str = ", ".join(f"{u or 'NULL'}={n:,}" for u, n in units)
        check(PASS if (null_mach / total_rou < 0.5) else WARN,
              f"routing: {null_mach:,}/{total_rou:,} rows have NULL machine_min ({null_mach/total_rou*100:.1f}%)")
        check(PASS if (null_lab / total_rou < 0.5) else WARN,
              f"routing: {null_lab:,}/{total_rou:,} rows have NULL labor_min ({null_lab/total_rou*100:.1f}%)")
        check(PASS, f"routing machine unit types: {unit_str}")

    # ── 3. Cross-file linkage ─────────────────────────────────────────────────
    print("\n[3] Cross-file linkage")

    if table_exists("bom") and table_exists("material_master"):
        total_bom_parents = conn.execute("SELECT COUNT(DISTINCT material) FROM bom").fetchone()[0]
        total_bom_comps   = conn.execute("SELECT COUNT(DISTINCT component) FROM bom").fetchone()[0]

        # Exact match
        matched_parents_exact = conn.execute("""
            SELECT COUNT(DISTINCT b.material) FROM bom b
            INNER JOIN material_master mm ON mm.material = b.material
        """).fetchone()[0]
        matched_comps_exact = conn.execute("""
            SELECT COUNT(DISTINCT b.component) FROM bom b
            INNER JOIN material_master mm ON mm.material = b.component
        """).fetchone()[0]

        # Normalized match (strip leading zeros)
        matched_parents_norm = conn.execute("""
            SELECT COUNT(DISTINCT b.material) FROM bom b
            WHERE LTRIM(b.material,'0') IN (SELECT LTRIM(material,'0') FROM material_master)
        """).fetchone()[0]
        matched_comps_norm = conn.execute("""
            SELECT COUNT(DISTINCT b.component) FROM bom b
            WHERE LTRIM(b.component,'0') IN (SELECT LTRIM(material,'0') FROM material_master)
        """).fetchone()[0]

        parent_pct_exact = matched_parents_exact / total_bom_parents * 100 if total_bom_parents else 0
        comp_pct_exact   = matched_comps_exact   / total_bom_comps   * 100 if total_bom_comps   else 0
        parent_pct_norm  = matched_parents_norm  / total_bom_parents * 100 if total_bom_parents else 0
        comp_pct_norm    = matched_comps_norm    / total_bom_comps   * 100 if total_bom_comps   else 0

        s = PASS if parent_pct_exact >= 80 else (WARN if parent_pct_exact >= 50 else FAIL)
        check(s, f"BOM parents → material_master (exact): {matched_parents_exact:,}/{total_bom_parents:,} ({parent_pct_exact:.1f}%)")
        if parent_pct_norm > parent_pct_exact:
            check(WARN, f"  After normalization: {parent_pct_norm:.1f}% match — IDs have leading-zero mismatch")

        s = PASS if comp_pct_exact >= 60 else (WARN if comp_pct_exact >= 30 else FAIL)
        check(s, f"BOM components → material_master (exact): {matched_comps_exact:,}/{total_bom_comps:,} ({comp_pct_exact:.1f}%)")
        if comp_pct_norm > comp_pct_exact:
            check(WARN, f"  After normalization: {comp_pct_norm:.1f}% match — normalization helps significantly")

        # Top unmatched BOM components
        unmatched = conn.execute("""
            SELECT b.component, COUNT(*) AS uses
            FROM bom b
            WHERE b.component NOT IN (SELECT material FROM material_master)
              AND LTRIM(b.component,'0') NOT IN (SELECT LTRIM(material,'0') FROM material_master)
            GROUP BY b.component ORDER BY uses DESC LIMIT 20
        """).fetchall()
        if unmatched:
            sample = ", ".join(f"{c}({u})" for c, u in unmatched[:10])
            check(WARN, f"Top unmatched BOM components (not in material_master): {sample}")

    if table_exists("bom") and table_exists("routing"):
        total_bom_parents = conn.execute("SELECT COUNT(DISTINCT material) FROM bom").fetchone()[0]
        matched_routing_exact = conn.execute("""
            SELECT COUNT(DISTINCT b.material) FROM bom b
            INNER JOIN routing r ON r.material = b.material
        """).fetchone()[0]
        matched_routing_norm = conn.execute("""
            SELECT COUNT(DISTINCT b.material) FROM bom b
            WHERE LTRIM(b.material,'0') IN (SELECT LTRIM(material,'0') FROM routing)
        """).fetchone()[0]

        pct_exact = matched_routing_exact / total_bom_parents * 100 if total_bom_parents else 0
        pct_norm  = matched_routing_norm  / total_bom_parents * 100 if total_bom_parents else 0

        s = PASS if pct_exact >= 50 else WARN
        check(s, f"BOM parents → routing (exact): {matched_routing_exact:,}/{total_bom_parents:,} ({pct_exact:.1f}%) have routing")
        if pct_norm > pct_exact + 1:
            check(WARN, f"  After normalization: {pct_norm:.1f}% match — routing_agg normalization is critical")

    # ── 4. routing_agg normalization effectiveness ────────────────────────────
    print("\n[4] routing_agg normalization (time-display fix)")

    if table_exists("routing_agg"):
        total_agg = conn.execute("SELECT COUNT(*) FROM routing_agg").fetchone()[0]
        has_norm  = conn.execute("SELECT COUNT(*) FROM routing_agg WHERE material_norm IS NOT NULL").fetchone()[0]
        check(PASS if has_norm == total_agg else WARN,
              f"routing_agg: {has_norm:,}/{total_agg:,} rows have material_norm populated")

        # Check that a BOM component can be found via normalized lookup
        sample_bom = conn.execute("""
            SELECT DISTINCT b.component FROM bom b LIMIT 10
        """).fetchall()
        found_via_norm = 0
        for (comp,) in sample_bom:
            r = conn.execute("""
                SELECT COUNT(*) FROM routing_agg
                WHERE material = ? OR material_norm = LTRIM(?, '0')
            """, [comp, comp]).fetchone()
            if r and r[0] > 0:
                found_via_norm += 1
        check(PASS if found_via_norm > 0 else WARN,
              f"routing_agg: {found_via_norm}/{len(sample_bom)} sampled BOM components find routing via normalized lookup")

    # ── 5. Production / scrap data ────────────────────────────────────────────
    print("\n[5] Production / scrap data")

    for tname in ["production_orders", "scrap_records"]:
        if table_exists(tname):
            n = conn.execute(f"SELECT COUNT(*) FROM {tname}").fetchone()[0]
            if n > 0:
                check(PASS, f"{tname}: {n:,} rows loaded")
            else:
                check(WARN, f"{tname}: empty — import a CSV via Data Management to enable scrap features")
        else:
            check(WARN, f"{tname}: table does not exist yet")

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(1 for s, _ in results if s == PASS)
    warned = sum(1 for s, _ in results if s == WARN)
    failed = sum(1 for s, _ in results if s == FAIL)
    print(f"\n{'─'*60}")
    print(f"Summary: {passed} passed, {warned} warnings, {failed} failed\n")

    conn.close()
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
