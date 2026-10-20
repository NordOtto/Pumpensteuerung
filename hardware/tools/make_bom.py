#!/usr/bin/env python3
"""Gruppierte Stückliste (CSV) direkt aus dem Generator-Design."""
import csv, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import gen_schematic as g

rows = {}
for sheet, p in g.d.parts:
    if p.ref.startswith("#"):
        continue
    key = (p.value, p.fp, p.props.get("MPN", ""))
    rows.setdefault(key, []).append(p.ref)
def natkey(r):
    m = re.match(r"([A-Z#]+)(\d+)", r); return (m.group(1), int(m.group(2)))
out = os.path.join(os.path.dirname(__file__), "..", "bom.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["Menge", "Referenzen", "Wert", "Footprint", "MPN/Hinweis"])
    for (val, fp, mpn), refs in sorted(rows.items(), key=lambda kv: natkey(sorted(kv[1], key=natkey)[0])):
        refs = sorted(set(refs), key=natkey)
        w.writerow([len(refs), " ".join(refs), val, fp.split(":")[-1], mpn])
print(f"{sum(len(set(v)) for v in rows.values())} Bauteile in {len(rows)} Positionen → {os.path.abspath(out)}")
