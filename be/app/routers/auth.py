from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import create_access_token, hash_password, verify_password
from app.crypto_service import encrypt_private_key, generate_rsa_keypair
from app.database import get_connection
from app.dependencies import get_current_user
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserProfile

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest):
    public_pem, private_pem = generate_rsa_keypair()
    encrypted_private, salt = encrypt_private_key(private_pem, body.password)
    password_hash = hash_password(body.password)

    try:
        with get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO users (username, email, password_hash, public_key_pem,
                                   encrypted_private_key, key_salt)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    body.username,
                    body.email,
                    password_hash,
                    public_pem,
                    encrypted_private,
                    salt,
                ),
            )
            user_id = cur.lastrowid
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username atau email sudah terdaftar",
            ) from exc
        raise

    token = create_access_token(body.username, user_id)
    return TokenResponse(access_token=token, username=body.username, user_id=user_id)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (body.username,),
        ).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Kredensial salah")

    token = create_access_token(row["username"], row["id"])
    return TokenResponse(access_token=token, username=row["username"], user_id=row["id"])


@router.get("/me", response_model=UserProfile)
def me(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, email, public_key_pem, created_at FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
    return UserProfile(**dict(row))
