// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapBatchDistributor} from "../src/CheapBatchDistributor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract CheapBatchDistributorTest is Test {
    MockERC20 internal rewardToken;
    CheapBatchDistributor internal distributor;

    address internal owner = makeAddr("ownerSafe");
    address internal operator = makeAddr("dropOperator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal dropId = keccak256("CHEAP_DROP_1");
    bytes32 internal root = keccak256("allocation.json");

    function setUp() public {
        rewardToken = new MockERC20();
        distributor = new CheapBatchDistributor(IERC20(address(rewardToken)), operator, owner);
        rewardToken.mint(address(distributor), 1_000 ether);
    }

    function testCreatesPaysAndFinalizesDrop() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;
        bytes32 batchesRoot = _batchLeaf(0, recipients, amounts);

        vm.prank(owner);
        distributor.createDrop(dropId, root, batchesRoot, 300 ether, 1);

        vm.prank(operator);
        distributor.distributeBatch(dropId, 0, recipients, amounts, _emptyProof());

        vm.prank(owner);
        distributor.finalizeDrop(dropId);

        assertEq(rewardToken.balanceOf(alice), 100 ether);
        assertEq(rewardToken.balanceOf(bob), 200 ether);
        assertEq(distributor.reservedRewards(), 0);
        CheapBatchDistributor.Drop memory drop = distributor.getDrop(dropId);
        assertTrue(drop.finalized);
        assertFalse(drop.cancelled);
    }

    function testFuzzSingleBatchPaysExactFundedAmount(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 1_000 ether);
        (address[] memory recipients, uint256[] memory amounts) = _single(alice, amount);

        vm.prank(owner);
        distributor.createDrop(dropId, root, _batchLeaf(0, recipients, amounts), amount, 1);

        vm.prank(operator);
        distributor.distributeBatch(dropId, 0, recipients, amounts, _emptyProof());

        assertEq(rewardToken.balanceOf(alice), amount);
        assertEq(distributor.reservedRewards(), 0);
        assertEq(distributor.availableRewards(), 1_000 ether - amount);
    }

    function testCannotReplayBatch() public {
        (address[] memory recipients, uint256[] memory amounts) = _single(alice, 100 ether);
        bytes32 batchesRoot = _batchLeaf(0, recipients, amounts);
        vm.prank(owner);
        distributor.createDrop(dropId, root, batchesRoot, 100 ether, 1);

        vm.startPrank(operator);
        distributor.distributeBatch(dropId, 0, recipients, amounts, _emptyProof());
        vm.expectRevert(CheapBatchDistributor.BatchAlreadyProcessed.selector);
        distributor.distributeBatch(dropId, 0, recipients, amounts, _emptyProof());
        vm.stopPrank();
    }

    function testCannotPayRecipientTwiceAcrossBatches() public {
        (address[] memory recipients, uint256[] memory amounts) = _single(alice, 100 ether);
        bytes32 leaf0 = _batchLeaf(0, recipients, amounts);
        bytes32 leaf1 = _batchLeaf(1, recipients, amounts);
        bytes32 batchesRoot = _hashPair(leaf0, leaf1);

        bytes32[] memory proof0 = new bytes32[](1);
        proof0[0] = leaf1;
        bytes32[] memory proof1 = new bytes32[](1);
        proof1[0] = leaf0;

        vm.prank(owner);
        distributor.createDrop(dropId, root, batchesRoot, 200 ether, 2);

        vm.startPrank(operator);
        distributor.distributeBatch(dropId, 0, recipients, amounts, proof0);
        vm.expectRevert(abi.encodeWithSelector(CheapBatchDistributor.DuplicateRecipient.selector, alice));
        distributor.distributeBatch(dropId, 1, recipients, amounts, proof1);
        vm.stopPrank();
    }

    function testOperatorCannotChangeSafeApprovedBatch() public {
        (address[] memory approvedRecipients, uint256[] memory approvedAmounts) = _single(alice, 100 ether);
        vm.prank(owner);
        distributor.createDrop(dropId, root, _batchLeaf(0, approvedRecipients, approvedAmounts), 100 ether, 1);

        (address[] memory changedRecipients, uint256[] memory changedAmounts) = _single(bob, 100 ether);
        vm.prank(operator);
        vm.expectRevert(CheapBatchDistributor.InvalidBatchProof.selector);
        distributor.distributeBatch(dropId, 0, changedRecipients, changedAmounts, _emptyProof());
    }

    function testReservedRewardsCannotBeWithdrawn() public {
        vm.prank(owner);
        distributor.createDrop(dropId, root, root, 900 ether, 1);
        assertEq(distributor.availableRewards(), 100 ether);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(CheapBatchDistributor.InsufficientUnreservedRewards.selector, 100 ether, 101 ether)
        );
        distributor.withdrawAvailable(owner, 101 ether);
    }

    function testOnlyOperatorCanDistribute() public {
        (address[] memory recipients, uint256[] memory amounts) = _single(alice, 100 ether);
        vm.prank(owner);
        distributor.createDrop(dropId, root, _batchLeaf(0, recipients, amounts), 100 ether, 1);

        vm.expectRevert(CheapBatchDistributor.UnauthorizedOperator.selector);
        distributor.distributeBatch(dropId, 0, recipients, amounts, _emptyProof());
    }

    function testCannotFinalizeIncompleteDrop() public {
        vm.prank(owner);
        distributor.createDrop(dropId, root, root, 100 ether, 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CheapBatchDistributor.DropIncomplete.selector, 100 ether, uint32(1)));
        distributor.finalizeDrop(dropId);
    }

    function testUnstartedCancellationCannotReuseDropId() public {
        vm.startPrank(owner);
        distributor.createDrop(dropId, root, root, 100 ether, 1);
        distributor.cancelUnstartedDrop(dropId);
        vm.expectRevert(CheapBatchDistributor.DropAlreadyExists.selector);
        distributor.createDrop(dropId, root, root, 100 ether, 1);
        vm.stopPrank();

        CheapBatchDistributor.Drop memory drop = distributor.getDrop(dropId);
        assertTrue(drop.cancelled);
        assertEq(distributor.reservedRewards(), 0);
    }

    function testPartialDropHasDelayedPausedRemediationPath() public {
        (address[] memory recipients0, uint256[] memory amounts0) = _single(alice, 100 ether);
        (address[] memory recipients1, uint256[] memory amounts1) = _single(bob, 100 ether);
        bytes32 leaf0 = _batchLeaf(0, recipients0, amounts0);
        bytes32 leaf1 = _batchLeaf(1, recipients1, amounts1);
        bytes32 batchesRoot = _hashPair(leaf0, leaf1);
        bytes32[] memory proof0 = new bytes32[](1);
        proof0[0] = leaf1;

        vm.prank(owner);
        distributor.createDrop(dropId, root, batchesRoot, 200 ether, 2);
        vm.prank(operator);
        distributor.distributeBatch(dropId, 0, recipients0, amounts0, proof0);

        vm.startPrank(owner);
        distributor.pause();
        CheapBatchDistributor.Drop memory activeDrop = distributor.getDrop(dropId);
        vm.expectRevert(
            abi.encodeWithSelector(
                CheapBatchDistributor.RemediationDelayActive.selector,
                uint256(activeDrop.lastActivityAt) + distributor.REMEDIATION_DELAY()
            )
        );
        distributor.closeForRemediation(dropId);
        vm.warp(block.timestamp + distributor.REMEDIATION_DELAY());
        distributor.closeForRemediation(dropId);
        vm.stopPrank();

        CheapBatchDistributor.Drop memory drop = distributor.getDrop(dropId);
        assertTrue(drop.cancelled);
        assertFalse(drop.finalized);
        assertEq(drop.remainingAmount, 0);
        assertEq(distributor.reservedRewards(), 0);
        assertEq(rewardToken.balanceOf(alice), 100 ether);
        assertEq(rewardToken.balanceOf(bob), 0);
    }

    function _single(address recipient, uint256 amount)
        private
        pure
        returns (address[] memory recipients, uint256[] memory amounts)
    {
        recipients = new address[](1);
        recipients[0] = recipient;
        amounts = new uint256[](1);
        amounts[0] = amount;
    }

    function _batchLeaf(uint256 batchIndex, address[] memory recipients, uint256[] memory amounts)
        private
        view
        returns (bytes32)
    {
        bytes32 batchHash = keccak256(abi.encode(dropId, batchIndex, recipients, amounts));
        return keccak256(bytes.concat(batchHash));
    }

    function _hashPair(bytes32 left, bytes32 right) private pure returns (bytes32) {
        return left < right ? keccak256(bytes.concat(left, right)) : keccak256(bytes.concat(right, left));
    }

    function _emptyProof() private pure returns (bytes32[] memory proof) {
        proof = new bytes32[](0);
    }
}
