import base64
import hashlib
import secrets
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.config import RSA_KEY_SIZE, SIGN_ALGORITHM


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_bytes(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def generate_rsa_keypair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=RSA_KEY_SIZE,
        backend=default_backend(),
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    return public_pem, private_pem


def _derive_fernet_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=390_000,
        backend=default_backend(),
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))


def encrypt_private_key(private_pem: str, password: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    fernet = Fernet(_derive_fernet_key(password, salt))
    encrypted = fernet.encrypt(private_pem.encode("utf-8")).decode("utf-8")
    return encrypted, base64.b64encode(salt).decode("ascii")


def decrypt_private_key(encrypted_pem: str, password: str, salt_b64: str) -> str:
    salt = base64.b64decode(salt_b64.encode("ascii"))
    fernet = Fernet(_derive_fernet_key(password, salt))
    try:
        return fernet.decrypt(encrypted_pem.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Password salah atau kunci privat tidak dapat didekripsi") from exc


def sign_hash(private_pem: str, document_hash_hex: str) -> str:
    private_key = serialization.load_pem_private_key(
        private_pem.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )
    digest = bytes.fromhex(document_hash_hex)
    signature = private_key.sign(
        digest,
        padding.PKCS1v15(),
        Prehashed(hashes.SHA256()),
    )
    return base64.b64encode(signature).decode("ascii")


def verify_signature(public_pem: str, document_hash_hex: str, signature_b64: str) -> bool:
    public_key = serialization.load_pem_public_key(
        public_pem.encode("utf-8"),
        backend=default_backend(),
    )
    digest = bytes.fromhex(document_hash_hex)
    try:
        public_key.verify(
            base64.b64decode(signature_b64.encode("ascii")),
            digest,
            padding.PKCS1v15(),
            Prehashed(hashes.SHA256()),
        )
        return True
    except Exception:
        return False


def build_signature_payload(
    *,
    document_id: str,
    document_hash: str,
    signature_b64: str,
    signer_username: str,
    signer_id: int,
    filename: str,
    signers: list[dict] | None = None,
) -> dict:
    payload = {
        "version": 1,
        "algorithm": SIGN_ALGORITHM,
        "document_id": document_id,
        "filename": filename,
        "document_hash": document_hash,
        "signature": signature_b64,
        "signer": signer_username,
        "signer_id": signer_id,
        "signed_at": datetime.now(timezone.utc).isoformat(),
    }
    if signers:
        payload["all_signers"] = signers
    return payload
