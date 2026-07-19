
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Top up the YieldDistributor's purse without creating a new epoch.
/// `fund_epoch` is payable and only flips `is_funded`, so re-calling it on an
/// already-funded epoch with attached CSPR is a pure purse top-up — used to
/// restore solvency after testnet epoch 1 was over-claimed (125 > 100 CSPR).
#[cfg(feature = "livenet")]
fn main() {
    use odra::casper_types::U512;
    use odra::host::{HostRef, HostRefLoader};
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let epoch: u64 = match std::env::var("TOPUP_EPOCH").ok().and_then(|v| v.parse().ok()) {
        Some(v) => v,
        None => {
            eprintln!("TOPUP_EPOCH is required (an existing funded epoch number)");
            std::process::exit(2);
        }
    };
    let motes: u64 = match std::env::var("TOPUP_AMOUNT_MOTES").ok().and_then(|v| v.parse().ok()) {
        Some(v) => v,
        None => {
            eprintln!("TOPUP_AMOUNT_MOTES is required (motes, e.g. 50000000000 = 50 CSPR)");
            std::process::exit(2);
        }
    };

    let env = odra_casper_livenet_env::env();
    println!("Authority account: {:?}", env.get_account(0));

    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let before = dist.get_epoch(epoch).expect("epoch must exist");
    println!(
        "Epoch {epoch}: pool {} motes, claimed {} motes, funded {}",
        before.total_distribution_cspr, before.total_claimed_cspr, before.is_funded
    );

    println!("Topping up purse via fund_epoch({epoch}) with {} CSPR...", motes as f64 / 1e9);
    env.set_gas(25_000_000_000);
    dist.with_tokens(U512::from(motes)).fund_epoch(epoch);

    println!("TOPUP_OK {{\"epoch\":{epoch},\"motes\":{motes}}}");
}
