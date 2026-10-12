"""Gera chaves de licença do Motion Pro em Python (para usar no seu bot do Telegram).

Requer: pip install cryptography
Uso no terminal:  python tools/licenca.py "Nome do cliente" 30
Uso no bot:       from licenca import gerar_licenca; chave = gerar_licenca("cliente", 30)
A chave privada fica em motion-licenca-privada.pem (NUNCA suba esse arquivo para o GitHub).
"""
import base64, json, os, secrets, sys
from datetime import date, timedelta
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

PRIV = os.environ.get("MOTION_PRIVATE_KEY", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "motion-licenca-privada.pem"))

def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def gerar_licenca(cliente: str, dias: int = 30, caminho_chave: str = PRIV) -> str:
    with open(caminho_chave, "rb") as f:
        chave = serialization.load_pem_private_key(f.read(), password=None)
    ate = (date.today() + timedelta(days=dias)).isoformat() if dias > 0 else None
    payload = _b64u(json.dumps({"n": cliente, "u": ate, "i": _b64u(secrets.token_bytes(6))}, separators=(",", ":")).encode())
    r, s = decode_dss_signature(chave.sign(payload.encode(), ec.ECDSA(hashes.SHA256())))
    assinatura = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"MOTION-{payload}.{_b64u(assinatura)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Uso: python tools/licenca.py "Cliente" 30')
        sys.exit(1)
    print(gerar_licenca(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 30))
