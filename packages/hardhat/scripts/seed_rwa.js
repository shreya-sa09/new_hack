// scripts/seed_rwa.js
//
// Seeds a handful of fully-tokenized (ACTIVE) property assets straight on-chain
// so the marketplace UI has cards to show without needing Pinata / the full
// document-encryption flow. Run against a local node AFTER deploy:
//
//   yarn hardhat run scripts/seed_rwa.js --network localhost
//
// Accounts (Hardhat defaults): 0 Platform · 1 Owner · 2 Verifier · 3 Regulator
//                              4 Bank · 5 Buyer
const { ethers } = require("hardhat");

const PROPERTY = 0;

// Demo listings. `value` is the on-chain lien payoff (₹, in paise) when `lien` is set.
const LISTINGS = [
  { title: "Prestige Villa, Whitefield", city: "Bengaluru", value: "8500000", lien: true, featured: true },
  { title: "Sea-view Apartment, Bandra", city: "Mumbai", value: "12500000", lien: true, featured: true },
  { title: "Farmland Plot, Devanahalli", city: "Bengaluru", value: "0", lien: false, featured: false },
  { title: "Commercial Unit, Cyber City", city: "Gurugram", value: "9800000", lien: true, featured: false },
  { title: "Row House, Kompally", city: "Hyderabad", value: "0", lien: false, featured: false },
  { title: "Retail Space, T. Nagar", city: "Chennai", value: "7200000", lien: false, featured: false },
];

async function main() {
  const signers = await ethers.getSigners();
  const [platform, owner, verifier, regulator, bank] = signers;

  const regDeployment = await deployments().get("RWAAssetRegistry");
  const registry = await ethers.getContractAt("RWAAssetRegistry", regDeployment.address);

  const asOwner = registry.connect(owner);
  const asVerifier = registry.connect(verifier);
  const asBank = registry.connect(bank);

  const already = (await registry.totalAssets()).toNumber();
  if (already > 0) {
    console.log(`ℹ️  ${already} asset(s) already exist — skipping seed to avoid duplicates.`);
    return;
  }

  for (let i = 0; i < LISTINGS.length; i++) {
    const l = LISTINGS[i];
    const cid = `demo://property/${i + 1}`;
    const metaHash = ethers.utils.id(`${l.title}|${l.city}|${i}`);

    // create -> attach a (dummy) document -> submit -> verify -> mint
    const createTx = await asOwner.createAsset(PROPERTY, metaHash, cid);
    await createTx.wait();
    const id = await registry.totalAssets();

    await (await asOwner.addDocument(id, 0, ethers.utils.id(`doc-${i}`), `${cid}/deed`, `${cid}/keys`)).wait();
    await (await asOwner.submitForReview(id)).wait();
    await (await asVerifier.verify(id, true, `${cid}/findings`)).wait();
    await (await asOwner.mint(id)).wait();

    // a lien on some assets so the atomic-settlement flow has something to act on
    if (l.lien) {
      await (await asBank.registerLien(id, ethers.utils.parseUnits(l.value, 2))).wait();
    }

    console.log(`✅ Asset #${id}  ${l.title} (${l.city})${l.lien ? "  · lien registered" : ""}`);
  }

  console.log("🌱 Seed complete.");
}

// helper: hardhat-deploy's deployments namespace
function deployments() {
  return require("hardhat").deployments;
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
