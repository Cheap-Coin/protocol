// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CheapFeeSplitter} from "../src/CheapFeeSplitter.sol";

/// @notice Prints the exact one-time configurePool calldata for independent
///         review and submission through the protocol-owner Safe.
contract BuildConfigurePoolCalldata is Script {
    function run() external view returns (bytes memory data) {
        address feeManager = vm.envAddress("DOPPLER_FEE_MANAGER");
        bytes32 poolId = vm.envBytes32("DOPPLER_POOL_ID");
        data = abi.encodeCall(CheapFeeSplitter.configurePool, (feeManager, poolId));
        console2.log("Fee manager", feeManager);
        console2.logBytes32(poolId);
        console2.logBytes(data);
    }
}
