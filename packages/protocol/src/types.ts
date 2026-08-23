export type SolanaAddress = string & { readonly __solanaAddress: unique symbol };
export type SolanaSignature = string & { readonly __solanaSignature: unique symbol };
export type Sha256Digest = string & { readonly __sha256Digest: unique symbol };
export type DecimalString = string & { readonly __decimalString: unique symbol };

export type LaunchLifecycle = "PRELAUNCH" | "BONDING_CURVE" | "PUMPSWAP";
export type SolanaCluster = "localnet" | "devnet" | "mainnet-beta";
export type FreshnessState = "live" | "stale" | "unavailable" | "preview";

export interface SourceStamp {
  provider: string;
  observedAt: string;
  slot: string | null;
  state: FreshnessState;
}

export interface LaunchManifest {
  schemaVersion: 1;
  launchId: string;
  lifecycle: { state: LaunchLifecycle; updatedAt: string };
  cluster: SolanaCluster;
  token: {
    name: "CheapCoin";
    symbol: "CHEAP";
    mint: SolanaAddress | null;
    tokenProgram: SolanaAddress | null;
    decimals: number | null;
  };
  pump: {
    programId: SolanaAddress;
    feesProgramId: SolanaAddress;
    ammProgramId: SolanaAddress;
    global: SolanaAddress | null;
    bondingCurve: SolanaAddress | null;
    sharingConfig: SolanaAddress | null;
    feeSharing: {
      ownerTreasuryVault: SolanaAddress;
      communityTreasuryVault: SolanaAddress;
      ownerShareBps: 7_500;
      communityShareBps: 2_500;
      finalizedSignature: SolanaSignature | null;
    };
  };
  canonicalPool: {
    address: SolanaAddress;
    lpMint: SolanaAddress;
    quoteMint: SolanaAddress;
    verifiedAtSlot: DecimalString;
    verificationSignature: SolanaSignature;
  } | null;
  governance: {
    squadsMultisig: SolanaAddress;
    ownerTreasuryVault: SolanaAddress;
    communityTreasuryVault: SolanaAddress;
    threshold: 2;
    signerCount: 3;
  };
  programs: {
    cheapLock: SolanaAddress | null;
    rewards: {
      programId: SolanaAddress;
      auditedCommit: string;
      deploymentSignature: SolanaSignature;
    } | null;
  };
  verification: { slot: DecimalString | null; blockhash: string | null };
  publication: {
    sourceRepository: "https://github.com/Cheap-Coin/protocol";
    sourceCommit: string;
    signedTag: string | null;
    manifestPath: string;
    artifactSha256: Sha256Digest | null;
  };
}

export interface RiskGate {
  code:
    | "MINT_AUTHORITY"
    | "FREEZE_AUTHORITY"
    | "TOKEN_PROGRAM"
    | "TOKEN_2022_EXTENSION"
    | "LOW_LIQUIDITY"
    | "HOLDER_CONCENTRATION"
    | "POOL_AGE"
    | "INCOMPLETE_DATA";
  severity: "blocked" | "warning";
  message: string;
}

export interface CheapScoreBreakdown {
  liquidityAndMarketQuality: number;
  holderDistributionAndSafety: number;
  priceAndRetracementContext: number;
  organicTradingMomentum: number;
  aggregateXActivity: number;
  total: number;
}

export interface TokenSummary {
  mint: SolanaAddress;
  name: string;
  symbol: string;
  unitPriceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  holderConcentrationPercent: number | null;
  mintAuthority: SolanaAddress | null;
  freezeAuthority: SolanaAddress | null;
  tokenProgram: SolanaAddress;
  riskGates: RiskGate[];
  score: CheapScoreBreakdown | null;
  socialHeat: number | null;
  sponsored: boolean;
  sponsorship: { startsAt: string; endsAt: string } | null;
  sources: SourceStamp[];
}

export type CommunityEventType =
  | "original_post"
  | "quote_post"
  | "reply"
  | "repost"
  | "official_like";

export interface CommunityActivity {
  eventId: string;
  type: CommunityEventType;
  occurredAt: string;
  qualifyingSignal: string | null;
  points: number;
  decision: "accepted" | "capped" | "duplicate" | "deleted" | "private" | "spam" | "unqualified";
  coverage: "complete" | "partial";
  lastIndexedAt: string;
}

export interface LeaderboardEntry {
  publicIdentity: string;
  wallet: SolanaAddress | null;
  optedIntoWalletDisclosure: boolean;
  points7d: number;
  points30d: number;
  pointsAllTime: number;
  coverage: "complete" | "partial";
  lastIndexedAt: string;
}

export type LockTier = "THIRTY_DAYS" | "NINETY_DAYS";
export type LockPositionState = "LOCKED" | "EXITED_EARLY" | "WITHDRAWN_MATURED";

export interface LockPosition {
  address: SolanaAddress;
  owner: SolanaAddress;
  mint: SolanaAddress;
  amount: DecimalString;
  depositId: DecimalString;
  startTime: string;
  endTime: string;
  tier: LockTier;
  state: LockPositionState;
  withdrawalSignature: SolanaSignature | null;
  finalizedCampaignReferences: Sha256Digest[];
}

export type CampaignStatus =
  | "DRAFT"
  | "APPROVED"
  | "FUNDED"
  | "ACTIVE"
  | "EXPIRED"
  | "RECONCILED";

export interface CampaignAsset {
  kind: "NATIVE_SOL" | "SPL_TOKEN";
  mint: SolanaAddress | null;
  tokenProgram: SolanaAddress | null;
  decimals: number;
}

export interface CampaignManifest {
  schemaVersion: 1;
  campaignId: string;
  asset: CampaignAsset;
  budget: DecimalString;
  rulesUri: string;
  rulesSha256: Sha256Digest;
  snapshotSlot: DecimalString;
  allocationSha256: Sha256Digest;
  recipients: {
    mode: "DIRECT_LIST" | "MERKLE_ROOT";
    count: number;
    root: Sha256Digest | null;
    listUri: string;
  };
  delivery: "SQUADS_BATCH" | "MERKLE_REWARDS";
  rewardsDeployment: {
    programId: SolanaAddress;
    auditedCommit: string;
    deploymentSignature: SolanaSignature;
  } | null;
  sourceTreasury: SolanaAddress;
  expiresAt: string;
  status: CampaignStatus;
  reconciliation: {
    preparedSignatures: SolanaSignature[];
    executedSignatures: SolanaSignature[];
    distributed: DecimalString;
    remaining: DecimalString;
    reconciledAt: string | null;
  };
}
