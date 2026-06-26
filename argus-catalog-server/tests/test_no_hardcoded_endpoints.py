"""거버넌스 게이트(ratchet): 런타임 코드의 하드코딩 엔드포인트 증가 금지.

CLAUDE.md §2.1 운영 견고성 — 호스트/IP/포트/URL/자격은 설정(app.core.config) 경유.

catalog-server 는 현재 일부 모듈에서 `config.get(key, "http://localhost:...")` 형태의
**config-overridable fallback 기본값**을 두고 있다(아래 _BASELINE). 이는 하드-블로킹은
아니나 §2.1 의 "기본값은 core/config 에 집중" 원칙과는 어긋나는 잔존 부채다.

본 게이트는 **새 위반 유입을 차단**(ratchet)하고 기존 부채는 _BASELINE 으로 명시·동결한다.
신규 파일은 0건이어야 하며, 기존 파일도 카운트가 baseline 을 넘으면 실패한다.
부채 burn-down(기본값 core/config 집중)은 CLAUDE.md §6 TODO 로 별도 진행.
"""

import re
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parents[1] / "app"

# 설정 기본값을 두는 것이 허용된 위치(스캔 제외).
_ALLOWED_PREFIXES = ("core/config",)

_PATTERNS = [
    re.compile(r"\blocalhost\b", re.IGNORECASE),
    re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"),          # IPv4 리터럴
    re.compile(r"https?://[A-Za-z0-9.\-]"),               # http(s):// 호스트
]

# 기존 잔존 부채(파일별 위반 라인 수). 줄여나갈 대상 — 절대 늘리지 말 것.
# burn-down: 기본값을 app.core.config 로 이관하면 해당 카운트를 낮춘다.
_BASELINE: dict[str, int] = {
    "ai/registry.py": 3,                  # openai/ollama/anthropic base_url fallback
    "ai/providers/anthropic.py": 1,       # base_url 기본값(vendor 공개 URL)
    "ai/providers/ollama.py": 2,          # docstring + base_url 기본값
    "ai/providers/openai.py": 1,
    "embedding/registry.py": 2,
    "embedding/providers/openai.py": 1,
    "embedding/providers/ollama.py": 2,
    "catalog/sync.py": 2,                 # catalog_url 127.0.0.1 기본 + host fallback
    "settings/service.py": 2,             # object_storage_endpoint localhost 기본
    "quality/service.py": 1,              # host fallback
    "oci_hub/router.py": 2,               # 0.0.0.0→localhost 호스트네임 해석 분기
    "models/uc_compat.py": 1,             # mlflow uc:http://localhost:4600
}


def _is_comment(line: str) -> bool:
    return line.lstrip().startswith("#")


def _violations_in_text(text: str) -> list[tuple[int, str]]:
    hits: list[tuple[int, str]] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if _is_comment(line):
            continue
        if any(p.search(line) for p in _PATTERNS):
            hits.append((lineno, line.strip()))
    return hits


def _rel(path: Path) -> str:
    return path.relative_to(_APP_DIR).as_posix()


def _scan() -> dict[str, list[tuple[int, str]]]:
    found: dict[str, list[tuple[int, str]]] = {}
    for path in sorted(_APP_DIR.rglob("*.py")):
        rel = _rel(path)
        if "__pycache__" in rel or any(rel.startswith(p) for p in _ALLOWED_PREFIXES):
            continue
        hits = _violations_in_text(path.read_text(encoding="utf-8"))
        if hits:
            found[rel] = hits
    return found


def test_detector_flags_known_hardcoded_endpoints():
    """탐지기 자체 검증 — 하드코딩 샘플을 반드시 잡아낸다(게이트 실효성 증명)."""
    sample = (
        'host = "localhost"\n'
        'url = "http://10.0.0.5:8080/api"\n'
        'ok = settings.db_host\n'
    )
    flagged = {h[0] for h in _violations_in_text(sample)}
    assert flagged == {1, 2}  # line 3 (settings 참조)은 위반 아님


def test_no_new_hardcoded_endpoints():
    """신규/증가한 하드코딩 엔드포인트 0건 (기존 부채는 _BASELINE 으로 동결)."""
    found = _scan()
    regressions: list[str] = []
    for rel, hits in found.items():
        allowed = _BASELINE.get(rel, 0)
        if len(hits) > allowed:
            for lineno, line in hits[allowed:]:
                regressions.append(f"{rel}:{lineno}: {line}")

    assert not regressions, (
        "새 하드코딩 엔드포인트 유입 — 설정(app.core.config) 경유로 옮기세요:\n"
        + "\n".join(regressions)
    )


def test_baseline_is_not_stale():
    """_BASELINE 이 실제보다 부풀려지지 않도록(부채를 줄였으면 baseline 도 낮추도록) 동기 유지."""
    found = _scan()
    stale: list[str] = []
    for rel, allowed in _BASELINE.items():
        actual = len(found.get(rel, []))
        if actual < allowed:
            stale.append(f"{rel}: baseline={allowed} > actual={actual} → baseline 낮추세요")
        elif actual == 0:
            stale.append(f"{rel}: 위반 0 → _BASELINE 에서 제거하세요")
    assert not stale, "부채가 줄었습니다 — _BASELINE 동기화 필요:\n" + "\n".join(stale)
