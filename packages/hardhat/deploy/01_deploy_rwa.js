// deploy/01_deploy_rwa.js
//
// Deploys the RWA tokenization prototype:
//   1. TokenizedINR (tINR)         - settlement currency
//   2. RWAAssetRegistry(tINR)      - passport + documents + liens + atomic settlement
//   3. Grants VERIFIER_ROLE / REGULATOR_ROLE to demo accounts
//   4. Mints demo tINR to the buyer so an atomic settlement can be funded locally
//
// Demo account map (local Hardhat accounts):
//   acct0 Platform (deployer/admin) · acct1 Owner/Seller · acct2 Verifier
//   acct3 Regulator · acct4 Bank/Lender · acct5 Buyer

const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  // --- 1. settlement currency ---
  const tinr = await deploy("TokenizedINR", { from: deployer, log: true });

  // --- 2. registry ---
  const registry = await deploy("RWAAssetRegistry", {
    from: deployer,
    args: [tinr.address],
    log: true,
  });

  // --- 3 & 4. roles + demo funding ---
  const signers = await ethers.getSigners();
  // Fall back gracefully if fewer accounts are available.
  const verifier = signers[2] || signers[0];
  const regulator = signers[3] || signers[0];
  const buyer = signers[5] || signers[0];

  const Registry = await ethers.getContractAt("RWAAssetRegistry", registry.address, signers[0]);
  const VERIFIER_ROLE = await Registry.VERIFIER_ROLE();
  const REGULATOR_ROLE = await Registry.REGULATOR_ROLE();

  if (!(await Registry.hasRole(VERIFIER_ROLE, verifier.address))) {
    await (await Registry.grantRole(VERIFIER_ROLE, verifier.address)).wait();
    log(`   granted VERIFIER_ROLE  -> ${verifier.address}`);
  }
  if (!(await Registry.hasRole(REGULATOR_ROLE, regulator.address))) {
    await (await Registry.grantRole(REGULATOR_ROLE, regulator.address)).wait();
    log(`   granted REGULATOR_ROLE -> ${regulator.address}`);
  }

  const Tinr = await ethers.getContractAt("TokenizedINR", tinr.address, signers[0]);
  const demoFunding = ethers.utils.parseUnits("100000000", 2); // ₹1,00,00,000.00 in paise
  if ((await Tinr.balanceOf(buyer.address)).isZero()) {
    await (await Tinr.mint(buyer.address, demoFunding)).wait();
    log(`   minted demo tINR       -> ${buyer.address} (₹1,00,00,000.00)`);
  }

  log("✅ RWA prototype deployed");
  log(`   TokenizedINR:      ${tinr.address}`);
  log(`   RWAAssetRegistry:  ${registry.address}`);
};

module.exports.tags = ["RWA", "TokenizedINR", "RWAAssetRegistry"];
