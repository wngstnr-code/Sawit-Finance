//! Sawit Finance — Casper livenet deployment binary.
//!
//! Installs all four contracts as **upgradable** packages, wires cross-contract
//! permissions, and prints the addresses for `agents/.env`.
//!
//! Run:
//!     cargo odra build                      # produce the wasm first
//!     cargo run --bin deploy --features livenet
//!
//! Requires livenet env vars (see README → "Deploy to Casper Testnet"):
//!     ODRA_BACKEND=casper
//!     ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
//!     ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
//!     ODRA_CASPER_LIVENET_SECRET_KEY_PATH=./keys/secret_key.pem

#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    eprintln!("Run:  cargo run --bin deploy --features livenet");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::{Deployer, InstallConfig};
    use odra::prelude::Addressable;
    use production_vault::production_vault::{
        SawitProductionVault, SawitProductionVaultInitArgs,
    };
    use sawit_token::sawit_token::{SawitToken, SawitTokenInitArgs};
    use token_minter::token_minter::{SawitMinter, SawitMinterInitArgs};
    use yield_distributor::yield_distributor::{
        SawitYieldDistributor, SawitYieldDistributorInitArgs,
    };

    // Gas budget (motes) attached to each deploy. Contract installs are heavy;
    // 250 CSPR per deploy is a safe ceiling on Testnet (unused gas is refunded
    // by the install logic's actual cost — adjust if a deploy runs out of gas).
    const DEPLOY_GAS: u64 = 250_000_000_000;

    // Default minting parameters
    const TOKEN_RATE: u64 = 1_000; // SAWIT per ton CPO
    const GORR_BPS: u32 = 500; // 5% gross overriding royalty rate

    let env = odra_casper_livenet_env::env();

    // The deploying account bootstraps as authority / oracle / yield-router.
    // These roles can be reassigned on-chain afterward (update_oracle_agent, etc.).
    let deployer = env.get_account(0);
    println!("Deployer account: {:?}", deployer);
    println!("Installing 4 upgradable contracts...\n");

    // 1. SawitToken — minter set to deployer for now, rewired in step 5
    env.set_gas(DEPLOY_GAS);
    let mut token = SawitToken::deploy_with_cfg(
        &env,
        SawitTokenInitArgs { minter: deployer },
        InstallConfig::new::<SawitToken>(true, false),
    );
    println!("SAWIT_TOKEN_CONTRACT={:?}", token.address());

    // 2. ProductionVault — verified CPO data + KYC registry; oracle = deployer
    env.set_gas(DEPLOY_GAS);
    let vault = SawitProductionVault::deploy_with_cfg(
        &env,
        SawitProductionVaultInitArgs { oracle_agent: deployer },
        InstallConfig::new::<SawitProductionVault>(true, false),
    );
    println!("PRODUCTION_VAULT_CONTRACT={:?}", vault.address());

    // 3. TokenMinter — reads vault (CPI), mints via token (CPI)
    env.set_gas(DEPLOY_GAS);
    let minter = SawitMinter::deploy_with_cfg(
        &env,
        SawitMinterInitArgs {
            sawit_token: token.address(),
            production_vault: vault.address(),
            token_rate: TOKEN_RATE,
            gorr_bps: GORR_BPS,
        },
        InstallConfig::new::<SawitMinter>(true, false),
    );
    println!("TOKEN_MINTER_CONTRACT={:?}", minter.address());

    // 4. YieldDistributor — reads vault KYC (CPI); router = deployer
    env.set_gas(DEPLOY_GAS);
    let dist = SawitYieldDistributor::deploy_with_cfg(
        &env,
        SawitYieldDistributorInitArgs {
            yield_router: deployer,
            production_vault: vault.address(),
        },
        InstallConfig::new::<SawitYieldDistributor>(true, false),
    );
    println!("YIELD_DISTRIBUTOR_CONTRACT={:?}", dist.address());

    // 5. Wire permissions: only TokenMinter may mint SAWIT
    env.set_gas(5_000_000_000);
    token.set_minter(minter.address());
    println!("\nWired SawitToken.minter → TokenMinter ✅");

    println!("\n── Deployment complete ──");
    println!("Copy the *_CONTRACT lines above into agents/.env.");
    println!("Then register investors for KYC:  ProductionVault.register_kyc(<address>)");
}
