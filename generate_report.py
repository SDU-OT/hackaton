import pandas as pd, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

orders = pd.read_excel('Production orders 2025.xlsx')
orders['qty'] = pd.to_numeric(orders['Order quantity (GMEIN)'], errors='coerce')
orders['scrap'] = pd.to_numeric(orders['Confirmed scrap (GMEIN)'], errors='coerce')
scrap = orders.groupby(['Material Number','Material description']).agg(
    Total_Produced=('qty','sum'), Total_Scrap=('scrap','sum')).reset_index()
scrap['Scrap_Rate'] = scrap['Total_Scrap'] / scrap['Total_Produced']
top20 = scrap[scrap['Total_Produced'] > 100].sort_values('Scrap_Rate', ascending=False).head(20).reset_index(drop=True)
top20.index += 1

ingr = pd.read_csv('top20_scrap_ingredients.csv', dtype=str)
ingr['Total_Qty_Per_Unit'] = pd.to_numeric(ingr['Total_Qty_Per_Unit'], errors='coerce')
ingr['Deepest_Level'] = pd.to_numeric(ingr['Deepest_Level'], errors='coerce')

css = """
body { font-family: Arial, sans-serif; margin: 40px; color: #222; background: #f5f5f5; }
h1 { color: #c0392b; border-bottom: 3px solid #c0392b; padding-bottom: 10px; }
h2 { color: #2c3e50; margin-top: 40px; }
h3 { color: #e74c3c; margin: 0 0 6px 0; }
.summary-box { display: flex; gap: 20px; margin: 20px 0; }
.kpi { background: white; border-radius: 8px; padding: 20px 30px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1); flex: 1; }
.kpi .value { font-size: 2em; font-weight: bold; color: #c0392b; }
.kpi .label { font-size: 0.85em; color: #666; margin-top: 4px; }
table { border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.1); margin-bottom: 30px; }
th { background: #2c3e50; color: white; padding: 10px 14px; text-align: left; font-size: 0.9em; }
td { padding: 9px 14px; border-bottom: 1px solid #eee; font-size: 0.88em; }
tr:hover td { background: #fdf6f6; }
.rate-high { color: #c0392b; font-weight: bold; }
.rate-med  { color: #e67e22; font-weight: bold; }
.rate-low  { color: #27ae60; font-weight: bold; }
.card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); border-left: 5px solid #c0392b; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.badge { background: #c0392b; color: white; border-radius: 20px; padding: 3px 12px; font-size: 0.82em; font-weight: bold; }
.badge-warn { background: #e67e22; color: white; border-radius: 20px; padding: 3px 12px; font-size: 0.82em; font-weight: bold; }
.ingr-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.ingr-table th { background: #ecf0f1; color: #2c3e50; padding: 6px 10px; font-size: 0.82em; }
.ingr-table td { padding: 5px 10px; font-size: 0.82em; border-bottom: 1px solid #f0f0f0; }
.no-bom { color: #999; font-style: italic; }
.insight { background: #fff8e1; border-left: 4px solid #f39c12; padding: 14px 18px; border-radius: 4px; margin: 20px 0; font-size: 0.92em; }
.group-title { background: #2c3e50; color: white; padding: 8px 14px; border-radius: 4px; margin: 24px 0 10px 0; font-size: 0.95em; }
.footer { text-align: center; color: #999; font-size: 0.8em; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 16px; }
"""

parts = []
parts.append(f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scrap Analysis Report</title><style>{css}</style></head><body>')
parts.append('<h1>&#9888; Scrap Analysis Report &mdash; Production Orders 2025</h1>')
parts.append('<p style="color:#666">Materials with highest scrap rates (minimum 100 units produced) &bull; Source: Production orders 2025 + Bill of Material SRP100_1201</p>')

# KPIs
total_scrap = top20['Total_Scrap'].sum()
total_produced = top20['Total_Produced'].sum()
avg_rate = total_scrap / total_produced * 100
parts.append('<div class="summary-box">')
for val, lbl in [(len(top20), 'High-Scrap Materials'),
                  (f'{total_scrap:,.0f}', 'Total Units Scrapped'),
                  (f'{total_produced:,.0f}', 'Total Units Produced'),
                  (f'{avg_rate:.1f}%', 'Avg Scrap Rate (top 20)')]:
    parts.append(f'<div class="kpi"><div class="value">{val}</div><div class="label">{lbl}</div></div>')
parts.append('</div>')

parts.append('''<div class="insight">
<strong>Key Findings:</strong> Scrap is concentrated in three part families &mdash;
<strong>Spacers</strong> (up to 34.6% scrap rate), <strong>Shafts</strong> (up to 20.2%),
and <strong>Gear Sets / Spool-Sleeve Sets</strong> (7&ndash;17%).
All high-scrap parts are machined from steel blanks or round bar stock, suggesting the root cause lies in
<strong>machining and grinding operations</strong>. The #1 material (SPACER OMV) alone accounts for 2,115 scrapped units.
</div>''')

# Summary table
parts.append('<h2>Top 20 Scrap Rate Summary</h2>')
parts.append('<table><tr><th>#</th><th>Material Number</th><th>Description</th><th>Produced</th><th>Scrapped</th><th>Scrap Rate</th></tr>')
for i, row in top20.iterrows():
    rate = row['Scrap_Rate']
    rc = 'rate-high' if rate > 0.15 else ('rate-med' if rate > 0.08 else 'rate-low')
    parts.append(f'<tr><td>{i}</td><td><code>{row["Material Number"]}</code></td><td>{row["Material description"]}</td>'
                 f'<td>{row["Total_Produced"]:,.0f}</td><td>{row["Total_Scrap"]:,.0f}</td>'
                 f'<td class="{rc}">{rate*100:.1f}%</td></tr>')
parts.append('</table>')

# Ingredient cards grouped
parts.append('<h2>Bill of Materials &mdash; Ingredient Breakdown</h2>')
parts.append('<p style="color:#666;font-size:0.9em">All sub-components required to produce each high-scrap material, traced to raw material level.</p>')

groups = {
    'Spacers':           ['151B1391','151B1924'],
    'Shafts':            ['151B1634','11057089','11057079','11057087','151B1493','151B1951','151B1347','151F6405'],
    'Gear Sets':         ['150-4197','150-4192','150-4142','150-4243','150-4196','11231877'],
    'Spool / Sleeve Sets': ['150N7465','11273127','150G1316','11091248'],
}

for group_name, mats in groups.items():
    parts.append(f'<div class="group-title">&#9654; {group_name}</div>')
    for i, row in top20.iterrows():
        mat = row['Material Number']
        if mat not in mats:
            continue
        rate = row['Scrap_Rate']
        badge = 'badge' if rate > 0.15 else 'badge-warn'
        parts.append(f'''<div class="card">
<div class="card-header">
  <div><h3>#{i} &nbsp; {row["Material description"]}</h3>
  <code style="color:#666;font-size:0.85em">{mat}</code></div>
  <div style="text-align:right">
    <span class="{badge}">{rate*100:.1f}% scrap</span><br>
    <span style="font-size:0.8em;color:#999">{row["Total_Scrap"]:,.0f} scrapped / {row["Total_Produced"]:,.0f} produced</span>
  </div>
</div>''')

        mat_ingr = ingr[ingr['Top_Material'] == mat].sort_values('Deepest_Level')
        if mat_ingr.empty:
            parts.append('<p class="no-bom">&#9888; No BOM entries found for this material.</p>')
        else:
            parts.append('<table class="ingr-table"><tr><th>Level</th><th>Component</th><th>Description</th><th>MRP</th><th>Qty / Unit</th></tr>')
            for _, r in mat_ingr.iterrows():
                lvl = int(r['Deepest_Level'])
                indent = '&nbsp;' * (lvl * 6)
                arrow = '&#8627; ' if lvl > 0 else ''
                desc = str(r['Component_Desc']) if pd.notna(r['Component_Desc']) else '-'
                mrp  = str(r['Component_MRP'])  if pd.notna(r['Component_MRP'])  else '-'
                qty  = r['Total_Qty_Per_Unit']
                parts.append(f'<tr><td>L{lvl}</td><td>{indent}{arrow}<code>{r["Component"]}</code></td>'
                              f'<td>{desc}</td><td>{mrp}</td><td>{qty:.3f}</td></tr>')
            parts.append('</table>')
        parts.append('</div>')

parts.append('<div class="footer">Generated from Production Orders 2025 &bull; Bill of Material SRP100_1201 &bull; Danfoss Power Solutions</div>')
parts.append('</body></html>')

with open('scrap_analysis_report.html', 'w', encoding='utf-8') as f:
    f.write('\n'.join(parts))

print('Saved scrap_analysis_report.html')
