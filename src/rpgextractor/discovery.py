from __future__ import annotations
from dataclasses import dataclass, asdict, field
from pathlib import Path
import re
from .io import safe_files, reject_links, load_json

@dataclass
class Candidate:
    root:Path
    data_dir:Path
    engine:str
    confidence:str
    evidence:list[str]
    version:str|None
    map_files:int
    file_count:int
    layout:dict[str,list[str]]
    archive:Path|None=None
    title:str=""
    score:int=0
    validation:dict=field(default_factory=dict)
    def to_dict(self):
        return {**asdict(self),'root':str(self.root),'data_dir':str(self.data_dir),'archive':str(self.archive) if self.archive else None}

def identify(root,data,files):
    evidence=[]; votes=set(); active=set(); version=None
    ace=any(p.parent==data and p.suffix.lower()=='.rvdata2' for p in files)
    if ace:
        engine='VXACE'; evidence.append('Ruby Marshal 4.8 / VX Ace 데이터베이스')
    else:
        for eng,prefix,project in [('MV','rpg_','.rpgproject'),('MZ','rmmz_','.rmmzproject')]:
            cores=[p for p in files if p.name in (prefix+'core.js',prefix+'objects.js')]
            if cores: votes.add(eng); evidence.append(eng+' 엔진 파일 존재')
            if any(p.suffix==project for p in files): active.add(eng); evidence.append(eng+' 프로젝트 파일')
        entry=set()
        for name in ('index.html','js/main.js'):
            p=root/name
            try:
                reject_links(p)
                if p.stat().st_size>4*1024*1024: continue
                text=p.read_text(encoding='utf-8-sig',errors='replace')
                text=re.sub(r'<!--.*?-->|/\*.*?\*/','',text,flags=re.S)
                text=re.sub(r'(?m)^\s*//.*$','',text)
                for eng,prefix in [('MV','rpg_'),('MZ','rmmz_')]:
                    if re.search(r'[\'\"][^\'\"]*'+prefix+r'(?:core|objects)\.js[\'\"]',text): entry.add(eng)
            except OSError: pass
        try: system=load_json(data/'System.json')
        except (OSError,ValueError): system={}
        if len(entry)==1: engine=next(iter(entry)); evidence.append('실행 진입점의 엔진 파일 참조')
        elif len(active)==1: engine=next(iter(active)); evidence.append('프로젝트 형식 사용')
        elif isinstance(system,dict) and isinstance(system.get('advanced'),dict): engine='MZ'; evidence.append('MZ advanced 데이터 구조')
        elif len(votes)==1: engine=next(iter(votes))
        else: engine='MV_MZ'; evidence.append('엔진 불확실 — 공통 JSON 데이터 추출 가능')
        if len(votes)>1: evidence.append('MV/MZ 엔진 파일 혼재')
    layout={k:[] for k in ('img','audio','movies','effects','fonts','js')}
    for p in files:
        rel=p.relative_to(root)
        for i,part in enumerate(rel.parts[:-1]):
            kind={'graphics':'img'}.get(part.lower(),part.lower())
            if kind in layout:
                folder=Path(*rel.parts[:i+1]).as_posix()
                if folder not in layout[kind]: layout[kind].append(folder)
    return Candidate(root,data,engine,'low' if engine=='MV_MZ' else 'high',evidence,version,
                     sum(bool(re.fullmatch(r'Map\d+\.(json|rvdata2)',p.name,re.I)) for p in files if p.parent==data),len(files),layout)

def discover(folder,exclude=(),cancel=lambda:None,issue=None):
    folder=Path(folder); reject_links(folder); folder=folder.resolve()
    selected_file=folder if folder.is_file() else None
    if selected_file: folder=folder.parent
    if folder.name.lower()=='data': folder=folder.parent
    files=[]
    for p in safe_files(folder,exclude,issue):
        cancel(); files.append(p)
        if len(files)>250000: raise ValueError('파일 검색 한도 250,000개를 초과했습니다.')
    dirs=set()
    for p in files:
        if re.fullmatch(r'(?:System|MapInfos|CommonEvents|Actors|Map\d+)\.(json|rvdata2)',p.name,re.I):dirs.add(p.parent)
    result=[]
    if selected_file and selected_file.suffix.lower()==".rgss3a": dirs.clear()
    for data in sorted(dirs):
        root=data.parent
        while root!=folder and folder in root.parents:
            if (root/'js').is_dir() or (root/'Game.ini').is_file(): break
            if any(d!=data and root.parent in d.parents and root not in d.parents for d in dirs): break
            root=root.parent
        scoped=[p for p in files if root in p.parents]
        candidate=identify(root,data,scoped)
        from .adapters import adapter_for
        adapter=adapter_for(candidate.engine)
        candidates=[p for p in scoped if p.parent==data and p.suffix.lower()==adapter.extension]
        maps=[p for p in candidates if re.fullmatch(r'Map\d+',p.stem,re.I)]
        core=[p for p in candidates if p.stem in ('System','MapInfos','CommonEvents')]
        valid=0;sample_good=0;failures=[]
        for p in core+maps[:3]:
            cancel()
            try:
                value=adapter.load(p,cancel)
                okay=isinstance(value,dict) if p.stem=='System' else isinstance(value,(dict,list)) if p.stem=='MapInfos' else isinstance(value,list) if p.stem=='CommonEvents' else isinstance(value,dict) and isinstance(value.get('events'),list)
                if not okay:raise ValueError('unexpected structure')
                if p in maps:sample_good+=1
                else:valid+=1
                if p.stem=='System':candidate.title=str(value.get('gameTitle') or root.name)
            except (OSError,ValueError,UnicodeError,RecursionError):failures.append(p.name)
        candidate.validation={'core_valid':valid,'core_present':len(core),'map_files':len(maps),'sample_valid':sample_good,'sample_checked':min(3,len(maps)),'failed_files':failures}
        candidate.score=valid*10+sample_good*5+(10 if maps else 0)
        candidate.evidence.append(f'핵심 데이터 {valid}/{len(core)}개 유효 · 맵 {len(maps)}개 · 맵 표본 {sample_good}/{min(3,len(maps))}개 유효')
        if valid or sample_good:result.append(candidate)
        elif issue:issue('invalid_data_root',str(data),'핵심 파일은 있지만 지원 데이터로 파싱하지 못했습니다.')
    from .adapters.rgss3 import entries
    for p in files:
        if p.suffix.lower()=='.rgss3a' and (selected_file is None or selected_file==p):
            try:
                rows=entries(p,cancel)
                core=[e for e in rows if re.search(r'(?:^|/)Data/(?:System|MapInfos|Map\d+)\.rvdata2$',e.name,re.I)]
                if core and not any(c.engine=='VXACE' and c.root==p.parent for c in result):
                    result.append(Candidate(p.parent,p.parent/'Data','VXACE','high',['표준 RGSSAD v3 아카이브'],None,len([e for e in core if re.search(r'Map\d+',e.name)]),len(rows),{},p))
            except (OSError,ValueError,UnicodeError):
                if issue: issue('archive_invalid',str(p),'표준 RGSS3 아카이브를 읽을 수 없습니다.')
    return sorted(result,key=lambda c:(-c.score,str(c.data_dir)))


def preferred(candidates):
    if len(candidates)==1:return candidates[0]
    if candidates and candidates[0].score>candidates[1].score+10:return candidates[0]
    return None
