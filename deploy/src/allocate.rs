
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    eprintln!("Run:  cargo run -p sawit-deploy --bin allocate --features livenet");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::casper_types::U256;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use sawit_token::sawit_token::SawitToken;
    use token_minter::token_minter::SawitMinter;

    const MINTER: &str = "hash-cb3b96b8cdb987178db0353ef6a713a7d888a4256f59702243187982358d8e06";
    const TOKEN: &str = "hash-579f3197493048529a56ea3887721c4bd027e3fad6755644f19446b4c9205a47";

    fn err_exit(reason: &str, extra: &str) -> ! {
        eprintln!("ALLOCATE_ERR {{\"reason\":\"{reason}\"{extra}}}");
        std::process::exit(1);
    }

    let epoch: u64 = std::env::var("ALLOC_EPOCH")
        .ok()
        .and_then(|v| v.parse().ok())
        .expect("ALLOC_EPOCH (u64) is required");

    let investor_raw =
        std::env::var("ALLOC_INVESTOR").expect("ALLOC_INVESTOR (account-hash-<hex>) is required");
    let investor_str = if investor_raw.starts_with("account-hash-") {
        investor_raw.clone()
    } else {
        format!("account-hash-{investor_raw}")
    };
    let investor = Address::from_str(&investor_str).expect("valid account-hash");

    let deposit_cspr: u64 = std::env::var("ALLOC_DEPOSIT_CSPR")
        .ok()
        .and_then(|v| v.parse().ok())
        .expect("ALLOC_DEPOSIT_CSPR (u64) is required");

    let price_cspr: u64 = std::env::var("ALLOC_PRICE_CSPR")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    let env = odra_casper_livenet_env::env();
    let deployer = env.get_account(0);
    println!("Authority/pool account: {:?}", deployer);

    let mut minter = SawitMinter::load(&env, Address::new(MINTER).unwrap());
    let mut token = SawitToken::load(&env, Address::new(TOKEN).unwrap());

    let record = match minter.get_epoch_mint(epoch) {
        Some(r) => r,
        None => err_exit("epoch_not_minted", &format!(",\"epoch\":{epoch}")),
    };

    println!(
        "Epoch {epoch} mint record: tokens_minted={} tokens_allocated={} is_fully_allocated={}",
        record.tokens_minted, record.tokens_allocated, record.is_fully_allocated
    );

    // total_round_deposits_cspr = tokens_minted * price_cspr, must fit u64
    // (matches the on-chain divisor semantics: allocation = tokens_minted * deposit / total_round)
    let tokens_minted_u64: u64 = record
        .tokens_minted
        .try_into()
        .unwrap_or_else(|_| err_exit("tokens_minted_overflow", ""));
    let total_round_u64: u64 = tokens_minted_u64
        .checked_mul(price_cspr)
        .unwrap_or_else(|| err_exit("total_round_overflow", ""));

    let total_round: U256 = U256::from(total_round_u64);
    let allocation: U256 =
        record.tokens_minted * U256::from(deposit_cspr) / total_round;

    if allocation.is_zero() {
        err_exit("zero_allocation", "");
    }

    let remaining = record.tokens_minted - record.tokens_allocated;
    if allocation > remaining || record.is_fully_allocated {
        err_exit("epoch_exhausted", "");
    }

    println!(
        "\nCalling TokenMinter.allocate_tokens({epoch}, investor, {deposit_cspr}, {total_round_u64})..."
    );
    env.set_gas(10_000_000_000);
    minter.allocate_tokens(epoch, investor, deposit_cspr, total_round_u64);

    println!("\nTransferring {allocation} SAWIT to investor...");
    env.set_gas(8_000_000_000);
    token.transfer(&investor, &allocation);

    println!(
        "ALLOCATE_OK {{\"epoch\":{epoch},\"investor\":\"{investor_str}\",\"deposit_cspr\":{deposit_cspr},\"price_cspr\":{price_cspr},\"allocation\":\"{allocation}\"}}"
    );
    println!("\n✅ Allocated {allocation} SAWIT to {investor_str} for epoch {epoch}.");
}
