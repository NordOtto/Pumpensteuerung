"""Schaltplan-Generator im Block-Stil (Referenz: pool_ui/hardware/pool-pcb).

Stilregeln
  * Jede Funktion steht in einem blau gestrichelten Block mit fettem Titel darüber,
    Erläuterungen als Notiz direkt unter dem Block.
  * Bauteile sind mit echten Drähten verbunden (Signalfluss links → rechts).
  * Versorgung über Power-Symbole (+24V, +5V, +3V3, GND …) direkt am Pin.
  * Global-Labels nur für Signale, die das Blatt verlassen; lokale Labels nur,
    wenn ein Draht quer über das Blatt laufen müsste.

Arbeitsweise
  * Jedes Bauteil deklariert für jeden Pin sein Netz (Absicht).
  * Ein kleiner Router zieht Drähte (L-/Z-Form) zwischen den Pins eines Netzes und
    meidet Bauteilkörper, fremde Pins und fremde Drähte. Wo das nicht geht,
    fällt er auf lokale Labels zurück.
  * check_netlist.py vergleicht danach die KiCad-Netzliste (aus der Geometrie)
    mit der Absicht → jeder Zeichenfehler fällt auf.
"""
from __future__ import annotations

import copy
import json
import math
import os
import uuid as _uuid
from collections import defaultdict

from libs import get_symbol, pins as sym_pins
from sexp import Sym, dump, find, first

S = Sym
FP_DIR = "/usr/share/kicad/footprints"
PROJECT = "pumpensteuerung"
G = 1.27
POWER_NETS = {"GND": "power:GND", "+3V3": "power:+3V3", "+5V": "power:+5V", "+12V": "power:+12V",
              "+24V": "power:+24V", "GND_ISO": "PumpCtrl:GND_ISO", "VISO": "PumpCtrl:VISO",
              "ETH_AVDD": "PumpCtrl:ETH_AVDD"}
UP_SYMS = {"+3V3", "+5V", "+12V", "+24V", "VISO", "ETH_AVDD"}


def uid():
    return str(_uuid.uuid4())


def sn(v):
    return round(round(v / G) * G, 3)


def P(x, y):
    return (sn(x), sn(y))


# ── Projektsymbole ────────────────────────────────────────────
class Custom:
    symbols: dict[str, list] = {}


def _prop(k, v, x, y, hide=False, ang=0, justify=None, size=1.27):
    eff = [S("effects"), [S("font"), [S("size"), size, size]]]
    if justify:
        eff.append([S("justify"), *[S(j) for j in justify]])
    if hide:
        eff.append(S("hide"))
    return [S("property"), k, v, [S("at"), x, y, ang], eff]


def make_conn_symbol(name, pinmap, ptype, ref="J", value=None, fp="", left=None, right=None, width=30.48):
    """Rechteck-Symbol. left/right: Listen von Pin-Nummern (None = Lücke); sonst ungerade links, gerade rechts."""
    if left is None:
        nums = sorted(pinmap)
        left = [n for n in nums if n % 2]
        right = [n for n in nums if not n % 2]
    rows = max(len(left), len(right))
    top = sn(rows / 2 * 2.54)
    w = width
    body = [S("symbol"), f"{name}_0_1",
            [S("rectangle"), [S("start"), -w / 2, top + 2.54], [S("end"), w / 2, top - rows * 2.54],
             [S("stroke"), [S("width"), 0.254], [S("type"), S("default")]], [S("fill"), [S("type"), S("background")]]]]
    pins = [S("symbol"), f"{name}_1_1"]
    for side, lst in (("L", left), ("R", right)):
        for row, num in enumerate(lst):
            if num is None:
                continue
            y = top - row * 2.54
            x, ang = (-w / 2 - 5.08, 0) if side == "L" else (w / 2 + 5.08, 180)
            pins.append([S("pin"), S(ptype.get(num, "passive")), S("line"), [S("at"), x, y, ang], [S("length"), 5.08],
                         [S("name"), pinmap[num], [S("effects"), [S("font"), [S("size"), 1.0, 1.0]]]],
                         [S("number"), str(num), [S("effects"), [S("font"), [S("size"), 1.0, 1.0]]]]])
    sym = [S("symbol"), f"PumpCtrl:{name}", [S("pin_names"), [S("offset"), 1.016]],
           [S("in_bom"), S("yes")], [S("on_board"), S("yes")],
           _prop("Reference", ref, 0, top + 3.81), _prop("Value", value or name, 0, top - rows * 2.54 - 1.27),
           _prop("Footprint", fp, 0, 0, hide=True), _prop("Datasheet", "", 0, 0, hide=True), body, pins]
    Custom.symbols[f"PumpCtrl:{name}"] = sym
    return f"PumpCtrl:{name}"


def make_power_symbol(name, base):
    """Eigenes Power-Symbol: Netzname = Pin-Name (KiCad 7)."""
    sym = copy.deepcopy(get_symbol(base))
    old = base.split(":")[1]
    sym[1] = f"PumpCtrl:{name}"
    for x in sym:
        if isinstance(x, list) and x and x[0] == "property" and x[1] == "Value":
            x[2] = name
        if isinstance(x, list) and x and x[0] == "symbol":
            x[1] = x[1].replace(old, name, 1)
            for pn in find(x, "pin"):
                nm = first(pn, "name")
                if nm:
                    nm[1] = name
    Custom.symbols[f"PumpCtrl:{name}"] = sym


make_power_symbol("GND_ISO", "power:GNDPWR")
make_power_symbol("VISO", "power:VDD")
make_power_symbol("ETH_AVDD", "power:+3.3VA")


def resolve_symbol(libid):
    if libid in Custom.symbols:
        return copy.deepcopy(Custom.symbols[libid])
    return get_symbol(libid)


def check_fp(fp):
    if not fp or fp.startswith("PumpCtrl:"):
        return
    lib, name = fp.split(":", 1)
    if not os.path.exists(f"{FP_DIR}/{lib}.pretty/{name}.kicad_mod"):
        raise FileNotFoundError(f"Footprint fehlt: {fp}")


def _rot(x, y, r):
    r %= 360
    if r == 0:
        return x, y
    if r == 90:
        return -y, x
    if r == 180:
        return -x, -y
    return y, -x


def _body_bbox(sym, unit):
    xs, ys = [], []
    for sub in find(sym, "symbol"):
        u = int(sub[1].rsplit("_", 2)[-2])
        if u not in (0, unit):
            continue
        for g in sub[2:]:
            if not isinstance(g, list):
                continue
            if g[0] == "rectangle":
                for k in ("start", "end"):
                    e = first(g, k)
                    xs.append(float(e[1])); ys.append(float(e[2]))
            elif g[0] == "polyline":
                for p in first(g, "pts")[1:]:
                    xs.append(float(p[1])); ys.append(float(p[2]))
            elif g[0] == "circle":
                c = first(g, "center"); r = float(first(g, "radius")[1])
                xs += [float(c[1]) - r, float(c[1]) + r]; ys += [float(c[2]) - r, float(c[2]) + r]
            elif g[0] == "arc":
                for k in ("start", "mid", "end"):
                    e = first(g, k)
                    xs.append(float(e[1])); ys.append(float(e[2]))
    if not xs:
        return (-1.27, 1.27, -1.27, 1.27)
    return min(xs), max(xs), min(ys), max(ys)


# ── Datenstrukturen ───────────────────────────────────────────
class Pin:
    def __init__(self, part, num, name, x, y, out, ptype, unit):
        self.part, self.num, self.name, self.x, self.y, self.out, self.ptype, self.unit = \
            part, num, name, x, y, out, ptype, unit

    @property
    def pt(self):
        return (self.x, self.y)


class Part:
    def __init__(self, ref, libid, value, fp, nets, props, dnp=False):
        self.ref, self.libid, self.value, self.fp, self.unit_nets, self.props, self.dnp = ref, libid, value, fp, nets, props, dnp
        self.placed = {}  # unit -> (x, y, rot)


class Sheet:
    def __init__(self, design, name, filename, title, desc="", paper="A3"):
        self.d, self.name, self.filename, self.title, self.desc, self.paper = design, name, filename, title, desc, paper
        self.width, self.height = {"A4": (297.0, 210.0), "A3": (420.0, 297.0), "A2": (594.0, 420.0)}[paper]
        self.uuid = uid()
        self.sheet_uuid_in_root = uid()
        self.items = []
        self.used_libs = set()
        self.pins: list[Pin] = []
        self.bodies = []           # (xmin, xmax, ymin, ymax, ref)
        self.ox = self.oy = 0.0
        self.extra_nodes = []      # Pseudo-Pins (Labels) : (net, Pin)
        self.label_mode = set()    # Netze, die nur per Label verbunden werden
        self.gl_hint = {}          # net -> (x, y, ang) explizite Global-Label-Position
        self.boxes = []
        self.lab_hint = {}         # (net, box) -> (x, y, ang)

    # Blöcke ---------------------------------------------------
    def box(self, title, x1, y1, x2, y2, note=None, note_w=None):
        self.boxes.append((x1, y1, x2, y2))
        self.items.append([S("rectangle"), [S("start"), x1, y1], [S("end"), x2, y2],
                           [S("stroke"), [S("width"), 0.3], [S("type"), S("dash")], [S("color"), 0, 0, 132, 1]],
                           [S("fill"), [S("type"), S("none")]], [S("uuid"), uid()]])
        self.items.append([S("text"), title, [S("at"), (x1 + x2) / 2, y1 - 1.5, 0],
                           [S("effects"), [S("font"), [S("size"), 2.0, 2.0], [S("thickness"), 0.4], S("bold")],
                            [S("justify"), S("bottom")]], [S("uuid"), uid()]])
        if note:
            self.note(note, x1, y2 + 2.0)
        return self

    def box_of(self, pt):
        for i, (x1, y1, x2, y2) in enumerate(self.boxes):
            if x1 <= pt[0] <= x2 and y1 <= pt[1] <= y2:
                return i
        return -1

    def note(self, text, x, y, size=1.27):
        self.items.append([S("text"), text, [S("at"), x, y, 0],
                           [S("effects"), [S("font"), [S("size"), size, size]], [S("justify"), S("left"), S("top")]],
                           [S("uuid"), uid()]])

    # Bauteile -------------------------------------------------
    def add(self, prefix, libid, value, fp, nets=None, at=(0, 0), rot=0, units=None, unit_at=None, nc=(),
            nc_rest=False, props=None, dnp=False, ref=None, val_side=None, mirror=False):
        check_fp(fp)
        sym = resolve_symbol(libid)
        allp = sym_pins(sym)
        if units is None:
            units = {1: dict(nets or {})}
            unit_at = {1: (at, rot)}
        unit_nets = {}
        for u, m in units.items():
            up = [p for p in allp if p["unit"] in (u, 0)]
            nums = {p["number"] for p in up}
            mm = {}
            for k, v in m.items():
                if str(k) not in nums:
                    raise KeyError(f"{libid}: Pin {k} gibt es nicht")
                mm[str(k)] = v
            for k in nc:
                if str(k) in nums:
                    mm[str(k)] = None
            miss = [p["number"] for p in up if p["number"] not in mm]
            if miss:
                if nc_rest:
                    for k in miss:
                        mm[k] = None
                else:
                    raise KeyError(f"{libid} ({prefix}): Pins ohne Netz: {miss}")
            unit_nets[u] = mm
        ref = ref or self.d.next_ref(prefix)
        part = Part(ref, libid, value, fp, unit_nets, props or {}, dnp)
        self.d.parts.append((self, part))
        for u in unit_nets:
            (ax, ay), r = unit_at[u]
            self._place(part, u, sym, sn(ax), sn(ay), r, val_side, mirror)
        return part

    def _place(self, part, unit, sym, sx, sy, rot, val_side, mirror=False):
        self.used_libs.add(part.libid)
        part.placed[unit] = (sx, sy, rot)
        bx0, bx1, by0, by1 = _body_bbox(sym, unit)
        if mirror:
            bx0, bx1 = -bx1, -bx0
        cs = [_rot(x, y, rot) for x, y in ((bx0, by0), (bx1, by1))]
        xs = [sx + c[0] for c in cs]; ys = [sy - c[1] for c in cs]
        body = (min(xs), max(xs), min(ys), max(ys))
        self.bodies.append((*body, part.ref))
        ps = [p for p in sym_pins(sym) if p["unit"] in (unit, 0)]
        is_pwr = part.libid.startswith("power:") and part.libid != "power:PWR_FLAG"
        # Feldpositionen
        bw = body[1] - body[0]; bh = body[3] - body[2]
        small = len(ps) <= 3 and max(bw, bh) < 8
        if val_side is None:
            val_side = "right" if (small and bh >= bw) else ("below" if small else "inside")
        fa = 90 if rot % 360 in (90, 270) else 0
        L, Rj = (["right"], ["left"]) if rot % 360 == 90 else (["left"], ["right"])
        if is_pwr:
            fields = [_prop("Reference", part.ref, sx, sy, hide=True),
                      _prop("Value", part.value, sx, sy + (3.2 if part.value.startswith("GND") else -3.2))]
        elif val_side == "right":
            fields = [_prop("Reference", part.ref, body[1] + 0.8, sy - 1.0, justify=L, ang=fa),
                      _prop("Value", part.value, body[1] + 0.8, sy + 1.2, justify=L, ang=fa)]
        elif val_side == "left":
            fields = [_prop("Reference", part.ref, body[0] - 0.8, sy - 1.0, justify=Rj, ang=fa),
                      _prop("Value", part.value, body[0] - 0.8, sy + 1.2, justify=Rj, ang=fa)]
        elif val_side == "below":
            fields = [_prop("Reference", part.ref, sx, body[2] - 1.0, ang=fa),
                      _prop("Value", part.value, sx, body[3] + 1.8, ang=fa)]
        else:  # groß: Ref oben, Wert unten
            fields = [_prop("Reference", part.ref, sx, body[2] - 1.2, ang=fa),
                      _prop("Value", part.value, sx, body[3] + 1.8, ang=fa)]
        fields += [_prop("Footprint", part.fp, sx, sy, hide=True), _prop("Datasheet", "", sx, sy, hide=True)]
        for k, v in part.props.items():
            fields.append(_prop(k, v, sx, sy, hide=True))
        self.items.append([S("symbol"), [S("lib_id"), part.libid], [S("at"), sx, sy, rot],
                           *([[S("mirror"), S("y")]] if mirror else []), [S("unit"), unit],
                           [S("in_bom"), S("no" if is_pwr else "yes")], [S("on_board"), S("no" if is_pwr else "yes")],
                           [S("dnp"), S("yes" if part.dnp else "no")], [S("uuid"), uid()], *fields,
                           *[[S("pin"), p["number"], [S("uuid"), uid()]] for p in ps],
                           [S("instances"), [S("project"), PROJECT,
                                             [S("path"), f"/{self.d.root_uuid}/{self.sheet_uuid_in_root}",
                                              [S("reference"), part.ref], [S("unit"), unit]]]]])
        for p in ps:
            x0, a0 = p["x"], int(p["angle"])
            if mirror:
                x0, a0 = -x0, (180 - a0) % 360
            px, py = _rot(x0, p["y"], rot)
            a = (a0 + rot) % 360
            out = {0: (-1, 0), 180: (1, 0), 90: (0, 1), 270: (0, -1)}[a]
            pin = Pin(part, p["number"], p["name"], round(sx + px, 3), round(sy - py, 3), out, p["type"], unit)
            net = part.unit_nets[unit][p["number"]]
            if not is_pwr:
                self.pins.append(pin)
            if net is None:
                self.items.append([S("no_connect"), [S("at"), pin.x, pin.y], [S("uuid"), uid()]])
            elif not is_pwr:
                self.d.net_nodes[net].add((part.ref, p["number"]))
                self.d.net_sheets[net].add(self.name)

    # Hinweise für das Routing --------------------------------
    def labels(self, *nets):
        """Diese Netze auf diesem Blatt nur über Labels an jedem Pin verbinden."""
        self.label_mode.update(nets)

    def gl(self, net, x, y, ang):
        """Global-Label-Position für ein Netz festlegen (relativ zum aktuellen Block). ang: Richtung, in die das Label zeigt."""
        self.lab_hint[(net, self.box_of((x, y)))] = (sn(x), sn(y), ang)

    def lab(self, net, x, y, ang):
        """Label-Position (global oder lokal, je nach Netz) für ein Netz im Block, der (x, y) enthält."""
        self.lab_hint[(net, self.box_of((x, y)))] = (sn(x), sn(y), ang)

    def pwr_flag(self, net, x, y):
        p = self.add("#FLG", "power:PWR_FLAG", "PWR_FLAG", "", {1: net}, at=(x, y), val_side="right")
        self.d.flag_nets.add(net)
        return p


class Router:
    def __init__(self, sheet: Sheet):
        self.s = sheet
        self.segs = []           # (x1,y1,x2,y2,net)
        self.points = defaultdict(set)   # point -> nets (Pin-Endpunkte)
        for p in sheet.pins:
            net = p.part.nets_of(p) if hasattr(p.part, "nets_of") else p.part.unit_nets[p.unit][p.num]
            self.points[p.pt].add(net if net is not None else f"__NC_{p.part.ref}_{p.num}")
        self.wires_out = []
        self.labels_out = []
        self.pwr_out = []
        self.fail = []

    # Geometrie ------------------------------------------------
    @staticmethod
    def _on_seg(pt, s):
        x, y = pt
        x1, y1, x2, y2 = s[:4]
        if x1 == x2 == x and min(y1, y2) <= y <= max(y1, y2):
            return True
        if y1 == y2 == y and min(x1, x2) <= x <= max(x1, x2):
            return True
        return False

    def _seg_ok(self, a, b, net, own_pins):
        (x1, y1), (x2, y2) = a, b
        if a == b:
            return True
        # Körper
        for bd in self.s.bodies:
            if bd is None:
                continue
            bx0, bx1, by0, by1, ref = bd
            ex0, ex1, ey0, ey1 = bx0 + 0.2, bx1 - 0.2, by0 + 0.2, by1 - 0.2
            if x1 == x2:
                if ex0 < x1 < ex1 and max(min(y1, y2), ey0) < min(max(y1, y2), ey1):
                    return False
            else:
                if ey0 < y1 < ey1 and max(min(x1, x2), ex0) < min(max(x1, x2), ex1):
                    return False
        # fremde Pins / Punkte
        seg = (x1, y1, x2, y2)
        for pt, nets in self.points.items():
            if net in nets:
                continue
            if self._on_seg(pt, seg):
                return False
        # Pin-Linien (zwischen Pin-Ende und Körper) fremder Pins nicht überfahren
        for p in self.s.pins:
            n = p.part.unit_nets[p.unit][p.num]
            if p.pt in own_pins:
                continue
            ix, iy = p.x - p.out[0] * 2.54, p.y - p.out[1] * 2.54
            pseg = (min(p.x, ix), min(p.y, iy), max(p.x, ix), max(p.y, iy))
            if x1 == x2 and pseg[0] == pseg[2] == x1 and max(min(y1, y2), pseg[1]) < min(max(y1, y2), pseg[3]):
                return False
            if y1 == y2 and pseg[1] == pseg[3] == y1 and max(min(x1, x2), pseg[0]) < min(max(x1, x2), pseg[2]):
                return False
        # fremde Drähte: keine Überlappung, keine T-Berührung
        for s2 in self.segs:
            if s2[4] == net:
                continue
            if self._on_seg((x1, y1), s2) or self._on_seg((x2, y2), s2):
                return False
            if self._on_seg((s2[0], s2[1]), seg) or self._on_seg((s2[2], s2[3]), seg):
                return False
            # kollinear überlappend
            if x1 == x2 == s2[0] == s2[2] and max(min(y1, y2), min(s2[1], s2[3])) < min(max(y1, y2), max(s2[1], s2[3])):
                return False
            if y1 == y2 == s2[1] == s2[3] and max(min(x1, x2), min(s2[0], s2[2])) < min(max(x1, x2), max(s2[0], s2[2])):
                return False
        return True

    def _path_ok(self, path, net, own_pins):
        return all(self._seg_ok(path[i], path[i + 1], net, own_pins) for i in range(len(path) - 1))

    def _add_path(self, path, net):
        for i in range(len(path) - 1):
            a, b = path[i], path[i + 1]
            if a != b:
                self.segs.append((a[0], a[1], b[0], b[1], net))
        for pt in path:
            self.points[pt].add(net)

    def _candidates(self, a, b, a_out=None, b_out=None):
        (ax, ay), (bx, by) = a, b
        cands = []
        if ax == bx or ay == by:
            cands.append([a, b])
        cands.append([a, (bx, ay), b])
        cands.append([a, (ax, by), b])
        # Z-Formen mit Abstand vom Pin
        for d in (2.54, 5.08, 7.62, 10.16, 12.7, 15.24):
            if a_out:
                s = (sn(ax + a_out[0] * d), sn(ay + a_out[1] * d))
                cands.append([a, s, (s[0], by), b])
                cands.append([a, s, (bx, s[1]), b])
            if b_out:
                t = (sn(bx + b_out[0] * d), sn(by + b_out[1] * d))
                cands.append([a, (t[0], ay), t, b])
                cands.append([a, (ax, t[1]), t, b])
            if a_out and b_out:
                s = (sn(ax + a_out[0] * d), sn(ay + a_out[1] * d))
                t = (sn(bx + b_out[0] * d), sn(by + b_out[1] * d))
                cands.append([a, s, (s[0], t[1]), t, b])
                cands.append([a, s, (t[0], s[1]), t, b])
        # Mittelwege
        for f in (0.5, 0.25, 0.75):
            mx = sn(ax + (bx - ax) * f); my = sn(ay + (by - ay) * f)
            cands.append([a, (mx, ay), (mx, by), b])
            cands.append([a, (ax, my), (bx, my), b])
        out = []
        for c in cands:
            c2 = [c[0]]
            for p in c[1:]:
                if p != c2[-1]:
                    c2.append(p)
            out.append(c2)
        return out

    @staticmethod
    def _plen(path):
        return sum(abs(path[i][0] - path[i + 1][0]) + abs(path[i][1] - path[i + 1][1]) for i in range(len(path) - 1)) \
            + 3 * (len(path) - 2)

    def _starts_inward(self, path, out):
        if not out or len(path) < 2:
            return False
        dx, dy = path[1][0] - path[0][0], path[1][1] - path[0][1]
        return (dx * out[0] + dy * out[1]) < 0 and (dx * out[1] == dy * out[0])

    def route_net(self, net, nodes):
        """nodes: Liste (pt, out). Verbindet alle zu einem Baum."""
        own = {n[0] for n in nodes}
        done = [nodes[0]]
        tree_pts = {nodes[0][0]}
        rest = list(nodes[1:])
        ok_all = True
        while rest:
            best = None
            for i, (pt, out) in enumerate(rest):
                for tp in list(tree_pts) + self._tree_proj(net, pt):
                    tout = next((o for p, o in done if p == tp), None)
                    for path in self._candidates(pt, tp, out, tout):
                        if self._starts_inward(path, out):
                            continue
                        if tout and self._starts_inward(list(reversed(path)), tout):
                            continue
                        if not self._path_ok(path, net, own):
                            continue
                        L = self._plen(path)
                        if best is None or L < best[0]:
                            best = (L, i, path)
            if best is None:
                ok_all = False
                break
            _, i, path = best
            self._add_path(path, net)
            tree_pts.update(path)
            done.append(rest.pop(i))
        return ok_all, rest

    def _tree_proj(self, net, pt):
        out = []
        for s in self.segs:
            if s[4] != net:
                continue
            x1, y1, x2, y2 = s[:4]
            if x1 == x2 and min(y1, y2) < pt[1] < max(y1, y2):
                out.append((x1, pt[1]))
            if y1 == y2 and min(x1, x2) < pt[0] < max(x1, x2):
                out.append((pt[0], y1))
        return out

    # Ausgabe --------------------------------------------------
    def emit(self):
        s = self.s
        segs = self.segs
        # T-Stellen splitten + Junctions
        pts = set()
        for x1, y1, x2, y2, n in segs:
            pts.add((x1, y1)); pts.add((x2, y2))
        final = []
        for x1, y1, x2, y2, n in segs:
            cuts = [(x1, y1), (x2, y2)]
            for p in pts:
                if p not in cuts and self._on_seg(p, (x1, y1, x2, y2)) and n in self.points.get(p, ()):
                    cuts.append(p)
            cuts.sort(key=lambda p: (p[0] - x1) ** 2 + (p[1] - y1) ** 2)
            for i in range(len(cuts) - 1):
                final.append((cuts[i], cuts[i + 1], n))
        deg = defaultdict(int)
        for a, b, n in final:
            deg[a] += 1; deg[b] += 1
        pin_pts = {p.pt for p in s.pins}
        for pt, k in deg.items():
            if k + (1 if pt in pin_pts else 0) >= 3:
                s.items.append([S("junction"), [S("at"), pt[0], pt[1]], [S("diameter"), 0], [S("color"), 0, 0, 0, 0],
                                [S("uuid"), uid()]])
        for a, b, n in final:
            s.items.append([S("wire"), [S("pts"), [S("xy"), a[0], a[1]], [S("xy"), b[0], b[1]]],
                            [S("stroke"), [S("width"), 0], [S("type"), S("default")]], [S("uuid"), uid()]])


class Design:
    def __init__(self, date, rev, company):
        self.date, self.rev, self.company = date, rev, company
        self.root_uuid = uid()
        self.sheets: list[Sheet] = []
        self.parts = []
        self.refcount = defaultdict(int)
        self.net_nodes = defaultdict(set)
        self.net_sheets = defaultdict(set)
        self.flag_nets = set()
        self.report = []
        self.sources = {}        # Netz → (Ref, Pin): Ort, an dem das Netz entsteht

    def sheet(self, *a, **kw):
        s = Sheet(self, *a, **kw)
        self.sheets.append(s)
        return s

    def next_ref(self, prefix):
        self.refcount[prefix] += 1
        return f"{prefix}{self.refcount[prefix]}"

    def is_global(self, net):
        return len(self.net_sheets[net]) > 1

    # Verdrahtung eines Blatts ---------------------------------
    def wire_sheet(self, s: Sheet):
        r = Router(s)
        self._r = r
        bynet = defaultdict(list)
        for p in s.pins:
            n = p.part.unit_nets[p.unit][p.num]
            if n is not None:
                bynet[n].append(p)
        # 1) Power-Netze: Symbol am Pin; gleichgerichtete Pins eines Bauteils als Sammelschiene
        for net, ps in bynet.items():
            if net not in POWER_NETS:
                continue
            groups = defaultdict(list)
            for p in ps:
                groups[(p.part.ref, p.unit, p.out)].append(p)
            # Nachbarn verschiedener Bauteile in einer Reihe (gleiche Höhe, Pins nach oben/unten, ≤ 9 mm Abstand)
            singles = [g[0] for g in groups.values() if len({q.pt for q in g}) == 1]
            merged = set()
            rows = defaultdict(list)
            for p in singles:
                if p.out[0] == 0:
                    rows[(p.y, p.out, s.box_of(p.pt))].append(p)
            for key, rp in rows.items():
                rp.sort(key=lambda q: q.x)
                run = [rp[0]]
                for q in rp[1:] + [None]:
                    if q is not None and q.x - run[-1].x <= 9.0:
                        run.append(q)
                        continue
                    if len(run) > 1:
                        yb = round(run[0].y + run[0].out[1] * 2.54, 3)
                        path_ok = r._seg_ok((run[0].x, yb), (run[-1].x, yb), net, {x.pt for x in run}) and all(
                            r._seg_ok(x.pt, (x.x, yb), net, {x.pt}) for x in run)
                        if path_ok:
                            self._pwr_bus(s, r, net, run)
                            merged.update(id(x) for x in run)
                    run = [q] if q is not None else []
            for key, gp in groups.items():
                uniq = {}
                for p in gp:
                    uniq.setdefault(p.pt, p)
                gp = list(uniq.values())
                if len(gp) == 1:
                    if id(gp[0]) not in merged:
                        self._pwr_at(s, r, net, gp[0])
                else:
                    self._pwr_bus(s, r, net, gp)
        # 2) Signalnetze, kleinste zuerst; je Block ein Baum + Label, wenn das Netz den Block verlässt
        order = sorted((n for n in bynet if n not in POWER_NETS), key=lambda n: (len(bynet[n]), n))
        for net in order:
            ps = bynet[net]
            glob = self.is_global(net)
            if net in s.label_mode:
                for p in ps:
                    self._label_at(s, r, net, p, glob)
                continue
            clusters = defaultdict(list)
            for p in ps:
                clusters[s.box_of(p.pt)].append(p)
            hinted = {bx for (n, bx) in s.lab_hint if n == net}
            need_label = glob or len(clusters) > 1 or bool(hinted)
            for bx, cps in clusters.items():
                nodes = []
                uniq = set()
                for p in cps:
                    if p.pt not in uniq:
                        uniq.add(p.pt)
                        nodes.append((p.pt, p.out))
                hint = s.lab_hint.get((net, bx))
                if hint:
                    x, y, ang = hint
                    out = {0: (1, 0), 180: (-1, 0), 90: (0, -1), 270: (0, 1)}[ang]
                    nodes.append(((x, y), (-out[0], -out[1])))
                rest = []
                if len(nodes) > 1:
                    ok, rest = r.route_net(net, nodes)
                if rest:
                    self.report.append(f"{s.name}: {net} → {len(rest)} Knoten per Label")
                    rest_pts = {pt for pt, _ in rest}
                    for p in cps:
                        if p.pt in rest_pts:
                            self._label_at(s, r, net, p, glob)
                    tree = [p for p in cps if p.pt not in rest_pts]
                    hint_ok = hint and (hint[0], hint[1]) not in rest_pts
                    if hint_ok:
                        self._emit_label(s, net, hint[0], hint[1], hint[2], glob)
                    elif tree:
                        self._label_at(s, r, net, tree[0], glob)
                elif need_label:
                    if hint:
                        self._emit_label(s, net, hint[0], hint[1], hint[2], glob)
                    else:
                        self._label_at(s, r, net, cps[0], glob)
        r.emit()

    def _stub_end(self, r, p, length):
        e = (round(p.x + p.out[0] * length, 3), round(p.y + p.out[1] * length, 3))
        return e

    def _label_at(self, s, r, net, p, glob, stub_only_if_free=False):
        for L in (2.54, 5.08, 7.62):
            e = self._stub_end(r, p, L)
            if r._seg_ok(p.pt, e, net, {p.pt}):
                r._add_path([p.pt, e], net)
                ang = {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[p.out]
                self._emit_label(s, net, e[0], e[1], ang, glob)
                return
        # Notfall: direkt am Pin
        ang = {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[p.out]
        self._emit_label(s, net, p.x, p.y, ang, glob)

    def _emit_label(self, s, net, x, y, ang, glob):
        just = [S("left")] if ang in (0, 90) else [S("right")]
        L = len(net) * 1.05 + (3.0 if glob else 0.6)
        d = {0: (1, 0), 180: (-1, 0), 90: (0, -1), 270: (0, 1)}[ang]
        ex, ey = x + d[0] * L, y + d[1] * L
        bb = (min(x, ex) - (0.9 if d[1] else 0), max(x, ex) + (0.9 if d[1] else 0),
              min(y, ey) - (0.9 if d[0] else 0), max(y, ey) + (0.9 if d[0] else 0))
        s.bodies.append((bb[0] + (0.3 if d[0] > 0 else 0), bb[1] - (0.3 if d[0] < 0 else 0),
                         bb[2] + (0.3 if d[1] > 0 else 0), bb[3] - (0.3 if d[1] < 0 else 0), f"LBL:{net}"))
        if glob:
            s.items.append([S("global_label"), net, [S("shape"), S("passive")], [S("at"), x, y, ang],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), *just]],
                            [S("uuid"), uid()],
                            [S("property"), "Intersheetrefs", "${INTERSHEET_REFS}", [S("at"), x, y, 0],
                             [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], S("hide")]]])
        else:
            s.items.append([S("label"), net, [S("at"), x, y, ang],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), *just, S("bottom")]],
                            [S("uuid"), uid()]])

    def _pwr_symbol(self, s, r, net, at, d):
        """Power-Symbol bei 'at', Grafik zeigt in Richtung d."""
        libid = POWER_NETS[net]
        up = net in UP_SYMS
        if up:
            rot = {(0, -1): 0, (-1, 0): 90, (0, 1): 180, (1, 0): 270}[d]
        else:
            rot = {(0, 1): 0, (1, 0): 90, (0, -1): 180, (-1, 0): 270}[d]
        s.used_libs.add(libid)
        ref = self.next_ref("#PWR")
        vx, vy = at[0] + d[0] * 4.0, at[1] + d[1] * 4.0
        just = None
        if d[0]:
            just = ["left"] if d[0] > 0 else ["right"]
            vx = at[0] + d[0] * 3.3
        s.items.append([S("symbol"), [S("lib_id"), libid], [S("at"), at[0], at[1], rot], [S("unit"), 1],
                        [S("in_bom"), S("no")], [S("on_board"), S("no")], [S("dnp"), S("no")], [S("uuid"), uid()],
                        _prop("Reference", ref, at[0], at[1], hide=True),
                        _prop("Value", net, vx, vy, justify=just),
                        _prop("Footprint", "", at[0], at[1], hide=True), _prop("Datasheet", "", at[0], at[1], hide=True),
                        [S("pin"), "1", [S("uuid"), uid()]],
                        [S("instances"), [S("project"), PROJECT,
                                          [S("path"), f"/{self.root_uuid}/{s.sheet_uuid_in_root}",
                                           [S("reference"), ref], [S("unit"), 1]]]]])
        r.points[at].add(net)
        # Grafik als Hindernis
        L = 3.2 + len(net) * 0.9
        ex, ey = at[0] + d[0] * L, at[1] + d[1] * L
        s.bodies.append((min(at[0], ex) - 1.3 + (0.3 if d[0] > 0 else 0), max(at[0], ex) + 1.3 - (0.3 if d[0] < 0 else 0),
                         min(at[1], ey) - 1.3 + (0.3 if d[1] > 0 else 0), max(at[1], ey) + 1.3 - (0.3 if d[1] < 0 else 0),
                         f"PWR:{net}"))

    def _pwr_at(self, s, r, net, p):
        up = net in UP_SYMS
        pref = (0, -1) if up else (0, 1)
        o = p.out
        if o == pref or o == (-pref[0], -pref[1]):
            self._pwr_symbol(s, r, net, p.pt, o)
            return
        # seitlicher Pin: kurzer Stich, dann Symbol in Vorzugsrichtung
        for L in (2.54, 5.08):
            e = (round(p.x + o[0] * L, 3), round(p.y + o[1] * L, 3))
            if r._seg_ok(p.pt, e, net, {p.pt}):
                r._add_path([p.pt, e], net)
                self._pwr_symbol(s, r, net, e, pref)
                return
        self._pwr_symbol(s, r, net, p.pt, o)

    def _pwr_bus(self, s, r, net, gp):
        up = net in UP_SYMS
        o = gp[0].out
        if o[1] == 0:   # Pins seitlich → senkrechte Schiene
            L = 2.54
            xs = round(gp[0].x + o[0] * L, 3)
            for p in gp:
                r._add_path([p.pt, (xs, p.y)], net)
            ys = sorted(p.y for p in gp)
            r._add_path([(xs, ys[0]), (xs, ys[-1])], net)
            at = (xs, ys[-1]) if not up else (xs, ys[0])
            self._pwr_symbol(s, r, net, at, (0, 1) if not up else (0, -1))
        else:           # Pins oben/unten → waagrechte Schiene
            L = 2.54
            yb = round(gp[0].y + o[1] * L, 3)
            for p in gp:
                r._add_path([p.pt, (p.x, yb)], net)
            xs = sorted(p.x for p in gp)
            r._add_path([(xs[0], yb), (xs[-1], yb)], net)
            mid = min((p.x for p in gp), key=lambda x: abs(x - (xs[0] + xs[-1]) / 2))
            self._pwr_symbol(s, r, net, (mid, yb), o)

    # Schreiben -----------------------------------------------
    def write(self, outdir, root_notes=()):
        os.makedirs(outdir, exist_ok=True)
        for s in self.sheets:
            self.wire_sheet(s)
        root = Sheet(self, "Root", f"{PROJECT}.kicad_sch", "Pumpensteuerung — Übersicht")
        blocks = []
        x, y = 25.4, 45.72
        for s in self.sheets:
            w, h = 60.96, 20.32
            blocks.append([S("sheet"), [S("at"), x, y], [S("size"), w, h],
                           [S("stroke"), [S("width"), 0.1524], [S("type"), S("solid")]],
                           [S("fill"), [S("color"), 0, 0, 0, 0.0]], [S("uuid"), s.sheet_uuid_in_root],
                           [S("property"), "Sheetname", s.name, [S("at"), x, y - 0.7116, 0],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), S("left"), S("bottom")]]],
                           [S("property"), "Sheetfile", s.filename, [S("at"), x, y + h + 0.5846, 0],
                            [S("effects"), [S("font"), [S("size"), 1.27, 1.27]], [S("justify"), S("left"), S("top")]]],
                           [S("instances"), [S("project"), PROJECT,
                                             [S("path"), f"/{self.root_uuid}", [S("page"), str(self.sheets.index(s) + 2)]]]]])
            x += 76.2
            if x > 330:
                x, y = 25.4, y + 38.1
        for t, (nx, ny) in root_notes:
            root.note(t, nx, ny)
        self._write_sch(os.path.join(outdir, f"{PROJECT}.kicad_sch"), root, True,
                        blocks + [[S("sheet_instances"), [S("path"), "/", [S("page"), "1"]]]])
        for s in self.sheets:
            self._write_sch(os.path.join(outdir, s.filename), s, False, [])
        os.makedirs(os.path.join(outdir, "lib", "PumpCtrl.pretty"), exist_ok=True)
        lib = [S("kicad_symbol_lib"), [S("version"), 20220914], [S("generator"), S("kicad_symbol_editor")]]
        for k, v in Custom.symbols.items():
            v = copy.deepcopy(v); v[1] = k.split(":")[1]; lib.append(v)
        with open(os.path.join(outdir, "lib", "PumpCtrl.kicad_sym"), "w") as f:
            f.write(dump(lib) + "\n")
        with open(os.path.join(outdir, "sym-lib-table"), "w") as f:
            f.write('(sym_lib_table\n  (lib (name "PumpCtrl")(type "KiCad")(uri "${KIPRJMOD}/lib/PumpCtrl.kicad_sym")(options "")(descr "Projektsymbole"))\n)\n')
        with open(os.path.join(outdir, "fp-lib-table"), "w") as f:
            f.write('(fp_lib_table\n  (lib (name "PumpCtrl")(type "KiCad")(uri "${KIPRJMOD}/lib/PumpCtrl.pretty")(options "")(descr "Projekt-Footprints"))\n)\n')
        self._write_linkmap(os.path.join(outdir, "..", "tools", "link_map.json"))
        pro = {"meta": {"filename": f"{PROJECT}.kicad_pro", "version": 1},
               "sheets": [[self.root_uuid, "Root"]] + [[s.sheet_uuid_in_root, s.name] for s in self.sheets],
               "boards": [], "libraries": {"pinned_footprint_libs": [], "pinned_symbol_libs": []}}
        with open(os.path.join(outdir, f"{PROJECT}.kicad_pro"), "w") as f:
            json.dump(pro, f, indent=2)

    def _write_linkmap(self, path):
        """Positionen aller Labels/Power-Symbole und der Netz-Quellen für tools/pdf_links.py."""
        sheets = []
        for i, s in enumerate(self.sheets):
            items = []
            for b in s.bodies:
                if b and isinstance(b[4], str) and (b[4].startswith("PWR:") or b[4].startswith("LBL:")):
                    x0, x1, y0, y1, tag = b
                    items.append({"net": tag.split(":", 1)[1], "kind": tag[:3], "bbox": [x0, y0, x1, y1],
                                  "box": s.box_of(((x0 + x1) / 2, (y0 + y1) / 2))})
            pins = {}
            for p in s.pins:
                pins[f"{p.part.ref}.{p.num}"] = {"pt": [p.x, p.y], "type": p.ptype, "box": s.box_of(p.pt),
                                                 "net": p.part.unit_nets[p.unit][p.num], "lib": p.part.libid}
            sheets.append({"name": s.name, "page": i + 2, "paper": s.paper, "items": items, "pins": pins,
                           "boxes": s.boxes})
        with open(path, "w") as f:
            json.dump({"sheets": sheets, "sources": self.sources}, f, indent=0)

    def _write_sch(self, path, s, is_root, extra):
        libs = [S("lib_symbols")] + [resolve_symbol(l) for l in sorted(s.used_libs)]
        tb = [S("title_block"), [S("title"), s.title], [S("date"), self.date], [S("rev"), self.rev],
              [S("company"), self.company], [S("comment"), 1, s.desc or ""],
              [S("comment"), 2, "Erzeugt mit hardware/tools/gen_schematic.py"]]
        out = [S("kicad_sch"), [S("version"), 20230121], [S("generator"), S("eeschema")],
               [S("uuid"), self.root_uuid if is_root else s.uuid], [S("paper"), s.paper], tb, libs]
        out += s.items + list(extra)
        with open(path, "w") as f:
            f.write(dump(out) + "\n")

    def intended_netlist(self):
        return {n: sorted(f"{r}.{p}" for r, p in v) for n, v in self.net_nodes.items()}
