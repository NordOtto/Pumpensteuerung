import os, copy, sys
sys.path.insert(0, os.path.dirname(__file__))
from sexp import parse, find, first, Sym
LIBDIR='/usr/share/kicad/symbols'
_cache={}
def load_lib(lib):
    if lib not in _cache:
        _cache[lib]=parse(open(f'{LIBDIR}/{lib}.kicad_sym').read())[0]
    return _cache[lib]
def get_symbol(libid):
    """Return fully resolved symbol (extends flattened), named libid."""
    lib,name=libid.split(':')
    L=load_lib(lib)
    syms={s[1]:s for s in find(L,'symbol')}
    s=copy.deepcopy(syms[name])
    ext=first(s,'extends')
    if ext:
        parent=copy.deepcopy(syms[ext[1]])
        # take parent body, override properties from child
        props={p[1]:p for p in find(s,'property')}
        new=[Sym('symbol'),name]
        for x in parent[2:]:
            if isinstance(x,list) and x[0]=='property' and x[1] in props:
                new.append(props.pop(x[1]))
            elif isinstance(x,list) and x[0]=='symbol':
                x[1]=x[1].replace(ext[1],name,1); new.append(x)
            else: new.append(x)
        for p in props.values(): new.append(p)
        s=new
    s[1]=libid
    for sub in find(s,'symbol'):
        sub[1]=sub[1].split(':')[-1]
    return s
def pins(sym):
    """list of dict(number,name,x,y,angle,type,unit)"""
    out=[]
    for sub in find(sym,'symbol'):
        unit=int(sub[1].rsplit('_',2)[-2])
        for p in find(sub,'pin'):
            at=first(p,'at'); nm=first(p,'name'); nb=first(p,'number'); ln=first(p,'length')
            out.append(dict(number=nb[1],name=nm[1],x=float(at[1]),y=float(at[2]),angle=float(at[3]) if len(at)>3 else 0.0,type=str(p[1]),unit=unit,length=float(ln[1])))
    return out
if __name__=='__main__':
    for a in sys.argv[1:]:
        s=get_symbol(a); fp=[p for p in find(s,'property') if p[1]=='Footprint']
        print('==',a, fp[0][2] if fp else '')
        for p in sorted(pins(s),key=lambda p:(p['unit'],p['number'].zfill(4))):
            print(f"  u{p['unit']} {p['number']:>4} {p['name']:<14} {p['type']}")
