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

    function testPauseStopsClaims() public {
        vm.prank(owner);
        splitter.pause();
        vm.expectRevert();
        splitter.collectAndSplit();
    }
}
