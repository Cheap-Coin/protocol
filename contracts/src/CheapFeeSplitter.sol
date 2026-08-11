// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICreatorFeeManager} from "./interfaces/ICreatorFeeManager.sol";

/// @title CHEAP Creator Fee Splitter
/// @notice Collects primary-pool quote-only creator fees and routes 25% to the creator and
///         75% to the holder-rewards treasury. The recipients and reward token
///         are immutable. The Doppler fee manager and pool can be configured
///         exactly once after the launch transaction is verified.
contract CheapFeeSplitter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant CREATOR_SHARE_BPS = 2_500;
    uint256 public constant HOLDER_SHARE_BPS = 7_500;

    IERC20 public immutable rewardToken;
    address public immutable creatorRecipient;
    address public immutable holderTreasury;

    ICreatorFeeManager public feeManager;
    bytes32 public poolId;
    bool public poolConfigured;

    error ZeroAddress();
    error PoolAlreadyConfigured();
    error PoolNotConfigured();
    error InvalidFeeManager();
    error NoRewardsAvailable();
    error RewardTokenCannotBeSwept();

    event PoolConfigured(address indexed feeManager, bytes32 indexed poolId);
    event RewardsSplit(uint256 totalAmount, uint256 creatorAmount, uint256 holderAmount);
    event UnsupportedTokenSwept(address indexed token, address indexed recipient, uint256 amount);

    constructor(IERC20 rewardToken_, address creatorRecipient_, address holderTreasury_, address initialOwner)
        Ownable(initialOwner)
    {
        if (
            address(rewardToken_) == address(0) || creatorRecipient_ == address(0) || holderTreasury_ == address(0)
                || initialOwner == address(0)
        ) revert ZeroAddress();
        if (creatorRecipient_ == holderTreasury_) revert ZeroAddress();

        rewardToken = rewardToken_;
        creatorRecipient = creatorRecipient_;
        holderTreasury = holderTreasury_;
    }

    /// @notice Locks the verified Doppler fee manager and pool into the splitter.
    function configurePool(address feeManager_, bytes32 poolId_) external onlyOwner {
        if (poolConfigured) revert PoolAlreadyConfigured();
        if (feeManager_ == address(0) || feeManager_.code.length == 0 || poolId_ == bytes32(0)) {
            revert InvalidFeeManager();
        }

        feeManager = ICreatorFeeManager(feeManager_);
        poolId = poolId_;
        poolConfigured = true;
        emit PoolConfigured(feeManager_, poolId_);
    }

    /// @notice Claims fees as the configured beneficiary, then splits the full
    ///         canonical reward-token balance. Anyone may trigger this;
    ///         funds can only reach the two immutable recipients.
    function collectAndSplit()
        external
        nonReentrant
        whenNotPaused
        returns (uint256 creatorAmount, uint256 holderAmount)
    {
        if (!poolConfigured) revert PoolNotConfigured();

        feeManager.collectFees(poolId);
        return _splitAvailableBalance();
    }

    /// @notice Splits reward tokens already transferred to this contract. This
    ///         supports Safe-controlled/manual claims without changing routing.
    function splitBalance() external nonReentrant whenNotPaused returns (uint256 creatorAmount, uint256 holderAmount) {
        return _splitAvailableBalance();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recovers unrelated tokens accidentally sent here. Canonical COST
    ///         can never be redirected away from the immutable fee split.
    function sweepUnsupportedToken(IERC20 token, address recipient) external onlyOwner {
        if (address(token) == address(rewardToken)) revert RewardTokenCannotBeSwept();
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(recipient, amount);
        emit UnsupportedTokenSwept(address(token), recipient, amount);
    }

    function _split(uint256 amount) private returns (uint256 creatorAmount, uint256 holderAmount) {
        creatorAmount = (amount * CREATOR_SHARE_BPS) / BASIS_POINTS;
        holderAmount = amount - creatorAmount;

        rewardToken.safeTransfer(creatorRecipient, creatorAmount);
        rewardToken.safeTransfer(holderTreasury, holderAmount);
        emit RewardsSplit(amount, creatorAmount, holderAmount);
    }

    function _splitAvailableBalance() private returns (uint256 creatorAmount, uint256 holderAmount) {
        uint256 amount = rewardToken.balanceOf(address(this));
        if (amount == 0) revert NoRewardsAvailable();
        return _split(amount);
    }
}
