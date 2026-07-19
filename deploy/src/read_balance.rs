
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use sawit_token::sawit_token::SawitToken;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";

    let account = std::env::var("BALANCE_ACCOUNT")
        .expect("BALANCE_ACCOUNT (account-hash-<hex>) is required");
    let addr = Address::from_str(&account).expect("valid account-hash");

    let env = odra_casper_livenet_env::env();
    let token = SawitToken::load(&env, Address::new(TOKEN).unwrap());
    let dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());

    let balance = token.balance_of(&addr);
    let epoch = dist.get_current_epoch();
    let claimable = dist.get_claimable(epoch, &addr);
    let kyc_verified = vault.is_kyc_verified(&addr);

    println!(
        "SAWIT_BALANCE_JSON {{\"account\":\"{account}\",\"balance\":\"{balance}\",\"claimable_motes\":\"{claimable}\",\"epoch\":{epoch},\"kyc_verified\":{kyc_verified}}}"
    );
}
