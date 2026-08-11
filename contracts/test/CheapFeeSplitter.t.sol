// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapFeeSplitter} from "../src/CheapFeeSplitter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeManager} from "./mocks/MockFeeManager.sol";

contract CheapFeeSplitterTest is Test {
    MockERC20 internal rewardToken;
    MockFeeManager internal feeManager;
    CheapFeeSplitter internal splitter;

    address internal creator = makeAddr("creator");
    address internal holderTreasury = makeAddr("holderTreasury");
    address internal owner = makeAddr("ownerSafe");
    bytes32 internal poolId = keccak256("CHEAP-COST");

    function setUp() public {
        rewardToken = new MockERC20();
        feeManager = new MockFeeManager(IERC20(address(rewardToken)));
        splitter = new CheapFeeSplitter(IERC20(address(rewardToken)), creator, holderTreasury, owner);
        rewardToken.mint(address(feeManager), 10_000 ether);

        vm.prank(owner);
        splitter.configurePool(address(feeManager), poolId);
    }

    function testCollectAndSplitRoutesExactShares() public {
        feeManager.setPayout(1_001 ether);
        splitter.collectAndSplit();

        assertEq(rewardToken.balanceOf(creator), 250.25 ether);
        assertEq(rewardToken.balanceOf(holderTreasury), 750.75 ether);
        assertEq(rewardToken.balanceOf(address(splitter)), 0);
    }

    function testCollectionAlsoRoutesAnyPreviouslyTransferredBalance() public {
        rewardToken.mint(address(splitter), 99 ether);
        feeManager.setPayout(1 ether);

        splitter.collectAndSplit();

        assertEq(rewardToken.balanceOf(creator), 25 ether);
        assertEq(rewardToken.balanceOf(holderTreasury), 75 ether);
        assertEq(rewardToken.balanceOf(address(splitter)), 0);
    }

    function testSplitBalanceSupportsManualClaims() public {
        rewardToken.mint(address(splitter), 101);
        splitter.splitBalance();
        assertEq(rewardToken.balanceOf(creator), 25);
        assertEq(rewardToken.balanceOf(holderTreasury), 76);
    }

    function testFuzzSplitBalanceRoutesEveryUnit(uint128 amount) public {
        vm.assume(amount > 0);
        rewardToken.mint(address(splitter), amount);

        (uint256 creatorAmount, uint256 holderAmount) = splitter.splitBalance();
        uint256 expectedCreatorAmount = (uint256(amount) * splitter.CREATOR_SHARE_BPS()) / splitter.BASIS_POINTS();

        assertEq(creatorAmount, expectedCreatorAmount);
        assertEq(holderAmount, uint256(amount) - expectedCreatorAmount);
        assertEq(rewardToken.balanceOf(creator), creatorAmount);
        assertEq(rewardToken.balanceOf(holderTreasury), holderAmount);
        assertEq(rewardToken.balanceOf(address(splitter)), 0);
    }

    function testPoolCannotBeReconfigured() public {
        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.PoolAlreadyConfigured.selector);
        splitter.configurePool(address(feeManager), bytes32(uint256(2)));
    }

    function testOnlyOwnerCanConfigurePool() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.expectRevert();
        unconfigured.configurePool(address(feeManager), poolId);
    }

    function testConfigurePoolRejectsZeroPoolId() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.InvalidFeeManager.selector);
        unconfigured.configurePool(address(feeManager), bytes32(0));
    }

    function testConfigurePoolRejectsAddressWithoutCode() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.InvalidFeeManager.selector);
        unconfigured.configurePool(makeAddr("notAContract"), poolId);
    }

    function testCollectRequiresConfiguredPool() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.expectRevert(CheapFeeSplitter.PoolNotConfigured.selector);
        unconfigured.collectAndSplit();
    }

    function testCollectRevertsWhenNoCostIsAvailable() public {
        vm.expectRevert(CheapFeeSplitter.NoRewardsAvailable.selector);
        splitter.collectAndSplit();
    }

    function testSplitBalanceRevertsWhenNoCostIsAvailable() public {
        vm.expectRevert(CheapFeeSplitter.NoRewardsAvailable.selector);
        splitter.splitBalance();
    }

    function testUnsupportedTokenCanBeRecoveredWithoutMovingCost() public {
        MockERC20 unsupported = new MockERC20();
        unsupported.mint(address(splitter), 50 ether);
        rewardToken.mint(address(splitter), 100 ether);

        vm.prank(owner);
        splitter.sweepUnsupportedToken(IERC20(address(unsupported)), owner);

        assertEq(unsupported.balanceOf(owner), 50 ether);
        assertEq(rewardToken.balanceOf(address(splitter)), 100 ether);
    }

    function testCostCannotBeSwept() public {
        rewardToken.mint(address(splitter), 100 ether);

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.RewardTokenCannotBeSwept.selector);
        splitter.sweepUnsupportedToken(IERC20(address(rewardToken)), owner);
    }

    function testOnlyOwnerCanSweepUnsupportedToken() public {
        MockERC20 unsupported = new MockERC20();
        unsupported.mint(address(splitter), 50 ether);

        vm.expectRevert();
        splitter.sweepUnsupportedToken(IERC20(address(unsupported)), owner);
    }

    function testPauseStopsClaims() public {
        vm.prank(owner);
        splitter.pause();
        vm.expectRevert();
        splitter.collectAndSplit();
    }

    function testPauseStopsManualSplitAndUnpauseRestoresIt() public {
        rewardToken.mint(address(splitter), 100 ether);

        vm.prank(owner);
        splitter.pause();
        vm.expectRevert();
        splitter.splitBalance();

        vm.prank(owner);
        splitter.unpause();
        splitter.splitBalance();

        assertEq(rewardToken.balanceOf(creator), 25 ether);
        assertEq(rewardToken.balanceOf(holderTreasury), 75 ether);
    }

    function _newUnconfiguredSplitter() private returns (CheapFeeSplitter) {
        return new CheapFeeSplitter(IERC20(address(rewardToken)), creator, holderTreasury, owner);
    }
}
