// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CheapFeeSplitter} from "../src/CheapFeeSplitter.sol";
import {CheapBatchDistributor} from "../src/CheapBatchDistributor.sol";

/// @notice Deploys the non-upgradeable CHEAP protocol contracts with Safe
///         ownership from environment-supplied, human-verified addresses.
/// @dev Use Foundry's encrypted keystore/account support for broadcasting. This
///      script deliberately does not read a raw private key environment value.
contract DeployProtocol is Script {
    function run() external returns (CheapFeeSplitter splitter, CheapBatchDistributor distributor) {
        IERC20 cost = IERC20(vm.envAddress("COST_ADDRESS"));
        address creatorRecipient = vm.envAddress("CREATOR_RECIPIENT");
        address holderTreasury = vm.envAddress("HOLDER_TREASURY_SAFE");
        address operator = vm.envAddress("DISTRIBUTION_OPERATOR");
        address ownerSafe = vm.envAddress("PROTOCOL_OWNER_SAFE");

        vm.startBroadcast();
        splitter = new CheapFeeSplitter(cost, creatorRecipient, holderTreasury, ownerSafe);
        distributor = new CheapBatchDistributor(cost, operator, ownerSafe);
        vm.stopBroadcast();

        console2.log("CheapFeeSplitter", address(splitter));
        console2.log("CheapBatchDistributor", address(distributor));
        console2.log("Protocol owner Safe", ownerSafe);
    }
}
