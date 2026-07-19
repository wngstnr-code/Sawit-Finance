
#[cfg(not(feature = "livenet"))]
fn main() {
    eprintln!("This binary requires the livenet backend.");
    std::process::exit(1);
}

#[cfg(feature = "livenet")]
fn main() {
    use core::str::FromStr;
    use odra::host::HostRefLoader;
    use odra::prelude::Address;
    use production_vault::production_vault::SawitProductionVault;

    const VAULT: &str = "hash-0b860c574e7b7cd6969a33dd57992fc6efedd503473b44e1c9309f1c8455e365";

    let raw = match std::env::var("KYC_ACCOUNT") {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => {
            println!("KYC_ERR {{\"reason\":\"KYC_ACCOUNT (account-hash-<hex> or bare hex) is required\"}}");
            std::process::exit(1);
        }
    };

    let hex_part = raw
        .strip_prefix("account-hash-")
        .unwrap_or(raw.as_str())
        .to_lowercase();

    if hex_part.len() != 64 || !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        println!(
            "KYC_ERR {{\"reason\":\"KYC_ACCOUNT must be a 64-char hex account hash\"}}"
        );
        std::process::exit(1);
    }

    let formatted = format!("account-hash-{hex_part}");
    let addr = match Address::from_str(&formatted) {
        Ok(a) => a,
        Err(_) => {
            println!("KYC_ERR {{\"reason\":\"invalid account hash\"}}");
            std::process::exit(1);
        }
    };

    let env = odra_casper_livenet_env::env();
    let mut vault = SawitProductionVault::load(&env, Address::new(VAULT).unwrap());

    if vault.is_kyc_verified(&addr) {
        println!(
            "KYC_OK {{\"account\":\"{hex_part}\",\"verified\":true,\"already\":true}}"
        );
        return;
    }

    println!("register_kyc({hex_part})...");
    env.set_gas(5_000_000_000);
    vault.register_kyc(addr);

    println!(
        "KYC_OK {{\"account\":\"{hex_part}\",\"verified\":true,\"already\":false}}"
    );
}
