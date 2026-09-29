//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenizedINR (tINR)
 * @notice Minimal ERC-20 standing in for tokenized INR, used as the settlement
 *         currency in the RWA prototype. The deployer (Platform) can mint demo
 *         balances so buyers can fund an atomic settlement on a local chain.
 *
 *         This is a PROTOTYPE convenience. In the real DRUNIX/Fabric MVP, tINR
 *         is issued by a regulated issuer org, not freely minted by one operator.
 */
contract TokenizedINR is ERC20, Ownable {
    constructor() ERC20("Tokenized INR", "tINR") {}

    /// @notice tINR uses 2 decimals (paise) to read like real rupee amounts.
    function decimals() public pure override returns (uint8) {
        return 2;
    }

    /// @notice Mint demo balances (Platform only).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
