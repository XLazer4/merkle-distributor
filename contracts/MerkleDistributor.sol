// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "./IMerkleDistributor.sol";
import './IEVMAccounts.sol';

/**
 * @title Merkle Distributor
 *
 * Modified from https://github.com/Badger-Finance/badger-system/blob/master/contracts/badger-geyser/BadgerTreeV2.sol
 */
contract MerkleDistributor is Initializable, AccessControlUpgradeable, PausableUpgradeable, IMerkleDistributor {

    struct MerkleData {
        bytes32 root;
        bytes32 contentHash;
        uint256 timestamp;
        uint256 publishBlock;
        uint256 startBlock;
        uint256 endBlock;
    }

    bytes32 public constant ROOT_PROPOSER_ROLE = keccak256("ROOT_PROPOSER_ROLE");
    bytes32 public constant ROOT_VALIDATOR_ROLE = keccak256("ROOT_VALIDATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    uint256 public currentCycle;
    bytes32 public merkleRoot;
    bytes32 public merkleContentHash;
    uint256 public lastPublishTimestamp;
    uint256 public lastPublishBlockNumber;

    uint256 public pendingCycle;
    bytes32 public pendingMerkleRoot;
    bytes32 public pendingMerkleContentHash;
    uint256 public lastProposeTimestamp;
    uint256 public lastProposeBlockNumber;

    // Reward targets are Polkadot address, so it's represented as bytes32
    // Polkadot address => (token address => amount)
    mapping(bytes32 => mapping(address => uint256)) public claimed;
    // Token address => total amount claimed
    mapping(address => uint256) public totalClaimed;

    uint256 public lastPublishStartBlock;
    uint256 public lastPublishEndBlock;

    uint256 public lastProposeStartBlock;
    uint256 public lastProposeEndBlock;

    function initialize(
        address admin,
        address initialProposer,
        address initialValidator
    ) public initializer {
        __AccessControl_init();
        __Pausable_init_unchained();

        _setupRole(DEFAULT_ADMIN_ROLE, admin); // The admin can edit all role permissions
        _setupRole(ROOT_PROPOSER_ROLE, initialProposer); // The admin can edit all role permissions
        _setupRole(ROOT_VALIDATOR_ROLE, initialValidator); // The admin can edit all role permissions
    }

    /// ===== Modifiers =====

    /// @notice Admins can approve new root updaters or admins
    function _onlyAdmin() internal view {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "onlyAdmin");
    }

    /// @notice Root updaters can update the root
    function _onlyRootProposer() internal view {
        require(hasRole(ROOT_PROPOSER_ROLE, msg.sender), "onlyRootProposer");
    }

    function _onlyRootValidator() internal view {
        require(hasRole(ROOT_VALIDATOR_ROLE, msg.sender), "onlyRootValidator");
    }

    function _onlyPauser() internal view {
        require(hasRole(PAUSER_ROLE, msg.sender), "onlyPauser");
    }

    function _onlyUnpauser() internal view {
        require(hasRole(UNPAUSER_ROLE, msg.sender), "onlyUnpauser");
    }

    function getCurrentMerkleData() external view returns (MerkleData memory) {
        return
            MerkleData(merkleRoot, merkleContentHash, lastPublishTimestamp, lastPublishBlockNumber, lastPublishStartBlock, lastPublishEndBlock);
    }

    function getPendingMerkleData() external view returns (MerkleData memory) {
        return
            MerkleData(
                pendingMerkleRoot,
                pendingMerkleContentHash,
                lastProposeTimestamp,
                lastProposeBlockNumber,
                lastProposeStartBlock,
                lastProposeEndBlock
            );
    }

    function hasPendingRoot() external view returns (bool) {
        return pendingCycle == currentCycle + 1;
    }

    /// @dev Return true if account has outstanding claims in any token from the given input data
    function isClaimAvailableFor(
        bytes32 user,
        address[] memory tokens,
        uint256[] memory cumulativeAmounts
    ) public view returns (bool) {
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 userClaimable = cumulativeAmounts[i] - claimed[user][tokens[i]];
            if (userClaimable > 0) {
                return true;
            }
        }
        return false;
    }

    /// @dev Get the number of tokens claimable for an account, given a list of tokens and latest cumulativeAmounts data
    function getClaimableFor(
        bytes32 user,
        address[] memory tokens,
        uint256[] memory cumulativeAmounts
    ) public view returns (address[] memory, uint256[] memory) {
        uint256[] memory userClaimable = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            userClaimable[i] = cumulativeAmounts[i] - claimed[user][tokens[i]];
        }
        return (tokens, userClaimable);
    }

    function getClaimedFor(bytes32 user, address[] memory tokens) public view returns (address[] memory, uint256[] memory) {
        uint256[] memory userClaimed = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            userClaimed[i] = claimed[user][tokens[i]];
        }
        return (tokens, userClaimed);
    }

    function encodeClaim(
        address[] calldata tokens,
        uint256[] calldata cumulativeAmounts,
        bytes32 account,
        uint256 index,
        uint256 cycle
    ) public pure returns (bytes memory encoded, bytes32 hash) {
        encoded = abi.encode(index, account, cycle, tokens, cumulativeAmounts);
        hash = keccak256(encoded);
    }

    /// @notice Claim accumulated rewards for a set of tokens at a given cycle number
    function claim(
        bytes32 user,
        address[] calldata tokens,
        uint256[] calldata cumulativeAmounts,
        uint256 index,
        uint256 cycle,
        bytes32[] calldata merkleProof
    ) external whenNotPaused {
        require(cycle == currentCycle, "Invalid cycle");

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encode(index, user, cycle, tokens, cumulativeAmounts));
        require(MerkleProofUpgradeable.verify(merkleProof, merkleRoot, node), "Invalid proof");

        // Claim each token
        for (uint256 i = 0; i < tokens.length; i++) {
            // If none claimable for token, skip
            if (cumulativeAmounts[i] == 0) {
                continue;
            }

            uint256 claimable = cumulativeAmounts[i] - claimed[user][tokens[i]];
            // If all claimed, skip
            if (claimable == 0) {
                continue;
            }

            claimed[user][tokens[i]] += claimable;
            totalClaimed[tokens[i]] += claimable;

            // address userAddress = IEVMAccounts(ADDRESS.EVMAccounts).getEvmAddress(user);
            address userAddress = IEVMAccounts(0x0000000000000000000000000000000000000806).getEvmAddress(user);
            require(IERC20Upgradeable(tokens[i]).transfer(userAddress, claimable), "Transfer failed");

            emit Claimed(user, userAddress, tokens[i], claimable, cycle, block.timestamp, block.number, msg.sender);
        }
    }

    // ===== Root Updater Restricted =====

    /// @notice Propose a new root and content hash, which will be stored as pending until approved
    function proposeRoot(
        bytes32 root,
        bytes32 contentHash,
        uint256 cycle,
        uint256 startBlock,
        uint256 endBlock
    ) external whenNotPaused {
        _onlyRootProposer();
        require(cycle == currentCycle + 1, "Incorrect cycle");

        pendingCycle = cycle;
        pendingMerkleRoot = root;
        pendingMerkleContentHash = contentHash;
        lastProposeStartBlock = startBlock;
        lastProposeEndBlock = endBlock;

        lastProposeTimestamp = block.timestamp;
        lastProposeBlockNumber = block.number;

        emit RootProposed(cycle, pendingMerkleRoot, pendingMerkleContentHash, startBlock, endBlock, block.timestamp, block.number);
    }

    /// ===== Guardian Restricted =====

    /// @notice Approve the current pending root and content hash
    function approveRoot(
        bytes32 root,
        bytes32 contentHash,
        uint256 cycle,
        uint256 startBlock,
        uint256 endBlock
    ) external whenNotPaused {
        _onlyRootValidator();
        require(root == pendingMerkleRoot, "Incorrect root");
        require(contentHash == pendingMerkleContentHash, "Incorrect content hash");
        require(cycle == pendingCycle, "Incorrect cycle");

        require(startBlock == lastProposeStartBlock, "Incorrect cycle start block");
        require(endBlock == lastProposeEndBlock, "Incorrect cycle end block");

        currentCycle = cycle;
        merkleRoot = root;
        merkleContentHash = contentHash;
        lastPublishStartBlock = startBlock;
        lastPublishEndBlock = endBlock;

        lastPublishTimestamp = block.timestamp;
        lastPublishBlockNumber = block.number;

        emit RootUpdated(currentCycle, root, contentHash, startBlock, endBlock, block.timestamp, block.number);
    }

    /// @notice Pause publishing of new roots
    function pause() external {
        _onlyPauser();
        _pause();
    }

    /// @notice Unpause publishing of new roots
    function unpause() external {
        _onlyUnpauser();
        _unpause();
    }
}