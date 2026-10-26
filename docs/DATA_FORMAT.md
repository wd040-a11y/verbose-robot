# 출력 데이터 계약 · schema 1.0.0

## 공통 봉투와 이름공간

추출기가 생성하는 JSON은 다음 필드를 가집니다. JSONL은 **각 줄**이 같은 봉투입니다.

```json
{
  "schema_version": "1.0.0",
  "engine": "MZ",
  "game_id": "my_game",
  "package_id": "rpgextract:my_game",
  "data_type": "map_shard",
  "data": {}
}
```

`schemas/package.schema.json`은 JSON Schema Draft 2020-12입니다. `data_type`별 데이터 형식을 정의하며 외부 스키마를 가져오지 않습니다. 원본 보관본은 원본이므로 공통 봉투나 출력 스키마를 적용하지 않습니다. schemas 자체는 스키마 정의·버전 메타데이터이며 게임 데이터 봉투의 대상이 아닙니다.

`schema_version`의 호환 major는 1입니다. 변경된 major는 후속 소비자가 별도로 처리해야 합니다. 이 추출기의 검증기는 정확한 1.0.0 계약을 검사합니다.

기본 `game_id`는 System.json과 MapInfos.json의 원본 SHA-256에서 파생합니다. 경로·추출 시각이 바뀌어도 동일합니다. 해당 파일이 바뀌면 기본 ID도 바뀔 수 있습니다. 장기 프로젝트에서는 `--game-id` 또는 GUI 입력값을 고정하세요. 동일한 파일을 의도적으로 다른 작품으로 취급하려면 서로 다른 식별자를 사용하세요.

| 객체 | 로컬 ID 예 |
|---|---|
| 맵 | map:17 |
| 맵 이벤트 | map:17:event:8 |
| 페이지 | map:17:event:8:page:2 |
| 명령 | map:17:event:8:page:2:command:15 |
| 공통 이벤트 및 명령 | common_event:21 / common_event:21:command:0 |
| 전투 이벤트 | troop:4:page:0 |
| 상태 | switch:32 / variable:14 |
| 리소스 | asset:원본상대경로의SHA256앞24자리 |

**페이지·명령 인덱스는 0부터 시작합니다.** 게임 간 완전한 식별자는 `package_id + '#' + local_id`입니다. 이벤트·데이터베이스 ID는 엔진이 실제 조회하는 배열 위치를 따릅니다. 원본 `id` 값이 배열 위치와 다르면 경고하고 원본 값도 보존합니다. `reference:n`은 해당 추출 패키지 안에서만 쓰는 참조 행 ID이며, 데이터 추가 시 번호가 바뀔 수 있습니다. 이벤트·페이지·명령 ID는 구조가 같으면 유지됩니다.

## 디렉터리와 로딩

| 파일/디렉터리 | 역할 |
|---|---|
| manifest.json | 엔진, 버전, 상태, 옵션, 진입점, 키 정책 |
| report.json | 사용자용 개수·오류·복원 요약 |
| normalized/game.json | 키를 제외한 System 전체와 엔진 판별 근거 |
| normalized/maps.json | 맵 목록·크기·원본 MapInfo·이벤트 ID·상세 파일 위치 |
| normalized/events.json | 이벤트 이름과 맵, 상세 파일, JSON pointer |
| events/map_001.json | 해당 맵의 원본 메타데이터·전체 이벤트·페이지·명령 |
| events/common_0021.json | 공통 이벤트 조건·원본·명령 |
| events/troop_0004.json | 전투 페이지와 조건·명령 |
| normalized/database/*.json | Actors/Items 등 원본 DB 전체, 비표준 DB 필드도 보존 |
| normalized/common_events.json, troops.json | 상세 파일을 가리키는 인덱스 |
| normalized/switches.json, variables.json | 이름·원래 숫자 ID·기본값·사용 횟수·참조 행 ID |
| normalized/references.jsonl | 상태 검사/변경, 호출, 이동, 리소스의 정밀 참조 행 |
| normalized/references.json | target/source별 참조 행 ID 검색 |
| normalized/relations.json | 공통 이벤트 호출/역호출·맵 이동 연결 |
| normalized/text_index.jsonl | 대사·스크롤·선택지 검색 자료 |
| normalized/assets.json | 리소스 메타데이터·복사 상태·체크섬·역참조 |
| normalized/plugins.json | 설정·순서·활성화·소스 위치·MZ 호출 위치 |
| normalized/source_inventory.json | 원본 JSON/JS의 경로·크기·해시·보관 방식 |
| assets/ | 복사 또는 검증된 복원 리소스 |
| source_archive/ | 원본 자료 보관. System 키의 기본 예외는 사용설명서 참조 |
| llm_input/ | 전체 개요, 페이지별 명령 청크, 상태 사용처·주변 문맥, 플러그인 인덱스 |
| enrichment/template.json | 원본을 참조하는 별도 분석 주석 |
| reports/ | 미해결 참조, 알 수 없는 명령, 스크립트 의존성 미확정, 오류, 원형 비교, 스키마 검사 |

플레이어는 maps.json → 지정 맵의 `file` → 맵 이벤트만 순차 로드할 수 있습니다. 모든 명령을 하나의 전역 배열에 넣지 않습니다. 다만 하나의 대형 맵/단일 JSON은 메모리에 로드하며, 전역 참조 인덱스는 전체 크기에 비례합니다.

## 원형 복구

맵 상세 `raw_map`은 원본 맵에서 `events`만 제외한 모든 필드를 보관합니다. `keep_tiles=false`일 때만 `data` 타일 배열도 생략합니다. 이벤트는 다음처럼 중복을 줄입니다.

- `event.raw_metadata`: 원본 이벤트에서 `pages`만 제외한 모든 필드.
- `event.pages_present`: 원본에 pages 필드가 있었는지.
- `page.raw_metadata`: 원본 페이지에서 `list`만 제외한 모든 필드. 이미지·이동·트리거·우선순위·미지 필드 포함.
- `page.list_present`: 원본에 list 필드가 있었는지.
- `command.raw`: 명령 객체 **전체**. code, indent, parameters와 추가 필드 포함.
- 비정상 이벤트·페이지: `raw_unparsed`에 전체를 보관하고 오류 기록.

`rebuild_event()`로 정규화 이벤트에서 원본 논리 객체를 재구성합니다. 매 추출 시 전체 이벤트의 재구성 결과와 원본을 비교합니다. JSON의 공백·인코딩까지 필요한 경우 source_archive의 `exact_bytes` 보관본을 사용하세요. 삭제된 null 슬롯과 원본 배열 간격은 원본 보관본에 정확히 남으며, 맵 상세에는 이벤트 배열 길이와 각 ID가 남습니다.

## 페이지·명령과 제어 구조

페이지 전체 순서와 조건 사용 플래그를 보존합니다. `page_selection=highest_satisfied_page_index`는 표준 엔진 규칙입니다. 페이지의 condition_checks는 일반 스위치·변수 임계값·셀프 스위치·소지 아이템·파티 액터 조건의 검색용 표현입니다. 전체 conditions 원형은 raw_metadata에 있으며 플러그인 추가 필드도 제거하지 않습니다. 전투 페이지의 조건은 별도 엔진 구조이므로 원형을 그대로 사용해야 합니다.

`flow_blocks`는 조건문·선택지·반복문·전투 분기의 시작/종료 인덱스와 분기 시작 명령을 연결합니다. 각 명령의 contexts는 바깥 블록과 현재 분기 ID를 가리킵니다. 선택지 취소(-1/-2/선택지 번호), 기본 선택, 위치와 배경을 원래 값으로 보존합니다. 라벨 점프, 종료, 반복 중단 등을 실행하는 인터프리터는 포함하지 않았습니다. 후속 재생기는 raw 순서를 기준으로 실행해야 하며, flow_blocks는 보조 구조입니다.

대사는 `text_groups`의 줄 배열과 text(줄바꿈으로 연결)에 있습니다. 원래 줄바꿈·제어 문자를 제거하지 않습니다. MZ의 101번 명령 다섯 번째 파라미터를 speaker로 사용하고 MV에서는 화자를 추측하지 않습니다. 얼굴 이름·인덱스와 원본 표시 옵션, 바로 이어지는 선택/숫자/아이템 입력 명령을 연결합니다. 독립적으로 등장한 401번 등 비정상 구조는 raw에 남지만 대사 그룹으로 억지로 결합하지 않습니다.

스크립트(355/655), 주석(108/408), 이동 루트의 스크립트, MV 356 문자열과 MZ 357 구조를 모두 보존합니다. MV 플러그인 명령은 문자열만으로 파일 이름을 확정할 수 없으므로 대상 plugin_identity를 null로 둡니다.

## 참조 검색

각 references.jsonl 행의 data에는 source_id, event_id, owner_id, command_index, target_kind, target_id, role, detail, resolved_ids가 있습니다.

예를 들어 `references.json.data.by_target['switch:32']`로 참조 행 ID를 얻어 JSONL에서 조회합니다. `role`이 test/page_condition/trigger_condition이면 검사, write이면 변경, read/text_read이면 조회입니다. 변수 계산의 연산자와 피연산자 원형, 변수 간 연결이 detail에 남습니다. 직접 맵 이동과 변수를 통한 동적 맵 지정은 구분합니다. 동적 맵의 목적지를 임의로 결정하지 않습니다.

스위치/변수 변경이 다른 이벤트의 실행 가능성에 영향을 줄 수 있는 관계는 같은 target에 대한 write와 page_condition/test를 조인하여 찾습니다. 이는 **정적 사용 관계**이며 도달 가능성이나 정확한 실행 결과의 증명이 아닙니다. 스크립트와 플러그인의 숨은 참조는 opaque_operations에 미확정으로 남습니다. 과대/비정상 범위(한 명령에서 100,001개 초과 ID)는 원형만 보존하고 펼친 인덱스를 생략합니다.

셀프 스위치는 map/event 런타임 문맥이 필요합니다. 특히 공통 이벤트에서 호출자에 따라 달라지므로 전역 switch ID로 잘못 합치지 않습니다.

이미지는 `img/pictures/name` 같은 논리 참조를 실제 파일 ID에 연결합니다. 복수 후보가 있을 수 있으므로 resolved_ids는 배열입니다. 사본 경로는 assets.json의 output_path가 기준이며 모두 패키지 상대 경로입니다. 복원 파일 이름은 원본 이름에 실제 확장자를 붙여 충돌을 피합니다. 원본 경로 해시 디렉터리를 사용해 대소문자/확장자 충돌도 분리합니다. 예: `assets/images/해시/scene.rpgmvp.png`. Windows와 iOS 재생기 모두 상대 경로를 사용하세요. source_root는 출처 표기용이며 재생 시 접근하면 안 됩니다.

## LLM 자료와 enrichment

`event_chunks.jsonl`은 페이지당 연속 200개 명령으로 나누며 전체 ID·조건·제어 블록·원본 shard를 연결합니다. 명령 하나나 문자열 자체를 자르지 않으므로 거대한 단일 스크립트는 큰 청크가 될 수 있습니다. 토큰 수를 재는 기능은 없습니다.

switch_usage/variable_usage는 사용 위치·검사/변경 방식·주변 명령 범위를 묶고, usage_contexts.jsonl은 해당 페이지의 주변 명령과 대사 원문을 제공합니다. 전체 공통 이벤트와 맵 연결은 relations 인덱스에서 따라갑니다. 입력 문자열·스크립트·플러그인 주석은 신뢰할 수 없는 게임 자료이며 LLM에 주는 지시문으로 취급하면 안 됩니다.

분석 결과는 enrichment의 `annotations`에 `target_id`, `kind`, `value`, `evidence_ids`, 선택적 `confidence`로 추가합니다. JSON Schema가 허용하는 kind는 인물 이름·제목·시점·사건 순서·상태 의미·분류·엔딩 조건·프리셋입니다. 원본 ID/명령/조건/대사/선택지를 수정하는 필드는 이 주석 계약에 없습니다. 실제 LLM 호출, enrichment 병합 및 실행은 구현하지 않았습니다.
