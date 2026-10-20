"""Kleiner KiCad-7-Schaltplan-Generator (label-basiert).

Jedes Bauteil wird platziert, an jedes Pin-Ende kommt ein kurzer Draht und
ein Netz-Label (lokal oder global) bzw. ein No-Connect-Flag. Dadurch ist die
Konnektivität eindeutig und per Netzliste prüfbar.
"""
from __future__ import annotations

import copy
import os
import uuid as _uuid
from collections import defaultdict

from libs import get_symbol, pins as sym_pins
from sexp import Sym, dump, find, first

S = Sym
FP_DIR = "/usr/share/kicad/footprints"
PROJECT = "pumpensteuerung"
GRID = 2.54
STUB = 2.54


def uid():
    return str(_uuid.uuid4())


def snap(v, g=GRID):
    return round(round(v / g) * g, 4)


class Custom:
    """Registry für projekteigene Symbole (lib 'PumpCtrl')."""
    symbols: dict[str, list] = {}


def make_conn_symbol(name, pinmap, ptype, ref="J", value=None, fp=""):
    """Rechteck-Symbol mit nummerierten Pins: ungerade links, gerade rechts.

    pinmap: {nummer(int): pinname}, ptype: {nummer: elektrischer Typ}
    """
    n = max(pinmap)
    rows = (n + 1) // 2
    w = 30.48
    top = rows / 2 * GRID
    top = snap(top)
    body = [S("symbol"), f"{name}_0_1",
            [S("rectangle"), [S("start"), -w / 2, top + GRID],
             [S("end"), w / 2, top - rows * GRID],
             [S("stroke"), [S("width"), 0.254], [S("type"), S("default")]],
             [S("fill"), [S("type"), S("background")]]]]
    pins = [S("symbol"), f"{name}_1_1"]
    for num in range(1, n + 1):
        row = (num - 1) // 2
        y = top - row * GRID
        if num % 2:
            x, ang = -w / 2 - 5.08, 0
        else:
            x, ang = w / 2 + 5.08, 180
        pins.append([S("pin"), S(ptype.get(num, "bidirectional")), S("line"),
                     [S("at"), x, y, ang], [S("length"), 5.08],
                     [S("name"), pinmap[num], [S("effects"), [S("font"), [S("size"), 1.0, 1.0]]]],
                     [S("number"), str(num), [S("effects"), [S("font"), [S("size"), 1.0, 1.0]]]]])
    sym = [S("symbol"), f"PumpCtrl:{name}", [S("pin_names"), [S("offset"), 1.016]],
           [S("in_bom"), S("yes")], [S("on_board"), S("yes")],
           _prop("Reference", ref, 0, top + 3.81),
           _prop("Value", value or name, 0, top - rows * GRID - 1.27),
           _prop("Footprint", fp, 0, 0, hide=True),
           _prop("Datasheet", "", 0, 0, hide=True),
           body, pins]
    Custom.symbols[f"PumpCtrl:{name}"] = sym
    return f"PumpCtrl:{name}"


def _prop(k, v, x, y, hide=False, ang=0, justify=None):
    eff = [S("effects"), [S("font"), [S("size"), 1.27, 1.27]]]
    if justify:
        eff.append([S("justify"), *[S(j) for j in justify]])
    if hide:
        eff.append(S("hide"))
    return [S("property"), k, v, [S("at"), x, y, ang], eff]


def resolve_symbol(libid):
    if libid in Custom.symbols:
        return copy.deepcopy(Custom.symbols[libid])
    return get_symbol(libid)


def check_fp(fp):
    if not fp or fp.startswith("PumpCtrl:"):
        return
    lib, name = fp.split(":", 1)
    path = f"{FP_DIR}/{lib}.pretty/{name}.kicad_mod"
    if not os.path.exists(path):
        raise FileNotFoundError(f"Footprint fehlt: {fp}")


class Part:
    def __init__(self, ref, libid, value, fp, unit_nets, props, dnp=False):
        self.ref, self.libid, self.value, self.fp = ref, libid, value, fp
        self.unit_nets = unit_nets  # {unit: {pin_number: net|None}}
        self.props = props
        self.dnp = dnp


class Sheet:
    def __init__(self, design, name, filename, title, page, width=420.0, height=297.0, paper="A3"):
        self.d, self.name, self.filename, self.title, self.page = design, name, filename, title, page
        self.width, self.height, self.paper = width, height, paper
        self.uuid = uid()
        self.items: list = []           # schematic s-exprs
        self.used_libs: set[str] = set()
        self.groups: list = []           # (title, [placements])
        self.cur = None
        self.label_jobs = []             # (x, y, angle, net) — erst später global/lokal entscheidbar
        self.sheet_uuid_in_root = uid()

    # ── Aufbau ────────────────────────────────────────────────
    def group(self, title):
        self.cur = (title, [])
        self.groups.append(self.cur)
        return self

    def add(self, prefix, libid, value, fp="", nets=None, units=None, nc=(), nc_rest=False,
            props=None, dnp=False, ref=None):
        """nets: {pin: net} für Einheit 1; units: {unit: {pin: net}} für Mehrteiler."""
        check_fp(fp)
        sym = resolve_symbol(libid)
        allpins = sym_pins(sym)
        if units is None:
            units = {1: dict(nets or {})}
        unit_nets = {}
        for u, m in units.items():
            upins = [p for p in allpins if p["unit"] in (u, 0)]
            nums = {p["number"] for p in upins}
            mm = {}
            for k, v in m.items():
                k = str(k)
                if k not in nums:
                    raise KeyError(f"{libid}: Pin {k} gibt es nicht (Einheit {u})")
                mm[k] = v
            for k in nc:
                if str(k) in nums:
                    mm[str(k)] = None
            missing = [p["number"] for p in upins if p["number"] not in mm]
            if missing:
                if nc_rest:
                    for k in missing:
                        mm[k] = None
                else:
                    raise KeyError(f"{libid} ({prefix}): Pins ohne Netz: {missing}")
            unit_nets[u] = mm
        ref = ref or self.d.next_ref(prefix)
        part = Part(ref, libid, value, fp, unit_nets, props or {}, dnp)
        for u in unit_nets:
            self.cur[1].append((part, u, sym))
        self.d.parts.append((self, part))
        return ref

    # ── Layout & Ausgabe ──────────────────────────────────────
    @staticmethod
    def _rot(sym, unit):
        ps = [p for p in sym_pins(sym) if p["unit"] in (unit, 0)]
        if len(ps) == 2 and all(int(p["angle"]) % 180 == 90 for p in ps):
            return 90
        return 0

    def _pins(self, sym, unit):
        rot = self._rot(sym, unit)
        out = []
        for p in sym_pins(sym):
            if p["unit"] not in (unit, 0):
                continue
            q = dict(p)
            if rot == 90:  # gegen den Uhrzeigersinn (Symbolkoordinaten, y nach oben)
                q["x"], q["y"] = -p["y"], p["x"]
                q["angle"] = (p["angle"] + 90) % 360
            out.append(q)
        return out

    def _bbox(self, sym, unit):
        ps = self._pins(sym, unit)
        xs = [p["x"] for p in ps] or [0]
        ys = [p["y"] for p in ps] or [0]
        return min(xs), max(xs), min(ys), max(ys)

    PAPERS = [("A3", 420.0, 297.0), ("A2", 594.0, 420.0), ("A1", 841.0, 594.0)]

    def layout(self):
        snapshot = list(self.items)
        for paper, w, h in self.PAPERS:
            if w < self.width:
                continue
            self.items = list(snapshot)
            self.paper, self.width, self.height = paper, w, h
            self.d.rollback(self)
            try:
                return self._layout()
            except OverflowError:
                continue
        raise RuntimeError(f"Blatt {self.name} passt auf kein Papierformat")

    def _layout(self):
        x0, y = 20.32, 30.48
        right = self.width - 20.32
        for title, places in self.groups:
            # Gruppenüberschrift
            self.items.append([S("text"), title, [S("at"), x0, y, 0],
                               [S("effects"), [S("font"), [S("size"), 2.54, 2.54], S("bold")],
                                [S("justify"), S("left"), S("bottom")]], [S("uuid"), uid()]])
            y += 7.62
            x = x0
            row_h = 0
            for part, unit, sym in places:
                xmin, xmax, ymin, ymax = self._bbox(sym, unit)
                lab = self._label_room(part, unit, sym)
                wl, wr = lab["left"], lab["right"]
                hu, hd = lab["up"], lab["down"]
                w = (xmax - xmin) + wl + wr + 10.16
                h = (ymax - ymin) + hu + hd + 12.7
                if x + w > right and x > x0:
                    x = x0
                    y += row_h
                    row_h = 0
                sx = snap(x + wl - xmin + 5.08)
                sy = snap(y + hu + ymax + 5.08)
                self._place(part, unit, sym, sx, sy)
                x += w
                row_h = max(row_h, h)
            y += row_h + 5.08
        if y > self.height - 20:
            raise OverflowError(self.name)

    def _label_room(self, part, unit, sym):
        room = dict(left=0.0, right=0.0, up=0.0, down=0.0)
        for p in self._pins(sym, unit):
            net = part.unit_nets[unit].get(p["number"])
            ln = STUB + (len(net) * 1.27 + 5.08 if net else 1.27)
            a = int(p["angle"]) % 360
            key = {0: "left", 180: "right", 90: "down", 270: "up"}[a]
            room[key] = max(room[key], ln)
        return room

    def _place(self, part, unit, sym, sx, sy):
        self.used_libs.add(part.libid)
        ps = self._pins(sym, unit)
        rot = self._rot(sym, unit)
        xmin, xmax, ymin, ymax = self._bbox(sym, unit)
        props = [
            _prop("Reference", part.ref, sx, sy - max(ymax, 1.27) - 2.54, ang=rot),
            _prop("Value", part.value, sx, sy - min(ymin, -1.27) + 2.54, ang=rot),
            _prop("Footprint", part.fp, sx, sy, hide=True),
            _prop("Datasheet", "", sx, sy, hide=True),
        ]
        for k, v in part.props.items():
            props.append(_prop(k, v, sx, sy, hide=True))
        pin_entries = [[S("pin"), p["number"], [S("uuid"), uid()]] for p in ps]
        self.items.append([S("symbol"), [S("lib_id"), part.libid], [S("at"), sx, sy, rot], [S("unit"), unit],
                           [S("in_bom"), S("yes")], [S("on_board"), S("yes")],
                           [S("dnp"), S("yes" if part.dnp else "no")],
                           [S("uuid"), uid()], *props, *pin_entries,
                           [S("instances"), [S("project"), PROJECT,
                                             [S("path"), f"/{self.d.root_uuid}/{self.sheet_uuid_in_root}",
                                              [S("reference"), part.ref], [S("unit"), unit]]]]])
        for p in ps:
            px, py = round(sx + p["x"], 4), round(sy - p["y"], 4)
            net = part.unit_nets[unit][p["number"]]
            if net is None:
                self.items.append([S("no_connect"), [S("at"), px, py], [S("uuid"), uid()]])
                continue
            a = int(p["angle"]) % 360
            dx, dy = {0: (-STUB, 0), 180: (STUB, 0), 90: (0, STUB), 270: (0, -STUB)}[a]
            ex, ey = round(px + dx, 4), round(py + dy, 4)
            self.items.append([S("wire"), [S("pts"), [S("xy"), px, py], [S("xy"), ex, ey]],
                               [S("stroke"), [S("width"), 0], [S("type"), S("default")]],
                               [S("uuid"), uid()]])
            lang = {0: 180, 180: 0, 90: 270, 270: 90}[a]
            self.label_jobs.append((ex, ey, lang, net))
            self.d.net_nodes[net].add((part.ref, p["number"]))
            self.d.net_sheets[net].add(self.name)

    def emit_labels(self):
        for x, y, ang, net in self.label_jobs:
            just = [S("left")] if ang in (0, 90) else [S("right")]
            if self.d.is_global(net):
                self.items.append([S("global_label"), net, [S("shape"), S("passive")], [S("at"), x, y, ang],
                                   [S("fields_autoplaced")],
                                   [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), *just]],
                                   [S("uuid"), uid()],
                                   [S("property"), "Intersheetrefs", "${INTERSHEET_REFS}", [S("at"), x, y, 0],
                                    [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], S("hide")]]])
            else:
                self.items.append([S("label"), net, [S("at"), x, y, ang], [S("fields_autoplaced")],
                                   [S("effects"), [S("font"), [S("size"), 1.27, 1.27]],
                                    [S("justify"), *just, S("bottom")]],
                                   [S("uuid"), uid()]])

    def note(self, text, x, y, size=1.5):
        self.items.append([S("text"), text, [S("at"), x, y, 0],
                           [S("effects"), [S("font"), [S("size"), size, size]], [S("justify"), S("left"), S("top")]],
                           [S("uuid"), uid()]])

    def sexpr(self, is_root=False, extra=()):
        libs = [S("lib_symbols")] + [resolve_symbol(l) for l in sorted(self.used_libs)]
        tb = [S("title_block"), [S("title"), self.title], [S("date"), self.d.date],
              [S("rev"), self.d.rev], [S("company"), self.d.company],
              [S("comment"), 1, "Erzeugt mit hardware/tools/gen_schematic.py — Änderungen bitte dort"]]
        out = [S("kicad_sch"), [S("version"), 20230121], [S("generator"), S("eeschema")],
               [S("uuid"), self.d.root_uuid if is_root else self.uuid], [S("paper"), self.paper], tb, libs]
        out += self.items
        out += list(extra)
        return out


class Design:
    def __init__(self, date, rev, company):
        self.date, self.rev, self.company = date, rev, company
        self.root_uuid = uid()
        self.sheets: list[Sheet] = []
        self.parts = []
        self.refcount = defaultdict(int)
        self.net_nodes = defaultdict(set)
        self.net_sheets = defaultdict(set)
        self.force_global: set[str] = set()

    def sheet(self, name, filename, title, **kw):
        s = Sheet(self, name, filename, title, page=str(len(self.sheets) + 2), **kw)
        self.sheets.append(s)
        return s

    def rollback(self, sheet):
        """Netz-Knoten dieses Blatts vor erneutem Layout entfernen."""
        sheet.label_jobs = []
        sheet.used_libs = set()
        refs = {p.ref for s, p in self.parts if s is sheet}
        for net in list(self.net_nodes):
            self.net_nodes[net] = {n for n in self.net_nodes[net] if n[0] not in refs}
            if not self.net_nodes[net]:
                del self.net_nodes[net]
        for net in list(self.net_sheets):
            if not any(r for r, _ in self.net_nodes.get(net, ())) and sheet.name in self.net_sheets[net]:
                pass
        # Blatt-Zugehörigkeit neu aufbauen
        self.net_sheets = defaultdict(set)
        ref_sheet = {p.ref: s.name for s, p in self.parts}
        for net, nodes in self.net_nodes.items():
            for r, _ in nodes:
                self.net_sheets[net].add(ref_sheet[r])

    def next_ref(self, prefix):
        self.refcount[prefix] += 1
        return f"{prefix}{self.refcount[prefix]}"

    def is_global(self, net):
        return net in self.force_global or len(self.net_sheets[net]) > 1 or net.startswith("+") or net.startswith("GND")

    def write(self, outdir, root_notes=()):
        os.makedirs(outdir, exist_ok=True)
        for s in self.sheets:
            s.layout()
        for s in self.sheets:
            s.emit_labels()
        # Root
        root = Sheet(self, "Root", f"{PROJECT}.kicad_sch", "Pumpensteuerung — AIO-Steuerplatine (Übersicht)", "1")
        blocks = []
        x, y = 25.4, 40.64
        for i, s in enumerate(self.sheets):
            w, h = 60.96, 25.4
            blocks.append([S("sheet"), [S("at"), x, y], [S("size"), w, h], [S("fields_autoplaced")],
                           [S("stroke"), [S("width"), 0.1524], [S("type"), S("solid")]],
                           [S("fill"), [S("color"), 0, 0, 0, 0.0]],
                           [S("uuid"), s.sheet_uuid_in_root],
                           [S("property"), "Sheetname", s.name, [S("at"), x, y - 0.7116, 0],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), S("left"), S("bottom")]]],
                           [S("property"), "Sheetfile", s.filename, [S("at"), x, y + h + 0.5846, 0],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), S("left"), S("top")]]],
                           [S("instances"), [S("project"), PROJECT, [S("path"), f"/{self.root_uuid}", [S("page"), s.page]]]]])
            x += 76.2
            if x > 330:
                x, y = 25.4, y + 45.72
        for t, (nx, ny) in root_notes:
            root.note(t, nx, ny)
        root_s = root.sexpr(is_root=True, extra=blocks + [[S("sheet_instances"), [S("path"), "/", [S("page"), "1"]]]])
        with open(os.path.join(outdir, f"{PROJECT}.kicad_sch"), "w") as f:
            f.write(dump(root_s) + "\n")
        for s in self.sheets:
            with open(os.path.join(outdir, s.filename), "w") as f:
                f.write(dump(s.sexpr()) + "\n")
        # Custom-Symbol-Bibliothek
        os.makedirs(os.path.join(outdir, "lib"), exist_ok=True)
        lib = [S("kicad_symbol_lib"), [S("version"), 20220914], [S("generator"), S("kicad_symbol_editor")]]
        for k, v in Custom.symbols.items():
            v = copy.deepcopy(v)
            v[1] = k.split(":")[1]
            lib.append(v)
        with open(os.path.join(outdir, "lib", "PumpCtrl.kicad_sym"), "w") as f:
            f.write(dump(lib) + "\n")
        with open(os.path.join(outdir, "sym-lib-table"), "w") as f:
            f.write('(sym_lib_table\n  (lib (name "PumpCtrl")(type "KiCad")(uri "${KIPRJMOD}/lib/PumpCtrl.kicad_sym")(options "")(descr "Projektsymbole"))\n)\n')
        with open(os.path.join(outdir, "fp-lib-table"), "w") as f:
            f.write('(fp_lib_table\n  (lib (name "PumpCtrl")(type "KiCad")(uri "${KIPRJMOD}/lib/PumpCtrl.pretty")(options "")(descr "Projekt-Footprints"))\n)\n')
        os.makedirs(os.path.join(outdir, "lib", "PumpCtrl.pretty"), exist_ok=True)
        import json
        pro = {"meta": {"filename": f"{PROJECT}.kicad_pro", "version": 1},
               "sheets": [[self.root_uuid, "Root"]] + [[s.sheet_uuid_in_root, s.name] for s in self.sheets],
               "schematic": {"legacy_lib_dir": "", "legacy_lib_list": []},
               "boards": [], "libraries": {"pinned_footprint_libs": [], "pinned_symbol_libs": []}}
        with open(os.path.join(outdir, f"{PROJECT}.kicad_pro"), "w") as f:
            json.dump(pro, f, indent=2)

    def intended_netlist(self):
        return {n: set(v) for n, v in self.net_nodes.items()}
