//! Sawit Finance — read a single account's live SAWIT (CEP-18) balance from the
//! token contract via Odra's livenet client. CSPR.cloud can't surface Odra's
//! internal state, so the frontend reads balances through this bridge (served by
//! the /api/balance route). The account is passed via the BALANCE_ACCOUNT env var
//! as a formatted `account-hash-...` string.
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     BALANCE_ACCOUNT=account-hash-<hex> \
//!       cargo run -p sawit-deploy --bin read_balance --features livenet

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
    use sawit_token::sawit_token::SawitToken;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let account = std::env::var("BALANCE_ACCOUNT")
        .expect("BALANCE_ACCOUNT (account-hash-<hex>) is required");
    let addr = Address::from_str(&account).expect("valid account-hash");

    let env = odra_casper_livenet_env::env();
    let token = SawitToken::load(&env, Address::new(TOKEN).unwrap());
    let dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    let balance = token.balance_of(&addr);
    let epoch = dist.get_current_epoch();
    let claimable = dist.get_claimable(epoch, &addr); // U512 motes for the current epoch

    // Machine-readable line the /api/balance route parses.
    println!(
        "SAWIT_BALANCE_JSON {{\"account\":\"{account}\",\"balance\":\"{balance}\",\"claimable_motes\":\"{claimable}\",\"epoch\":{epoch}}}"
    );
}
