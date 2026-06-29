//! Sawit Finance — autonomously apply a GORR change on the deployed TokenMinter.
//!
//! This is the *write* side of the Market Analyst's closed loop:
//!   READ chain state → REASON with Gemini → **WRITE back to chain**.
//!
//! The agent decides a new GORR (within safety rails) and invokes this binary,
//! which signs and broadcasts a real `TokenMinter.update_config(new_gorr_bps)`
//! transaction on Casper Testnet — the deploy hash it prints is the agent's
//! decision, verifiable on cspr.live.
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     SET_GORR_BPS=520 cargo run -p sawit-deploy --bin set_gorr --features livenet

#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    eprintln!("Run:  SET_GORR_BPS=<bps> cargo run -p sawit-deploy --bin set_gorr --features livenet");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use token_minter::token_minter::SawitMinter;

    // Deployed TokenMinter package hash (see README → Live on Casper Testnet).
    const MINTER: &str =
        "hash-cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06";

    let new_gorr: u32 = std::env::var("SET_GORR_BPS")
        .expect("set SET_GORR_BPS=<bps> (e.g. 520)")
        .parse()
        .expect("SET_GORR_BPS must be an integer (bps)");

    let env = odra_casper_livenet_env::env();
    let authority = env.get_account(0);
    println!("Authority account: {:?}", authority);

    let addr = Address::new(MINTER).expect("valid minter address");
    let mut minter = SawitMinter::load(&env, addr);

    let before = minter.get_gorr_bps();
    println!("GORR on-chain before: {before} bps");

    if new_gorr == before {
        println!("Requested GORR equals current GORR ({before} bps) — nothing to do.");
        return;
    }

    println!("\nSubmitting update_config(new_gorr_bps = {new_gorr})...");
    env.set_gas(3_000_000_000);
    minter.update_config(None, Some(new_gorr));

    let after = minter.get_gorr_bps();
    println!("\n── Updated ──");
    println!("GORR on-chain after : {after} bps");
    // Machine-readable marker so the agent can confirm the write landed.
    println!("GORR_UPDATE_OK {{\"before\":{before},\"after\":{after}}}");
    println!("\n✅ Autonomous GORR update complete — verify the deploy on cspr.live.");
}
