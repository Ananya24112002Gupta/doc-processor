"""
app/main.py

FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.documents import router as documents_router

app = FastAPI(
    title="DocFlow API",
    description=(
        "Async document processing system. Upload documents, track processing "
        "progress in real-time via SSE, review extracted output, and export finalized results."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Allow the Next.js dev server to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)


@app.get("/api/health", tags=["health"])
async def health_check():
    return {"status": "ok", "service": "docflow-api"}
