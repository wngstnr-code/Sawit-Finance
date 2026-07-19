
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Set the YieldDistributor's claim_window_ms (applies to epochs created from
/// now on; already-stored epochs keep their previously computed
/// claim_deadline untouched). There is no default here on purpose — the
/// caller must be explicit about the window they intend to set on a live,
/// upgradable contract.
#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let window_ms: u64 = match std::env::var("CLAIM_WINDOW_MS").ok().and_then(|v| v.parse().ok()) {
        Some(v) => v,
        None => {
            eprintln!("CLAIM_WINDOW_MS is required (milliseconds, e.g. 2592000000 = 30 days)");
            std::process::exit(2);
        }
    };

    let env = odra_casper_livenet_env::env();
    println!("Authority account: {:?}", env.get_account(0));

    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let before = dist.get_claim_window();
    println!("Current claim window: {before} ms");

    println!("Setting claim window to {window_ms} ms...");
    env.set_gas(25_000_000_000);
    dist.set_claim_window(window_ms);

    let after = dist.get_claim_window();
    println!("New claim window: {after} ms");
    println!("SET_WINDOW_OK {{\"window_ms\":{after}}}");
}
