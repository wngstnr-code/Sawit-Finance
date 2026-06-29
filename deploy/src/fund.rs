//! Sawit Finance — create & fund a yield distribution epoch (bootstrapping step 3).
//!
//! The authority creates a distribution epoch on YieldDistributor, then funds it
//! by attaching real CSPR to the payable `fund_epoch` call. This opens a 90-day
//! claim window for KYC-verified SAWIT holders (claim = step 4).
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     cargo run -p sawit-deploy --bin fund --features livenet

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

    // 100 CSPR distribution pool for this epoch.
    let pool: U512 = U512::from(100_000_000_000u64); // motes (100 CSPR)

    let env = odra_casper_livenet_env::env();
    let deployer = env.get_account(0);
    println!("Authority account: {:?}", deployer);

    let mut dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let cur = dist.get_current_epoch();
    println!("Current epoch before: {cur}");

    // Idempotent: only create a fresh epoch if the current one is missing or
    // already funded. Otherwise fund the existing (unfunded) current epoch —
    // avoids creating a duplicate epoch on re-run after a funding retry.
    let already_unfunded = matches!(dist.get_epoch(cur), Some(e) if !e.is_funded) && cur > 0;
    let epoch_no = if already_unfunded {
        println!("Reusing existing unfunded epoch #{cur}");
        cur
    } else {
        // 1. Create the distribution epoch (claim_deadline = now + 90 days).
        println!("\nCreating distribution epoch 'Jun-2026'...");
        env.set_gas(6_000_000_000);
        dist.create_epoch(
            "Jun-2026".to_string(),
            pool,    // total_distribution_cspr
            1,       // total_eligible_holders
            82_500,  // cpo_trigger_price_cents ($825.00/ton)
        );
        let n = dist.get_current_epoch();
        println!("Created epoch #{n}");
        n
    };

    // 2. Fund it — attach 100 CSPR to the payable fund_epoch call. Payable calls
    // run through Odra's proxy_caller wasm, which needs a generous gas budget.
    println!("\nFunding epoch #{epoch_no} with 100 CSPR...");
    env.set_gas(25_000_000_000);
    dist.with_tokens(pool).fund_epoch(epoch_no);

    // 3. Read back.
    println!("\n── Funded ──");
    println!("Current epoch        : {}", dist.get_current_epoch());
    if let Some(e) = dist.get_epoch(epoch_no) {
        println!("Epoch label          : {}", e.epoch_label);
        println!("Distribution pool    : {} motes", e.total_distribution_cspr);
        println!("Is funded            : {}", e.is_funded);
        println!("Claim deadline (ms)  : {}", e.claim_deadline);
    }
    println!("\n✅ Distribution epoch {epoch_no} created and funded.");
}
