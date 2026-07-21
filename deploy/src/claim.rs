
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::casper_types::U512;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const EPOCH: u64 = 1;
    let amount: U512 = U512::from(100_000_000_000u64);

    let env = odra_casper_livenet_env::env();
    let holder = env.get_account(0);
    println!("Holder account: loaded from deploy secret key");

    let mut vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());
    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    if vault.is_kyc_verified(&holder) {
        println!("Holder already KYC-verified.");
    } else {
        println!("\n[1/3] register_kyc(holder)...");
        env.set_gas(5_000_000_000);
        vault.register_kyc(holder);
        println!("KYC verified: {}", vault.is_kyc_verified(&holder));
    }

    println!("\n[2/3] set_claimable(epoch {EPOCH}, holder, 100 CSPR)...");
    env.set_gas(5_000_000_000);
    dist.set_claimable(EPOCH, holder, amount);
    println!("Claimable now: {} motes", dist.get_claimable(EPOCH, &holder));

    println!("\n[3/3] claim_yield(epoch {EPOCH})...");
    env.set_gas(8_000_000_000);
    dist.claim_yield(EPOCH);

    println!("\n── Claimed ──");
    println!("Remaining claimable : {} motes", dist.get_claimable(EPOCH, &holder));
    if let Some(e) = dist.get_epoch(EPOCH) {
        println!("Epoch total claimed : {} motes", e.total_claimed_cspr);
        println!("Epoch claims count  : {}", e.claims_count);
    }
    println!("\n✅ Full loop closed: production → mint → fund → claim.");
}
