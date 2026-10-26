from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from .discovery import discover
from .pipeline import Extractor, Options
from .validation import validate_package
from .io import Cancelled

def main(argv=None):
    parser=argparse.ArgumentParser(description="RPG Maker MV/MZ/VX Ace 데이터 추출기")
    sub=parser.add_subparsers(dest="action",required=True)
    scan=sub.add_parser("scan",help="게임 데이터 루트 찾기"); scan.add_argument("folder",type=Path)
    export=sub.add_parser("extract",help="데이터 추출"); export.add_argument("folder",type=Path); export.add_argument("output",type=Path,nargs="?")
    export.add_argument("--root",type=Path,help="여러 게임이 있을 때 scan 결과의 root 선택")
    export.add_argument("--game-id",help="재추출 시 유지할 패키지 ID")
    for name,help_text in [("no-raw","원본 JSON 보관 생략"),("no-scripts","JavaScript 소스 보관 생략"),("no-images","이미지 복사 생략"),("no-decrypt","복호화 생략"),("audio","오디오 포함"),("movies","영상 포함"),("no-llm","LLM 입력 생략"),("no-tiles","정규화 파일에서 타일 배열 생략"),("sensitive-system","키를 포함한 System.json 원본도 별도 보관")]:
        export.add_argument("--"+name,action="store_true",help=help_text)
    check=sub.add_parser("validate",help="출력 스키마 검증"); check.add_argument("folder",type=Path)
    sub.add_parser("gui",help="한국어 GUI 시작")
    args=parser.parse_args(argv)
    try:
        if args.action=="gui":
            from .gui import main as gui_main
            return gui_main()
        if args.action=="scan":
            print(json.dumps([c.to_dict() for c in discover(args.folder)],ensure_ascii=False,indent=2)); return 0
        if args.action=="validate":
            errors=validate_package(args.folder)
            print(json.dumps({"valid":not errors,"errors":errors},ensure_ascii=False,indent=2)); return 2 if errors else 0
        candidate=None
        if args.root:
            matches=[c for c in discover(args.folder) if c.root==args.root.absolute()]
            if len(matches)!=1: raise ValueError("--root가 scan 결과의 고유한 루트와 일치하지 않습니다.")
            candidate=matches[0]
        options=Options(raw_json=not args.no_raw,plugin_sources=not args.no_scripts,images=not args.no_images,decrypt=not args.no_decrypt,
                        audio=args.audio,movies=args.movies,llm=not args.no_llm,keep_tiles=not args.no_tiles,
                        sensitive_system=args.sensitive_system,game_id=args.game_id)
        def progress(stage,current,total,errors):
            if current % 50==0 or current==total: print(f"[{current}/{total}] {stage} (오류 {errors})",file=sys.stderr)
        result=Extractor(options,progress).run(args.folder,args.output,candidate)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return 0 if result["state"] in ("complete","complete_with_issues") else 2
    except (ValueError,OSError,Cancelled) as exc:
        print("처리할 수 없습니다: "+str(exc),file=sys.stderr); return 2
    except KeyboardInterrupt:
        print("중단되었습니다. 새 출력 폴더에서 다시 실행하세요.",file=sys.stderr); return 130

if __name__=="__main__": raise SystemExit(main())
