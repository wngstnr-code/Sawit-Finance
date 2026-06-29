//! Sawit Finance — record one production epoch on the deployed ProductionVault.
//!
//! This is the first *functional* (non-install) transaction: the oracle account
//! (the deployer) submits AI-verified CPO production data for an epoch, then we
//! read it back from chain to confirm.
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     cargo run -p sawit-deploy --bin record --features livenet

#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    eprintln!("Run:  cargo run -p sawit-deploy --bin record --features livenet");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Deployed ProductionVault package hash (see README → Live on Casper Testnet).
    const VAULT: &str =
        "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";

    let env = odra_casper_livenet_env::env();
    let oracle = env.get_account(0);
    println!("Oracle account: {:?}", oracle);

    let addr = Address::new(VAULT).expect("valid vault address");
    let mut vault = SawitProductionVault::load(&env, addr);

    let before = vault.get_epoch_count();
    println!("Epochs on-chain before: {before}");

    // A strictly-increasing timestamp (must beat last_epoch_timestamp).
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    println!("\nSubmitting record_production for epoch 'Jun-2026'...");
    env.set_gas(8_000_000_000);
    vault.record_production(
        "Jun-2026".to_string(), // epoch_label
        45_200,                 // tons_cpo
        37_290_000,             // revenue_usd
        1_506,                  // daily_output_ton
        21,                     // oer_pct
        82_500,                 // cpo_price_cents ($825.00/ton)
        12,                     // estate_count
        8,                      // active_mills
        92,                     // validation_score (>= 60)
        "GAPKI+KPBN+Gemini".to_string(), // data_source
        now,                    // epoch_timestamp
    );

    let after = vault.get_epoch_count();
    let total = vault.get_total_tons_cpo();
    let rep = vault.get_oracle_reputation();
    let subs = vault.get_oracle_submission_count();

    println!("\n── Recorded ──");
    println!("Epochs on-chain after : {after}");
    println!("Total CPO (tons)      : {total}");
    println!("Oracle reputation     : {rep}/100  ({subs} submissions)");

    if let Some(rec) = vault.get_epoch(after) {
        println!(
            "Latest epoch          : {} — {} tons @ {} cents/ton",
            rec.epoch_label, rec.tons_cpo, rec.cpo_price_cents
        );
    }
    println!("\n✅ First functional transaction complete.");
}
