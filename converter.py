import pandas as pd
import csv
from pathlib import Path

# Paths
bom_path = Path('Bill_of_material_SRP100_1201.txt')
mm_path = Path('Material_Master_SRP100_1201.txt')

# --- Parse BOM ---
# Read as tab-separated, no header
bom_df = pd.read_csv(bom_path, sep='\t', header=None, dtype=str)

# Assign best-known headers from Headers & Filter.xlsx (Bill of Material section)
bom_columns = [
    'Material',        # Parent material
    'Plant',
    'BOM_Number',      # internal / unknown
    'Alternative',
    'Item',
    'Component',
    'ItemCategory',
    'Unit',
    'Quantity',
    'Unused1',
    'Unused2'
]

# Trim or extend columns safely
bom_df = bom_df.iloc[:, :len(bom_columns)]
bom_df.columns = bom_columns

# Assign practical subset of headers (core fields)
mm_columns = [
    'Material',
    'CreatedOn',
    'MaterialType',
    'Industry',
    'Weight',
    'OldMaterial',
    'MaterialGroup',
    'Description',
    'Plant',
    'Status',
    'PlannerGroup',
    'MRPType',
    'MRPController',
]

# --- Parse Material Master ---
# Material master is tab-separated and very wide; some rows have uneven widths.
# Read via csv module and safely trim/pad to required columns.
mm_rows = []
with mm_path.open('r', encoding='utf-8', errors='ignore', newline='') as fh:
    reader = csv.reader(fh, delimiter='\t')
    for row in reader:
        if len(row) < len(mm_columns):
            row = row + [''] * (len(mm_columns) - len(row))
        mm_rows.append(row[:len(mm_columns)])

mm_df = pd.DataFrame(mm_rows, columns=mm_columns)

# Ensure string dtype for consistent downstream parsing.
mm_df = mm_df.astype(str)

# --- Save CSVs ---
bom_csv = 'Bill_of_material_SRP100_1201.csv'
mm_csv = 'Material_Master_SRP100_1201.csv'

bom_df.to_csv(bom_csv, index=False)
mm_df.to_csv(mm_csv, index=False)

(bom_csv, mm_csv, bom_df.head(), mm_df.head())
