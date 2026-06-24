"""데이터 표준 API 엔드포인트."""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.standard import service
from app.standard.schemas import (
    AutoMapResult,
    BulkResult,
    CodeGroupBulkRequest,
    CodeGroupCreate,
    CodeGroupResponse,
    CodeGroupUpdate,
    CodeValueCreate,
    CodeValueResponse,
    ComplianceStats,
    DatasetTermMapping,
    DictionaryCreate,
    DictionaryResponse,
    DictionaryUpdate,
    DomainBulkRequest,
    DomainCreate,
    DomainResponse,
    DomainUpdate,
    MorphemeResult,
    TermBulkRequest,
    TermCreate,
    TermMappingCreate,
    TermMappingResponse,
    TermResponse,
    TermUpdate,
    WordBulkRequest,
    WordCreate,
    WordResponse,
    WordUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/standards", tags=["standards"])


# ---------------------------------------------------------------------------
# Bulk file import (CSV/XLSX) — 표준 4종 일괄 적재
# ---------------------------------------------------------------------------

@router.post("/import-file", response_model=BulkResult, status_code=201)
async def import_standards_file(
    kind: str = Form(...),
    dictionary_id: int = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    """CSV/XLSX 파일을 업로드해 kind(word|term|domain|code) 표준을 일괄 적재."""
    if kind not in service.IMPORT_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"unknown kind '{kind}' (allowed: {sorted(service.IMPORT_KINDS)})",
        )
    content = await file.read()
    result = await service.import_standards_file(
        session, kind, dictionary_id, file.filename or "upload", content
    )
    await session.commit()
    return result


# ---------------------------------------------------------------------------
# Dictionary
# ---------------------------------------------------------------------------

@router.post("/dictionaries", response_model=DictionaryResponse, status_code=201)
async def create_dictionary(data: DictionaryCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_dictionary(session, data)
    await session.commit()
    return result


@router.get("/dictionaries", response_model=list[DictionaryResponse])
async def list_dictionaries(session: AsyncSession = Depends(get_session)):
    return await service.list_dictionaries(session)


@router.get("/dictionaries/{dict_id}", response_model=DictionaryResponse)
async def get_dictionary(dict_id: int, session: AsyncSession = Depends(get_session)):
    d = await service.get_dictionary(session, dict_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dictionary not found")
    return await service._build_dict_response(session, d)


@router.put("/dictionaries/{dict_id}", response_model=DictionaryResponse)
async def update_dictionary(dict_id: int, data: DictionaryUpdate, session: AsyncSession = Depends(get_session)):
    result = await service.update_dictionary(session, dict_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Dictionary not found")
    await session.commit()
    return result


@router.delete("/dictionaries/{dict_id}", status_code=204)
async def delete_dictionary(dict_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_dictionary(session, dict_id):
        raise HTTPException(status_code=404, detail="Dictionary not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Word
# ---------------------------------------------------------------------------

@router.post("/words", response_model=WordResponse, status_code=201)
async def create_word(data: WordCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_word(session, data)
    await session.commit()
    return result


@router.post("/words/bulk", response_model=BulkResult, status_code=201)
async def bulk_create_words(data: WordBulkRequest, session: AsyncSession = Depends(get_session)):
    result = await service.bulk_create_words(session, data.items)
    await session.commit()
    return result


@router.get("/words", response_model=list[WordResponse])
async def list_words(
    dictionary_id: int = Query(...),
    word_type: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    return await service.list_words(session, dictionary_id, word_type)


@router.get("/words/{word_id}", response_model=WordResponse)
async def get_word(word_id: int, session: AsyncSession = Depends(get_session)):
    w = await service.get_word(session, word_id)
    if not w:
        raise HTTPException(status_code=404, detail="Word not found")
    return WordResponse.model_validate(w)


@router.put("/words/{word_id}", response_model=WordResponse)
async def update_word(word_id: int, data: WordUpdate, session: AsyncSession = Depends(get_session)):
    result = await service.update_word(session, word_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Word not found")
    await session.commit()
    return result


@router.delete("/words/{word_id}", status_code=204)
async def delete_word(word_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_word(session, word_id):
        raise HTTPException(status_code=404, detail="Word not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Domain
# ---------------------------------------------------------------------------

@router.post("/domains", response_model=DomainResponse, status_code=201)
async def create_domain(data: DomainCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_domain(session, data)
    await session.commit()
    return result


@router.post("/domains/bulk", response_model=BulkResult, status_code=201)
async def bulk_create_domains(data: DomainBulkRequest, session: AsyncSession = Depends(get_session)):
    result = await service.bulk_create_domains(session, data.items)
    await session.commit()
    return result


@router.get("/domains", response_model=list[DomainResponse])
async def list_domains(dictionary_id: int = Query(...), session: AsyncSession = Depends(get_session)):
    return await service.list_domains(session, dictionary_id)


@router.get("/domains/{domain_id}", response_model=DomainResponse)
async def get_domain(domain_id: int, session: AsyncSession = Depends(get_session)):
    d = await service.get_domain(session, domain_id)
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")
    return await service._build_domain_response(session, d)


@router.put("/domains/{domain_id}", response_model=DomainResponse)
async def update_domain(domain_id: int, data: DomainUpdate, session: AsyncSession = Depends(get_session)):
    result = await service.update_domain(session, domain_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Domain not found")
    await session.commit()
    return result


@router.delete("/domains/{domain_id}", status_code=204)
async def delete_domain(domain_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_domain(session, domain_id):
        raise HTTPException(status_code=404, detail="Domain not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Code Group / Value
# ---------------------------------------------------------------------------

@router.post("/code-groups", response_model=CodeGroupResponse, status_code=201)
async def create_code_group(data: CodeGroupCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_code_group(session, data)
    await session.commit()
    return result


@router.post("/code-groups/bulk", response_model=BulkResult, status_code=201)
async def bulk_create_code_groups(data: CodeGroupBulkRequest, session: AsyncSession = Depends(get_session)):
    result = await service.bulk_create_code_groups(session, data.items)
    await session.commit()
    return result


@router.get("/code-groups", response_model=list[CodeGroupResponse])
async def list_code_groups(dictionary_id: int = Query(...), session: AsyncSession = Depends(get_session)):
    return await service.list_code_groups(session, dictionary_id)


@router.get("/code-groups/{group_id}", response_model=CodeGroupResponse)
async def get_code_group(group_id: int, session: AsyncSession = Depends(get_session)):
    cg = await service.get_code_group(session, group_id)
    if not cg:
        raise HTTPException(status_code=404, detail="Code group not found")
    return await service._build_code_group_response(session, cg)


@router.put("/code-groups/{group_id}", response_model=CodeGroupResponse)
async def update_code_group(group_id: int, data: CodeGroupUpdate, session: AsyncSession = Depends(get_session)):
    result = await service.update_code_group(session, group_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Code group not found")
    await session.commit()
    return result


@router.delete("/code-groups/{group_id}", status_code=204)
async def delete_code_group(group_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_code_group(session, group_id):
        raise HTTPException(status_code=404, detail="Code group not found")
    await session.commit()


@router.post("/code-groups/{group_id}/values", response_model=CodeValueResponse, status_code=201)
async def add_code_value(group_id: int, data: CodeValueCreate, session: AsyncSession = Depends(get_session)):
    cg = await service.get_code_group(session, group_id)
    if not cg:
        raise HTTPException(status_code=404, detail="Code group not found")
    result = await service.add_code_value(session, group_id, data)
    await session.commit()
    return result


@router.put("/code-values/{value_id}", response_model=CodeValueResponse)
async def update_code_value(value_id: int, data: CodeValueCreate, session: AsyncSession = Depends(get_session)):
    result = await service.update_code_value(session, value_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Code value not found")
    await session.commit()
    return result


@router.delete("/code-values/{value_id}", status_code=204)
async def delete_code_value(value_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_code_value(session, value_id):
        raise HTTPException(status_code=404, detail="Code value not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Term + 형태소 분석
# ---------------------------------------------------------------------------

@router.get("/terms/analyze", response_model=MorphemeResult)
async def analyze_term(
    dictionary_id: int = Query(...),
    term_name: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_session),
):
    """용어를 형태소 분석하여 단어 분해, 영문 약어, 도메인 추천 결과를 반환."""
    return await service.analyze_term(session, dictionary_id, term_name)


@router.post("/terms", response_model=TermResponse, status_code=201)
async def create_term(data: TermCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_term(session, data)
    await session.commit()
    return result


@router.post("/terms/bulk", response_model=BulkResult, status_code=201)
async def bulk_create_terms(data: TermBulkRequest, session: AsyncSession = Depends(get_session)):
    result = await service.bulk_create_terms(session, data.items)
    await session.commit()
    return result


@router.get("/terms", response_model=list[TermResponse])
async def list_terms(
    dictionary_id: int = Query(...),
    search: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    return await service.list_terms(session, dictionary_id, search)


@router.get("/terms/{term_id}", response_model=TermResponse)
async def get_term(term_id: int, session: AsyncSession = Depends(get_session)):
    t = await service.get_term(session, term_id)
    if not t:
        raise HTTPException(status_code=404, detail="Term not found")
    return await service._build_term_response(session, t)


@router.put("/terms/{term_id}", response_model=TermResponse)
async def update_term(term_id: int, data: TermUpdate, session: AsyncSession = Depends(get_session)):
    result = await service.update_term(session, term_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Term not found")
    await session.commit()
    return result


@router.delete("/terms/{term_id}", status_code=204)
async def delete_term(term_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_term(session, term_id):
        raise HTTPException(status_code=404, detail="Term not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Term-Column Mapping
# ---------------------------------------------------------------------------

@router.post("/mappings", response_model=TermMappingResponse, status_code=201)
async def create_mapping(data: TermMappingCreate, session: AsyncSession = Depends(get_session)):
    result = await service.create_term_mapping(session, data)
    await session.commit()
    return result


@router.get("/mappings", response_model=list[TermMappingResponse])
async def list_mappings(
    term_id: int | None = Query(None),
    dataset_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    return await service.list_term_mappings(session, term_id, dataset_id)


@router.delete("/mappings/{mapping_id}", status_code=204)
async def delete_mapping(mapping_id: int, session: AsyncSession = Depends(get_session)):
    if not await service.delete_term_mapping(session, mapping_id):
        raise HTTPException(status_code=404, detail="Mapping not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Auto-mapping + Dataset Term Mapping
# ---------------------------------------------------------------------------

@router.post("/mappings/auto-map", response_model=AutoMapResult)
async def auto_map_dataset(
    dictionary_id: int = Query(...),
    dataset_id: int = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """데이터셋의 컬럼을 표준 용어와 자동 매핑한다.

    컬럼의 field_path와 용어의 physical_name을 비교하여
    MATCHED (타입 호환) 또는 VIOLATION (타입 불일치)으로 매핑.
    """
    result = await service.auto_map_dataset(session, dictionary_id, dataset_id)
    await session.commit()
    return result


@router.get("/mappings/dataset", response_model=DatasetTermMapping)
async def get_dataset_term_mapping(
    dictionary_id: int = Query(...),
    dataset_id: int = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """데이터셋의 전체 컬럼-용어 매핑 현황을 조회한다."""
    return await service.get_dataset_term_mapping(session, dictionary_id, dataset_id)


# ---------------------------------------------------------------------------
# Compliance (표준 준수율)
# ---------------------------------------------------------------------------

@router.get("/compliance", response_model=ComplianceStats)
async def get_compliance(
    dictionary_id: int = Query(...),
    dataset_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """표준 준수율을 계산한다."""
    return await service.get_compliance_stats(session, dictionary_id, dataset_id)


# ---------------------------------------------------------------------------
# Change Log
# ---------------------------------------------------------------------------

@router.get("/change-logs")
async def list_change_logs(
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    return await service.list_change_logs(session, entity_type, entity_id, page, page_size)
