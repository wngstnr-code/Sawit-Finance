"""
Sawit Finance — x402 micropayment client (Casper)
=============================================
A real, working implementation of the x402 HTTP micropayment handshake used by
the Sawit Finance agents to pay per-request for gated CPO data.

x402 flow (client side):
  1. Agent requests a resource           → server returns 402 Payment Required
  2. Server's 402 body lists requirements (network, amount, payTo, nonce)
  3. Agent builds a signed payment authorization (ed25519 — Casper's key scheme)
  4. Agent retries with header  X-PAYMENT: base64(payload)
  5. Facilitator verifies the signature/amount/nonce on-chain and serves the data

What is REAL here:
  - The full HTTP 402 → pay → retry handshake
  - ed25519 signing/verification using Casper's key scheme (real cryptography)
  - Replay protection via server-issued nonces
  - Amount / recipient / resource binding inside the signed message

Settlement (moving the CSPR on-chain) is LIVE too — see `x402_settle.py`, which
runs this handshake and then broadcasts a real native CSPR transfer on Casper
Testnet for the payment, verifying it executed before serving the data. This
module is the protocol/crypto layer; that script is the on-chain settlement layer.

Run the in-process self-test:   python agents/x402.py
Run the live on-chain settlement: python agents/x402_settle.py
"""

import base64
import json
import secrets
from dataclasses import dataclass
from typing import Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

X402_VERSION = 1
CASPER_ED25519_PREFIX = "01"  # Casper tags ed25519 public keys with 0x01


class X402Error(Exception):
    """Raised when the x402 handshake fails."""


# ─── HELPERS ───

def _raw_pubkey_hex(pk: Ed25519PublicKey) -> str:
    """Casper-style ed25519 public key hex: '01' + 32-byte raw key."""
    raw = pk.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return CASPER_ED25519_PREFIX + raw.hex()


def _pubkey_from_casper_hex(hex_str: str) -> Ed25519PublicKey:
    """Parse a Casper '01'-prefixed ed25519 public key back to a key object."""
    if hex_str.startswith(CASPER_ED25519_PREFIX):
        hex_str = hex_str[len(CASPER_ED25519_PREFIX):]
    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(hex_str))


def canonical_message(network: str, resource: str, pay_to: str, amount: str, nonce: str) -> bytes:
    """
    The exact bytes that get signed. Binding all five fields means a proof for one
    (resource, amount, recipient, nonce) cannot be replayed for another.
    """
    return f"x402|{network}|{resource}|{pay_to}|{amount}|{nonce}".encode()


# ─── PAYMENT REQUIREMENT (from the 402 response) ───

@dataclass
class PaymentRequirement:
    scheme: str
    network: str
    resource: str
    pay_to: str
    max_amount_required: str   # motes (string, as in the x402 spec)
    nonce: str
    asset: str = "CSPR"
    description: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "PaymentRequirement":
        return cls(
            scheme=d["scheme"],
            network=d["network"],
            resource=d["resource"],
            pay_to=d["payTo"],
            max_amount_required=str(d["maxAmountRequired"]),
            nonce=d["nonce"],
            asset=d.get("asset", "CSPR"),
            description=d.get("description", ""),
        )


# ─── CLIENT SIDE: the paying agent ───

class X402Payer:
    """Holds the agent's ed25519 key and builds signed x402 payment proofs."""

    def __init__(self, seed_hex: Optional[str] = None, network: str = "casper-test"):
        self.network = network
        if seed_hex:
            self._sk = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(seed_hex)[:32])
        else:
            self._sk = Ed25519PrivateKey.generate()
        self._pk = self._sk.public_key()

    @property
    def public_key_hex(self) -> str:
        return _raw_pubkey_hex(self._pk)

    def build_payment(self, req: PaymentRequirement, amount: Optional[str] = None) -> dict:
        """
        Sign a payment authorization for the given requirement.
        `amount` defaults to the maximum required (the "exact" scheme).
        """
        pay_amount = str(amount) if amount is not None else req.max_amount_required
        msg = canonical_message(req.network, req.resource, req.pay_to, pay_amount, req.nonce)
        signature = self._sk.sign(msg)

        return {
            "x402Version": X402_VERSION,
            "scheme": req.scheme,
            "network": req.network,
            "payload": {
                "resource": req.resource,
                "payTo": req.pay_to,
                "amount": pay_amount,
                "nonce": req.nonce,
                "from": self.public_key_hex,
                "signature": signature.hex(),
            },
        }


def encode_payment(payment: dict) -> str:
    """Serialize a payment payload into the X-PAYMENT header value."""
    return base64.b64encode(json.dumps(payment).encode()).decode()


def decode_payment(header_value: str) -> dict:
    """Parse the X-PAYMENT header back into a payment dict."""
    return json.loads(base64.b64decode(header_value).decode())


# ─── FACILITATOR SIDE: issues challenges, verifies proofs ───

class X402Verifier:
    """
    Server/facilitator side. Issues 402 challenges and verifies the signed proofs.
    Tracks spent nonces to prevent replay.
    """

    def __init__(self, pay_to_hex: Optional[str] = None, network: str = "casper-test"):
        self.network = network
        if pay_to_hex:
            self.pay_to = pay_to_hex
            self._own_key = None
        else:
            # Generate a receiving account for the demo
            self._own_key = Ed25519PrivateKey.generate()
            self.pay_to = _raw_pubkey_hex(self._own_key.public_key())
        self._issued_nonces: dict[str, str] = {}   # nonce -> resource
        self._spent_nonces: set[str] = set()

    def make_challenge(self, resource: str, amount_motes: int, description: str = "") -> dict:
        """Build a 402 Payment Required body for a resource."""
        nonce = secrets.token_hex(16)
        self._issued_nonces[nonce] = resource
        return {
            "x402Version": X402_VERSION,
            "error": "payment required",
            "accepts": [
                {
                    "scheme": "exact",
                    "network": self.network,
                    "resource": resource,
                    "payTo": self.pay_to,
                    "maxAmountRequired": str(amount_motes),
                    "asset": "CSPR",
                    "description": description,
                    "nonce": nonce,
                }
            ],
        }

    def verify(self, header_value: str, expected_resource: str, required_motes: int) -> tuple[bool, str]:
        """Verify an X-PAYMENT header. Returns (ok, reason)."""
        try:
            payment = decode_payment(header_value)
        except Exception as e:
            return False, f"malformed X-PAYMENT header: {e}"

        if payment.get("x402Version") != X402_VERSION:
            return False, "unsupported x402 version"
        if payment.get("network") != self.network:
            return False, "wrong network"

        p = payment.get("payload", {})
        nonce = p.get("nonce", "")
        resource = p.get("resource", "")
        pay_to = p.get("payTo", "")
        amount = p.get("amount", "0")
        from_pk = p.get("from", "")
        sig_hex = p.get("signature", "")

        # Binding checks
        if resource != expected_resource:
            return False, "resource mismatch"
        if pay_to != self.pay_to:
            return False, "recipient mismatch"
        if self._issued_nonces.get(nonce) != expected_resource:
            return False, "unknown or mismatched nonce"
        if nonce in self._spent_nonces:
            return False, "nonce already spent (replay)"
        try:
            if int(amount) < int(required_motes):
                return False, "insufficient payment amount"
        except ValueError:
            return False, "invalid amount"

        # Signature check — the heart of the proof
        try:
            pk = _pubkey_from_casper_hex(from_pk)
            msg = canonical_message(self.network, resource, pay_to, amount, nonce)
            pk.verify(bytes.fromhex(sig_hex), msg)
        except (InvalidSignature, ValueError, Exception) as e:
            return False, f"invalid signature: {e}"

        # Accept: burn the nonce so it can't be replayed
        self._spent_nonces.add(nonce)
        # The proof is now authorized; settlement (broadcasting the CSPR transfer
        # so payTo receives `amount` motes from `from_pk`) runs on-chain in
        # x402_settle.py and is verified before the data is served.
        return True, "ok"


# ─── HIGH-LEVEL CLIENT: the full handshake over HTTP ───

async def fetch_with_x402(session, url: str, payer: X402Payer, max_amount_motes: int) -> dict:
    """
    Perform the full x402 handshake against a resource URL and return its JSON body.

    Raises X402Error if the resource cannot be paid for within max_amount_motes.
    """
    # 1. Initial request — expect 402
    async with session.get(url) as r1:
        if r1.status == 200:
            return await r1.json()  # resource was free
        if r1.status != 402:
            raise X402Error(f"unexpected status {r1.status} (expected 402)")
        challenge = await r1.json()

    # 2. Select a requirement we can satisfy
    reqs = [PaymentRequirement.from_dict(a) for a in challenge.get("accepts", [])]
    chosen = next((r for r in reqs if r.network == payer.network), None)
    if chosen is None:
        raise X402Error(f"no payment requirement for network {payer.network}")
    if int(chosen.max_amount_required) > max_amount_motes:
        raise X402Error(
            f"price {chosen.max_amount_required} motes exceeds budget {max_amount_motes}"
        )

    # 3. Build + attach the signed payment, retry
    payment = payer.build_payment(chosen)
    headers = {"X-PAYMENT": encode_payment(payment)}
    async with session.get(url, headers=headers) as r2:
        if r2.status == 200:
            return await r2.json()
        body = await r2.text()
        raise X402Error(f"payment rejected ({r2.status}): {body}")


# ─── IN-PROCESS SELF-TEST (no network, no testnet key needed) ───

def selftest() -> None:
    print("x402 self-test (in-process, real ed25519)\n" + "=" * 44)

    payer = X402Payer(network="casper-test")
    verifier = X402Verifier(network="casper-test")
    resource = "/api/kpbn/price"
    price = 10_000_000  # 0.01 CSPR in motes

    print(f"payer pubkey   : {payer.public_key_hex[:20]}...")
    print(f"facilitator pay_to: {verifier.pay_to[:20]}...")

    # Happy path
    challenge = verifier.make_challenge(resource, price, "KPBN daily CPO price")
    req = PaymentRequirement.from_dict(challenge["accepts"][0])
    payment = payer.build_payment(req)
    ok, reason = verifier.verify(encode_payment(payment), resource, price)
    assert ok, f"valid payment rejected: {reason}"
    print(f"[1] valid payment            → accepted ✅")

    # Replay rejected
    ok, reason = verifier.verify(encode_payment(payment), resource, price)
    assert not ok and "replay" in reason, "replay not blocked"
    print(f"[2] replayed same proof      → rejected ({reason}) ✅")

    # Tampered amount rejected
    challenge2 = verifier.make_challenge(resource, price)
    req2 = PaymentRequirement.from_dict(challenge2["accepts"][0])
    underpay = payer.build_payment(req2, amount=str(price // 2))
    ok, reason = verifier.verify(encode_payment(underpay), resource, price)
    assert not ok, "underpayment not blocked"
    print(f"[3] underpaid amount         → rejected ({reason}) ✅")

    # Forged signature rejected
    challenge3 = verifier.make_challenge(resource, price)
    req3 = PaymentRequirement.from_dict(challenge3["accepts"][0])
    forged = payer.build_payment(req3)
    forged["payload"]["signature"] = "00" * 64  # tamper
    ok, reason = verifier.verify(encode_payment(forged), resource, price)
    assert not ok, "forged signature not blocked"
    print(f"[4] forged signature         → rejected ({reason}) ✅")

    # Wrong resource rejected
    challenge4 = verifier.make_challenge(resource, price)
    req4 = PaymentRequirement.from_dict(challenge4["accepts"][0])
    p4 = payer.build_payment(req4)
    ok, reason = verifier.verify(encode_payment(p4), "/api/other", price)
    assert not ok, "resource mismatch not blocked"
    print(f"[5] wrong resource           → rejected ({reason}) ✅")

    print("\n✅ All x402 handshake checks passed — protocol is sound.")


if __name__ == "__main__":
    selftest()
