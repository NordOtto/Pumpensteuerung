#!/usr/bin/env python3
"""Vergleicht die von KiCad exportierte Netzliste mit der vom Generator beabsichtigten."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sexp import parse, find, first
net_file, intended_file = sys.argv[1], sys.argv[2]
root = parse(open(net_file).read())[0]
nets = first(root, 'nets')
got = {}
for n in find(nets, 'net'):
    name = first(n, 'name')[1].lstrip('/')
    name = name.split('/')[-1]
    nodes = {f"{first(x,'ref')[1]}.{first(x,'pin')[1]}" for x in find(n, 'node')}
    got.setdefault(name, set()).update(nodes)
want = {k: {n for n in v if not n.startswith("#")} for k, v in json.load(open(intended_file)).items()}
# KiCad benennt unbenannte Netze "Net-(...)" / "unconnected-(...)"
errors = 0
node2got = {nd: k for k, v in got.items() for nd in v}
for net, nodes in sorted(want.items()):
    gnames = {node2got.get(nd) for nd in nodes}
    if len(gnames) != 1 or None in gnames:
        print(f"FEHLER {net}: aufgeteilt auf {gnames}"); errors += 1; continue
    g = gnames.pop()
    extra = {nd for nd in got[g] if not nd.startswith('#')} - nodes
    if extra:
        print(f"FEHLER {net}: zusätzliche Knoten {sorted(extra)} (KiCad-Netz {g})"); errors += 1
    if g != net and not g.startswith("Net-("):
        print(f"Hinweis {net}: heißt in KiCad {g}")
single = [k for k, v in want.items() if len(v) < 2]
for k in single:
    print(f"WARNUNG Netz mit nur einem Knoten: {k} {sorted(want[k])}")
uncon = [k for k in got if k.startswith('unconnected')]
print(f"{len(want)} Netze geprüft, {errors} Fehler, {len(single)} Ein-Knoten-Netze, {len(uncon)} 'unconnected'-Pins (NC)")
sys.exit(1 if errors else 0)
