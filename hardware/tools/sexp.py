"""Minimal S-expression parser/writer for KiCad files."""
import re
TOK = re.compile(r'\s*(?:(\()|(\))|("(?:[^"\\]|\\.)*")|([^\s()"]+))')
class Sym(str):
    pass
def parse(text):
    stack=[[]]; pos=0; n=len(text)
    while pos<n:
        m=TOK.match(text,pos)
        if not m:
            if text[pos:].strip()=='' : break
            raise ValueError(text[pos:pos+50])
        pos=m.end()
        if m.group(1): stack.append([])
        elif m.group(2):
            e=stack.pop(); stack[-1].append(e)
        elif m.group(3) is not None:
            s=m.group(3)[1:-1].replace('\\"','"').replace('\\\\','\\'); stack[-1].append(s)
        elif m.group(4) is not None: stack[-1].append(Sym(m.group(4)))
    return stack[0]
def q(s):
    return '"'+str(s).replace('\\','\\\\').replace('"','\\"').replace('\n','\\n')+'"'
def dump(e, ind=0):
    if isinstance(e,list):
        if not e: return '()'
        simple = all(not isinstance(x,list) for x in e)
        if simple:
            return '('+' '.join(dump(x) for x in e)+')'
        parts=[]; out='('+dump(e[0])
        for x in e[1:]:
            if isinstance(x,list): out+='\n'+'  '*(ind+1)+dump(x,ind+1)
            else: out+=' '+dump(x)
        return out+')'
    if isinstance(e,Sym): return str(e)
    if isinstance(e,bool): return 'yes' if e else 'no'
    if isinstance(e,(int,float)):
        if isinstance(e,float): 
            s=('%.4f'%e).rstrip('0').rstrip('.'); return s if s not in ('-0','') else '0'
        return str(e)
    return q(e)
def find(e,key):
    return [x for x in e if isinstance(x,list) and x and x[0]==key]
def first(e,key):
    r=find(e,key); return r[0] if r else None
