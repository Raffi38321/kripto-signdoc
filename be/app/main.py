from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import auth, documents, verify

FE_DIR = Path(__file__).resolve().parent.parent.parent / "fe"

app = FastAPI(
    title="SignDoc API",
    description="Sistem Tanda Tangan Digital — RSA-2048 + SHA-256",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(verify.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "algorithm": "RSA-2048+SHA-256"}


if FE_DIR.exists():
    app.mount("/fe", StaticFiles(directory=str(FE_DIR), html=True), name="frontend")
