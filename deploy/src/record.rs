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

    // Read the epoch values the Oracle Agent computed (env-overridable so the
    // agent posts its OWN reasoned data; defaults keep a manual `cargo run` working).
    fn ev<T: std::str::FromStr>(key: &str, default: T) -> T {
        std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
    }
    let epoch_label = std::env::var("RECORD_EPOCH_LABEL").unwrap_or_else(|_| "Jun-2026".into());
    let data_source =
        std::env::var("RECORD_DATA_SOURCE").unwrap_or_else(|_| "GAPKI+KPBN+Gemini".into());
    let tons_cpo: u64 = ev("RECORD_TONS_CPO", 45_200);
    let revenue_usd: u64 = ev("RECORD_REVENUE_USD", 37_290_000);
    let daily_output_ton: u32 = ev("RECORD_DAILY_OUTPUT_TON", 1_506);
    let oer_pct: u8 = ev("RECORD_OER_PCT", 21);
    let cpo_price_cents: u64 = ev("RECORD_CPO_PRICE_CENTS", 82_500);
    let estate_count: u8 = ev("RECORD_ESTATE_COUNT", 12);
    let active_mills: u8 = ev("RECORD_ACTIVE_MILLS", 8);
    let validation_score: u8 = ev("RECORD_VALIDATION_SCORE", 92);

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

    println!("\nSubmitting record_production for epoch '{epoch_label}' ({tons_cpo} t @ {cpo_price_cents} cents)...");
    env.set_gas(8_000_000_000);
    vault.record_production(
        epoch_label.clone(),
        tons_cpo,
        revenue_usd,
        daily_output_ton,
        oer_pct,
        cpo_price_cents,
        estate_count,
        active_mills,
        validation_score,
        data_source,
        now,
    );

    let after = vault.get_epoch_count();
    let total = vault.get_total_tons_cpo();
    let rep = vault.get_oracle_reputation();
    let subs = vault.get_oracle_submission_count();

    // Machine-readable marker so the Oracle Agent can confirm the write landed.
    println!("RECORD_OK {{\"epoch_count\":{after},\"reputation\":{rep}}}");

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
