'use client';

import {
  ContractCallBuilder,
  Args,
  CLValue,
  PublicKey,
} from 'casper-js-sdk';
import { CONTRACTS, NETWORK } from './config';

/**
 * Builds the `claim_yield(epoch_number)` contract-call transaction against the
 * YieldDistributor package. The connected wallet signs + sends it via CSPR.click
 * (`clickRef.send(tx.toJSON(), publicKey)`).
 *
 * The contract uses `self.env().caller()` as the holder and checks KYC via CPI to
 * the ProductionVault, so the deploy MUST originate from the holder's account and
 * the account must be KYC-registered with a claimable allocation, or the call
 * reverts on-chain.
 */
export function buildClaimTransaction(publicKeyHex: string, epochNumber: number) {
  return new ContractCallBuilder()
    .byPackageHash(CONTRACTS.yieldDistributor)
    .entryPoint('claim_yield')
    .runtimeArgs(
      Args.fromMap({ epoch_number: CLValue.newCLUint64(epochNumber) })
    )
    .from(PublicKey.fromHex(publicKeyHex))
    .chainName(NETWORK.name)
    // 10 CSPR gas budget — claim_yield does a CPI to the vault (KYC check),
    // a CSPR transfer, and an event emit, so it needs more than a trivial call.
    // (3 CSPR ran out of gas; the on-chain loop used 8 — 10 leaves margin.)
    .payment(10_000_000_000)
    .build();
}
