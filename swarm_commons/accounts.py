import hashlib
import hmac
import secrets


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = secrets.token_hex(16) if salt is None else salt
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**15, r=8, p=1, maxmem=64 * 1024**2)
    return f"{salt}:{digest.hex()}"


def verify_password(password, stored):
    salt = stored.split(":", 1)[0] if stored else "00" * 16
    derived = password_hash(password, salt)
    return bool(stored and hmac.compare_digest(derived, stored))
