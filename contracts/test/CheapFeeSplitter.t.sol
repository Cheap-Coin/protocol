// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapFeeSplitter} from "../src/CheapFeeSplitter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeManager} from "./mocks/MockFeeManager.sol";

contract CheapFeeSplitterTest is Test {
    MockERC20 internal cheap;
    MockERC20 internal cost;
    MockFeeManager internal feeManager;
    CheapFeeSplitter internal splitter;

    address internal creator = makeAddr("creator");
    address internal communityTreasury = makeAddr("communityTreasury");
    address internal owner = makeAddr("ownerSafe");
    bytes32 internal poolId = keccak256("CHEAP-COST");

    function setUp() public {
        cheap = new MockERC20();
        cost = new MockERC20();
        feeManager = new MockFeeManager(IERC20(address(cheap)), IERC20(address(cost)));
        splitter = new CheapFeeSplitter(IERC20(address(cost)), creator, communityTreasury, owner);
        cheap.mint(address(feeManager), 10_000 ether);
        cost.mint(address(feeManager), 10_000 ether);

        vm.prank(owner);
        splitter.configurePool(address(feeManager), poolId, IERC20(address(cheap)));
    }

    function testCollectAndSplitRoutesBothPoolAssets() public {
        feeManager.setPayout(1_001 ether, 2_002 ether);
        splitter.collectAndSplit();

        assertEq(cheap.balanceOf(creator), 250.25 ether);
        assertEq(cheap.balanceOf(communityTreasury), 750.75 ether);
        assertEq(cost.balanceOf(creator), 500.5 ether);
        assertEq(cost.balanceOf(communityTreasury), 1_501.5 ether);
        assertEq(cheap.balanceOf(address(splitter)), 0);
        assertEq(cost.balanceOf(address(splitter)), 0);
    }

    function testCollectionRoutesExistingAndNewBalances() public {
        cheap.mint(address(splitter), 99 ether);
        cost.mint(address(splitter), 199 ether);
        feeManager.setPayout(1 ether, 1 ether);

        splitter.collectAndSplit();

        assertEq(cheap.balanceOf(creator), 25 ether);
        assertEq(cheap.balanceOf(communityTreasury), 75 ether);
        assertEq(cost.balanceOf(creator), 50 ether);
        assertEq(cost.balanceOf(communityTreasury), 150 ether);
    }

    function testSplitBalancesSupportsManualClaimsOfEitherAsset() public {
        cheap.mint(address(splitter), 101);
        splitter.splitBalances();
        assertEq(cheap.balanceOf(creator), 25);
        assertEq(cheap.balanceOf(communityTreasury), 76);

        cost.mint(address(splitter), 101);
        splitter.splitBalances();
        assertEq(cost.balanceOf(creator), 25);
        assertEq(cost.balanceOf(communityTreasury), 76);
    }

    function testFuzzSplitBalancesRouteEveryUnit(uint128 cheapAmount, uint128 costAmount) public {
        vm.assume(cheapAmount > 0 || costAmount > 0);
        cheap.mint(address(splitter), cheapAmount);
        cost.mint(address(splitter), costAmount);

        (uint256 cheapCreator, uint256 cheapCommunity, uint256 costCreator, uint256 costCommunity) =
            splitter.splitBalances();

        assertEq(cheapCreator + cheapCommunity, uint256(cheapAmount));
        assertEq(costCreator + costCommunity, uint256(costAmount));
        assertEq(cheapCreator, (uint256(cheapAmount) * splitter.CREATOR_SHARE_BPS()) / splitter.BASIS_POINTS());
        assertEq(costCreator, (uint256(costAmount) * splitter.CREATOR_SHARE_BPS()) / splitter.BASIS_POINTS());
        assertEq(cheap.balanceOf(creator), cheapCreator);
        assertEq(cheap.balanceOf(communityTreasury), cheapCommunity);
        assertEq(cost.balanceOf(creator), costCreator);
        assertEq(cost.balanceOf(communityTreasury), costCommunity);
    }

    function testPoolCannotBeReconfigured() public {
        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.PoolAlreadyConfigured.selector);
        splitter.configurePool(address(feeManager), bytes32(uint256(2)), IERC20(address(cheap)));
    }

    function testOnlyOwnerCanConfigurePool() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.expectRevert();
        unconfigured.configurePool(address(feeManager), poolId, IERC20(address(cheap)));
    }

    function testConfigurePoolRejectsZeroPoolId() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.InvalidFeeManager.selector);
        unconfigured.configurePool(address(feeManager), bytes32(0), IERC20(address(cheap)));
    }

    function testConfigurePoolRejectsAddressWithoutCode() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.InvalidFeeManager.selector);
        unconfigured.configurePool(makeAddr("notAContract"), poolId, IERC20(address(cheap)));
    }

    function testConfigurePoolRejectsInvalidAssetToken() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.InvalidAssetToken.selector);
        unconfigured.configurePool(address(feeManager), poolId, IERC20(address(cost)));
    }

    function testCollectAndManualSplitRequireConfiguration() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();

        vm.expectRevert(CheapFeeSplitter.PoolNotConfigured.selector);
        unconfigured.collectAndSplit();
        vm.expectRevert(CheapFeeSplitter.PoolNotConfigured.selector);
        unconfigured.splitBalances();
    }

    function testCollectRevertsWhenNoFeesAreAvailable() public {
        vm.expectRevert(CheapFeeSplitter.NoRewardsAvailable.selector);
        splitter.collectAndSplit();
    }

    function testUnsupportedTokenCanBeRecoveredWithoutMovingPoolAssets() public {
        MockERC20 unsupported = new MockERC20();
        unsupported.mint(address(splitter), 50 ether);
        cheap.mint(address(splitter), 100 ether);
        cost.mint(address(splitter), 100 ether);

        vm.prank(owner);
        splitter.sweepUnsupportedToken(IERC20(address(unsupported)), owner);

        assertEq(unsupported.balanceOf(owner), 50 ether);
        assertEq(cheap.balanceOf(address(splitter)), 100 ether);
        assertEq(cost.balanceOf(address(splitter)), 100 ether);
    }

    function testNeitherPoolTokenCanBeSwept() public {
        vm.startPrank(owner);
        vm.expectRevert(CheapFeeSplitter.PoolTokenCannotBeSwept.selector);
        splitter.sweepUnsupportedToken(IERC20(address(cheap)), owner);
        vm.expectRevert(CheapFeeSplitter.PoolTokenCannotBeSwept.selector);
        splitter.sweepUnsupportedToken(IERC20(address(cost)), owner);
        vm.stopPrank();
    }

    function testSweepRequiresConfiguration() public {
        CheapFeeSplitter unconfigured = _newUnconfiguredSplitter();
        MockERC20 unsupported = new MockERC20();

        vm.prank(owner);
        vm.expectRevert(CheapFeeSplitter.PoolNotConfigured.selector);
        unconfigured.sweepUnsupportedToken(IERC20(address(unsupported)), owner);
    }

    function testOnlyOwnerCanSweepUnsupportedToken() public {
        MockERC20 unsupported = new MockERC20();
        unsupported.mint(address(splitter), 50 ether);

        vm.expectRevert();
        splitter.sweepUnsupportedToken(IERC20(address(unsupported)), owner);
    }

    function testPauseStopsCollectionAndManualSplit() public {
        cheap.mint(address(splitter), 100 ether);
        vm.prank(owner);
        splitter.pause();

        vm.expectRevert();
        splitter.collectAndSplit();
        vm.expectRevert();
        splitter.splitBalances();

        vm.prank(owner);
        splitter.unpause();
        splitter.splitBalances();
        assertEq(cheap.balanceOf(communityTreasury), 75 ether);
    }

    function _newUnconfiguredSplitter() private returns (CheapFeeSplitter) {
        return new CheapFeeSplitter(IERC20(address(cost)), creator, communityTreasury, owner);
    }
}
