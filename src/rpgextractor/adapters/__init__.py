"""Engine-specific reading; common pipeline consumes a stable projection."""
import re
import zlib
from .marshal import Reader, Node, plain, graph, decode_text, MarshalError
from ..io import load_json, write_json

class JsonAdapter:
    version='2.0.0'
    extension='.json'
    def load(self,path,cancel=lambda:None,raw_dir=None): return load_json(path)

class AceAdapter:
    version='1.0.0'
    extension='.rvdata2'
    def load(self,path,cancel=lambda:None,raw_dir=None):
        if path.stat().st_size>128*1024*1024: raise ValueError('Data size limit')
        node=Reader(path.read_bytes(),cancel).load()
        if raw_dir is not None: write_json(raw_dir/(path.name+'.graph.json'),graph(node))
        value=plain(node)
        def convert(v):
            if isinstance(v,list): return [convert(x) for x in v]
            if not isinstance(v,dict): return v
            result={re.sub(r'_([a-z])',lambda m:m[1].upper(),k):convert(x) for k,x in v.items() if k!='__ruby_class'}
            if 'condition' in result: result['conditions']=result.pop('condition')
            if 'graphic' in result: result['image']=result.pop('graphic')
            if 'events' in result and isinstance(result['events'],dict): result['events']=indexed(result['events'])
            return result
        value=convert(value)
        if path.stem=='MapInfos' and isinstance(value,dict): value=indexed(value)
        return value
    def scripts(self,path,output,cancel=lambda:None):
        node=Reader(path.read_bytes(),cancel).load()
        if not isinstance(node,Node) or node.kind!='array': raise MarshalError('Invalid script table')
        rows=[]
        for i,item in enumerate(node.value):
            cancel()
            row={'id':None,'name':None,'order':i,'source_path':None,'status':'failed','references':[]}
            try:
                if not isinstance(item,Node) or item.kind!='array' or len(item.value)<3: raise ValueError('Script row')
                sid,name,compressed=item.value[:3]
                row.update(id=plain(sid),name=plain(name))
                if not isinstance(compressed,Node) or compressed.kind!='string': raise ValueError('Script bytes')
                dec=zlib.decompressobj(); src=dec.decompress(compressed.value,16*1024*1024+1)
                if len(src)>16*1024*1024 or dec.unconsumed_tail or not dec.eof or dec.unused_data: raise ValueError('Script compression limit')
                rel=f'scripts/{i:05d}.rb'; dest=output/rel; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(src)
                text=decode_text(src)
                row.update(source_path=rel,status='decompressed',source=text,references=re.findall(r'\b(?:require|load)\s*[\( ]\s*[\'"]([^\'"]+)',text))
            except (ValueError,TypeError,zlib.error,UnicodeError): pass
            rows.append(row)
        return rows

def indexed(values):
    keys=[int(k) for k in values]
    if any(k<0 or k>100000 for k in keys): raise ValueError('Database ID limit')
    result=[None]*(max(keys,default=0)+1)
    for k,v in values.items(): result[int(k)]=v
    return result

def adapter_for(engine): return AceAdapter() if engine=='VXACE' else JsonAdapter()
