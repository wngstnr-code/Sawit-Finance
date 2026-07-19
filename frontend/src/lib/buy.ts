'use client';

import { NativeTransferBuilder, PublicKey } from 'casper-js-sdk';
import { NETWORK, TREASURY, SALE } from './config';

export function buildBuyTransferTransaction(publicKeyHex: string, csprAmount: number) {
  const motes = BigInt(Math.floor(csprAmount)) * BigInt(1_000_000_000);
  return new NativeTransferBuilder()
    .target(PublicKey.fromHex(TREASURY.publicKey))
    .amount(motes.toString())
    .id(SALE.buyMemoId)
    .from(PublicKey.fromHex(publicKeyHex))
    .chainName(NETWORK.name)
    .payment(100_000_000)
    .build();
}
