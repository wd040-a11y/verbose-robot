# RPG Maker Extractor 0.1.0

RPG Maker **MV / MZ** 게임의 이벤트·조건·대사·선택지·상태 참조·리소스를 로컬에서 추출하는 Python 프로그램입니다. 한국어 GUI와 명령줄 도구를 제공합니다. 재생기와 LLM 분석기는 포함하지 않습니다.

## Windows에서 시작하기

1. ZIP을 새 폴더에 모두 풉니다. ZIP 내부에서 바로 실행하지 마세요.
2. [Python 공식 사이트](https://www.python.org/downloads/windows/)에서 **Python 3.11 이상 64비트**를 설치합니다. 설치 시 Python Launcher와 PATH 옵션을 활성화하세요.
3. **`install_and_run.bat`**를 더블클릭합니다. 첫 설치에는 라이브러리 다운로드를 위한 인터넷 연결이 필요합니다.
4. 이후에는 **`run.bat`**를 더블클릭합니다. 설치가 끝난 뒤 추출 과정은 인터넷을 사용하지 않습니다.
5. 게임 폴더 선택 → 게임 분석 → 데이터 루트 선택 → 빈 출력 위치 지정 → 추출 시작.

`report.json`의 `state`, `schema_valid`, 오류 개수를 확인하세요. 문제가 있는 파일은 `reports/warnings.json`에 기록합니다. 결과를 다시 만들 때는 새 빈 폴더를 사용하세요.

**이 배포본은 전체 소스입니다. 미리 빌드된 Windows EXE는 포함하지 않습니다.** Linux 실행 환경에서 핵심 테스트와 Qt offscreen GUI를 검증했습니다. 실제 Windows의 파일 선택창, 정션 권한, EXE 실행은 Windows에서 추가 확인해야 합니다.

## 포함된 결과물

| 경로 | 내용 |
|---|---|
| `src/rpgextractor/` | 추출기·한국어 GUI·CLI 모듈 |
| `src/rpgextractor/schemas/` | 출력 JSON Schema 2020-12 |
| `tests/` | A~J 및 경계·보안·GUI 자동 테스트 |
| `samples/` | 직접 만든 MV/MZ 테스트 프로젝트 데이터 |
| `tools/sample_factory.py` | 샘플·대규모 테스트 자료 생성기 |
| `build_windows.ps1` | 테스트 후 Windows EXE 제작 |
| `.github/workflows/windows.yml` | Windows CI 테스트·빌드 설정 |
| `docs/USER_GUIDE.md` | 사용법·문제 해결 |
| `docs/DATA_FORMAT.md` | 패키지 계약·ID·참조·LLM 자료 |
| `docs/SUPPORT.md` | 구현 범위·제한·검증 근거 |
| `docs/TEST_RESULTS.md` | 실제 실행한 테스트 결과 |

## 개발자 실행

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[gui,dev]"
.\.venv\Scripts\python launch_gui.py
.\.venv\Scripts\python -m pytest -q
```

Python 3.11 이상이 필요합니다. `PySide6`는 GUI, `jsonschema`는 출력 검증, `Pillow`는 이미지 검사에 사용합니다. CLI만 사용할 때는 `pip install -e .`로 GUI 없이 설치할 수 있습니다.

```powershell
.\.venv\Scripts\python -m rpgextractor scan "C:\Games\MyGame"
.\.venv\Scripts\python -m rpgextractor extract "C:\Games\MyGame" "D:\Exports\MyGame"
.\.venv\Scripts\python -m rpgextractor validate "D:\Exports\MyGame"
```

## Windows EXE 제작

Windows PowerShell에서 다음을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\build_windows.ps1
```

`dist\RPGMakerExtractor\RPGMakerExtractor.exe`가 생성됩니다. **같은 폴더의 `_internal` 등 부속 파일을 함께 배포**하세요. EXE 파일 하나만 옮기면 실행되지 않습니다. PyInstaller는 대상 Windows에서 빌드해야 합니다. Linux에서 Windows EXE를 검증하거나 교차 빌드한 것으로 주장하지 않습니다.

권한과 이용 허락이 있는 자료를 처리하세요. 원본 실행 파일과 JavaScript는 실행하지 않고, 원본 파일 내용은 수정하지 않습니다. 결과의 자동 공유·외부 업로드 기능은 없습니다.
