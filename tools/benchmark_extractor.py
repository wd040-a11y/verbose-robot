"""Run in a fresh process for each revision; synthetic, identical full options."""
import json,time,sys,resource
from pathlib import Path
from tools.sample_factory import create_game
from rpgextractor import pipeline
from rpgextractor.pipeline import Extractor,Options
from rpgextractor.packaging import story_package
label,work=sys.argv[1],Path(sys.argv[2]);work.mkdir(parents=True,exist_ok=True)
game,_=create_game(work/'game','MZ',event_count=1000)
original=pipeline.validate_package;calls=[]
def measured(*a,**kw):
 start=time.perf_counter();r=original(*a,**kw);calls.append({'seconds':time.perf_counter()-start,'files':len(kw['only']) if kw.get('only') is not None else sum(1 for p in Path(a[0]).rglob('*') if p.suffix in ('.json','.jsonl') and p.relative_to(a[0]).parts[0] not in ('source_archive','schemas','assets','raw')),'errors':len(r),'scoped':kw.get('only')});return r
pipeline.validate_package=measured
start=time.perf_counter();r=Extractor(Options()).run(game,work/'exports');seconds=time.perf_counter()-start
out=Path(r['output_folder']);start=time.perf_counter();z=story_package(out);zip_seconds=time.perf_counter()-start
report={'label':label,'events':r['output_counts']['events'],'commands':r['output_counts']['commands'],'extraction_seconds':seconds,'validation_calls':calls,'validation_seconds':sum(c['seconds'] for c in calls),'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'state':r['state'],'schema_valid':r['schema_valid'],'integrity':json.loads((out/'reports/integrity.json').read_text())['data'],'story_zip_bytes':z.stat().st_size,'zip_seconds':zip_seconds,'output_folder':str(out)}
Path(work/'measurement.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
