from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    user_id: int


class UserProfile(BaseModel):
    id: int
    username: str
    email: str
    public_key_pem: str
    created_at: str


class DocumentResponse(BaseModel):
    id: str
    filename: str
    content_hash: str
    mime_type: str | None
    created_at: str
    owner_username: str | None = None
    signature_count: int = 0
    signers: list[dict] = []
    tampered: bool = False


class SignRequest(BaseModel):
    password: str


class VerifyFileResponse(BaseModel):
    valid: bool
    status: str
    document_hash: str
    expected_hash: str | None = None
    tampered: bool = False
    signer: str | None = None
    signed_at: str | None = None
    algorithm: str
    signers: list[dict] = []
    message: str


class HistoryItem(BaseModel):
    document_id: str
    filename: str
    content_hash: str
    signed_at: str
    signature_id: int
