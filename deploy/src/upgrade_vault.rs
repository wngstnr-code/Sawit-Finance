
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Upgrade the ProductionVault package in place (installed upgradable, same as
/// the YieldDistributor). State (epochs, KYC registry, oracle reputation) is
/// retained; only the contract wasm is replaced.
#[cfg(feature = "livenet")]
fn main() {
    use odra::host::{Deployer, HostRefLoader, NoArgs, UpgradeConfig};
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";

    let env = odra_casper_livenet_env::env();
    println!("Authority account: loaded from deploy secret key");
    let addr = Address::new(VAULT).unwrap();

    let vault = SawitProductionVault::load(&env, addr);
    println!("Pre-upgrade epoch count: {}", vault.get_epoch_count());

    println!("Upgrading SawitProductionVault at {VAULT}...");
    env.set_gas(300_000_000_000);
    match SawitProductionVault::try_upgrade_with_cfg(
        &env,
        addr,
        NoArgs,
        UpgradeConfig::new::<SawitProductionVault>(),
    ) {
        Ok(upgraded) => {
            println!("Post-upgrade epoch count: {}", upgraded.get_epoch_count());
            println!(
                "max_tons_per_epoch (new getter): {}",
                upgraded.get_max_tons_per_epoch()
            );
            println!("UPGRADE_OK");
        }
        Err(e) => {
            eprintln!("UPGRADE_FAILED: {e:?}");
            std::process::exit(1);
        }
    }
}
