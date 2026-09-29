// pinata.js
//
// Pins encrypted documents and key bundles to IPFS via Pinata, and fetches them
// back through a gateway. Replaces the deprecated Infura gateway in ipfs.js.
//
// Config (constants.js / .env):
//   REACT_APP_PINATA_JWT      - Pinata API JWT (required to pin)
//   REACT_APP_PINATA_GATEWAY  - gateway base, default https://gateway.pinata.cloud

import axios from "axios";
import { PINATA_JWT, PINATA_GATEWAY } from "../constants";

const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function authHeader() {
  if (!PINATA_JWT) {
    throw new Error("Missing REACT_APP_PINATA_JWT. Add your Pinata JWT to packages/react-app/.env");
  }
  return { Authorization: `Bearer ${PINATA_JWT}` };
}

/** Pin raw bytes (e.g. ciphertext). Returns the CID string. */
export async function pinBytes(bytes, name = "document.enc") {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/octet-stream" }), name);
  form.append("pinataMetadata", JSON.stringify({ name }));
  const res = await axios.post(PIN_FILE_URL, form, { headers: { ...authHeader() } });
  return res.data.IpfsHash;
}

/** Pin a JSON object (e.g. the key bundle or encrypted-passport wrapper). Returns the CID. */
export async function pinJSON(obj, name = "bundle.json") {
  const res = await axios.post(
    PIN_JSON_URL,
    { pinataContent: obj, pinataMetadata: { name } },
    { headers: { ...authHeader(), "Content-Type": "application/json" } },
  );
  return res.data.IpfsHash;
}

export function gatewayUrl(cid) {
  return `${PINATA_GATEWAY}/ipfs/${cid}`;
}

/** Fetch pinned content as raw bytes (Uint8Array). */
export async function fetchBytes(cid) {
  const res = await axios.get(gatewayUrl(cid), { responseType: "arraybuffer" });
  return new Uint8Array(res.data);
}

/** Fetch pinned JSON. */
export async function fetchJSON(cid) {
  const res = await axios.get(gatewayUrl(cid), { responseType: "json" });
  return res.data;
}

export function isConfigured() {
  return Boolean(PINATA_JWT);
}
