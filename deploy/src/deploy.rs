
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

    const DEPLOY_GAS: u64 = 250_000_000_000;

    const TOKEN_RATE: u64 = 1_000;
    const GORR_BPS: u32 = 500;

    let env = odra_casper_livenet_env::env();

    let deployer = env.get_account(0);
    println!("Deployer account: {:?}", deployer);
    println!("Installing 4 upgradable contracts...\n");

    env.set_gas(DEPLOY_GAS);
    let mut token = SawitToken::deploy_with_cfg(
        &env,
        SawitTokenInitArgs { minter: deployer },
        InstallConfig::new::<SawitToken>(true, false),
    );
    println!("SAWIT_TOKEN_CONTRACT={:?}", token.address());

    env.set_gas(DEPLOY_GAS);
    let vault = SawitProductionVault::deploy_with_cfg(
        &env,
        SawitProductionVaultInitArgs { oracle_agent: deployer },
        InstallConfig::new::<SawitProductionVault>(true, false),
    );
    println!("PRODUCTION_VAULT_CONTRACT={:?}", vault.address());

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

    env.set_gas(5_000_000_000);
    token.set_minter(minter.address());
    println!("\nWired SawitToken.minter → TokenMinter ✅");

    println!("\n── Deployment complete ──");
    println!("Copy the *_CONTRACT lines above into agents/.env.");
    println!("Then register investors for KYC:  ProductionVault.register_kyc(<address>)");
}
