// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ICreatorFeeManager {
    /// @dev The deployed manager may return accounting metadata. CHEAP ignores
    ///      returndata and treats the canonical token balance as authoritative.
    function collectFees(bytes32 poolId) external;
}
