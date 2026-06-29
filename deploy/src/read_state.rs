//! Sawit Finance — read live on-chain state from all 4 deployed contracts.
//!
//! Read-only (no gas, no tx). Uses Odra's livenet client — the same proven read
//! path the deploy/record bins use — so it reads Odra's `state` dictionary
//! correctly (CSPR.cloud's named-keys endpoint can't, since Odra stores state in
//! a dictionary, not classic named keys).
//!
//! Emits ONE line prefixed `SAWIT_STATE_JSON ` so callers can separate it from
//! Odra's log output. Consumed by agents/market_analyst_agent.py.
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     cargo run -p sawit-deploy --bin read_state --features livenet

#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;
    use sawit_token::sawit_token::SawitToken;
    use token_minter::token_minter::SawitMinter;
    use yield_distributor::yield_distributor::SawitYieldDistributor;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";
    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";
    const MINTER: &str = "hash-cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06";
    const DIST: &str = "hash-1a04935782cbd60b7a4cfddea6ab18a6efd0348b862171c6a4fe25c111ccf1e9";

    let env = odra_casper_livenet_env::env();

    // ── ProductionVault ──
    let vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());
    let epoch_count = vault.get_epoch_count();
    let oracle_reputation = vault.get_oracle_reputation();
    let oracle_submission_count = vault.get_oracle_submission_count();
    let total_tons_cpo = vault.get_total_tons_cpo();
    let (label, price_cents, val_score, latest_tons) = match vault.get_epoch(epoch_count) {
        Some(r) => (r.epoch_label, r.cpo_price_cents, r.validation_score, r.tons_cpo),
        None => (String::from("none"), 0u64, 0u8, 0u64),
    };

    // ── TokenMinter ──
    let minter = SawitMinter::load(&env, Address::new(MINTER).unwrap());
    let total_minted = minter.get_total_tokens_minted();
    let gorr_bps = minter.get_gorr_bps();
    let token_rate = minter.get_token_rate();

    // ── SawitToken ──
    let token = SawitToken::load(&env, Address::new(TOKEN).unwrap());
    let total_supply = token.total_supply();

    // ── YieldDistributor ──
    let dist = SawitYieldDistributor::load(&env, Address::new(DIST).unwrap());
    let cur_epoch = dist.get_current_epoch();
    let total_distributed = dist.get_total_distributed();
    let (funded, deadline) = match dist.get_epoch(cur_epoch) {
        Some(e) => (e.is_funded, e.claim_deadline),
        None => (false, 0u64),
    };

    // Hand-rolled JSON (avoids a serde dependency); strings here are simple/ASCII.
    let json = format!(
        "{{\"epoch_count\":{epoch_count},\"oracle_reputation\":{oracle_reputation},\
\"oracle_submission_count\":{oracle_submission_count},\"total_tons_cpo\":{total_tons_cpo},\
\"latest_epoch_label\":\"{label}\",\"latest_cpo_price_cents\":{price_cents},\
\"latest_validation_score\":{val_score},\"latest_tons_cpo\":{latest_tons},\
\"current_distribution_epoch\":{cur_epoch},\"latest_epoch_funded\":{funded},\
\"latest_epoch_claim_deadline_ms\":{deadline},\"total_distributed_cspr\":\"{total_distributed}\",\
\"total_tokens_minted\":\"{total_minted}\",\"gorr_bps\":{gorr_bps},\"token_rate\":{token_rate},\
\"total_sawit_supply\":\"{total_supply}\"}}"
    );
    println!("SAWIT_STATE_JSON {json}");
}
