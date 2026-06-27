# CLAUDE.md — Argus Insight (Data + AI Platform) 모노레포 공통 원칙

> Claude Code 가 이 저장소(어느 패키지든)에서 작업할 때 자동 로드하는 **단일 기준** 문서.
> Argus 는 더 큰 솔루션의 일부 패키지군이며, **전 패키지에 동일한 공통 원칙**이 적용된다.
> (2026-06-24 신설 — 사용자 명시: "Argus도 전체 솔루션 일부 패키지야. 전부 같은 원칙이 적용되어야 해.")

## 0. 솔루션 안에서의 위치

- **Argus Insight** = 확장가능한 Data + AI Platform (K8s 에코시스템 · Data Catalog · Data Science Workbench · 모니터링).
- 동일 솔루션의 **K-AIR / air-swmm**(수공 5계층 온톨로지·NLQ)과 연계: air-swmm 은 모든 카탈로그 호출을 `/air-swmm/catalog/*` 프록시로 Argus 에 위임하고, **Argus 는 메인 데이터허브 포털**(엔터프라이즈 거버넌스 + 표준 4종 카탈로그 + 리니지 제공 주체)이다. air-swmm 은 도메인 의미·마트의 생산자이자 표준 소비자.
- 두 코드베이스는 별개 repo 이지만 **공통 원칙은 동일**해야 한다. air-swmm 의 거버넌스(운영 견고성·dry-run·소프트삭제·TDD·OpenSpec)를 Argus 가 동일하게 따른다.

## 1. 패키지 맵

| 패키지 | 역할 | 스택 |
| --- | --- | --- |
| `argus-catalog-server` | 데이터 카탈로그 + **표준 4종(단어/용어/도메인/코드)** + 리니지·품질·거버넌스 API | FastAPI + SQLAlchemy(async) + PostgreSQL/MariaDB |
| `argus-catalog-ui` | 카탈로그 관리 UI (표준 dashboard 등) | Next.js |
| `argus-catalog-sdk` | 카탈로그 클라이언트 SDK | — |
| `argus-catalog-extensions` | 카탈로그 확장 | — |
| `argus-insight-server` | 플랫폼 중앙 서버 (Agent/DNS/Deploy/Workspace/Auth) | FastAPI |
| `argus-insight-ui` | 플랫폼 UI (Dashboard/Host/Deploy/Workspace/Monitoring) | Next.js |
| `argus-insight-agent` | 호스트 리소스 수집 에이전트 (60s heartbeat) | — |
| `argus-insight-extensions` / `-thirdparties` / `-workspace-provisioner` / `-docs` | 확장·서드파티·프로비저너·문서 | — |
| `argus-test-fixtures` | 테스트 픽스처 | — |

패키지별 세부는 각 디렉터리 README / 코드 참조. 신규 패키지도 본 문서 원칙을 상속한다.

## 2. 공통 원칙 (전 패키지 강제)

아래 4개 세트는 도메인·언어·패키지 무관하게 모든 작업에 우선 적용한다. (도메인 특수 원칙은 §4 에서 제외 명시.)

### 2.1 운영 견고성 (operational-resilience)

배포→고객사 반입 사업구조. **모든 코드 작업의 최상위 원칙.**

1. **하드코딩·비밀 금지**: 호스트/IP/포트/자격/URL/경로는 설정(`config.yml`/`config.properties`/환경변수, 즉 `app.core.config.settings` 또는 각 패키지의 동등 설정) 경유만. 소스·기본값에 비밀 리터럴 **절대 금지**. 런타임 모듈은 `localhost`/IP 직접 사용 금지(설정 심볼 참조). 새 키는 설정 예시에 동반.
2. **fail-fast**: 필수 비밀 부재 시 조용한 하드코딩 fallback 금지 → 명확한 메시지로 기동 실패.
3. **연결 견고성**: 외부 연결(DB·PowerDNS·Harbor·K8s·Agent·MindsDB 등)은 timeout·재시도·헬스체크를 둔다. 한 컴포넌트 장애가 전체로 전파 금지(부분 응답+degradation).
4. **정확한 장애 진단**: 외부 I/O 실패 메시지는 **컴포넌트·대상(host:port)·작업·조치** 4요소 포함. "오류가 발생했습니다" 류 모호 메시지·bare except 금지. 비밀 값은 메시지에 미노출.

### 2.2 dry-run 우선 + 삭제 정책

1. **dry-run 우선**: 벌크 적재·마이그레이션·일괄 변경 스크립트/엔드포인트는 `dry-run`(미적용) 결과를 먼저 보고하고, 검수 후 `--apply`. 자동 물질화 금지.
2. **삭제 정책 — 패키지 성격에 따른다** (2026-06-27 사용자 명시):
   - **`argus-catalog-server` 등 관리(management) 플레인**: 자산·표준·메타의 **물리 삭제(hard delete)는 정당한 관리 기능**이다. 단건/대량 삭제 API 를 그대로 유지한다. (예: `app/standard` 의 `delete_*`, `app/catalog` 의 삭제 엔드포인트.)
   - **소프트삭제(`status='deleted'`)는 감사·보존(retention)이 명시적으로 요구되는 자산에만** 적용한다(전면 강제 아님). 변경 이력은 `*_change_log` 로 남긴다.
   - air-swmm(K-AIR)의 "카탈로그 자산 전면 소프트삭제"는 **온톨로지 도메인 전용 정책**이며 Argus 관리 플레인에 그대로 이식하지 않는다(§4 비상속).
3. **멱등**: 적재/동기화는 재실행 안전(멱등) — 중복 키는 1회만, 재적재해도 결과 동일.
4. **대량 작업 게이트**: 100건 이상 일괄 삭제/덮어쓰기는 dry-run 결과 사용자 검토 강제 + 백업 확인.

### 2.3 TDD 우선 + OpenSpec (spec-driven)

1. **TDD 강제 (red-green-refactor)**: 신규 기능·버그픽스·리팩터는 **실패 테스트를 먼저 작성**하고, 올바른 실패를 확인한 뒤 최소 구현으로 통과시킨다. 프로덕션 코드보다 테스트가 먼저. (참고 스킬: superpowers `test-driven-development`.)
2. **테스트 인프라 재사용**: `argus-catalog-server` 는 `tests/conftest.py`(in-memory SQLite + ASGI 클라이언트, `get_session` override)로 외부 DB 없이 라우터·서비스를 검증한다. 이 패턴을 신규 테스트의 기본으로 한다.
3. **OpenSpec(spec-driven)**: 다단계/계약 변경은 제안(proposal)→스펙(delta)→tasks→구현→아카이브 흐름으로 추적한다. (도입 예정 — §6.)
4. **회귀 게이트**: 매 변경은 해당 패키지 테스트 + lint 통과 후 머지.

### 2.4 벌크 부분성공 패턴 (bulk partial-success)

1. **단건 → 벌크**: 외부에서 다건을 적재하는 API 는 단건 호출 반복이 아니라 **벌크 엔드포인트**를 제공한다(JSON 배열 + 파일 업로드 CSV/XLSX).
2. **행별 격리 + 부분 성공**: 행마다 SAVEPOINT(`session.begin_nested()`)로 격리 — 한 행 실패가 배치 전체를 롤백하지 않는다. 유효 행은 적재.
3. **표준 결과 계약**: `{total, created, failed, ids[], errors[{index, error}]}` 형태로 행별 실패 사유를 반환(환각·은폐 금지).
4. **단건 로직 재사용**: 벌크는 기존 단건 `create_*` 서비스를 재사용해 중복 로직을 만들지 않는다.

> **정전 예시(canonical reference)**: `argus-catalog-server/app/standard/` 의 표준 4종 벌크 적재
> (`POST /standards/{words,domains,terms}/bulk`, `/code-groups/bulk`, `/import-file`) — 위 4개 세트를 모두 만족하는 구현 + `tests/test_standard_bulk.py`. 신규 벌크 기능은 이 구조를 따른다.

## 3. 작업 컨벤션

- **한 PR = 한 패키지/모듈** — 패키지 경계를 넘는 변경은 분리한다.
- **브랜치 우선**: 기본 브랜치에서 직접 작업 금지 — `feat/…`·`fix/…` 브랜치 생성 후 작업.
- **커밋 메시지**: 한국어 본문 가능, 코드·로그·경로는 영문. 변경 사유·테스트 결과 포함.
- **응답에 등장한 고유명은 실제 데이터/스키마에 존재해야 함** (환각 방지).
- **인증 헤더 forward**: 프록시·연동 시 Authorization 헤더 변형 금지.
- **응답 언어**: 한국어 기본 (코드·로그·URL 영문 그대로).

## 4. 비상속 — Argus 에 적용하지 않는 K-AIR 도메인 특수 원칙

다음은 air-swmm(수공 온톨로지) 고유 원칙으로, **Argus 일반 패키지에는 강제하지 않는다**:

- **graph-naming-convention**(Neo4j lowerCamel/UpperCamel 관계명) — Argus 는 관계형/카탈로그 모델. *단, Argus 가 Neo4j 그래프를 직접 적재하는 경로가 생기면 그때 적용.*
- **NLQ 5대 원칙 / 5계층 그래프-그라운디드 / 5계층 라벨·BELONGS_TO_LAYER** — 온톨로지 도메인 전용.
- **codegraph-first** — air-swmm 의 `.codegraph` 인덱스 전제. Argus 는 해당 인덱스 부재 시 일반 탐색.

URN 규칙은 부분 적용: Argus 는 DataHub URN 호환을 유지하되, air-swmm 의 `urn:li:dataset:(…neo4j…)` 구체 포맷을 그대로 쓰지 않는다.

## 5. 거절 기준 (작업 중단·사용자 확인)

- 카탈로그 자산/표준사전 100건 이상 일괄 삭제 → dry-run 결과 검토 강제 (단건/소량 관리 삭제는 정상 기능)
- 표준사전·메타 일괄 덮어쓰기 → 백업 확인 + 충돌 보고서
- 비밀/엔드포인트 하드코딩 → 거부
- 테스트 없는 신규 프로덕션 코드 → 거부(TDD 위반)

## 6. 도입 예정 (TODO)

- [x] 하드코딩 엔드포인트 회귀 게이트(`test_no_hardcoded_endpoints`) catalog-server 추가 (ratchet, 2026-06-27)
- [ ] OpenSpec 워크플로(`openspec/`) 셋업 — 다단계 변경 추적
- [ ] 하드코딩 엔드포인트 부채 burn-down — 기본값을 `app.core.config` 로 집중 (ratchet baseline 낮추기)

> 참고: "하드삭제→소프트삭제" 전면 전환은 **TODO 에서 제외**. catalog-server 의 물리 삭제는 정당한 관리 기능(§2.2).

---

*Last updated: 2026-06-27 — 삭제 정책 정정(관리 플레인 hard delete 허용) + 하드코딩 게이트 반영*
