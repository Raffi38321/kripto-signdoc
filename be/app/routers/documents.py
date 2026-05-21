import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from app.crypto_service import (
    build_signature_payload,
    decrypt_private_key,
    sha256_hex,
    sign_hash,
)
from app.database import get_connection
from app.dependencies import get_current_user
from app.schemas import DocumentResponse, HistoryItem, SignRequest

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _get_signers(conn, document_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT s.signed_at, u.username, u.id AS user_id, s.signature_b64
        FROM signatures s
        JOIN users u ON u.id = s.user_id
        WHERE s.document_id = ?
        ORDER BY s.signed_at
        """,
        (document_id,),
    ).fetchall()
    return [
        {
            "username": r["username"],
            "user_id": r["user_id"],
            "signed_at": r["signed_at"],
            "status": "signed",
        }
        for r in rows
    ]


def _read_file_bytes(path: Path) -> bytes:
    return path.read_bytes()


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File terlalu besar (max 10MB)")

    doc_id = str(uuid.uuid4())
    stored_name = f"{doc_id}{ext}"
    stored_path = UPLOAD_DIR / stored_name
    stored_path.write_bytes(content)
    content_hash = sha256_hex(content)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO documents (id, owner_id, filename, stored_path, content_hash, mime_type)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (doc_id, user["id"], file.filename, str(stored_path), content_hash, file.content_type),
        )

    return DocumentResponse(
        id=doc_id,
        filename=file.filename or stored_name,
        content_hash=content_hash,
        mime_type=file.content_type,
        created_at="",
        owner_username=user["username"],
        signature_count=0,
        signers=[],
    )


@router.get("", response_model=list[DocumentResponse])
def list_my_documents(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT d.*, u.username AS owner_username,
                   (SELECT COUNT(*) FROM signatures s WHERE s.document_id = d.id) AS signature_count
            FROM documents d
            JOIN users u ON u.id = d.owner_id
            WHERE d.owner_id = ? OR d.id IN (
                SELECT document_id FROM signatures WHERE user_id = ?
            )
            ORDER BY d.created_at DESC
            """,
            (user["id"], user["id"]),
        ).fetchall()
        result = []
        for row in rows:
            signers = _get_signers(conn, row["id"])
            current_hash = sha256_hex(_read_file_bytes(Path(row["stored_path"])))
            result.append(
                DocumentResponse(
                    id=row["id"],
                    filename=row["filename"],
                    content_hash=row["content_hash"],
                    mime_type=row["mime_type"],
                    created_at=row["created_at"],
                    owner_username=row["owner_username"],
                    signature_count=row["signature_count"],
                    signers=signers,
                    tampered=current_hash != row["content_hash"],
                )
            )
    return result


@router.get("/history", response_model=list[HistoryItem])
def signing_history(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.id AS signature_id, s.signed_at, d.id AS document_id,
                   d.filename, d.content_hash
            FROM signatures s
            JOIN documents d ON d.id = s.document_id
            WHERE s.user_id = ?
            ORDER BY s.signed_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return [HistoryItem(**dict(r)) for r in rows]


@router.post("/{document_id}/sign")
def sign_document(
    document_id: str,
    body: SignRequest,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        doc = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokumen tidak ditemukan")

        existing = conn.execute(
            "SELECT id FROM signatures WHERE document_id = ? AND user_id = ?",
            (document_id, user["id"]),
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Anda sudah menandatangani dokumen ini",
            )

        user_row = conn.execute(
            "SELECT encrypted_private_key, key_salt, public_key_pem FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()

        stored_path = Path(doc["stored_path"])
        file_bytes = stored_path.read_bytes()
        current_hash = sha256_hex(file_bytes)
        if current_hash != doc["content_hash"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Dokumen telah dimodifikasi sejak diunggah — penandatanganan ditolak",
            )

        try:
            private_pem = decrypt_private_key(
                user_row["encrypted_private_key"],
                body.password,
                user_row["key_salt"],
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

        signature_b64 = sign_hash(private_pem, doc["content_hash"])
        conn.execute(
            """
            INSERT INTO signatures (document_id, user_id, signature_b64)
            VALUES (?, ?, ?)
            """,
            (document_id, user["id"], signature_b64),
        )
        signers = _get_signers(conn, document_id)

    payload = build_signature_payload(
        document_id=document_id,
        document_hash=doc["content_hash"],
        signature_b64=signature_b64,
        signer_username=user["username"],
        signer_id=user["id"],
        filename=doc["filename"],
        signers=signers,
    )
    return {"message": "Dokumen berhasil ditandatangani", "signature_file": payload}


@router.get("/{document_id}/signature-file")
def download_signature_file(document_id: str, user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        doc = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokumen tidak ditemukan")

        sig = conn.execute(
            """
            SELECT s.*, u.username FROM signatures s
            JOIN users u ON u.id = s.user_id
            WHERE s.document_id = ? AND s.user_id = ?
            """,
            (document_id, user["id"]),
        ).fetchone()
        if not sig:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Anda belum menandatangani dokumen ini",
            )
        signers = _get_signers(conn, document_id)

    payload = build_signature_payload(
        document_id=document_id,
        document_hash=doc["content_hash"],
        signature_b64=sig["signature_b64"],
        signer_username=sig["username"],
        signer_id=user["id"],
        filename=doc["filename"],
        signers=signers,
    )
    content = json.dumps(payload, indent=2, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="signdoc_{document_id[:8]}.sig.json"'},
    )


@router.get("/{document_id}/qr")
def qr_verification_data(document_id: str):
    """Data untuk QR — verifikasi publik tanpa login."""
    return {
        "verify_url": f"/fe/verify.html?doc={document_id}",
        "document_id": document_id,
    }
