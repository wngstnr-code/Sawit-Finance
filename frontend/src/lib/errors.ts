/**
 * Maps low-level wallet / RPC / contract error messages to short, friendly
 * copy shown in the dashboard UI.
 *
 * Contract `User error: N` code -> enum mapping (read from contracts/**):
 *
 *   yield-distributor/src/yield_distributor.rs :: DistError
 *     1  UnauthorizedAuthority
 *     2  UnauthorizedYieldRouter
 *     3  DistributorInactive
 *     4  EpochNotFound
 *     5  EpochNotFunded
 *     6  EpochAlreadySwept
 *     7  ClaimWindowExpired
 *     8  ClaimWindowNotExpired
 *     9  AlreadyClaimed
 *     10 NothingToClaim
 *     11 Overflow
 *     12 NotKycVerified          <- KYC gate hit on claim_yield
 *
 *   sawit-token/src/sawit_token.rs :: TokenError
 *     1  InsufficientBalance     <- KYC/CEP-18 side insufficient balance
 *     2  InsufficientAllowance
 *     3  UnauthorizedMinter
 *     4  UnauthorizedAuthority
 *     5  TransfersPaused
 *     6  ZeroAmount
 *
 *   production-vault/src/production_vault.rs :: VaultError
 *     1  UnauthorizedAuthority
 *     2  UnauthorizedOracleAgent
 *     3  LowValidationScore
 *     4  DuplicateEpoch
 *     5  VaultInactive
 *     6  InvalidEpochData
 *
 *   token-minter/src/token_minter.rs :: MinterError
 *     1  UnauthorizedAuthority
 *     2  MinterInactive
 *     3  EpochAlreadyMinted
 *     4  InvalidEpochData
 *     5  ZeroMintAmount
 *     6  ZeroAllocation
 *     7  InsufficientEpochTokens
 *     8  InvalidTokenRate
 *     9  InvalidGorrBps
 *     10 Overflow
 *
 * Only the yield-distributor / sawit-token codes are reachable from the
 * investor dashboard flows (claim, buy, KYC), so those are the ones mapped
 * by numeric `User error: N` code below.
 */

type ErrorRule = { pattern: RegExp; message: string };

const ERROR_RULES: ErrorRule[] = [
  {
    pattern: /reject|denied|cancel|closed|abort/i,
    message: 'Signature cancelled in wallet.',
  },
  {
    pattern: /AlreadyClaimed|User error: 9\b/i,
    message: 'Yield for this epoch was already claimed.',
  },
  {
    pattern: /NotKyc|KycRequired|NotKycVerified|unauthorized|User error: 12\b/i,
    message: 'Account is not KYC-verified yet.',
  },
  {
    pattern: /deadline|expired|ClaimWindowExpired|User error: 7\b/i,
    message: 'The claim window for this epoch has closed.',
  },
  {
    pattern: /insufficient|balance too low|out of gas|InsufficientBalance|User error: 1\b/i,
    message: 'Insufficient CSPR balance for this transaction.',
  },
  {
    pattern: /timeout|timed out/i,
    message: 'Network timeout — please try again.',
  },
  {
    pattern: /fetch|network|Failed to fetch/i,
    message: 'Network error — check your connection and try again.',
  },
  {
    pattern: /in_progress/i,
    message: 'A verification is already in progress for this account.',
  },
];

/** Turns a thrown error (or API error string) into short, friendly copy. */
export function humanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(raw)) return rule.message;
  }
  return raw.length > 96 ? `${raw.slice(0, 96)}…` : raw;
}
