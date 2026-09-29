// rwaCrypto.js
//
// Client-side encryption for the RWA documents journey.
//
// Model (envelope encryption):
//   - Each document is encrypted with a fresh random symmetric key
//     (nacl.secretbox = XSalsa20-Poly1305, authenticated). The ciphertext is what
//     gets pinned to IPFS -- the public gateway only ever sees ciphertext.
//   - That symmetric key is then WRAPPED (an anonymous sealed box built on
//     nacl.box / Curve25519) to each recipient's public key: owner + verifier +
//     regulator. The wrapped keys form a small "key bundle" JSON, also pinned.
//   - On-chain we store only: SHA-256(ciphertext) + ciphertext CID + keyBundle CID.
//
// Only a holder of a recipient private key can unseal the symmetric key and read
// the document -- so "govt can verify later" is private, not world-readable.
//
// Uses tweetnacl (pure ES5, webpack-4 safe) and ethers for SHA-256. initCrypto()
// is kept as a no-op async so callers don't need to change.
//
// PROTOTYPE NOTE: recipient keypairs are generated in the browser and the private
// key is kept in localStorage. In the real Fabric MVP these are MSP identities.

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { ethers } from "ethers";

export async function initCrypto() {
  return true; // nothing to load; kept for call-site compatibility
}

// ---- encoding helpers ----
export function toHex(bytes) {
  return ethers.utils.hexlify(bytes);
}
export function fromHex(hex) {
  return ethers.utils.arrayify(hex);
}
export function toB64(bytes) {
  return naclUtil.encodeBase64(bytes);
}
export function fromB64(str) {
  return naclUtil.decodeBase64(str);
}
export function strToBytes(str) {
  return naclUtil.decodeUTF8(str);
}
export function bytesToStr(bytes) {
  return naclUtil.encodeUTF8(bytes);
}

// ---- per-identity keypair (Curve25519 box keys) ----
const KP_PREFIX = "rwa_keypair_";

export function loadKeypair(address) {
  if (!address) return null;
  const raw = localStorage.getItem(KP_PREFIX + address.toLowerCase());
  if (!raw) return null;
  const { publicKey, privateKey } = JSON.parse(raw);
  return { publicKey: fromB64(publicKey), privateKey: fromB64(privateKey) };
}

export function getOrCreateKeypair(address) {
  const existing = loadKeypair(address);
  if (existing) return existing;
  const kp = nacl.box.keyPair();
  localStorage.setItem(
    KP_PREFIX + address.toLowerCase(),
    JSON.stringify({ publicKey: toB64(kp.publicKey), privateKey: toB64(kp.secretKey) }),
  );
  return { publicKey: kp.publicKey, privateKey: kp.secretKey };
}

/** Public key as an 0x-hex string, for registerPublicKey() on-chain. */
export function publicKeyHex(address) {
  return toHex(getOrCreateKeypair(address).publicKey);
}

// ---- symmetric encryption of the document itself ----
/** Encrypt bytes with a fresh key. Returns { blob: nonce||cipher, key }. */
export function encryptBytes(bytes) {
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const cipher = nacl.secretbox(bytes, nonce, key);
  const blob = new Uint8Array(nonce.length + cipher.length);
  blob.set(nonce, 0);
  blob.set(cipher, nonce.length);
  return { blob, key };
}

/** Decrypt a nonce||cipher blob with its symmetric key. */
export function decryptBytes(blob, key) {
  const n = nacl.secretbox.nonceLength;
  const nonce = blob.slice(0, n);
  const cipher = blob.slice(n);
  const out = nacl.secretbox.open(cipher, nonce, key);
  if (!out) throw new Error("secretbox open failed (wrong key)");
  return out;
}

// ---- anonymous sealed box (ephemeral-static ECDH over nacl.box) ----
// Layout: ephemeralPublicKey(32) || nonce(24) || ciphertext
function seal(message, recipientPublicKey) {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cipher = nacl.box(message, nonce, recipientPublicKey, eph.secretKey);
  const out = new Uint8Array(eph.publicKey.length + nonce.length + cipher.length);
  out.set(eph.publicKey, 0);
  out.set(nonce, eph.publicKey.length);
  out.set(cipher, eph.publicKey.length + nonce.length);
  return out;
}

function sealOpen(sealed, myKeypair) {
  const pkLen = nacl.box.publicKeyLength;
  const nLen = nacl.box.nonceLength;
  const ephPub = sealed.slice(0, pkLen);
  const nonce = sealed.slice(pkLen, pkLen + nLen);
  const cipher = sealed.slice(pkLen + nLen);
  const out = nacl.box.open(cipher, nonce, ephPub, myKeypair.privateKey);
  if (!out) throw new Error("sealed box open failed");
  return out;
}

// ---- envelope: wrap/unwrap the symmetric key to recipients ----
/**
 * Build a key bundle wrapping `symKey` to each recipient.
 * recipients: [{ role, address, publicKey: Uint8Array }]
 */
export function buildKeyBundle(symKey, recipients) {
  const wrapped = {};
  recipients.forEach(r => {
    if (!r.publicKey) return;
    wrapped[r.role] = { address: r.address, sealed: toB64(seal(symKey, r.publicKey)) };
  });
  return { alg: "naclbox-seal+secretbox", recipients: wrapped };
}

/** Unseal the symmetric key from a bundle using my keypair, trying my role then any entry. */
export function unwrapKeyFromBundle(bundle, myKeypair, myRole) {
  const entries = bundle && bundle.recipients ? bundle.recipients : {};
  const tryOrder = [];
  if (myRole && entries[myRole]) tryOrder.push(entries[myRole]);
  Object.keys(entries).forEach(k => {
    if (k !== myRole) tryOrder.push(entries[k]);
  });
  for (const e of tryOrder) {
    try {
      return sealOpen(fromB64(e.sealed), myKeypair);
    } catch (_) {
      // not for us; try the next recipient
    }
  }
  throw new Error("No wrapped key in this bundle is decryptable with your identity.");
}

// ---- hashing (matches the on-chain bytes32 sha256Hash) ----
export function sha256Hex(bytes) {
  return ethers.utils.sha256(bytes);
}

// ---- file <-> bytes ----
export function fileToBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
