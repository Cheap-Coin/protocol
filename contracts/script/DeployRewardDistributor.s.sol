// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapBatchDistributor} from "../src/CheapBatchDistributor.sol";

/// @notice Deploys one isolated distributor for an additional, independently
///         verified Robinhood Chain RWA reward token.
/// @dev Confirm REWARD_TOKEN against Robinhood's live registry immediately
///      before broadcasting. Use an encrypted Foundry account or hardware wallet.
contract DeployRewardDistributor is Script {
    function run() external returns (CheapBatchDistributor distributor) {
        IERC20 rewardToken = IERC20(vm.envAddress("REWARD_TOKEN"));
        address operator = vm.envAddress("DISTRIBUTION_OPERATOR");
        address ownerSafe = vm.envAddress("PROTOCOL_OWNER_SAFE");

        vm.startBroadcast();
        distributor = new CheapBatchDistributor(rewardToken, operator, ownerSafe);
        vm.stopBroadcast();

        console2.log("Reward token", address(rewardToken));
        console2.log("CheapBatchDistributor", address(distributor));
        console2.log("Protocol owner Safe", ownerSafe);
    }
}
