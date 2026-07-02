
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

fn deploy_system(env: &HostEnv) -> System {
    let oracle = env.get_account(1);

    let vault = SawitProductionVault::deploy(
        env,
        SawitProductionVaultInitArgs { oracle_agent: oracle },
    );

    let mut token = SawitToken::deploy(
        env,
        SawitTokenInitArgs { minter: env.get_account(0) },
    );

    let minter = SawitMinter::deploy(
        env,
        SawitMinterInitArgs {
            sawit_token: token.address(),
            production_vault: vault.address(),
            token_rate: 1_000u64,
            gorr_bps: 500u32,
        },
    );

    token.set_minter(minter.address());

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

    env.set_caller(oracle);
    sys.vault.record_production(
        "Jun-26".to_string(),
        45_000,
        37_125_000_00,
        1_500,
        22,
        82_500,
        12,
        8,
        88,
        "GAPKI+KPBN+MPOB".to_string(),
        1_751_000_000_000u64,
    );
    assert_eq!(sys.vault.get_epoch_count(), 1);
    assert_eq!(sys.vault.get_oracle_reputation(), 88);

    env.set_caller(env.get_account(0));
    assert_eq!(sys.token.balance_of(&holder), U256::zero());
    sys.minter.mint_epoch(1u64, holder);
    assert_eq!(sys.token.balance_of(&holder), U256::from(2_250_000u64));
    assert_eq!(sys.token.total_supply(), U256::from(2_250_000u64));

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

    env.set_caller(env.get_account(0));
    sys.vault.register_kyc(holder);
    assert!(sys.vault.is_kyc_verified(&holder));

    env.set_caller(holder);
    sys.dist.claim_yield(1u64);
    assert!(sys.dist.has_claimed(1u64, &holder));

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
    assert!(sys.dist.try_claim_yield(1u64).is_err());
}
