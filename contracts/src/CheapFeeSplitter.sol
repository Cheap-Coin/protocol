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
/// @notice Collects both assets earned by the primary CHEAP/COST pool and routes
///         25% of each asset to the creator and 75% to the community treasury.
///         COST can fund deterministic Diamond Drops and CHEAP can fund
///         separately published Surprise Drops. The launched CHEAP token,
///         Doppler fee manager, and pool are locked together exactly once after
///         the launch transaction is verified.
contract CheapFeeSplitter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant CREATOR_SHARE_BPS = 2_500;
    uint256 public constant HOLDER_SHARE_BPS = 7_500;

    IERC20 public immutable quoteToken;
    IERC20 public assetToken;
    address public immutable creatorRecipient;
    address public immutable communityTreasury;

    ICreatorFeeManager public feeManager;
    bytes32 public poolId;
    bool public poolConfigured;

    error ZeroAddress();
    error PoolAlreadyConfigured();
    error PoolNotConfigured();
    error InvalidFeeManager();
    error InvalidAssetToken();
    error NoRewardsAvailable();
    error PoolTokenCannotBeSwept();

    event PoolConfigured(address indexed feeManager, bytes32 indexed poolId, address indexed assetToken);
    event FeesSplit(address indexed token, uint256 totalAmount, uint256 creatorAmount, uint256 communityAmount);
    event UnsupportedTokenSwept(address indexed token, address indexed recipient, uint256 amount);

    constructor(IERC20 quoteToken_, address creatorRecipient_, address communityTreasury_, address initialOwner)
        Ownable(initialOwner)
    {
        if (
            address(quoteToken_) == address(0) || address(quoteToken_).code.length == 0
                || creatorRecipient_ == address(0) || communityTreasury_ == address(0) || initialOwner == address(0)
        ) revert ZeroAddress();
        if (creatorRecipient_ == communityTreasury_) revert ZeroAddress();

        quoteToken = quoteToken_;
        creatorRecipient = creatorRecipient_;
        communityTreasury = communityTreasury_;
    }

    /// @notice Locks the verified launched CHEAP token, Doppler fee manager, and
    ///         pool into the splitter. The asset token is configured here because
    ///         its address is not final until the launch is simulated/deployed.
    function configurePool(address feeManager_, bytes32 poolId_, IERC20 assetToken_) external onlyOwner {
        if (poolConfigured) revert PoolAlreadyConfigured();
        if (feeManager_ == address(0) || feeManager_.code.length == 0 || poolId_ == bytes32(0)) {
            revert InvalidFeeManager();
        }
        if (
            address(assetToken_) == address(0) || address(assetToken_).code.length == 0
                || address(assetToken_) == address(quoteToken)
        ) revert InvalidAssetToken();

        assetToken = assetToken_;
        feeManager = ICreatorFeeManager(feeManager_);
        poolId = poolId_;
        poolConfigured = true;
        emit PoolConfigured(feeManager_, poolId_, address(assetToken_));
    }

    /// @notice Claims fees as the configured beneficiary, then splits the full
    ///         balances of both pool tokens. Anyone may trigger this;
    ///         funds can only reach the two immutable recipients.
    function collectAndSplit()
        external
        nonReentrant
        whenNotPaused
        returns (
            uint256 assetCreatorAmount,
            uint256 assetCommunityAmount,
            uint256 quoteCreatorAmount,
            uint256 quoteCommunityAmount
        )
    {
        if (!poolConfigured) revert PoolNotConfigured();

        feeManager.collectFees(poolId);
        return _splitAvailableBalances();
    }

    /// @notice Splits pool tokens already transferred to this contract. This
    ///         supports Safe-controlled/manual claims without changing routing.
    function splitBalances()
        external
        nonReentrant
        whenNotPaused
        returns (
            uint256 assetCreatorAmount,
            uint256 assetCommunityAmount,
            uint256 quoteCreatorAmount,
            uint256 quoteCommunityAmount
        )
    {
        if (!poolConfigured) revert PoolNotConfigured();
        return _splitAvailableBalances();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recovers unrelated tokens accidentally sent here. Neither CHEAP
    ///         nor canonical COST can be redirected away from the immutable split.
    function sweepUnsupportedToken(IERC20 token, address recipient) external onlyOwner {
        if (!poolConfigured) revert PoolNotConfigured();
        if (address(token) == address(quoteToken) || address(token) == address(assetToken)) {
            revert PoolTokenCannotBeSwept();
        }
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(recipient, amount);
        emit UnsupportedTokenSwept(address(token), recipient, amount);
    }

    function _split(IERC20 token, uint256 amount) private returns (uint256 creatorAmount, uint256 communityAmount) {
        creatorAmount = (amount * CREATOR_SHARE_BPS) / BASIS_POINTS;
        communityAmount = amount - creatorAmount;

        if (creatorAmount != 0) token.safeTransfer(creatorRecipient, creatorAmount);
        token.safeTransfer(communityTreasury, communityAmount);
        emit FeesSplit(address(token), amount, creatorAmount, communityAmount);
    }

    function _splitAvailableBalances()
        private
        returns (
            uint256 assetCreatorAmount,
            uint256 assetCommunityAmount,
            uint256 quoteCreatorAmount,
            uint256 quoteCommunityAmount
        )
    {
        uint256 assetAmount = assetToken.balanceOf(address(this));
        uint256 quoteAmount = quoteToken.balanceOf(address(this));
        if (assetAmount == 0 && quoteAmount == 0) revert NoRewardsAvailable();
        if (assetAmount != 0) {
            (assetCreatorAmount, assetCommunityAmount) = _split(assetToken, assetAmount);
        }
        if (quoteAmount != 0) {
            (quoteCreatorAmount, quoteCommunityAmount) = _split(quoteToken, quoteAmount);
        }
    }
}
