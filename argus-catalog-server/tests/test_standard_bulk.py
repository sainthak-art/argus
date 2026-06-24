"""Tests for bulk loading of standard dictionary entries (words/terms/domains/codes)."""

import pytest

# ---------------------------------------------------------------------------
# Words — bulk JSON
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_create_words_inserts_all_rows(client, dictionary_id):
    payload = {
        "items": [
            {"dictionary_id": dictionary_id, "word_name": "고객", "word_english": "Customer", "word_abbr": "CUST"},
            {"dictionary_id": dictionary_id, "word_name": "번호", "word_english": "Number", "word_abbr": "NO"},
        ]
    }
    resp = await client.post("/api/v1/standards/words/bulk", json=payload)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert body["created"] == 2
    assert body["failed"] == 0
    assert body["errors"] == []

    # The rows are actually persisted and retrievable.
    listing = await client.get("/api/v1/standards/words", params={"dictionary_id": dictionary_id})
    names = {w["word_name"] for w in listing.json()}
    assert names == {"고객", "번호"}


@pytest.mark.asyncio
async def test_bulk_create_words_partial_success_reports_failed_rows(client, dictionary_id):
    """A duplicate word_name (UNIQUE violation) must fail only its own row.

    Valid rows still commit; the failed row is reported with its index.
    """
    payload = {
        "items": [
            {"dictionary_id": dictionary_id, "word_name": "고객", "word_english": "Customer", "word_abbr": "CUST"},
            {"dictionary_id": dictionary_id, "word_name": "고객", "word_english": "Customer", "word_abbr": "CUST"},
            {"dictionary_id": dictionary_id, "word_name": "번호", "word_english": "Number", "word_abbr": "NO"},
        ]
    }
    resp = await client.post("/api/v1/standards/words/bulk", json=payload)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["created"] == 2
    assert body["failed"] == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["index"] == 1   # the duplicate is the 2nd row

    # Both valid rows are persisted despite the failure in the middle.
    listing = await client.get("/api/v1/standards/words", params={"dictionary_id": dictionary_id})
    names = {w["word_name"] for w in listing.json()}
    assert names == {"고객", "번호"}


# ---------------------------------------------------------------------------
# Domains — bulk JSON
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_create_domains(client, dictionary_id):
    payload = {
        "items": [
            {"dictionary_id": dictionary_id, "domain_name": "번호", "data_type": "VARCHAR", "data_length": 20},
            {"dictionary_id": dictionary_id, "domain_name": "금액", "data_type": "NUMBER", "data_precision": 18, "data_scale": 2},
        ]
    }
    resp = await client.post("/api/v1/standards/domains/bulk", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["total"], body["created"], body["failed"]) == (2, 2, 0)

    listing = await client.get("/api/v1/standards/domains", params={"dictionary_id": dictionary_id})
    assert {d["domain_name"] for d in listing.json()} == {"번호", "금액"}


# ---------------------------------------------------------------------------
# Terms — bulk JSON (physical fields supplied to avoid morpheme dependency)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_create_terms(client, dictionary_id):
    payload = {
        "items": [
            {"dictionary_id": dictionary_id, "term_name": "고객번호",
             "term_english": "Customer Number", "term_abbr": "CUST_NO", "physical_name": "cust_no"},
            {"dictionary_id": dictionary_id, "term_name": "주문금액",
             "term_english": "Order Amount", "term_abbr": "ORD_AMT", "physical_name": "ord_amt"},
        ]
    }
    resp = await client.post("/api/v1/standards/terms/bulk", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["total"], body["created"], body["failed"]) == (2, 2, 0)

    listing = await client.get("/api/v1/standards/terms", params={"dictionary_id": dictionary_id})
    assert {t["term_name"] for t in listing.json()} == {"고객번호", "주문금액"}


# ---------------------------------------------------------------------------
# Code groups — bulk JSON with nested values
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_create_code_groups_with_values(client, dictionary_id):
    payload = {
        "items": [
            {
                "dictionary_id": dictionary_id, "group_name": "성별코드",
                "values": [
                    {"code_value": "M", "code_name": "남성", "sort_order": 1},
                    {"code_value": "F", "code_name": "여성", "sort_order": 2},
                ],
            },
            {"dictionary_id": dictionary_id, "group_name": "사용여부", "values": []},
        ]
    }
    resp = await client.post("/api/v1/standards/code-groups/bulk", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["total"], body["created"], body["failed"]) == (2, 2, 0)

    listing = await client.get("/api/v1/standards/code-groups", params={"dictionary_id": dictionary_id})
    groups = {g["group_name"]: g for g in listing.json()}
    assert set(groups) == {"성별코드", "사용여부"}
    assert {v["code_value"] for v in groups["성별코드"]["values"]} == {"M", "F"}


# ---------------------------------------------------------------------------
# File import (XLSX / CSV)
# ---------------------------------------------------------------------------

def _xlsx_bytes(headers, rows):
    import io

    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_import_words_from_xlsx(client, dictionary_id):
    content = _xlsx_bytes(
        ["단어명", "영문명", "영문약어"],
        [["고객", "Customer", "CUST"], ["번호", "Number", "NO"]],
    )
    resp = await client.post(
        "/api/v1/standards/import-file",
        data={"kind": "word", "dictionary_id": str(dictionary_id)},
        files={"file": ("words.xlsx", content,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["total"], body["created"], body["failed"]) == (2, 2, 0)

    listing = await client.get("/api/v1/standards/words", params={"dictionary_id": dictionary_id})
    assert {w["word_name"] for w in listing.json()} == {"고객", "번호"}


@pytest.mark.asyncio
async def test_import_domains_from_csv(client, dictionary_id):
    csv_text = "도메인명,데이터유형,길이\n번호,VARCHAR,20\n금액,NUMBER,\n"
    resp = await client.post(
        "/api/v1/standards/import-file",
        data={"kind": "domain", "dictionary_id": str(dictionary_id)},
        files={"file": ("domains.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert (body["total"], body["created"]) == (2, 2)

    listing = await client.get("/api/v1/standards/domains", params={"dictionary_id": dictionary_id})
    assert {d["domain_name"] for d in listing.json()} == {"번호", "금액"}


@pytest.mark.asyncio
async def test_import_codes_from_xlsx_groups_rows(client, dictionary_id):
    content = _xlsx_bytes(
        ["코드그룹", "코드값", "코드값명", "정렬순서"],
        [["성별코드", "M", "남성", 1], ["성별코드", "F", "여성", 2], ["사용여부", "Y", "사용", 1]],
    )
    resp = await client.post(
        "/api/v1/standards/import-file",
        data={"kind": "code", "dictionary_id": str(dictionary_id)},
        files={"file": ("codes.xlsx", content,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # 2 code groups created (성별코드, 사용여부) from 3 rows
    assert (body["total"], body["created"], body["failed"]) == (2, 2, 0)

    listing = await client.get("/api/v1/standards/code-groups", params={"dictionary_id": dictionary_id})
    groups = {g["group_name"]: g for g in listing.json()}
    assert set(groups) == {"성별코드", "사용여부"}
    assert {v["code_value"] for v in groups["성별코드"]["values"]} == {"M", "F"}


@pytest.mark.asyncio
async def test_import_file_rejects_unknown_kind(client, dictionary_id):
    resp = await client.post(
        "/api/v1/standards/import-file",
        data={"kind": "bogus", "dictionary_id": str(dictionary_id)},
        files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")},
    )
    assert resp.status_code == 422
