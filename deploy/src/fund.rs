
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::casper_types::U512;
    use odra::host::{HostRef, HostRefLoader};
    use odra::prelude::Address;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let pool_motes: u64 = std::env::var("FUND_AMOUNT_MOTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100_000_000_000u64);
    let trigger_cents: u64 = std::env::var("FUND_TRIGGER_CENTS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(82_500);
    let epoch_label = std::env::var("FUND_EPOCH_LABEL").unwrap_or_else(|_| "Jun-2026".into());
    let pool: U512 = U512::from(pool_motes);

    let env = odra_casper_livenet_env::env();
    let deployer = env.get_account(0);
    println!("Authority account: {:?}", deployer);

    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let cur = dist.get_current_epoch();
    println!("Current epoch before: {cur}");

    let already_unfunded = matches!(dist.get_epoch(cur), Some(e) if !e.is_funded) && cur > 0;
    let epoch_no = if already_unfunded {
        println!("Reusing existing unfunded epoch #{cur}");
        cur
    } else {
        println!("\nCreating distribution epoch '{epoch_label}'...");
        env.set_gas(6_000_000_000);
        dist.create_epoch(
            epoch_label.clone(),
            pool,
            1,
            trigger_cents,
        );
        let n = dist.get_current_epoch();
        println!("Created epoch #{n}");
        n
    };

    println!("\nFunding epoch #{epoch_no} with 100 CSPR...");
    env.set_gas(25_000_000_000);
    dist.with_tokens(pool).fund_epoch(epoch_no);

    println!("\n── Funded ──");
    println!("Current epoch        : {}", dist.get_current_epoch());
    if let Some(e) = dist.get_epoch(epoch_no) {
        println!("Epoch label          : {}", e.epoch_label);
        println!("Distribution pool    : {} motes", e.total_distribution_cspr);
        println!("Is funded            : {}", e.is_funded);
        println!("Claim deadline (ms)  : {}", e.claim_deadline);
    }
    println!("FUND_OK {{\"epoch\":{epoch_no},\"motes\":{pool_motes}}}");
    println!("\n✅ Distribution epoch {epoch_no} created and funded.");
}
