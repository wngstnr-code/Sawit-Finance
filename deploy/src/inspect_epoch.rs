
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

/// Read-only: print a distribution epoch's full state plus claimable amounts
/// for the known holder accounts (deployer/authority + treasury).
#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";
    const HOLDERS: [&str; 2] = [
        // deployer / authority
        "account-hash-57895ec9532fba625e63d3f7a5e250b50f9c5e0fb5321f8fa5890dd05d4ae2ec",
        // treasury
        "account-hash-e8134d5d5caf9ace626209d09365af48a867a18199b5139da8873733c6c14efe",
    ];

    let env = odra_casper_livenet_env::env();
    let dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let cur = dist.get_current_epoch();
    println!("current_epoch={cur} total_distributed_all_time={}", dist.get_total_distributed());

    let epoch: u64 = std::env::var("INSPECT_EPOCH")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(cur);

    match dist.get_epoch(epoch) {
        Some(e) => println!(
            "epoch={} label={} pool={} claimed={} funded={} swept={} claims={} deadline={}",
            e.epoch_number,
            e.epoch_label,
            e.total_distribution_cspr,
            e.total_claimed_cspr,
            e.is_funded,
            e.is_swept,
            e.claims_count,
            e.claim_deadline
        ),
        None => println!("epoch={epoch} NOT FOUND"),
    }
    println!("claimable_total={}", dist.get_claimable_total(epoch));
    for h in HOLDERS {
        let addr = Address::from_str(h).expect("valid account hash");
        println!(
            "holder {} claimable={} claimed={}",
            &h[13..21],
            dist.get_claimable(epoch, &addr),
            dist.has_claimed(epoch, &addr)
        );
    }
}
