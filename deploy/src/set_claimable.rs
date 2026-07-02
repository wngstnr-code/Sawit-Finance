
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::casper_types::U512;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const HOLDER_ACCOUNT: &str =
        "account-hash-e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe";

    let holder_str = std::env::var("CLAIM_HOLDER").unwrap_or_else(|_| HOLDER_ACCOUNT.into());
    let amount_motes: u64 = std::env::var("CLAIM_AMOUNT_MOTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(25_000_000_000u64);

    let env = odra_casper_livenet_env::env();
    let holder = Address::from_str(&holder_str).expect("valid account hash");
    println!("Holder: {:?}", holder);

    let mut vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());
    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    let epoch = std::env::var("CLAIM_EPOCH")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| dist.get_current_epoch());
    println!("Current distribution epoch: {epoch}");

    if vault.is_kyc_verified(&holder) {
        println!("Holder already KYC-verified.");
    } else {
        println!("register_kyc(holder)...");
        env.set_gas(5_000_000_000);
        vault.register_kyc(holder);
    }

    println!("set_claimable({epoch}, holder, {} CSPR)...", amount_motes as f64 / 1e9);
    env.set_gas(5_000_000_000);
    dist.set_claimable(epoch, holder, U512::from(amount_motes));
    let now = dist.get_claimable(epoch, &holder);
    println!("Claimable now: {now} motes");
    println!("SET_CLAIMABLE_OK {{\"epoch\":{epoch},\"motes\":{now}}}");
    println!("\n✅ Holder can now claim from the app UI on epoch {epoch}.");
}
