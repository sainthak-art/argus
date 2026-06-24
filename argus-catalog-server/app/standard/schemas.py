"""데이터 표준 Pydantic 스키마."""

from datetime import date, datetime

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Dictionary
# ---------------------------------------------------------------------------

class DictionaryCreate(BaseModel):
    dict_name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    version: str | None = None
    effective_date: date | None = None
    expiry_date: date | None = None
    created_by: str | None = None


class DictionaryUpdate(BaseModel):
    dict_name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    version: str | None = None
    status: str | None = None
    effective_date: date | None = None
    expiry_date: date | None = None


class DictionaryResponse(BaseModel):
    id: int
    dict_name: str
    description: str | None = None
    version: str | None = None
    status: str
    effective_date: date | None = None
    expiry_date: date | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    word_count: int = 0
    domain_count: int = 0
    term_count: int = 0
    code_group_count: int = 0


# ---------------------------------------------------------------------------
# Word
# ---------------------------------------------------------------------------

class WordCreate(BaseModel):
    dictionary_id: int
    word_name: str = Field(..., min_length=1, max_length=100)
    word_english: str = Field(..., min_length=1, max_length=100)
    word_abbr: str = Field(..., min_length=1, max_length=50)
    description: str | None = None
    word_type: str = "GENERAL"
    is_forbidden: str = "false"
    synonym_group_id: int | None = None


class WordBulkRequest(BaseModel):
    items: list["WordCreate"]


class WordUpdate(BaseModel):
    word_name: str | None = None
    word_english: str | None = None
    word_abbr: str | None = None
    description: str | None = None
    word_type: str | None = None
    is_forbidden: str | None = None
    synonym_group_id: int | None = None
    status: str | None = None


class WordResponse(BaseModel):
    id: int
    dictionary_id: int
    word_name: str
    word_english: str
    word_abbr: str
    description: str | None = None
    word_type: str
    is_forbidden: str
    synonym_group_id: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

class DomainCreate(BaseModel):
    dictionary_id: int
    domain_name: str = Field(..., min_length=1, max_length=100)
    domain_group: str | None = None
    data_type: str = Field(..., min_length=1, max_length=50)
    data_length: int | None = None
    data_precision: int | None = None
    data_scale: int | None = None
    description: str | None = None
    code_group_id: int | None = None


class DomainBulkRequest(BaseModel):
    items: list["DomainCreate"]


class DomainUpdate(BaseModel):
    domain_name: str | None = None
    domain_group: str | None = None
    data_type: str | None = None
    data_length: int | None = None
    data_precision: int | None = None
    data_scale: int | None = None
    description: str | None = None
    code_group_id: int | None = None
    status: str | None = None


class DomainResponse(BaseModel):
    id: int
    dictionary_id: int
    domain_name: str
    domain_group: str | None = None
    data_type: str
    data_length: int | None = None
    data_precision: int | None = None
    data_scale: int | None = None
    description: str | None = None
    code_group_id: int | None = None
    code_group_name: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Term
# ---------------------------------------------------------------------------

class TermCreate(BaseModel):
    dictionary_id: int
    term_name: str = Field(..., min_length=1, max_length=200)
    term_english: str | None = None         # auto-generated if omitted
    term_abbr: str | None = None            # auto-generated if omitted
    physical_name: str | None = None        # auto-generated if omitted
    domain_id: int | None = None
    description: str | None = None
    created_by: str | None = None


class TermBulkRequest(BaseModel):
    items: list["TermCreate"]


class TermUpdate(BaseModel):
    term_name: str | None = None
    term_english: str | None = None
    term_abbr: str | None = None
    physical_name: str | None = None
    domain_id: int | None = None
    description: str | None = None
    status: str | None = None


class TermWordInfo(BaseModel):
    word_id: int
    word_name: str
    word_english: str
    word_abbr: str
    word_type: str
    ordinal: int


class TermResponse(BaseModel):
    id: int
    dictionary_id: int
    term_name: str
    term_english: str
    term_abbr: str
    physical_name: str
    domain_id: int | None = None
    domain_name: str | None = None
    domain_data_type: str | None = None
    description: str | None = None
    status: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    words: list[TermWordInfo] = Field(default_factory=list)
    mapping_count: int = 0


# ---------------------------------------------------------------------------
# Code Group / Value
# ---------------------------------------------------------------------------

class CodeGroupCreate(BaseModel):
    dictionary_id: int
    group_name: str = Field(..., min_length=1, max_length=200)
    group_english: str | None = None
    description: str | None = None


class CodeGroupBulkItem(CodeGroupCreate):
    """벌크 적재용 코드그룹 — 코드값을 함께 중첩 적재."""
    values: list["CodeValueCreate"] = Field(default_factory=list)


class CodeGroupBulkRequest(BaseModel):
    items: list[CodeGroupBulkItem]


class CodeGroupUpdate(BaseModel):
    group_name: str | None = None
    group_english: str | None = None
    description: str | None = None
    status: str | None = None


class CodeValueCreate(BaseModel):
    code_value: str = Field(..., min_length=1, max_length=100)
    code_name: str = Field(..., min_length=1, max_length=200)
    code_english: str | None = None
    description: str | None = None
    sort_order: int = 0


class CodeValueResponse(BaseModel):
    id: int
    code_value: str
    code_name: str
    code_english: str | None = None
    description: str | None = None
    sort_order: int
    is_active: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CodeGroupResponse(BaseModel):
    id: int
    dictionary_id: int
    group_name: str
    group_english: str | None = None
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    values: list[CodeValueResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Term-Column Mapping
# ---------------------------------------------------------------------------

class TermMappingCreate(BaseModel):
    term_id: int
    dataset_id: int
    schema_id: int
    mapping_type: str = "MATCHED"


class TermMappingResponse(BaseModel):
    id: int
    term_id: int
    term_name: str | None = None
    dataset_id: int
    dataset_name: str | None = None
    schema_id: int
    column_name: str | None = None
    mapping_type: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Morpheme Analysis (형태소 분석 결과)
# ---------------------------------------------------------------------------

class MorphemeResult(BaseModel):
    """용어 형태소 분석 결과. 자동 추천용."""
    words: list[TermWordInfo]
    term_english: str           # 자동 생성된 영문명
    term_abbr: str              # 자동 생성된 영문 약어
    physical_name: str          # 자동 생성된 물리명
    recommended_domain: DomainResponse | None = None  # SUFFIX 단어 기반 도메인 추천
    unmatched_parts: list[str] = Field(default_factory=list)  # 매칭 안 된 부분


# ---------------------------------------------------------------------------
# Compliance (표준 준수율)
# ---------------------------------------------------------------------------

class ComplianceStats(BaseModel):
    total_columns: int = 0
    matched: int = 0
    similar: int = 0
    violation: int = 0
    unmapped: int = 0
    compliance_rate: float = 0.0     # (matched / total) * 100


# ---------------------------------------------------------------------------
# Auto-mapping (자동 매핑 결과)
# ---------------------------------------------------------------------------

class ColumnTermStatus(BaseModel):
    """데이터셋 컬럼별 표준 용어 매핑 상태."""
    schema_id: int
    column_name: str                         # 실제 컬럼명 (field_path)
    column_type: str                         # 실제 데이터 타입
    native_type: str | None = None           # 실제 네이티브 타입
    mapping_id: int | None = None            # 매핑 ID (없으면 미매핑)
    mapping_type: str | None = None          # MATCHED, SIMILAR, VIOLATION
    term_id: int | None = None               # 매핑된 용어 ID
    term_name: str | None = None             # 매핑된 용어 한글명
    term_physical_name: str | None = None    # 용어의 표준 물리명
    term_data_type: str | None = None        # 용어 도메인의 표준 데이터 타입
    term_data_length: int | None = None      # 용어 도메인의 표준 길이


class DatasetTermMapping(BaseModel):
    """데이터셋의 전체 컬럼-용어 매핑 현황."""
    dataset_id: int
    dictionary_id: int
    columns: list[ColumnTermStatus]
    compliance: ComplianceStats


class AutoMapResult(BaseModel):
    """자동 매핑 실행 결과."""
    created: int = 0                         # 새로 생성된 매핑 수
    updated: int = 0                         # 업데이트된 매핑 수
    matched: int = 0
    similar: int = 0
    violation: int = 0
    unmapped: int = 0


# ---------------------------------------------------------------------------
# Bulk load (단건 → 벌크 적재)
# ---------------------------------------------------------------------------

class BulkError(BaseModel):
    """벌크 적재 중 실패한 개별 행."""
    index: int                               # 입력 배열에서의 위치 (0-based)
    error: str                               # 실패 사유


class BulkResult(BaseModel):
    """벌크 적재 결과. 부분 성공을 허용하고 행별 실패를 보고한다."""
    total: int = 0                           # 입력 행 수
    created: int = 0                         # 성공 적재 수
    failed: int = 0                          # 실패 수
    ids: list[int] = Field(default_factory=list)       # 생성된 엔티티 id
    errors: list[BulkError] = Field(default_factory=list)


# Resolve forward reference to CodeValueCreate (defined above) for nested bulk item.
CodeGroupBulkItem.model_rebuild()
