#!/usr/bin/env python3
"""Einfache elektrische Regelprüfung (KiCad-7-CLI hat kein ERC).

Prüft je Netz: power_in braucht power_out/PWR_FLAG; keine zwei Treiber (output/power_out);
Eingänge ohne Treiber werden gemeldet (Hinweis).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import gen_schematic as g  # baut das Design im Speicher auf
from libs import pins as sym_pins
from schgen import resolve_symbol

types = {}
for sheet, part in g.d.parts:
    sym = resolve_symbol(part.libid)
    for p in sym_pins(sym):
        types[(part.ref, p["number"])] = p["type"]
probs = 0
for net, nodes in sorted(g.d.net_nodes.items()):
    t = [types[n] for n in nodes]
    drivers = [n for n in nodes if types[n] in ("output", "power_out")]
    pin_in = [n for n in nodes if types[n] == "power_in"]
    if pin_in and not any(types[n] == "power_out" for n in nodes):
        print(f"ERC: {net}: power_in ohne Quelle {sorted(pin_in)[:4]}"); probs += 1
    outs = [n for n in nodes if types[n] == "output"]
    pouts = [n for n in nodes if types[n] == "power_out" and not n[0].startswith("#")]
    if len(outs) + len(pouts) > 1:
        print(f"ERC: {net}: mehrere Treiber {sorted(outs + pouts)}"); probs += 1
    if all(x in ("input",) for x in t):
        print(f"Hinweis: {net}: nur Eingänge {sorted(nodes)}")
print(f"Mini-ERC: {probs} Probleme")
