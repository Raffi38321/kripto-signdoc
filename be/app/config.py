import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "signdoc.db"

# Untuk produksi: set SIGNDOC_SECRET_KEY di file .env atau environment
SECRET_KEY = os.environ.get("SIGNDOC_SECRET_KEY", "signdoc-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

RSA_KEY_SIZE = 2048
HASH_ALGORITHM = "SHA-256"
SIGN_ALGORITHM = "RSA-2048+SHA-256"

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".md", ".json", ".csv"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
