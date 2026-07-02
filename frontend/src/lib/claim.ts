'use client';

import {
  ContractCallBuilder,
  Args,
  CLValue,
  PublicKey,
} from 'casper-js-sdk';
import { CONTRACTS, NETWORK } from './config';

export function buildClaimTransaction(publicKeyHex: string, epochNumber: number) {
  return new ContractCallBuilder()
    .byPackageHash(CONTRACTS.yieldDistributor)
    .entryPoint('claim_yield')
    .runtimeArgs(
      Args.fromMap({ epoch_number: CLValue.newCLUint64(epochNumber) })
    )
    .from(PublicKey.fromHex(publicKeyHex))
    .chainName(NETWORK.name)

    .payment(10_000_000_000)
    .build();
}
