//! Full-pipeline integration test for Sawit Finance.
//!
//! Deploys all four contracts, wires their cross-contract permissions, and
//! drives the complete real-world flow in one test:
//!
//!   1. Oracle records verified CPO production       (ProductionVault)
//!   2. Minter mints SAWIT to the holder via CPI     (TokenMinter → SawitToken)
//!   3. Operator registers the holder for KYC        (ProductionVault)
//!   4. Router opens + funds a CSPR yield epoch       (YieldDistributor)
//!   5. KYC'd holder claims CSPR yield, gated by the  (YieldDistributor → ProductionVault)
//!      compliance check that reads ProductionVault
//!
//! Both cross-contract calls (mint, KYC check) are exercised for real.

use odra::casper_types::{U256, U512};
use odra::host::{Deployer, HostEnv, HostRef};
use odra::prelude::Addressable;

use production_vault::production_vault::{
    SawitProductionVault, SawitProductionVaultHostRef, SawitProductionVaultInitArgs,
};
use sawit_token::sawit_token::{SawitToken, SawitTokenHostRef, SawitTokenInitArgs};
use token_minter::token_minter::{SawitMinter, SawitMinterHostRef, SawitMinterInitArgs};
use yield_distributor::yield_distributor::{
    SawitYieldDistributor, SawitYieldDistributorHostRef, SawitYieldDistributorInitArgs,
};

struct System {
    vault: SawitProductionVaultHostRef,
    token: SawitTokenHostRef,
    minter: SawitMinterHostRef,
    dist: SawitYieldDistributorHostRef,
}

/// Deploy and wire the full Sawit Finance contract system.
fn deploy_system(env: &HostEnv) -> System {
    let oracle = env.get_account(1);

    // 1. ProductionVault — CPO data + KYC registry, oracle whitelisted
    let vault = SawitProductionVault::deploy(
        env,
        SawitProductionVaultInitArgs { oracle_agent: oracle },
    );

    // 2. SawitToken — minter set to deployer for now, rewired below
    let mut token = SawitToken::deploy(
        env,
        SawitTokenInitArgs { minter: env.get_account(0) },
    );

    // 3. TokenMinter — points at token + vault
    let minter = SawitMinter::deploy(
        env,
        SawitMinterInitArgs {
            sawit_token: token.address(),
            production_vault: vault.address(),
            token_rate: 1_000u64,
            gorr_bps: 500u32,
        },
    );

    // Rewire: only the TokenMinter contract may mint SAWIT
    token.set_minter(minter.address());

    // 4. YieldDistributor — reads KYC from the vault on every claim
    let dist = SawitYieldDistributor::deploy(
        env,
        SawitYieldDistributorInitArgs {
            yield_router: env.get_account(1),
            production_vault: vault.address(),
        },
    );

    System { vault, token, minter, dist }
}

#[test]
fn full_pipeline_production_to_yield_claim() {
    let env = odra_test::env();
    let mut sys = deploy_system(&env);

    let oracle = env.get_account(1);
    let holder = env.get_account(2);

    // ── 1. Oracle records a verified production epoch ──
    env.set_caller(oracle);
    sys.vault.record_production(
        "Jun-26".to_string(),
        45_000,          // tons CPO
        37_125_000_00,   // revenue (cents)
        1_500,           // daily output ton
        22,              // OER %
        82_500,          // CPO price cents/ton
        12,              // estates
        8,               // mills
        88,              // validation score
        "GAPKI+KPBN+MPOB".to_string(),
        1_751_000_000_000u64,
    );
    assert_eq!(sys.vault.get_epoch_count(), 1);
    // Oracle reputation now reflects the single 88-score submission
    assert_eq!(sys.vault.get_oracle_reputation(), 88);

    // ── 2. Minter reads the verified epoch from the vault (CPI) and mints (CPI) ──
    env.set_caller(env.get_account(0)); // authority
    assert_eq!(sys.token.balance_of(&holder), U256::zero());
    // Caller only picks the epoch + destination; tons_cpo comes from ProductionVault
    sys.minter.mint_epoch(1u64, holder);
    // 45,000 (from vault) × 1,000 × 500 / 10,000 = 2,250,000 SAWIT, minted for real
    assert_eq!(sys.token.balance_of(&holder), U256::from(2_250_000u64));
    assert_eq!(sys.token.total_supply(), U256::from(2_250_000u64));

    // ── 3. Before KYC, the holder cannot claim ──
    // Open + fund a yield epoch first (authority acts as router here)
    env.set_caller(env.get_account(0));
    sys.dist.create_epoch(
        "Jun-26".to_string(),
        U512::from(5_000_000_000u64),
        1u64,
        82_500u64,
    );
    sys.dist.set_claimable(1u64, holder, U512::from(1_000_000_000u64));
    sys.dist
        .with_tokens(U512::from(5_000_000_000u64))
        .fund_epoch(1u64);

    env.set_caller(holder);
    assert!(
        sys.dist.try_claim_yield(1u64).is_err(),
        "non-KYC holder must be blocked by the compliance gate"
    );
    assert!(!sys.dist.has_claimed(1u64, &holder));

    // ── 4. Operator registers KYC, holder can now claim ──
    env.set_caller(env.get_account(0)); // vault authority
    sys.vault.register_kyc(holder);
    assert!(sys.vault.is_kyc_verified(&holder));

    env.set_caller(holder);
    sys.dist.claim_yield(1u64);
    assert!(sys.dist.has_claimed(1u64, &holder));

    // ── 5. Holder can transfer their SAWIT freely ──
    let recipient = env.get_account(3);
    env.set_caller(holder);
    sys.token.transfer(&recipient, &U256::from(250_000u64));
    assert_eq!(sys.token.balance_of(&recipient), U256::from(250_000u64));
    assert_eq!(sys.token.balance_of(&holder), U256::from(2_000_000u64));
}

#[test]
fn double_claim_is_rejected() {
    let env = odra_test::env();
    let mut sys = deploy_system(&env);
    let holder = env.get_account(2);

    env.set_caller(env.get_account(0));
    sys.vault.register_kyc(holder);
    sys.dist.create_epoch(
        "Jun-26".to_string(),
        U512::from(5_000_000_000u64),
        1u64,
        82_500u64,
    );
    sys.dist.set_claimable(1u64, holder, U512::from(1_000_000_000u64));
    sys.dist
        .with_tokens(U512::from(5_000_000_000u64))
        .fund_epoch(1u64);

    env.set_caller(holder);
    sys.dist.claim_yield(1u64);
    // Second claim must fail (claim receipt already set)
    assert!(sys.dist.try_claim_yield(1u64).is_err());
}
