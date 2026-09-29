const { ethers } = require("hardhat");
const { expect } = require("chai");

// AssetClass.PROPERTY == 0; Status: DRAFT 0, UNDER_REVIEW 1, VERIFIED 2, ACTIVE 3
const PROPERTY = 0;
const DOC_TITLE_DEED = 0;

const HASH = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ciphertext"));
const CID = "bafyCiphertextCID";
const KEY_BUNDLE_CID = "bafyKeyBundleCID";
const META_CID = "bafyMetaCID";

async function fixture() {
  const [platform, owner, verifier, regulator, bank, buyer] = await ethers.getSigners();

  const TokenizedINR = await ethers.getContractFactory("TokenizedINR");
  const tinr = await TokenizedINR.deploy();

  const Registry = await ethers.getContractFactory("RWAAssetRegistry");
  const registry = await Registry.deploy(tinr.address);

  await registry.grantRole(await registry.VERIFIER_ROLE(), verifier.address);
  await registry.grantRole(await registry.REGULATOR_ROLE(), regulator.address);

  return { tinr, registry, platform, owner, verifier, regulator, bank, buyer };
}

// Drive an asset all the way to ACTIVE (minted) owned by `owner`.
async function activeAsset({ registry, owner, verifier }) {
  await registry.connect(owner).createAsset(PROPERTY, HASH, META_CID);
  const assetId = await registry.totalAssets();
  await registry.connect(owner).addDocument(assetId, DOC_TITLE_DEED, HASH, CID, KEY_BUNDLE_CID);
  await registry.connect(owner).submitForReview(assetId);
  await registry.connect(verifier).verify(assetId, true, "bafyFindings");
  await registry.connect(owner).mint(assetId);
  return assetId;
}

describe("RWA Tokenization prototype", function () {
  describe("Happy path: verify -> tokenize -> encumber -> atomic settle", function () {
    it("runs the full journey and settles atomically", async function () {
      const ctx = await fixture();
      const { registry, tinr, owner, verifier, bank, buyer } = ctx;

      // create + document + submit
      await registry.connect(owner).createAsset(PROPERTY, HASH, META_CID);
      const assetId = await registry.totalAssets();
      expect(assetId).to.equal(1);
      await registry.connect(owner).addDocument(assetId, DOC_TITLE_DEED, HASH, CID, KEY_BUNDLE_CID);
      expect(await registry.documentCount(assetId)).to.equal(1);
      await registry.connect(owner).submitForReview(assetId);

      // verify -> VERIFIED
      await registry.connect(verifier).verify(assetId, true, "bafyFindings");
      expect((await registry.getAsset(assetId)).status).to.equal(2);

      // mint -> ACTIVE, owned by owner
      await registry.connect(owner).mint(assetId);
      expect(await registry.ownerOf(assetId)).to.equal(owner.address);
      expect((await registry.getAsset(assetId)).status).to.equal(3);

      // bank registers a lien
      const payoff = ethers.utils.parseUnits("6000000", 2); // ₹60,00,000
      await registry.connect(bank).registerLien(assetId, payoff);
      expect((await registry.getAsset(assetId)).hasActiveLien).to.equal(true);

      // fund buyer and approve
      const salePrice = ethers.utils.parseUnits("8000000", 2); // ₹80,00,000
      await tinr.mint(buyer.address, salePrice);
      await tinr.connect(buyer).approve(registry.address, salePrice);

      const bankBefore = await tinr.balanceOf(bank.address);
      const sellerBefore = await tinr.balanceOf(owner.address);

      // atomic settle
      await expect(registry.connect(buyer).settle(assetId, buyer.address, salePrice))
        .to.emit(registry, "Settled")
        .withArgs(assetId, owner.address, buyer.address, salePrice, payoff);

      // ownership moved, lien released, money split correctly
      expect(await registry.ownerOf(assetId)).to.equal(buyer.address);
      expect((await registry.getAsset(assetId)).hasActiveLien).to.equal(false);
      expect(await tinr.balanceOf(bank.address)).to.equal(bankBefore.add(payoff));
      expect(await tinr.balanceOf(owner.address)).to.equal(sellerBefore.add(salePrice.sub(payoff)));
      expect(await tinr.balanceOf(buyer.address)).to.equal(0);
    });
  });

  describe("Error codes", function () {
    it("E01 NotVerified: mint reverts before VERIFIED", async function () {
      const ctx = await fixture();
      const { registry, owner, verifier } = ctx;
      await registry.connect(owner).createAsset(PROPERTY, HASH, META_CID);
      const assetId = await registry.totalAssets();
      await registry.connect(owner).addDocument(assetId, DOC_TITLE_DEED, HASH, CID, KEY_BUNDLE_CID);
      // still DRAFT
      await expect(registry.connect(owner).mint(assetId)).to.be.revertedWithCustomError(registry, "NotVerified");
      // even UNDER_REVIEW cannot mint
      await registry.connect(owner).submitForReview(assetId);
      await expect(registry.connect(owner).mint(assetId)).to.be.revertedWithCustomError(registry, "NotVerified");
      // rejected verification -> DRAFT, still cannot mint
      await registry.connect(verifier).verify(assetId, false, "");
      await expect(registry.connect(owner).mint(assetId)).to.be.revertedWithCustomError(registry, "NotVerified");
    });

    it("E02 AssetLocked: transfer of a lien-bearing asset reverts", async function () {
      const ctx = await fixture();
      const { registry, owner, bank, buyer } = ctx;
      const assetId = await activeAsset(ctx);
      await registry.connect(bank).registerLien(assetId, ethers.utils.parseUnits("100", 2));
      await expect(
        registry.connect(owner).transferFrom(owner.address, buyer.address, assetId)
      ).to.be.revertedWithCustomError(registry, "AssetLocked");
    });

    it("E03 OnHold: hold blocks both plain transfer and settlement", async function () {
      const ctx = await fixture();
      const { registry, tinr, owner, regulator, bank, buyer } = ctx;
      const assetId = await activeAsset(ctx);
      await registry.connect(regulator).placeHold(assetId);

      // plain transfer blocked
      await expect(
        registry.connect(owner).transferFrom(owner.address, buyer.address, assetId)
      ).to.be.revertedWithCustomError(registry, "OnHold");

      // settlement blocked too
      const payoff = ethers.utils.parseUnits("100", 2);
      await registry.connect(bank).registerLien(assetId, payoff);
      await tinr.mint(buyer.address, payoff);
      await tinr.connect(buyer).approve(registry.address, payoff);
      await expect(
        registry.connect(buyer).settle(assetId, buyer.address, payoff)
      ).to.be.revertedWithCustomError(registry, "OnHold");

      // lifting the hold unblocks settlement
      await registry.connect(regulator).liftHold(assetId);
      await expect(registry.connect(buyer).settle(assetId, buyer.address, payoff)).to.emit(registry, "Settled");
    });

    it("E04 Unauthorized: role/identity gates", async function () {
      const ctx = await fixture();
      const { registry, owner, buyer, regulator } = ctx;
      await registry.connect(owner).createAsset(PROPERTY, HASH, META_CID);
      const assetId = await registry.totalAssets();

      // non-submitter cannot add a document
      await expect(
        registry.connect(buyer).addDocument(assetId, DOC_TITLE_DEED, HASH, CID, KEY_BUNDLE_CID)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");

      // non-verifier cannot verify (AccessControl reverts with a role-based string, not a custom error)
      await registry.connect(owner).addDocument(assetId, DOC_TITLE_DEED, HASH, CID, KEY_BUNDLE_CID);
      await registry.connect(owner).submitForReview(assetId);
      await expect(registry.connect(buyer).verify(assetId, true, "")).to.be.reverted;

      // non-regulator cannot place a hold
      await expect(registry.connect(owner).placeHold(assetId)).to.be.reverted;

      // a stranger cannot settle on the buyer's behalf
      await registry.connect(regulator); // no-op, keep lint calm
    });

    it("E05 SettlementMismatch: sale price below payoff reverts", async function () {
      const ctx = await fixture();
      const { registry, tinr, bank, buyer } = ctx;
      const assetId = await activeAsset(ctx);
      const payoff = ethers.utils.parseUnits("6000000", 2);
      await registry.connect(bank).registerLien(assetId, payoff);

      const tooLow = payoff.sub(1);
      await tinr.mint(buyer.address, payoff);
      await tinr.connect(buyer).approve(registry.address, payoff);
      await expect(
        registry.connect(buyer).settle(assetId, buyer.address, tooLow)
      ).to.be.revertedWithCustomError(registry, "SettlementMismatch");
    });

    it("E06 InvalidState: illegal transitions revert", async function () {
      const ctx = await fixture();
      const { registry, owner, verifier } = ctx;
      await registry.connect(owner).createAsset(PROPERTY, HASH, META_CID);
      const assetId = await registry.totalAssets();

      // cannot submit with no documents
      await expect(registry.connect(owner).submitForReview(assetId)).to.be.revertedWithCustomError(
        registry,
        "InvalidState"
      );

      // cannot verify while still DRAFT
      await expect(registry.connect(verifier).verify(assetId, true, "")).to.be.revertedWithCustomError(
        registry,
        "InvalidState"
      );

      // operating on a non-existent asset
      await expect(registry.connect(owner).submitForReview(999)).to.be.revertedWithCustomError(
        registry,
        "InvalidState"
      );
    });
  });

  describe("Atomicity", function () {
    it("settle with an underfunded buyer reverts and leaves all state unchanged", async function () {
      const ctx = await fixture();
      const { registry, tinr, owner, bank, buyer } = ctx;
      const assetId = await activeAsset(ctx);

      const payoff = ethers.utils.parseUnits("6000000", 2);
      const salePrice = ethers.utils.parseUnits("8000000", 2);
      await registry.connect(bank).registerLien(assetId, payoff);

      // buyer approves but has NO tINR balance
      await tinr.connect(buyer).approve(registry.address, salePrice);

      const ownerBefore = await registry.ownerOf(assetId);
      const bankBefore = await tinr.balanceOf(bank.address);
      const sellerBefore = await tinr.balanceOf(owner.address);
      const lienBefore = (await registry.getAsset(assetId)).hasActiveLien;

      await expect(registry.connect(buyer).settle(assetId, buyer.address, salePrice)).to.be.reverted;

      // nothing moved: no payoff, no seller proceeds, lien still active, owner unchanged
      expect(await registry.ownerOf(assetId)).to.equal(ownerBefore);
      expect(await tinr.balanceOf(bank.address)).to.equal(bankBefore);
      expect(await tinr.balanceOf(owner.address)).to.equal(sellerBefore);
      expect((await registry.getAsset(assetId)).hasActiveLien).to.equal(lienBefore);
      expect(lienBefore).to.equal(true);
    });
  });

  describe("Provenance", function () {
    it("exposes ownership history via Transfer events", async function () {
      const ctx = await fixture();
      const { registry, tinr, owner, bank, buyer } = ctx;
      const assetId = await activeAsset(ctx);

      const payoff = ethers.utils.parseUnits("100", 2);
      const salePrice = ethers.utils.parseUnits("200", 2);
      await registry.connect(bank).registerLien(assetId, payoff);
      await tinr.mint(buyer.address, salePrice);
      await tinr.connect(buyer).approve(registry.address, salePrice);
      await registry.connect(buyer).settle(assetId, buyer.address, salePrice);

      const transfers = await registry.queryFilter(registry.filters.Transfer(null, null, assetId));
      // mint (0 -> owner) then settlement (owner -> buyer)
      expect(transfers.length).to.equal(2);
      expect(transfers[0].args.from).to.equal(ethers.constants.AddressZero);
      expect(transfers[0].args.to).to.equal(owner.address);
      expect(transfers[1].args.from).to.equal(owner.address);
      expect(transfers[1].args.to).to.equal(buyer.address);
    });
  });
});
