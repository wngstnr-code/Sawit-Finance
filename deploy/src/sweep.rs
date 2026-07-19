
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let epoch: u64 = match std::env::var("SWEEP_EPOCH").ok().and_then(|v| v.parse().ok()) {
        Some(e) => e,
        None => {
            eprintln!("SWEEP_ERR {{\"reason\":\"missing_epoch\"}}");
            std::process::exit(1);
        }
    };

    let env = odra_casper_livenet_env::env();
    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());

    let record = match dist.get_epoch(epoch) {
        Some(r) => r,
        None => {
            eprintln!("SWEEP_ERR {{\"reason\":\"epoch_not_found\",\"epoch\":{epoch}}}");
            std::process::exit(1);
        }
    };
    if record.is_swept {
        eprintln!("SWEEP_ERR {{\"reason\":\"already_swept\",\"epoch\":{epoch}}}");
        std::process::exit(1);
    }

    let unclaimed = record
        .total_distribution_cspr
        .checked_sub(record.total_claimed_cspr)
        .unwrap_or_else(|| {
            eprintln!("SWEEP_WARN {{\"reason\":\"claimed_exceeds_pool\",\"epoch\":{epoch}}}: total_claimed_cspr > total_distribution_cspr, treating unclaimed as 0");
            odra::casper_types::U512::zero()
        });
    println!(
        "sweep_unclaimed({epoch}): {} CSPR unclaimed...",
        unclaimed.as_u128() as f64 / 1e9
    );
    env.set_gas(5_000_000_000);
    dist.sweep_unclaimed(epoch);

    println!("SWEEP_OK {{\"epoch\":{epoch},\"swept_motes\":\"{unclaimed}\"}}");
}
