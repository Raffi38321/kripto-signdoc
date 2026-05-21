import json
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import SIGN_ALGORITHM
from app.crypto_service import sha256_hex, verify_signature
from app.database import get_connection

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyJsonBody(BaseModel):
    document_hash: str
    signature: str
    public_key_pem: str
    signer: str | None = None
    signed_at: str | None = None


def _run_verification(doc_bytes: bytes, sig_data: dict) -> dict:
    current_hash = sha256_hex(doc_bytes)

    document_hash = sig_data.get("document_hash", "")
    signature_b64 = sig_data.get("signature", "")
    document_id = sig_data.get("document_id")
    signer_name = sig_data.get("signer")
    signed_at = sig_data.get("signed_at")
    algorithm = sig_data.get("algorithm", SIGN_ALGORITHM)

    public_pem = None
    signers_detail: list[dict] = []
    tampered = current_hash != document_hash

    if document_id:
        with get_connection() as conn:
            doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
            if doc_row:
                stored_hash = doc_row["content_hash"]
                tampered = current_hash != stored_hash or current_hash != document_hash
                rows = conn.execute(
                    """
                    SELECT s.signature_b64, s.signed_at, u.username, u.public_key_pem
                    FROM signatures s
                    JOIN users u ON u.id = s.user_id
                    WHERE s.document_id = ?
                    """,
                    (document_id,),
                ).fetchall()
                for row in rows:
                    valid = verify_signature(
                        row["public_key_pem"],
                        document_hash if not tampered else current_hash,
                        row["signature_b64"],
                    )
                    signers_detail.append(
                        {
                            "username": row["username"],
                            "signed_at": row["signed_at"],
                            "valid": valid and not tampered,
                            "status": "valid" if valid and not tampered else "invalid",
                        }
                    )
                if rows:
                    public_pem = rows[0]["public_key_pem"]

    if not public_pem:
        with get_connection() as conn:
            if signer_name:
                user_row = conn.execute(
                    "SELECT public_key_pem FROM users WHERE username = ?",
                    (signer_name,),
                ).fetchone()
                if user_row:
                    public_pem = user_row["public_key_pem"]

    if not public_pem and document_id:
        with get_connection() as conn:
            sig_row = conn.execute(
                """
                SELECT u.public_key_pem FROM signatures s
                JOIN users u ON u.id = s.user_id
                WHERE s.document_id = ? LIMIT 1
                """,
                (document_id,),
            ).fetchone()
            if sig_row:
                public_pem = sig_row["public_key_pem"]

    hash_for_verify = document_hash if not tampered else current_hash
    crypto_valid = False
    if public_pem and signature_b64:
        crypto_valid = verify_signature(public_pem, hash_for_verify, signature_b64)

    valid = crypto_valid and not tampered
    status_text = "VALID" if valid else "INVALID"

    return {
        "valid": valid,
        "status": status_text,
        "document_hash": current_hash,
        "expected_hash": document_hash,
        "tampered": tampered,
        "signer": signer_name,
        "signed_at": signed_at,
        "algorithm": algorithm,
        "signers": signers_detail or (
            [{"username": signer_name, "signed_at": signed_at, "valid": valid, "status": status_text.lower()}]
            if signer_name
            else []
        ),
        "message": (
            "Tanda tangan valid dan dokumen utuh"
            if valid
            else (
                "Dokumen telah dimodifikasi sejak ditandatangani"
                if tampered
                else "Tanda tangan tidak valid"
            )
        ),
    }


@router.post("")
async def verify_upload(
    document: UploadFile = File(...),
    signature_file: UploadFile = File(...),
):
    doc_bytes = await document.read()
    try:
        sig_data = json.loads((await signature_file.read()).decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File signature tidak valid") from exc
    return _run_verification(doc_bytes, sig_data)


@router.post("/json")
def verify_json(body: VerifyJsonBody):
    valid = verify_signature(body.public_key_pem, body.document_hash, body.signature)
    return {
        "valid": valid,
        "status": "VALID" if valid else "INVALID",
        "document_hash": body.document_hash,
        "signer": body.signer,
        "signed_at": body.signed_at,
        "algorithm": SIGN_ALGORITHM,
        "message": "Tanda tangan valid" if valid else "Tanda tangan tidak valid",
    }


@router.get("/public/{document_id}")
def public_verify_info(document_id: str):
    with get_connection() as conn:
        doc = conn.execute(
            """
            SELECT d.*, u.username AS owner_username FROM documents d
            JOIN users u ON u.id = d.owner_id
            WHERE d.id = ?
            """,
            (document_id,),
        ).fetchone()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokumen tidak ditemukan")

        stored_path = Path(doc["stored_path"])
        current_hash = sha256_hex(stored_path.read_bytes()) if stored_path.exists() else ""
        tampered = current_hash != doc["content_hash"]

        sig_rows = conn.execute(
            """
            SELECT s.signed_at, u.username, s.signature_b64, u.public_key_pem
            FROM signatures s
            JOIN users u ON u.id = s.user_id
            WHERE s.document_id = ?
            ORDER BY s.signed_at
            """,
            (document_id,),
        ).fetchall()

    signers = []
    for row in sig_rows:
        valid = verify_signature(
            row["public_key_pem"],
            doc["content_hash"],
            row["signature_b64"],
        )
        signers.append(
            {
                "username": row["username"],
                "signed_at": row["signed_at"],
                "valid": valid and not tampered,
                "status": "valid" if valid and not tampered else "invalid",
            }
        )

    all_valid = bool(signers) and all(s["valid"] for s in signers) and not tampered

    return {
        "document_id": document_id,
        "filename": doc["filename"],
        "content_hash": doc["content_hash"],
        "current_hash": current_hash,
        "tampered": tampered,
        "status": "VALID" if all_valid else ("TAMPERED" if tampered else "INVALID"),
        "signers": signers,
        "owner": doc["owner_username"],
        "algorithm": SIGN_ALGORITHM,
    }


@router.post("/report-pdf")
async def export_verification_pdf(
    document: UploadFile = File(...),
    signature_file: UploadFile = File(...),
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    doc_bytes = await document.read()
    sig_data = json.loads((await signature_file.read()).decode("utf-8"))
    result = _run_verification(doc_bytes, sig_data)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("<b>SignDoc — Laporan Verifikasi</b>", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Status: <b>{result['status']}</b>", styles["Heading2"]),
        Paragraph(result["message"], styles["Normal"]),
        Spacer(1, 12),
    ]

    rows = [
        ["Field", "Nilai"],
        ["Algoritma", result.get("algorithm", SIGN_ALGORITHM)],
        ["Hash dokumen (saat ini)", result["document_hash"]],
        ["Hash dokumen (saat ditandatangani)", result.get("expected_hash") or "-"],
        ["Dimodifikasi?", "Ya" if result.get("tampered") else "Tidak"],
        ["Penanda tangan", result.get("signer") or "-"],
        ["Waktu tanda tangan", result.get("signed_at") or "-"],
    ]
    table = Table(rows, colWidths=[180, 300])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ]
        )
    )
    story.append(table)

    if result.get("signers"):
        story.append(Spacer(1, 16))
        story.append(Paragraph("<b>Multi-Signer</b>", styles["Heading3"]))
        for s in result["signers"]:
            story.append(
                Paragraph(
                    f"• {s.get('username', '?')} — {s.get('status', '?')} ({s.get('signed_at', '-')})",
                    styles["Normal"],
                )
            )

    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=signdoc_verification_report.pdf"},
    )
