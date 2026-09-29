// docFlows.js
//
// Orchestrates the encrypt -> pin -> (on-chain) and fetch -> unwrap -> decrypt
// halves of the documents journey, on top of helpers/rwaCrypto + helpers/pinata.
//
// Conventions:
//   Document:  `cid`          -> raw ciphertext bytes
//              `keyBundleCID` -> JSON key bundle (wrapped symmetric key per recipient)
//              `sha256Hash`   -> SHA-256 of the ciphertext (bytes32, verified on read)
//   Passport:  `metadataCID`  -> self-contained JSON { ciphertext(b64), keyBundle }
//              `metadataHash` -> SHA-256 of the ciphertext

import { rwaCrypto, pinata } from "../../helpers";

/**
 * Resolve on-chain-registered public keys for a set of recipients.
 * recipients: [{ role, address }] -> [{ role, address, publicKey: Uint8Array }]
 * Recipients without a registered key are dropped (with a warning).
 */
export async function resolveRecipients(registry, recipients) {
  await rwaCrypto.initCrypto();
  const resolved = [];
  const missing = [];
  for (const r of recipients) {
    const pkHex = await registry.publicKeys(r.address);
    if (pkHex && pkHex !== "0x") {
      resolved.push({ ...r, publicKey: rwaCrypto.fromHex(pkHex) });
    } else {
      missing.push(r.role);
    }
  }
  return { resolved, missing };
}

/** Encrypt + pin one document file. Returns { cid, keyBundleCID, sha256Hash }. */
export async function encryptAndPinDocument(fileBytes, recipients, name) {
  await rwaCrypto.initCrypto();
  const { blob, key } = rwaCrypto.encryptBytes(fileBytes);
  const cid = await pinata.pinBytes(blob, `${name}.enc`);
  const bundle = rwaCrypto.buildKeyBundle(key, recipients);
  const keyBundleCID = await pinata.pinJSON(bundle, `${name}.keys.json`);
  return { cid, keyBundleCID, sha256Hash: rwaCrypto.sha256Hex(blob) };
}

/** Encrypt + pin the passport metadata (self-contained). Returns { metadataCID, metadataHash }. */
export async function encryptAndPinPassport(passportObj, recipients) {
  await rwaCrypto.initCrypto();
  const bytes = rwaCrypto.strToBytes(JSON.stringify(passportObj));
  const { blob, key } = rwaCrypto.encryptBytes(bytes);
  const bundle = rwaCrypto.buildKeyBundle(key, recipients);
  const combined = { type: "rwa-passport", ciphertext: rwaCrypto.toB64(blob), keyBundle: bundle };
  const metadataCID = await pinata.pinJSON(combined, "passport.enc.json");
  return { metadataCID, metadataHash: rwaCrypto.sha256Hex(blob) };
}

/** Fetch + decrypt one document. Returns { bytes, hashOk }. */
export async function decryptDocument(doc, myKeypair, myRole) {
  await rwaCrypto.initCrypto();
  const blob = await pinata.fetchBytes(doc.cid);
  const bundle = await pinata.fetchJSON(doc.keyBundleCID);
  const key = rwaCrypto.unwrapKeyFromBundle(bundle, myKeypair, myRole);
  const bytes = rwaCrypto.decryptBytes(blob, key);
  const hashOk = rwaCrypto.sha256Hex(blob) === doc.sha256Hash;
  return { bytes, hashOk };
}

/** Fetch + decrypt the passport metadata. Returns the passport object. */
export async function decryptPassport(metadataCID, myKeypair, myRole) {
  await rwaCrypto.initCrypto();
  const combined = await pinata.fetchJSON(metadataCID);
  const blob = rwaCrypto.fromB64(combined.ciphertext);
  const key = rwaCrypto.unwrapKeyFromBundle(combined.keyBundle, myKeypair, myRole);
  return JSON.parse(rwaCrypto.bytesToStr(rwaCrypto.decryptBytes(blob, key)));
}
