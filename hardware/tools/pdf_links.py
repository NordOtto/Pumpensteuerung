#!/usr/bin/env python3
"""Fügt dem Schaltplan-PDF Sprungmarken hinzu.

Klick auf ein Power-Symbol (+5V, +3V3 …) oder ein Label → Sprung zu der Stelle, an der das
Netz entsteht (Spannungsregler, Netzteil, treibender Pin) bzw. zur Gegenseite des Signals
auf dem anderen Blatt. Die Quelle ist im PDF mit einem orangen Rahmen markiert.

Aufruf:  python3 pdf_links.py <schaltplan.pdf> [link_map.json]
Benötigt: pypdf  (pip install pypdf)
"""
import json
import os
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject,
                           TextStringObject)

K = 72 / 25.4
DRIVERS = ("output", "power_out", "open_collector", "tri_state")
CONTROLLERS = ("RF_Module:ESP32-S3-WROOM-1", "PumpCtrl:Stamp_P4")


def main(pdf_path, map_path):
    lm = json.load(open(map_path))
    sheets = lm["sheets"]
    sources = lm["sources"]
    pin_at = {}                       # "Ref.Pin" → (sheet_idx, pin)
    for si, sh in enumerate(sheets):
        for key, p in sh["pins"].items():
            pin_at[key] = (si, p)
    occ = {}                          # net → [(sheet_idx, item)]
    for si, sh in enumerate(sheets):
        for it in sh["items"]:
            occ.setdefault(it["net"], []).append((si, it))
    pins_by_net = {}
    for key, (si, p) in pin_at.items():
        if p["net"]:
            pins_by_net.setdefault(p["net"], []).append((si, key, p))

    def ref_of(key):
        return key.split(".")[0]

    def target(net, si, it):
        """→ (sheet_idx, x, y, beschreibung) oder None"""
        if net in sources:
            key = f"{sources[net][0]}.{sources[net][1]}"
            if key in pin_at:
                tsi, p = pin_at[key]
                if tsi == si and p["box"] == it["box"]:
                    return None
                return tsi, p["pt"][0], p["pt"][1], f"Quelle {ref_of(key)}"
        cands = pins_by_net.get(net, [])
        drv = [c for c in cands if c[2]["type"] in DRIVERS]
        if len(drv) == 1:
            tsi, key, p = drv[0]
            if not (tsi == si and p["box"] == it["box"]):
                return tsi, p["pt"][0], p["pt"][1], f"Quelle {ref_of(key)}"
        others = [(osi, o) for osi, o in occ.get(net, []) if osi != si]
        if others:
            osheets = sorted({osi for osi, _ in others})
            pick = osheets[0]
            if len(osheets) > 1:
                ctrl = [c for c in cands if c[2]["lib"] in CONTROLLERS and c[0] != si]
                if ctrl:
                    pick = ctrl[0][0]
            osi, o = next((x for x in others if x[0] == pick))
            b = o["bbox"]
            return osi, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, "Gegenseite"
        same = [o for osi, o in occ.get(net, []) if osi == si and o["box"] != it["box"]]
        if same:
            b = same[0]["bbox"]
            return si, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, "anderer Block"
        return None

    reader = PdfReader(pdf_path)
    writer = PdfWriter()
    writer.append(reader)
    pages = writer.pages
    n_links = 0
    marked = set()
    for si, sh in enumerate(sheets):
        page_idx = sh["page"] - 1
        page = pages[page_idx]
        H = float(page.mediabox.height)
        annots = page.get("/Annots") or ArrayObject()
        for it in sh["items"]:
            t = target(it["net"], si, it)
            if not t:
                continue
            tsi, tx, ty, why = t
            tpage = pages[sheets[tsi]["page"] - 1]
            tH = float(tpage.mediabox.height)
            x0, y0, x1, y1 = it["bbox"]
            pad = 0.6
            rect = [FloatObject((x0 - pad) * K), FloatObject(H - (y1 + pad) * K),
                    FloatObject((x1 + pad) * K), FloatObject(H - (y0 - pad) * K)]
            dest = ArrayObject([tpage.indirect_reference, NameObject("/XYZ"),
                                FloatObject(max(0, (tx - 70) * K)), FloatObject(tH - max(0, ty - 45) * K),
                                FloatObject(2.0)])
            link = DictionaryObject({
                NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Link"),
                NameObject("/Rect"): ArrayObject(rect), NameObject("/Border"): ArrayObject(
                    [NumberObject(0), NumberObject(0), NumberObject(0)]),
                NameObject("/Dest"): dest,
                NameObject("/Contents"): TextStringObject(
                    f"{it['net']} → {why}, Blatt {sheets[tsi]['name']} (S. {sheets[tsi]['page']})"),
            })
            annots.append(writer._add_object(link))
            n_links += 1
            # Ziel einmalig orange markieren
            if (tsi, round(tx, 2), round(ty, 2)) not in marked and why.startswith("Quelle"):
                marked.add((tsi, round(tx, 2), round(ty, 2)))
                tannots = tpage.get("/Annots") if tsi != si else annots
                if tannots is None:
                    tannots = ArrayObject()
                    tpage[NameObject("/Annots")] = tannots
                r = 3.0
                sq = DictionaryObject({
                    NameObject("/Type"): NameObject("/Annot"), NameObject("/Subtype"): NameObject("/Square"),
                    NameObject("/Rect"): ArrayObject([FloatObject((tx - r) * K), FloatObject(tH - (ty + r) * K),
                                                      FloatObject((tx + r) * K), FloatObject(tH - (ty - r) * K)]),
                    NameObject("/C"): ArrayObject([FloatObject(1), FloatObject(0.45), FloatObject(0)]),
                    NameObject("/BS"): DictionaryObject({NameObject("/W"): FloatObject(1.5)}),
                    NameObject("/F"): NumberObject(4),
                    NameObject("/Contents"): TextStringObject(f"Quelle {it['net']}"),
                })
                tannots.append(writer._add_object(sq))
        page[NameObject("/Annots")] = annots
    with open(pdf_path, "wb") as f:
        writer.write(f)
    print(f"{n_links} Sprungmarken, {len(marked)} Quellen markiert → {pdf_path}")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "link_map.json"))
