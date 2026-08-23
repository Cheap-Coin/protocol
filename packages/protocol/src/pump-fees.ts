import { address, getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import {
  LEGACY_SPL_TOKEN_PROGRAM,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  solanaAddress,
  WRAPPED_SOL_MINT,
} from "./solana.js";
import type { SolanaAddress } from "./types.js";

export interface PumpProgramAddresses {
  pumpProgramId: SolanaAddress;
  pumpFeesProgramId: SolanaAddress;
  pumpAmmProgramId: SolanaAddress;
}

export interface PumpFeeShareInput extends PumpProgramAddresses {
  mint: SolanaAddress;
  ownerTreasuryVault: SolanaAddress;
  communityTreasuryVault: SolanaAddress;
}

export interface DerivedPumpFeeAccounts {
  pumpGlobal: SolanaAddress;
  bondingCurve: SolanaAddress;
  sharingConfig: SolanaAddress;
  pumpCreatorVault: SolanaAddress;
  pumpEventAuthority: SolanaAddress;
  pumpFeesEventAuthority: SolanaAddress;
  pumpAmmEventAuthority: SolanaAddress;
  ammCreatorVaultAuthority: SolanaAddress;
}

export interface PumpFeeShareRehearsal {
  intentVersion: 1;
  mint: SolanaAddress;
  quoteMint: SolanaAddress;
  quoteTokenProgram: SolanaAddress;
  accounts: DerivedPumpFeeAccounts;
  currentShareholders: SolanaAddress[];
  newShareholders: [
    { address: SolanaAddress; shareBps: 7_500 },
    { address: SolanaAddress; shareBps: 2_500 },
  ];
  sdkCalls: [
    { method: "createFeeSharingConfig"; mint: SolanaAddress; pool: SolanaAddress | null },
    {
      method: "updateFeeSharesV2";
      mint: SolanaAddress;
      quoteMint: SolanaAddress;
      quoteTokenProgram: SolanaAddress;
      currentShareholders: SolanaAddress[];
      newShareholders: PumpFeeShareRehearsal["newShareholders"];
    },
  ];
  irreversibleAfterUpdate: true;
}

const utf8 = new TextEncoder();
const addressEncoder = getAddressEncoder();

async function derive(programAddress: SolanaAddress, seeds: Uint8Array[]): Promise<SolanaAddress> {
  const [derivedAddress] = await getProgramDerivedAddress({
    programAddress: address(programAddress) as Address,
    seeds,
  });
  return solanaAddress(derivedAddress);
}

function pinnedPumpPrograms(input: PumpProgramAddresses): PumpProgramAddresses {
  const programs = {
    pumpProgramId: solanaAddress(input.pumpProgramId, "pumpProgramId"),
    pumpFeesProgramId: solanaAddress(input.pumpFeesProgramId, "pumpFeesProgramId"),
    pumpAmmProgramId: solanaAddress(input.pumpAmmProgramId, "pumpAmmProgramId"),
  };
  if (
    programs.pumpProgramId !== PUMP_PROGRAM_ID
    || programs.pumpFeesProgramId !== PUMP_FEES_PROGRAM_ID
    || programs.pumpAmmProgramId !== PUMP_AMM_PROGRAM_ID
  ) {
    throw new TypeError("Pump program IDs do not match the pinned public deployments");
  }
  return programs;
}

export async function derivePumpFeeAccounts(input: Pick<PumpFeeShareInput, "mint"> & PumpProgramAddresses): Promise<DerivedPumpFeeAccounts> {
  const programs = pinnedPumpPrograms(input);
  const mint = solanaAddress(input.mint, "mint");
  const mintBytes = new Uint8Array(addressEncoder.encode(address(mint)));
  const sharingConfig = await derive(programs.pumpFeesProgramId, [utf8.encode("sharing-config"), mintBytes]);
  const sharingConfigBytes = new Uint8Array(addressEncoder.encode(address(sharingConfig)));
  const [pumpGlobal, bondingCurve, pumpCreatorVault, pumpEventAuthority, pumpFeesEventAuthority, pumpAmmEventAuthority, ammCreatorVaultAuthority] = await Promise.all([
    derive(programs.pumpProgramId, [utf8.encode("global")]),
    derive(programs.pumpProgramId, [utf8.encode("bonding-curve"), mintBytes]),
    derive(programs.pumpProgramId, [utf8.encode("creator-vault"), sharingConfigBytes]),
    derive(programs.pumpProgramId, [utf8.encode("__event_authority")]),
    derive(programs.pumpFeesProgramId, [utf8.encode("__event_authority")]),
    derive(programs.pumpAmmProgramId, [utf8.encode("__event_authority")]),
    derive(programs.pumpAmmProgramId, [utf8.encode("creator_vault"), sharingConfigBytes]),
  ]);
  return {
    pumpGlobal,
    bondingCurve,
    sharingConfig,
    pumpCreatorVault,
    pumpEventAuthority,
    pumpFeesEventAuthority,
    pumpAmmEventAuthority,
    ammCreatorVaultAuthority,
  };
}

export async function buildPumpFeeShareRehearsal(
  input: PumpFeeShareInput & { quoteMint: SolanaAddress; currentCreator: SolanaAddress; canonicalPool: SolanaAddress | null },
): Promise<PumpFeeShareRehearsal> {
  const mint = solanaAddress(input.mint, "mint");
  const ownerTreasuryVault = solanaAddress(input.ownerTreasuryVault, "ownerTreasuryVault");
  const communityTreasuryVault = solanaAddress(input.communityTreasuryVault, "communityTreasuryVault");
  if (ownerTreasuryVault === communityTreasuryVault) throw new TypeError("Fee-share recipients must be distinct");
  const quoteMint = solanaAddress(input.quoteMint, "quoteMint");
  if (quoteMint !== WRAPPED_SOL_MINT) throw new TypeError("Pump CHEAP fee sharing must use wrapped SOL as the quote mint");
  const currentCreator = solanaAddress(input.currentCreator, "currentCreator");
  const canonicalPool = input.canonicalPool === null ? null : solanaAddress(input.canonicalPool, "canonicalPool");
  const programs = pinnedPumpPrograms(input);
  const accounts = await derivePumpFeeAccounts({ mint, ...programs });
  const newShareholders = [
    { address: ownerTreasuryVault, shareBps: 7_500 as const },
    { address: communityTreasuryVault, shareBps: 2_500 as const },
  ] as PumpFeeShareRehearsal["newShareholders"];
  return {
    intentVersion: 1,
    mint,
    quoteMint,
    quoteTokenProgram: LEGACY_SPL_TOKEN_PROGRAM,
    accounts,
    currentShareholders: [currentCreator],
    newShareholders,
    sdkCalls: [
      { method: "createFeeSharingConfig", mint, pool: canonicalPool },
      { method: "updateFeeSharesV2", mint, quoteMint, quoteTokenProgram: LEGACY_SPL_TOKEN_PROGRAM, currentShareholders: [currentCreator], newShareholders },
    ],
    irreversibleAfterUpdate: true,
  };
}

export function assertPumpFeeShareReconciliation(
  expected: PumpFeeShareRehearsal,
  actual: { adminRevoked: boolean; shareholders: Array<{ address: string; shareBps: number }> },
): void {
  if (!actual.adminRevoked) throw new TypeError("Pump fee-sharing admin is not revoked");
  if (actual.shareholders.length !== 2) throw new TypeError("Pump fee sharing must contain exactly two recipients");
  expected.newShareholders.forEach((shareholder, index) => {
    const observed = actual.shareholders[index];
    if (!observed || solanaAddress(observed.address) !== shareholder.address || observed.shareBps !== shareholder.shareBps) {
      throw new TypeError(`Pump fee shareholder ${index} does not match the rehearsed 75/25 configuration`);
    }
  });
}
