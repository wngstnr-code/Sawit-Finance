
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::casper_types::{U256, U512};
    use odra::host::{HostRef, HostRefLoader};
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use sawit_token::sawit_token::SawitToken;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";
    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const HOLDER_ACCOUNT: &str =
        "account-hash-e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe";

    let env = odra_casper_livenet_env::env();
    let holder = Address::from_str(HOLDER_ACCOUNT).expect("valid account hash");
    println!("Holder (your wallet): {:?}", holder);

    let mut token = SawitToken::load(&env, Address::new(TOKEN).unwrap());
    let mut vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());
    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    println!("\n[1/4] transfer 100 SAWIT → holder...");
    env.set_gas(6_000_000_000);
    token.transfer(&holder, &U256::from(100u64));
    println!("Holder SAWIT balance: {}", token.balance_of(&holder));

    let pool: U512 = U512::from(30_000_000_000u64);
    println!("\n[2/4] create_epoch('Jul-2026')...");
    env.set_gas(6_000_000_000);
    dist.create_epoch("Jul-2026".to_string(), pool, 1, 82_500);
    let epoch = dist.get_current_epoch();
    println!("New distribution epoch: #{epoch}");

    println!("\n[3/4] fund_epoch({epoch}) with 30 CSPR...");
    env.set_gas(25_000_000_000);
    dist.with_tokens(pool).fund_epoch(epoch);

    if !vault.is_kyc_verified(&holder) {
        env.set_gas(5_000_000_000);
        vault.register_kyc(holder);
    }
    let claim_amount: U512 = U512::from(25_000_000_000u64);
    println!("\n[4/4] set_claimable({epoch}, holder, 25 CSPR)...");
    env.set_gas(5_000_000_000);
    dist.set_claimable(epoch, holder, claim_amount);
    println!("Claimable: {} motes", dist.get_claimable(epoch, &holder));

    println!(
        "\n✅ Demo ready: holder has 100 SAWIT + 25 CSPR claimable on epoch #{epoch}."
    );
}
