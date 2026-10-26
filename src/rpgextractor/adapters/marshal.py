"""Inert, bounded Ruby Marshal 4.8 reader. Never imports or instantiates Ruby classes.
Original bytes remain authoritative; JSON graph preserves links, symbols and ivars.
"""
import base64
import math
import struct

class MarshalError(ValueError): pass

class Node:
    def __init__(self, kind, value=None, name=None):
        self.kind, self.value, self.name = kind, value, name
        self.ivars = {}

class Reader:
    def __init__(self, data, cancel=lambda: None, max_nodes=1000000):
        if len(data)>128*1024*1024: raise MarshalError('Marshal file exceeds 128 MiB')
        self.data=data; self.pos=0; self.objects=[]; self.symbols=[]
        self.cancel=cancel; self.remaining=max_nodes
    def take(self,n):
        if n<0 or self.pos+n>len(self.data): raise MarshalError('Truncated Marshal stream')
        v=self.data[self.pos:self.pos+n]; self.pos+=n; return v
    def integer(self):
        c=int.from_bytes(self.take(1),'little',signed=True)
        if c==0: return 0
        if c>4: return c-5
        if c< -4: return c+5
        v=int.from_bytes(self.take(abs(c)),'little')
        return v if c>0 else v-(1<<(8*-c))
    def count(self):
        n=self.integer()
        if not 0<=n<=1000000: raise MarshalError('Collection limit')
        return n
    def blob(self):
        n=self.integer()
        if not 0<=n<=128*1024*1024: raise MarshalError('Blob limit')
        return self.take(n)
    def register(self, node): self.objects.append(node); return node
    def linked(self, table):
        n=self.integer()
        if not 0<=n<len(table): raise MarshalError('Invalid object/symbol link')
        return table[n]
    def read(self,depth=0):
        self.remaining-=1
        if self.remaining<0 or depth>160: raise MarshalError('Marshal complexity limit')
        if self.remaining%1024==0: self.cancel()
        t=self.take(1); read=lambda:self.read(depth+1)
        if t==b'0': return None
        if t==b'T': return True
        if t==b'F': return False
        if t==b'i': return self.integer()
        if t==b':':
            s=Node('symbol',self.blob()); self.symbols.append(s); return s
        if t==b';': return self.linked(self.symbols)
        if t==b'@': return self.linked(self.objects)
        if t==b'I':
            obj=read()
            if not isinstance(obj,Node): raise MarshalError('Invalid ivar target')
            for _ in range(self.count()):
                key=read(); val=read(); obj.ivars[symbol(key)]=val
            return obj
        if t in (b'C',b'e'):
            name=symbol(read()); obj=read()
            if not isinstance(obj,Node): raise MarshalError('Invalid wrapper')
            obj.ivars['__subclass' if t==b'C' else '__module']=name; return obj
        if t in (b'"',b'/',b'f',b'l',b'c',b'm',b'M'):
            if t==b'l':
                sign=self.take(1); v=int.from_bytes(self.take(self.count()*2),'little')
                return self.register(Node('integer',v if sign==b'+' else -v))
            v=self.blob(); node=self.register(Node({b'"':'string',b'/':'regexp',b'f':'float'}.get(t,'class'),v))
            if t==b'/': node.ivars['options']=self.take(1)[0]
            return node
        if t==b'[':
            n=self.register(Node('array',[]))
            for _ in range(self.count()): n.value.append(read())
            return n
        if t in (b'{',b'}'):
            n=self.register(Node('hash',[]))
            for _ in range(self.count()):
                key=read(); val=read(); n.value.append((key,val))
            if t==b'}': n.ivars['default']=read()
            return n
        if t in (b'o',b'S',b'u',b'U',b'd'):
            name=symbol(read()); n=self.register(Node('object' if t in (b'o',b'S') else 'user',None,name))
            if t in (b'o',b'S'):
                n.value={}
                for _ in range(self.count()):
                    key=symbol(read()); val=read(); n.value[key]=val
            elif t==b'u': n.value=self.blob()
            else: n.value=read()
            return n
        raise MarshalError('Unsupported Marshal tag '+t.hex())
    def load(self):
        if self.take(2)!=b'\x04\x08': raise MarshalError('Not Marshal 4.8')
        value=self.read()
        if self.pos!=len(self.data): raise MarshalError('Trailing Marshal bytes')
        return value

def symbol(n):
    if not isinstance(n,Node) or n.kind!='symbol': raise MarshalError('Expected symbol')
    return n.value.decode('utf-8','strict')

def decode_text(raw,encoding=None):
    for enc in ([encoding] if encoding else [])+['utf-8','cp932']:
        try: return raw.decode(enc)
        except (UnicodeError,LookupError): pass
    return raw.decode('utf-8','replace')

def graph(value):
    """Lossless tagged JSON graph, including binary strings and shared/cyclic nodes."""
    nodes=[]; seen={}
    def visit(v):
        if isinstance(v,bytes): return {'base64':base64.b64encode(v).decode('ascii')}
        if isinstance(v,Node):
            if id(v) in seen: return {'$ref':seen[id(v)]}
            i=len(nodes); seen[id(v)]=i; row={'id':i,'type':v.kind,'class':v.name}; nodes.append(row)
            row['value']=visit(v.value); row['ivars']=visit(v.ivars)
            return {'$ref':i}
        if isinstance(v,dict): return {k:visit(x) for k,x in v.items()}
        if isinstance(v,(list,tuple)): return [visit(x) for x in v]
        return v
    root=visit(value); return {'root':root,'nodes':nodes}

def plain(value,active=None,budget=None):
    """Projection for the common adapter. Refuse cyclic / expanding graphs safely."""
    active=set() if active is None else active
    budget=[2000000] if budget is None else budget
    budget[0]-=1
    if budget[0]<0: raise MarshalError('Projection complexity limit')
    if not isinstance(value,Node): return value
    if id(value) in active: raise MarshalError('Cyclic projection; inspect preserved graph')
    active.add(id(value))
    conv=lambda x:plain(x,active,budget)
    try:
        if value.kind in ('string','symbol'): return decode_text(value.value)
        if value.kind=='integer': return value.value
        if value.kind=='float':
            v=float(value.value.split(b'\0')[0]); return v if math.isfinite(v) else {'ruby_float':str(v)}
        if value.kind=='array': return [conv(x) for x in value.value]
        if value.kind=='hash': return {str(conv(k)):conv(v) for k,v in value.value}
        if value.kind=='object': return {'__ruby_class':value.name,**{k.lstrip('@'):conv(v) for k,v in value.value.items()}}
        if value.kind=='user' and isinstance(value.value,bytes):
            data=value.value
            if value.name=='Table':
                if len(data)<20: raise MarshalError('Truncated Table')
                dim,x,y,z,n=struct.unpack('<5I',data[:20])
                if dim not in (1,2,3) or n!=x*y*z or len(data)!=20+n*2: raise MarshalError('Invalid Table')
                return {'__ruby_class':'Table','dimensions':[x,y,z],'values':list(struct.unpack('<'+str(n)+'h',data[20:]))}
            if value.name in ('Color','Tone') and len(data)==32:
                vals=struct.unpack('<4d',data)
                if not all(math.isfinite(v) for v in vals): raise MarshalError('Non-finite color')
                return {'__ruby_class':value.name,'values':list(vals)}
            return {'__ruby_class':value.name,'base64':base64.b64encode(data).decode('ascii')}
        return {'__ruby_class':value.name,'opaque':True}
    finally: active.remove(id(value))
