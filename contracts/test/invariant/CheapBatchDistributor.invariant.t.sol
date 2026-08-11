// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapBatchDistributor} from "../../src/CheapBatchDistributor.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract CheapBatchDistributorHandler is Test {
    MockERC20 public immutable rewardToken;
    CheapBatchDistributor public immutable distributor;

    address public immutable owner;
    address public immutable operator;
    address public immutable recipient;
    address public immutable withdrawalRecipient;

    uint256 public totalFunded;
    uint256 public totalPaid;
    uint256 public totalWithdrawn;
    uint256 public dropCounter;

    constructor(
        MockERC20 rewardToken_,
        CheapBatchDistributor distributor_,
        address owner_,
        address operator_,
        address recipient_,
        address withdrawalRecipient_
    ) {
        rewardToken = rewardToken_;
        distributor = distributor_;
        owner = owner_;
        operator = operator_;
        recipient = recipient_;
        withdrawalRecipient = withdrawalRecipient_;
    }

    function fund(uint96 rawAmount) external {
        uint256 amount = bound(uint256(rawAmount), 1, type(uint96).max);
        totalFunded += amount;
        rewardToken.mint(address(distributor), amount);
    }

    function createPayAndFinalize(uint96 rawAmount) external {
        uint256 available = distributor.availableRewards();
        if (available == 0) return;

        uint256 amount = _boundedAvailable(rawAmount, available);
        (bytes32 dropId, bytes32 allocationRoot) = _nextDrop();
        address[] memory recipients = _singleRecipient();
        uint256[] memory amounts = _singleAmount(amount);
        bytes32 batchesRoot = _batchLeaf(dropId, recipients, amounts);

        vm.prank(owner);
        distributor.createDrop(dropId, allocationRoot, batchesRoot, amount, 1);
        vm.prank(operator);
        distributor.distributeBatch(dropId, 0, recipients, amounts, new bytes32[](0));
        vm.prank(owner);
        distributor.finalizeDrop(dropId);

        totalPaid += amount;
    }

    function createAndCancel(uint96 rawAmount) external {
        uint256 available = distributor.availableRewards();
        if (available == 0) return;

        uint256 amount = _boundedAvailable(rawAmount, available);
        (bytes32 dropId, bytes32 allocationRoot) = _nextDrop();
        bytes32 batchesRoot = keccak256(abi.encode("cancelled", dropId));

        vm.startPrank(owner);
        distributor.createDrop(dropId, allocationRoot, batchesRoot, amount, 1);
        distributor.cancelUnstartedDrop(dropId);
        vm.stopPrank();
    }

    function withdrawAvailable(uint96 rawAmount) external {
        uint256 available = distributor.availableRewards();
        if (available == 0) return;

        uint256 amount = _boundedAvailable(rawAmount, available);
        vm.prank(owner);
        distributor.withdrawAvailable(withdrawalRecipient, amount);
        totalWithdrawn += amount;
    }

    function exercisePause() external {
        vm.startPrank(owner);
        distributor.pause();
        distributor.unpause();
        vm.stopPrank();
    }

    function _nextDrop() private returns (bytes32 dropId, bytes32 allocationRoot) {
        dropCounter += 1;
        dropId = keccak256(abi.encode("CHEAP_INVARIANT_DROP", dropCounter));
        allocationRoot = keccak256(abi.encode("CHEAP_INVARIANT_ALLOCATION", dropId));
    }

    function _boundedAvailable(uint96 rawAmount, uint256 available) private pure returns (uint256) {
        uint256 maximum = available > type(uint96).max ? type(uint96).max : available;
        return bound(uint256(rawAmount), 1, maximum);
    }

    function _singleRecipient() private view returns (address[] memory recipients) {
        recipients = new address[](1);
        recipients[0] = recipient;
    }

    function _singleAmount(uint256 amount) private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](1);
        amounts[0] = amount;
    }

    function _batchLeaf(bytes32 dropId, address[] memory recipients, uint256[] memory amounts)
        private
        pure
        returns (bytes32)
    {
        bytes32 batchHash = keccak256(abi.encode(dropId, uint256(0), recipients, amounts));
        return keccak256(bytes.concat(batchHash));
    }
}

contract CheapBatchDistributorInvariantTest is StdInvariant, Test {
    MockERC20 internal rewardToken;
    CheapBatchDistributor internal distributor;
    CheapBatchDistributorHandler internal handler;

    address internal owner = makeAddr("ownerSafe");
    address internal operator = makeAddr("dropOperator");
    address internal recipient = makeAddr("rewardRecipient");
    address internal withdrawalRecipient = makeAddr("withdrawalRecipient");

    function setUp() public {
        rewardToken = new MockERC20();
        distributor = new CheapBatchDistributor(IERC20(address(rewardToken)), operator, owner);
        handler =
            new CheapBatchDistributorHandler(rewardToken, distributor, owner, operator, recipient, withdrawalRecipient);

        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = handler.fund.selector;
        selectors[1] = handler.createPayAndFinalize.selector;
        selectors[2] = handler.createAndCancel.selector;
        selectors[3] = handler.withdrawAvailable.selector;
        selectors[4] = handler.exercisePause.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariantReservedRewardsNeverExceedBalance() public view {
        assertLe(distributor.reservedRewards(), rewardToken.balanceOf(address(distributor)));
    }

    function invariantAvailableAndReservedReconcileToBalance() public view {
        uint256 balance = rewardToken.balanceOf(address(distributor));
        assertEq(distributor.availableRewards() + distributor.reservedRewards(), balance);
    }

    function invariantEveryFundedUnitIsAccountedFor() public view {
        uint256 accounted = rewardToken.balanceOf(address(distributor)) + handler.totalPaid() + handler.totalWithdrawn();
        assertEq(accounted, handler.totalFunded());
        assertEq(rewardToken.balanceOf(recipient), handler.totalPaid());
        assertEq(rewardToken.balanceOf(withdrawalRecipient), handler.totalWithdrawn());
    }

    function invariantImmutableAuthoritiesAndAssetDoNotDrift() public view {
        assertEq(address(distributor.rewardToken()), address(rewardToken));
        assertEq(distributor.owner(), owner);
        assertEq(distributor.operator(), operator);
        assertFalse(distributor.paused());
    }
}
