# Canonical liquidity

CheapCoin supports only the Pump-created CHEAP/wrapped-SOL PumpSwap pool after
graduation. Users deposit both assets in the current reserve ratio, receive the
pool's LP token, earn the pool's LP trading-fee share, and may later withdraw.
There is no secondary application pool, embedded swap, or additional farming yield.

Before building an instruction, verify the signed manifest state is `PUMPSWAP`,
the pool/mint/LP/quote accounts match finalized state, the quote is wrapped SOL,
the observation is not older than the verification slot, and reserves/LP supply
are positive. Show reserves, LP balance, fee information, estimated ratio/output,
slippage minimums, source timestamp, and stale state.

Simulate the complete unsigned transaction against a recent blockhash. Any changed
account, expired blockhash, reserve drift beyond limits, or failed simulation
invalidates the artifact. The user still reviews and signs in their wallet.

LP ownership exposes the user to price divergence and impermanent loss. Fees and
withdrawal outputs vary; no return is guaranteed.
