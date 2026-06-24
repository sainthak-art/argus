"""Pytest fixtures for the catalog server test suite.

Spins up an isolated in-memory SQLite database (async) and a FastAPI app
mounting only the routers under test, with ``get_session`` overridden to the
test session. No external Postgres/MariaDB required.
"""

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.catalog.models  # noqa: F401,E402  (FK targets for term-column mapping)

# Import models so their tables are registered on Base.metadata before create_all.
import app.standard.models  # noqa: F401,E402
from app.core.database import Base, get_session
from app.standard.router import router as standard_router  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(session_factory):
    app = FastAPI()
    app.include_router(standard_router, prefix="/api/v1")

    async def _override_get_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def dictionary_id(client) -> int:
    """Create a dictionary and return its id (FK parent for all standards)."""
    resp = await client.post(
        "/api/v1/standards/dictionaries",
        json={"dict_name": "테스트표준사전"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]
