// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICreatorFeeManager} from "../../src/interfaces/ICreatorFeeManager.sol";

contract MockFeeManager is ICreatorFeeManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    uint256 public payout;

    constructor(IERC20 rewardToken_) {
        rewardToken = rewardToken_;
    }

    function setPayout(uint256 payout_) external {
        payout = payout_;
    }

    function collectFees(bytes32) external {
        uint256 amount = payout;
        payout = 0;
        rewardToken.safeTransfer(msg.sender, amount);
    }
}
