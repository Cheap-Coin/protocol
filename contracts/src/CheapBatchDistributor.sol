// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CHEAP Reward Batch Distributor
/// @notice A pre-funded, push-based distributor for finalized Diamond Drops.
///         Each drop commits to public allocation and Safe-approved batch roots,
///         reserves its full budget, prevents batch replay and duplicate wallet
///         payments, and can only distribute its immutable reward token. Deploy
///         one isolated instance per approved RWA asset. A
///         delayed, paused remediation path prevents permanently stuck funds.
contract CheapBatchDistributor is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BATCH_SIZE = 200;
    uint256 public constant REMEDIATION_DELAY = 7 days;

    struct Drop {
        bytes32 allocationRoot;
        bytes32 batchesRoot;
        uint256 totalAmount;
        uint256 remainingAmount;
        uint32 expectedBatches;
        uint32 processedBatches;
        uint64 lastActivityAt;
        bool finalized;
        bool cancelled;
    }

    IERC20 public immutable rewardToken;
    address public operator;
    uint256 public reservedRewards;

    mapping(bytes32 dropId => Drop drop) public drops;
    mapping(bytes32 dropId => mapping(uint256 batchIndex => bool processed)) public batchProcessed;
    mapping(bytes32 dropId => mapping(address recipient => bool paid)) public paid;

    error ZeroAddress();
    error UnauthorizedOperator();
    error InvalidDrop();
    error DropAlreadyExists();
    error DropNotFound();
    error DropAlreadyFinalized();
    error DropIsCancelled();
    error InvalidBatch();
    error BatchAlreadyProcessed();
    error InvalidBatchProof();
    error DuplicateRecipient(address recipient);
    error InsufficientUnreservedRewards(uint256 available, uint256 required);
    error AllocationExceeded(uint256 remaining, uint256 requested);
    error DropIncomplete(uint256 remainingAmount, uint32 remainingBatches);
    error DropAlreadyStarted();
    error DropNotStarted();
    error RemediationDelayActive(uint256 availableAt);

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event DropCreated(
        bytes32 indexed dropId,
        bytes32 indexed allocationRoot,
        bytes32 batchesRoot,
        uint256 totalAmount,
        uint32 expectedBatches
    );
    event BatchDistributed(
        bytes32 indexed dropId,
        uint256 indexed batchIndex,
        bytes32 indexed batchHash,
        uint256 recipientCount,
        uint256 totalAmount
    );
    event DropFinalized(bytes32 indexed dropId, uint256 totalAmount);
    event DropCancelled(bytes32 indexed dropId, uint256 releasedAmount);
    event DropRemediationClosed(bytes32 indexed dropId, uint256 releasedAmount, uint32 processedBatches);
    event AvailableRewardsWithdrawn(address indexed recipient, uint256 amount);

    modifier onlyOperator() {
        if (msg.sender != operator) revert UnauthorizedOperator();
        _;
    }

    constructor(IERC20 rewardToken_, address operator_, address initialOwner) Ownable(initialOwner) {
        if (address(rewardToken_) == address(0) || operator_ == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        rewardToken = rewardToken_;
        operator = operator_;
    }

    function availableRewards() public view returns (uint256) {
        uint256 balance = rewardToken.balanceOf(address(this));
        return balance > reservedRewards ? balance - reservedRewards : 0;
    }

    function getDrop(bytes32 dropId) external view returns (Drop memory) {
        return drops[dropId];
    }

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    /// @notice Registers an immutable allocation commitment and reserves the
    ///         entire reward budget before any wallet is paid.
    function createDrop(
        bytes32 dropId,
        bytes32 allocationRoot,
        bytes32 batchesRoot,
        uint256 totalAmount,
        uint32 expectedBatches
    ) external onlyOwner whenNotPaused {
        if (
            dropId == bytes32(0) || allocationRoot == bytes32(0) || batchesRoot == bytes32(0) || totalAmount == 0
                || expectedBatches == 0
        ) revert InvalidDrop();
        if (drops[dropId].allocationRoot != bytes32(0)) revert DropAlreadyExists();

        uint256 available = availableRewards();
        if (available < totalAmount) {
            revert InsufficientUnreservedRewards(available, totalAmount);
        }

        drops[dropId] = Drop({
            allocationRoot: allocationRoot,
            batchesRoot: batchesRoot,
            totalAmount: totalAmount,
            remainingAmount: totalAmount,
            expectedBatches: expectedBatches,
            processedBatches: 0,
            lastActivityAt: uint64(block.timestamp),
            finalized: false,
            cancelled: false
        });
        reservedRewards += totalAmount;
        emit DropCreated(dropId, allocationRoot, batchesRoot, totalAmount, expectedBatches);
    }

    function distributeBatch(
        bytes32 dropId,
        uint256 batchIndex,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata proof
    ) external nonReentrant onlyOperator whenNotPaused {
        Drop storage drop = drops[dropId];
        if (drop.allocationRoot == bytes32(0)) revert DropNotFound();
        if (drop.finalized) revert DropAlreadyFinalized();
        if (drop.cancelled) revert DropIsCancelled();
        if (
            recipients.length == 0 || recipients.length > MAX_BATCH_SIZE || recipients.length != amounts.length
                || batchIndex >= drop.expectedBatches
        ) revert InvalidBatch();
        if (batchProcessed[dropId][batchIndex]) revert BatchAlreadyProcessed();

        bytes32 batchHash = _verifyBatchProof(drop.batchesRoot, dropId, batchIndex, recipients, amounts, proof);
        uint256 total = _markRecipientsPaid(dropId, recipients, amounts);

        if (total > drop.remainingAmount) {
            revert AllocationExceeded(drop.remainingAmount, total);
        }

        batchProcessed[dropId][batchIndex] = true;
        drop.processedBatches += 1;
        drop.remainingAmount -= total;
        drop.lastActivityAt = uint64(block.timestamp);
        reservedRewards -= total;

        for (uint256 index = 0; index < recipients.length; ++index) {
            rewardToken.safeTransfer(recipients[index], amounts[index]);
        }

        emit BatchDistributed(dropId, batchIndex, batchHash, recipients.length, total);
    }

    function finalizeDrop(bytes32 dropId) external onlyOwner {
        Drop storage drop = drops[dropId];
        if (drop.allocationRoot == bytes32(0)) revert DropNotFound();
        if (drop.finalized) revert DropAlreadyFinalized();
        if (drop.cancelled) revert DropIsCancelled();
        if (drop.remainingAmount != 0 || drop.processedBatches != drop.expectedBatches) {
            revert DropIncomplete(drop.remainingAmount, drop.expectedBatches - drop.processedBatches);
        }

        drop.finalized = true;
        drop.lastActivityAt = uint64(block.timestamp);
        emit DropFinalized(dropId, drop.totalAmount);
    }

    /// @notice Cancels only an untouched drop while retaining its identifier and
    ///         commitment forever in storage for an unambiguous audit trail.
    function cancelUnstartedDrop(bytes32 dropId) external onlyOwner {
        Drop storage drop = drops[dropId];
        if (drop.allocationRoot == bytes32(0)) revert DropNotFound();
        if (drop.finalized) revert DropAlreadyFinalized();
        if (drop.cancelled) revert DropIsCancelled();
        if (drop.processedBatches != 0) revert DropAlreadyStarted();
        uint256 released = _cancel(drop);
        emit DropCancelled(dropId, released);
    }

    /// @notice Releases the unpaid remainder of a partially executed drop only
    ///         while paused and after a seven-day review window. Paid wallets
    ///         remain recorded; an explicit remediation drop can cover valid
    ///         unpaid recipients without hiding the failed original commitment.
    function closeForRemediation(bytes32 dropId) external onlyOwner whenPaused {
        Drop storage drop = drops[dropId];
        if (drop.allocationRoot == bytes32(0)) revert DropNotFound();
        if (drop.finalized) revert DropAlreadyFinalized();
        if (drop.cancelled) revert DropIsCancelled();
        if (drop.processedBatches == 0) revert DropNotStarted();
        uint256 availableAt = uint256(drop.lastActivityAt) + REMEDIATION_DELAY;
        // A bounded validator timestamp drift cannot bypass a seven-day Safe review delay.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < availableAt) {
            revert RemediationDelayActive(availableAt);
        }

        uint256 released = _cancel(drop);
        emit DropRemediationClosed(dropId, released, drop.processedBatches);
    }

    /// @notice Withdraws only funds not reserved by a published drop.
    function withdrawAvailable(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 available = availableRewards();
        if (amount > available) {
            revert InsufficientUnreservedRewards(available, amount);
        }
        rewardToken.safeTransfer(recipient, amount);
        emit AvailableRewardsWithdrawn(recipient, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _verifyBatchProof(
        bytes32 batchesRoot,
        bytes32 dropId,
        uint256 batchIndex,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata proof
    ) private pure returns (bytes32 batchHash) {
        batchHash = keccak256(abi.encode(dropId, batchIndex, recipients, amounts));
        bytes32 batchLeaf = keccak256(bytes.concat(batchHash));
        if (!MerkleProof.verifyCalldata(proof, batchesRoot, batchLeaf)) {
            revert InvalidBatchProof();
        }
    }

    function _markRecipientsPaid(bytes32 dropId, address[] calldata recipients, uint256[] calldata amounts)
        private
        returns (uint256 total)
    {
        for (uint256 index = 0; index < recipients.length; ++index) {
            address recipient = recipients[index];
            uint256 amount = amounts[index];
            if (recipient == address(0) || amount == 0) revert InvalidBatch();
            if (paid[dropId][recipient]) revert DuplicateRecipient(recipient);
            paid[dropId][recipient] = true;
            total += amount;
        }
    }

    function _cancel(Drop storage drop) private returns (uint256 released) {
        released = drop.remainingAmount;
        drop.remainingAmount = 0;
        drop.cancelled = true;
        drop.lastActivityAt = uint64(block.timestamp);
        reservedRewards -= released;
    }
}
