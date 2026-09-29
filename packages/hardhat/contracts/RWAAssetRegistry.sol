//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RWAAssetRegistry
 * @notice Encumbrance-aware real-world-asset passport + settlement, EVM prototype.
 *
 *         Lifecycle:  DRAFT -> UNDER_REVIEW -> VERIFIED -> ACTIVE
 *         - Minting (tokenization) is impossible before VERIFIED (verify-gate).
 *         - VERIFIED requires an endorsement from a VERIFIER_ROLE account (the govt org).
 *         - An ACTIVE asset carrying a live lien or a dispute hold cannot be transferred.
 *         - settle() atomically pays off the lender, pays the seller, releases the lien,
 *           and transfers ownership -- all or nothing.
 *
 *         Documents live off-chain (encrypted, on IPFS). Only the ciphertext hash, the
 *         CID, and the CID of the envelope-wrapped key bundle are stored on-chain.
 *
 *         PROTOTYPE CAVEAT: on Fabric the orgs are separate MSP identities and no single
 *         operator can fabricate "lien released". Here orgs are simulated with roles on
 *         one contract -- the multi-org trust property is out of scope for this track.
 */
contract RWAAssetRegistry is ERC721, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    /// @notice tINR, the settlement currency.
    IERC20 public immutable settlementToken;

    enum Status {
        DRAFT,
        UNDER_REVIEW,
        VERIFIED,
        ACTIVE
    }
    enum AssetClass {
        PROPERTY // fungible gold/bond classes are a future assetClass; out of scope for the prototype
    }

    // ---- error codes (6) ----
    error NotVerified(); // E01: mint attempted before VERIFIED
    error AssetLocked(); // E02: transfer blocked by an active lien
    error OnHold(); // E03: transfer/settlement blocked by a dispute hold
    error Unauthorized(); // E04: caller lacks the required identity/role
    error SettlementMismatch(); // E05: sale price does not cover the lender payoff
    error InvalidState(); // E06: illegal state-machine transition / missing asset

    struct Asset {
        address submitter; // pre-mint owner; after mint, ownerOf(assetId) is authoritative
        AssetClass assetClass;
        Status status;
        bytes32 metadataHash; // SHA-256 of the encrypted passport JSON
        string metadataCID; // IPFS CID of the encrypted passport JSON
        bool hasActiveLien;
        bool onHold;
        bool minted;
    }

    struct Document {
        bytes32 sha256Hash; // hash of the CIPHERTEXT pinned to IPFS
        string cid; // IPFS CID of the ciphertext
        string keyBundleCID; // IPFS CID of the envelope-wrapped key bundle
        uint8 docType; // 0 TITLE_DEED, 1 ENCUMBRANCE_CERT, 2 LOAN_AGREEMENT, ...
        address uploadedBy;
        uint256 timestamp;
    }

    struct Attestation {
        address verifier;
        bool approved;
        string findingsCID; // encrypted AI-findings / verifier notes (optional)
        uint256 timestamp;
    }

    struct Lien {
        address lender;
        uint256 amount; // outstanding payoff, in tINR
        bool active;
    }

    uint256 public nextAssetId = 1;
    mapping(uint256 => Asset) public assets;
    mapping(uint256 => Document[]) private _documents;
    mapping(uint256 => Attestation) public attestations;
    mapping(uint256 => Lien) public liens;
    mapping(address => bytes) public publicKeys; // envelope-encryption public keys, per identity

    // ---- events ----
    event AssetCreated(
        uint256 indexed assetId,
        address indexed submitter,
        AssetClass assetClass,
        bytes32 metadataHash,
        string metadataCID
    );
    event DocumentAdded(
        uint256 indexed assetId,
        uint256 indexed index,
        uint8 docType,
        bytes32 sha256Hash,
        string cid,
        string keyBundleCID
    );
    event SubmittedForReview(uint256 indexed assetId);
    event Verified(uint256 indexed assetId, address indexed verifier, bool approved, string findingsCID);
    event Tokenized(uint256 indexed assetId, address indexed owner);
    event LienRegistered(uint256 indexed assetId, address indexed lender, uint256 amount);
    event LienReleased(uint256 indexed assetId, address indexed lender);
    event HoldPlaced(uint256 indexed assetId, address indexed regulator);
    event HoldLifted(uint256 indexed assetId, address indexed regulator);
    event PublicKeyRegistered(address indexed account, bytes publicKey);
    event Settled(
        uint256 indexed assetId,
        address indexed seller,
        address indexed buyer,
        uint256 salePrice,
        uint256 payoff
    );

    constructor(address settlementToken_) ERC721("RWA Asset Passport", "RWA") {
        require(settlementToken_ != address(0), "token=0");
        settlementToken = IERC20(settlementToken_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Envelope-encryption public keys
    // ---------------------------------------------------------------------

    /// @notice Publish the caller's public key so uploaders can wrap file keys to it.
    function registerPublicKey(bytes calldata pk) external {
        publicKeys[msg.sender] = pk;
        emit PublicKeyRegistered(msg.sender, pk);
    }

    // ---------------------------------------------------------------------
    // Asset lifecycle
    // ---------------------------------------------------------------------

    function createAsset(
        AssetClass assetClass_,
        bytes32 metadataHash_,
        string calldata metadataCID_
    ) external returns (uint256 assetId) {
        assetId = nextAssetId++;
        Asset storage a = assets[assetId];
        a.submitter = msg.sender;
        a.assetClass = assetClass_;
        a.status = Status.DRAFT;
        a.metadataHash = metadataHash_;
        a.metadataCID = metadataCID_;
        emit AssetCreated(assetId, msg.sender, assetClass_, metadataHash_, metadataCID_);
    }

    function addDocument(
        uint256 assetId,
        uint8 docType,
        bytes32 sha256Hash,
        string calldata cid,
        string calldata keyBundleCID
    ) external {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (msg.sender != a.submitter) revert Unauthorized();
        // documents may only be attached while the asset is still being prepared/reviewed
        if (a.status != Status.DRAFT && a.status != Status.UNDER_REVIEW) revert InvalidState();
        _documents[assetId].push(
            Document({
                sha256Hash: sha256Hash,
                cid: cid,
                keyBundleCID: keyBundleCID,
                docType: docType,
                uploadedBy: msg.sender,
                timestamp: block.timestamp
            })
        );
        emit DocumentAdded(assetId, _documents[assetId].length - 1, docType, sha256Hash, cid, keyBundleCID);
    }

    function submitForReview(uint256 assetId) external {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (msg.sender != a.submitter) revert Unauthorized();
        if (a.status != Status.DRAFT) revert InvalidState();
        if (_documents[assetId].length == 0) revert InvalidState();
        a.status = Status.UNDER_REVIEW;
        emit SubmittedForReview(assetId);
    }

    /// @notice Govt/VerifierOrg endorsement. Approve -> VERIFIED; reject -> back to DRAFT.
    function verify(uint256 assetId, bool approved, string calldata findingsCID) external onlyRole(VERIFIER_ROLE) {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (a.status != Status.UNDER_REVIEW) revert InvalidState();
        attestations[assetId] = Attestation({
            verifier: msg.sender,
            approved: approved,
            findingsCID: findingsCID,
            timestamp: block.timestamp
        });
        a.status = approved ? Status.VERIFIED : Status.DRAFT;
        emit Verified(assetId, msg.sender, approved, findingsCID);
    }

    /// @notice Tokenize a VERIFIED asset. Impossible before verification (E01).
    function mint(uint256 assetId) external {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (msg.sender != a.submitter) revert Unauthorized();
        if (a.status != Status.VERIFIED) revert NotVerified();
        a.status = Status.ACTIVE;
        a.minted = true;
        _safeMint(a.submitter, assetId);
        emit Tokenized(assetId, a.submitter);
    }

    // ---------------------------------------------------------------------
    // Encumbrances: liens & dispute holds
    // ---------------------------------------------------------------------

    /// @notice A lender records an outstanding loan against an ACTIVE asset.
    function registerLien(uint256 assetId, uint256 amount) external {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (a.status != Status.ACTIVE) revert InvalidState();
        if (amount == 0) revert InvalidState();
        if (liens[assetId].active) revert InvalidState(); // one active lien per asset in the prototype
        liens[assetId] = Lien({lender: msg.sender, amount: amount, active: true});
        a.hasActiveLien = true;
        emit LienRegistered(assetId, msg.sender, amount);
    }

    /// @notice The lender voluntarily releases its lien (e.g. loan repaid off-platform).
    function releaseLien(uint256 assetId) external {
        Asset storage a = assets[assetId];
        _requireExists(a);
        Lien storage l = liens[assetId];
        if (!l.active) revert InvalidState();
        if (msg.sender != l.lender) revert Unauthorized();
        l.active = false;
        a.hasActiveLien = false;
        emit LienReleased(assetId, l.lender);
    }

    function placeHold(uint256 assetId) external onlyRole(REGULATOR_ROLE) {
        Asset storage a = assets[assetId];
        _requireExists(a);
        a.onHold = true;
        emit HoldPlaced(assetId, msg.sender);
    }

    function liftHold(uint256 assetId) external onlyRole(REGULATOR_ROLE) {
        Asset storage a = assets[assetId];
        _requireExists(a);
        a.onHold = false;
        emit HoldLifted(assetId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Atomic settlement of an encumbered asset
    // ---------------------------------------------------------------------

    /**
     * @notice Settle a mortgaged asset in one atomic transaction:
     *         lender payoff + seller proceeds + lien release + ownership transfer.
     *         If any leg fails (e.g. buyer underfunded), the whole tx reverts and
     *         nothing changes.
     *
     * @dev    The buyer must have approved this contract for at least `salePrice` tINR.
     *         Callable by the buyer or the Platform admin.
     */
    function settle(uint256 assetId, address buyer, uint256 salePrice) external nonReentrant {
        Asset storage a = assets[assetId];
        _requireExists(a);
        if (msg.sender != buyer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        if (a.status != Status.ACTIVE) revert InvalidState();
        if (a.onHold) revert OnHold();

        Lien storage l = liens[assetId];
        if (!l.active) revert InvalidState(); // this path settles an encumbered asset
        uint256 payoff = l.amount;
        if (salePrice < payoff) revert SettlementMismatch();

        address seller = ownerOf(assetId);
        require(buyer != address(0) && buyer != seller, "bad buyer");

        // Money legs first -- these revert if the buyer is underfunded/under-approved.
        settlementToken.safeTransferFrom(buyer, l.lender, payoff);
        if (salePrice > payoff) {
            settlementToken.safeTransferFrom(buyer, seller, salePrice - payoff);
        }

        // Release the lien BEFORE the transfer so the encumbrance gate passes within this tx.
        l.active = false;
        a.hasActiveLien = false;
        emit LienReleased(assetId, l.lender);

        _transfer(seller, buyer, assetId);

        emit Settled(assetId, seller, buyer, salePrice, payoff);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getAsset(uint256 assetId) external view returns (Asset memory) {
        return assets[assetId];
    }

    function getDocuments(uint256 assetId) external view returns (Document[] memory) {
        return _documents[assetId];
    }

    function documentCount(uint256 assetId) external view returns (uint256) {
        return _documents[assetId].length;
    }

    function totalAssets() external view returns (uint256) {
        return nextAssetId - 1;
    }

    // ---------------------------------------------------------------------
    // Internal: encumbrance transfer gate
    // ---------------------------------------------------------------------

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        // Allow mint (from == 0) and burn (to == 0); gate only real ownership moves.
        if (from != address(0) && to != address(0)) {
            Asset storage a = assets[tokenId];
            if (a.onHold) revert OnHold();
            if (a.hasActiveLien) revert AssetLocked();
        }
    }

    function _requireExists(Asset storage a) private view {
        if (a.submitter == address(0)) revert InvalidState();
    }

    // ---------------------------------------------------------------------
    // ERC165
    // ---------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
