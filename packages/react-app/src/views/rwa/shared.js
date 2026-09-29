// shared.js — labels, formatters, and the assets-loading hook for the RWA views.
import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { docTypeLabel, DOC_TYPES } from "../../helpers";

export { docTypeLabel, DOC_TYPES };

export const STATUS = ["DRAFT", "UNDER_REVIEW", "VERIFIED", "ACTIVE"];
export const STATUS_COLOR = ["default", "processing", "cyan", "green"];
export const ASSET_CLASS = ["PROPERTY"];

export const TINR_DECIMALS = 2;

export function formatINR(amount) {
  if (amount === undefined || amount === null) return "-";
  const asStr = ethers.utils.formatUnits(amount, TINR_DECIMALS);
  // Indian grouping for readability
  const [whole, frac] = asStr.split(".");
  const lastThree = whole.slice(-3);
  const other = whole.slice(0, -3);
  const grouped = other ? other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree : lastThree;
  return `₹${grouped}${frac ? "." + frac : ""}`;
}

export function parseINR(value) {
  return ethers.utils.parseUnits(String(value || "0"), TINR_DECIMALS);
}

/**
 * Load every asset (plus its docs, attestation and lien) from the registry.
 * Returns { assets, loading, error, refresh }.
 */
export function useRwaAssets(readContracts, refreshKey) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [localBump, setLocalBump] = useState(0);

  const refresh = useCallback(() => setLocalBump(b => b + 1), []);

  useEffect(() => {
    let cancelled = false;
    const registry = readContracts && readContracts.RWAAssetRegistry;
    if (!registry) return undefined;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const total = (await registry.totalAssets()).toNumber();
        const ids = Array.from({ length: total }, (_, i) => i + 1);
        const loaded = await Promise.all(
          ids.map(async id => {
            const [a, docs, attestation, lien] = await Promise.all([
              registry.getAsset(id),
              registry.getDocuments(id),
              registry.attestations(id),
              registry.liens(id),
            ]);
            let owner = a.submitter;
            if (a.status === 3) {
              try {
                owner = await registry.ownerOf(id);
              } catch (_) {
                /* not minted yet */
              }
            }
            return {
              id,
              submitter: a.submitter,
              owner,
              assetClass: a.assetClass,
              status: a.status,
              metadataHash: a.metadataHash,
              metadataCID: a.metadataCID,
              hasActiveLien: a.hasActiveLien,
              onHold: a.onHold,
              minted: a.minted,
              docs: docs.map(d => ({
                sha256Hash: d.sha256Hash,
                cid: d.cid,
                keyBundleCID: d.keyBundleCID,
                docType: d.docType,
                uploadedBy: d.uploadedBy,
                timestamp: d.timestamp.toNumber(),
              })),
              attestation: {
                verifier: attestation.verifier,
                approved: attestation.approved,
                findingsCID: attestation.findingsCID,
                timestamp: attestation.timestamp.toNumber(),
              },
              lien: { lender: lien.lender, amount: lien.amount, active: lien.active },
            };
          }),
        );
        if (!cancelled) setAssets(loaded);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readContracts, refreshKey, localBump]);

  return { assets, loading, error, refresh };
}

/** Read the caller's on-chain roles so the UI can hint what they can do. */
export function useMyRoles(readContracts, address, refreshKey) {
  const [roles, setRoles] = useState({ admin: false, verifier: false, regulator: false });
  useEffect(() => {
    let cancelled = false;
    const registry = readContracts && readContracts.RWAAssetRegistry;
    if (!registry || !address) return undefined;
    (async () => {
      try {
        const [VERIFIER_ROLE, REGULATOR_ROLE, ADMIN_ROLE] = await Promise.all([
          registry.VERIFIER_ROLE(),
          registry.REGULATOR_ROLE(),
          registry.DEFAULT_ADMIN_ROLE(),
        ]);
        const [verifier, regulator, admin] = await Promise.all([
          registry.hasRole(VERIFIER_ROLE, address),
          registry.hasRole(REGULATOR_ROLE, address),
          registry.hasRole(ADMIN_ROLE, address),
        ]);
        if (!cancelled) setRoles({ admin, verifier, regulator });
      } catch (_) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readContracts, address, refreshKey]);
  return roles;
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-";
}

export function isMe(a, b) {
  return a && b && a.toLowerCase() === b.toLowerCase();
}
