
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Upgrade the YieldDistributor package in place (it was installed with
/// `InstallConfig::new::<T>(true, false)`, i.e. upgradable). State (epochs,
/// claimables, purse) is retained; only the contract wasm is replaced.
#[cfg(feature = "livenet")]
fn main() {
    use odra::host::{Deployer, HostRefLoader, NoArgs, UpgradeConfig};
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let env = odra_casper_livenet_env::env();
    println!("Authority account: loaded from deploy secret key");
    let addr = Address::new(DIST).unwrap();

    let dist = SawitYieldDistributor::load(&env, addr);
    println!("Pre-upgrade current epoch: {}", dist.get_current_epoch());

    println!("Upgrading SawitYieldDistributor at {DIST}...");
    env.set_gas(300_000_000_000);
    match SawitYieldDistributor::try_upgrade_with_cfg(
        &env,
        addr,
        NoArgs,
        UpgradeConfig::new::<SawitYieldDistributor>(),
    ) {
        Ok(upgraded) => {
            println!("Post-upgrade current epoch: {}", upgraded.get_current_epoch());
            println!(
                "Epoch 1 claimable_total (new getter): {}",
                upgraded.get_claimable_total(1)
            );
            println!("UPGRADE_OK");
        }
        Err(e) => {
            eprintln!("UPGRADE_FAILED: {e:?}");
            std::process::exit(1);
        }
    }
}
