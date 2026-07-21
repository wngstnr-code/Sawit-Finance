
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Lower (or raise) the declared pool of a distribution epoch whose funding never
/// completed, via `resize_unfunded_epoch`.
///
/// Needed when an epoch was created at the wrong size — e.g. from a stale config
/// default — and its `fund_epoch` then failed, leaving `is_funded` permanently
/// false. That state blocks `claim_yield` and `sweep_unclaimed`, and the `fund`
/// bin's reuse path keeps targeting the stuck epoch instead of opening a new one.
///
/// Both parameters are required with no defaults, deliberately: this mutates a
/// live upgradable contract, and a silent default is exactly what caused the
/// original over-allocation incident.
#[cfg(feature = "livenet")]
fn main() {
    use odra::casper_types::U512;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let epoch: u64 = match std::env::var("RESIZE_EPOCH").ok().and_then(|v| v.parse().ok()) {
        Some(v) => v,
        None => {
            eprintln!("RESIZE_EPOCH is required (the distribution epoch number)");
            std::process::exit(2);
        }
    };
    let new_pool: u64 = match std::env::var("RESIZE_POOL_MOTES").ok().and_then(|v| v.parse().ok()) {
        Some(v) => v,
        None => {
            eprintln!("RESIZE_POOL_MOTES is required (new pool size in motes, 1 CSPR = 1e9)");
            std::process::exit(2);
        }
    };

    let env = odra_casper_livenet_env::env();
    println!("Authority account: loaded from deploy secret key");

    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    let before = match dist.get_epoch(epoch) {
        Some(e) => e,
        None => {
            eprintln!("epoch {epoch} not found on-chain");
            std::process::exit(3);
        }
    };
    let allocated = dist.get_claimable_total(epoch);
    println!(
        "Epoch {epoch} before: pool={} claimable_total={} is_funded={} is_swept={}",
        before.total_distribution_cspr, allocated, before.is_funded, before.is_swept
    );

    println!("Resizing epoch {epoch} pool to {new_pool} motes...");
    env.set_gas(25_000_000_000);
    dist.resize_unfunded_epoch(epoch, U512::from(new_pool));

    let after = dist.get_epoch(epoch).unwrap();
    println!(
        "Epoch {epoch} after : pool={} is_funded={}",
        after.total_distribution_cspr, after.is_funded
    );
    println!(
        "RESIZE_EPOCH_OK {{\"epoch\":{epoch},\"pool_motes\":\"{}\",\"is_funded\":{}}}",
        after.total_distribution_cspr, after.is_funded
    );
}
