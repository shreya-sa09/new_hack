// identities.js
//
// Multi-actor demo identities for the RWA journey.
//
// scaffold-eth's burner wallet is a single random key, which can't play the
// owner / verifier / regulator / bank / buyer roles the demo needs. For a LOCAL
// prototype we instead derive the deterministic Hardhat accounts from the
// well-known test mnemonic (these are PUBLIC test keys — never used on a real
// network). These are exactly the accounts `deploy/01_deploy_rwa.js` grants
// roles to and funds, so on-chain roles line up with the UI identity switcher.

import { ethers } from "ethers";

export const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

export const IDENTITIES = [
  { index: 0, role: "Platform", label: "Platform", desc: "Admin / deployer" },
  { index: 1, role: "Owner", label: "Owner / Seller", desc: "Submits & tokenizes the asset" },
  { index: 2, role: "Verifier", label: "Verifier (Govt)", desc: "Endorses documents → VERIFIED" },
  { index: 3, role: "Regulator", label: "Regulator", desc: "Audit + dispute holds" },
  { index: 4, role: "Bank", label: "Bank / Lender", desc: "Registers the lien" },
  { index: 5, role: "Buyer", label: "Buyer", desc: "Funds the atomic settlement" },
];

function pathFor(index) {
  return `m/44'/60'/0'/0/${index}`;
}

export function walletFor(index, provider) {
  const w = ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, pathFor(index));
  return provider ? w.connect(provider) : w;
}

export function addressFor(index) {
  return ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, pathFor(index)).address;
}

export const OWNER_INDEX = 1;
export const VERIFIER_INDEX = 2;
export const REGULATOR_INDEX = 3;
export const BANK_INDEX = 4;
export const BUYER_INDEX = 5;
