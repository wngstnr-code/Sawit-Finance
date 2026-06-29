import { NETWORK } from './config';

export const txUrl = (hash: string) => `${NETWORK.explorer}/transaction/${hash}`;
export const pkgUrl = (hash: string) =>
  `${NETWORK.explorer}/contract-package/${hash}`;

// The full economic loop executed on Casper Testnet (see README).
export const LOOP_STEPS = [
  {
    n: 1,
    title: 'Record production',
    desc: 'AI oracle records a verified CPO epoch — 45,200 t @ $825, reputation 92/100.',
    entrypoint: 'record_production',
    tx: '4d83e1a4b9c12ee2f386e0e14fd325a14ae81abb9446508650a20471b54a7bdb',
  },
  {
    n: 2,
    title: 'Mint SAWIT',
    desc: 'TokenMinter reads the vault (CPI) and mints 2,260,000 SAWIT via the token (CPI).',
    entrypoint: 'mint_epoch',
    tx: 'b257a68867b5253b1d5f05c6e362759091f91ec223cd650b6f555335351afb93',
  },
  {
    n: 3,
    title: 'Fund yield',
    desc: 'A distribution epoch is created and funded with 100 CSPR (payable) — a 90-day claim window opens.',
    entrypoint: 'fund_epoch',
    tx: '6fb1893145d969bad32e0f6ba26810a81f532be5b5b288af3977a142e489772f',
  },
  {
    n: 4,
    title: 'Claim CSPR',
    desc: 'A KYC-verified holder claims yield — CSPR transferred, gated by a CPI to the vault.',
    entrypoint: 'claim_yield',
    tx: '23e6e9d7d665a3a94e58170ee2c70434cf6dc71f8c18a2998f97f8497f80f8f6',
  },
] as const;
