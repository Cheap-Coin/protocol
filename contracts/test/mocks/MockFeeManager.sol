// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICreatorFeeManager} from "../../src/interfaces/ICreatorFeeManager.sol";

contract MockFeeManager is ICreatorFeeManager {
    using SafeERC20 for IERC20;

    IERC20 public immutable token0;
    IERC20 public immutable token1;
    uint256 public payout0;
    uint256 public payout1;

    constructor(IERC20 token0_, IERC20 token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setPayout(uint256 payout0_, uint256 payout1_) external {
        payout0 = payout0_;
        payout1 = payout1_;
    }

    function collectFees(bytes32) external {
        uint256 amount0 = payout0;
        uint256 amount1 = payout1;
        payout0 = 0;
        payout1 = 0;
        if (amount0 != 0) token0.safeTransfer(msg.sender, amount0);
        if (amount1 != 0) token1.safeTransfer(msg.sender, amount1);
    }
}
