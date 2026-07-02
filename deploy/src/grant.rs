
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::casper_types::U512;
    use odra::host::{HostRef, HostRefLoader};
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const EPOCH: u64 = 1;
    const HOLDER_ACCOUNT: &str =
        "account-hash-e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe";
    let top_up: U512 = U512::from(30_000_000_000u64);
    let claim_amount: U512 = U512::from(25_000_000_000u64);

    let env = odra_casper_livenet_env::env();
    let holder = Address::from_str(HOLDER_ACCOUNT).expect("valid account hash");
    println!("Holder (your wallet): {:?}", holder);

    let mut vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());
    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    println!("\n[1/3] fund_epoch({EPOCH}) with 30 CSPR...");
    env.set_gas(20_000_000_000);
    dist.with_tokens(top_up).fund_epoch(EPOCH);

    if vault.is_kyc_verified(&holder) {
        println!("\n[2/3] holder already KYC-verified.");
    } else {
        println!("\n[2/3] register_kyc(holder)...");
        env.set_gas(5_000_000_000);
        vault.register_kyc(holder);
        println!("KYC verified: {}", vault.is_kyc_verified(&holder));
    }

    println!("\n[3/3] set_claimable({EPOCH}, holder, 25 CSPR)...");
    env.set_gas(5_000_000_000);
    dist.set_claimable(EPOCH, holder, claim_amount);
    println!("Claimable now: {} motes", dist.get_claimable(EPOCH, &holder));

    println!("\n✅ Allocation ready. Connect this wallet in the app and click \"Claim CSPR yield\".");
}
