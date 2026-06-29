//! Sawit Finance — mint SAWIT for a recorded production epoch (bootstrapping step 2).
//!
//! The authority (deployer) calls TokenMinter.mint_epoch(epoch, pool). The minter
//! reads the epoch straight from ProductionVault via CPI (it does not trust caller
//! figures), computes tokens = tons × token_rate × gorr_bps / 10_000, and mints
//! SAWIT (CEP-18) to the allocation pool. Then we read back the new totals.
//!
//! Run:
//!     set -a && . ./.env && set +a
//!     cargo run -p sawit-deploy --bin mint --features livenet

#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use sawit_token::sawit_token::SawitToken;
    use token_minter::token_minter::SawitMinter;

    const MINTER: &str = "hash-cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06";
    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";

    // Mint for the first recorded epoch; tokens go to the deployer's pool.
    const EPOCH: u64 = 1;

    let env = odra_casper_livenet_env::env();
    let deployer = env.get_account(0);
    println!("Authority/pool account: {:?}", deployer);

    let mut minter = SawitMinter::load(&env, Address::new(MINTER).unwrap());
    let token = SawitToken::load(&env, Address::new(TOKEN).unwrap());

    println!("Total minted before : {}", minter.get_total_tokens_minted());
    println!("Token supply before : {}", token.total_supply());

    println!("\nCalling TokenMinter.mint_epoch({EPOCH}, deployer)...");
    env.set_gas(12_000_000_000);
    minter.mint_epoch(EPOCH, deployer);

    println!("\n── Minted ──");
    println!("Total SAWIT minted  : {}", minter.get_total_tokens_minted());
    println!("Token total supply  : {}", token.total_supply());
    println!("Allocation balance  : {}", token.balance_of(&deployer));
    if let Some(rec) = minter.get_epoch_mint(EPOCH) {
        println!(
            "Epoch {} mint record : {} SAWIT from {} tons @ {} bps GORR",
            rec.epoch_number, rec.tokens_minted, rec.tons_cpo, rec.gorr_bps
        );
    }
    println!("\n✅ SAWIT minted for epoch {EPOCH}.");
}
