
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

    const MINTER: &str =
        "hash-cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06";

    let new_gorr: u32 = std::env::var("SET_GORR_BPS")
        .expect("set SET_GORR_BPS=<bps> (e.g. 520)")
        .parse()
        .expect("SET_GORR_BPS must be an integer (bps)");

    let env = odra_casper_livenet_env::env();
    let authority = env.get_account(0);
    println!("Authority account: loaded from deploy secret key");

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
    println!("GORR_UPDATE_OK {{\"before\":{before},\"after\":{after}}}");
    println!("\n✅ Autonomous GORR update complete — verify the deploy on cspr.live.");
}
