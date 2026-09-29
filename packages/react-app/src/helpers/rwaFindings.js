// rwaFindings.js
//
// AI findings pipeline (PROTOTYPE STUB).
//
// In the real DRUNIX/Fabric MVP this is where an AI document-analysis service
// runs against the decrypted documents (title-deed OCR, encumbrance-certificate
// cross-checks, name/'area' consistency, forgery signals, ...) and produces a
// structured findings report that the verifier reviews before endorsing.
//
// Here it is a deterministic heuristic over the passport + document metadata so
// the flow is exercisable end-to-end offline. `runFindings` is the single seam:
// swap its body for a real API call and the rest of the app is unchanged.

export const DOC_TYPES = ["TITLE_DEED", "ENCUMBRANCE_CERT", "LOAN_AGREEMENT", "TAX_RECEIPT", "ID_PROOF", "OTHER"];

export function docTypeLabel(t) {
  return DOC_TYPES[t] || "OTHER";
}

/**
 * @param passport decrypted passport object (property details)
 * @param docs     array of { docType, sha256Hash, cid } (metadata only; no plaintext needed for the stub)
 * @returns { score, verdict, checks: [{ name, status, note }], summary, generatedAt }
 */
export function runFindings(passport = {}, docs = []) {
  const checks = [];

  const hasTitle = docs.some(d => Number(d.docType) === 0);
  checks.push({
    name: "Title deed present",
    status: hasTitle ? "pass" : "fail",
    note: hasTitle ? "A TITLE_DEED document is attached." : "No TITLE_DEED attached.",
  });

  const hasEC = docs.some(d => Number(d.docType) === 1);
  checks.push({
    name: "Encumbrance certificate present",
    status: hasEC ? "pass" : "warn",
    note: hasEC ? "An ENCUMBRANCE_CERT is attached." : "No encumbrance certificate provided.",
  });

  const fieldsOk = Boolean(passport.address && passport.area && passport.owner);
  checks.push({
    name: "Passport fields complete",
    status: fieldsOk ? "pass" : "warn",
    note: fieldsOk ? "Address, area and owner are set." : "Some passport fields are missing.",
  });

  const uniqueHashes = new Set(docs.map(d => d.sha256Hash));
  const noDupes = uniqueHashes.size === docs.length;
  checks.push({
    name: "No duplicate documents",
    status: noDupes ? "pass" : "warn",
    note: noDupes ? "All document hashes are distinct." : "Duplicate document hashes detected.",
  });

  const passes = checks.filter(c => c.status === "pass").length;
  const fails = checks.filter(c => c.status === "fail").length;
  const score = Math.round((passes / checks.length) * 100);
  const verdict = fails > 0 ? "REVIEW_REQUIRED" : score >= 75 ? "LIKELY_OK" : "REVIEW_REQUIRED";

  return {
    score,
    verdict,
    checks,
    summary: `${passes}/${checks.length} checks passed. Automated verdict: ${verdict}. Human endorsement still required.`,
    generatedAt: new Date().toISOString(),
  };
}
