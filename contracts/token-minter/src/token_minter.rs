// Sawit Finance — TokenMinter Odra Contract
// =======================================
// Mints SAWIT tokens proportional to verified CPO production data.
// Reads epoch data from ProductionVault (passed as parameters, verified by caller).
//
// Minting Formula:
//   tokens_minted = tons_cpo × token_rate × (gorr_bps / 10,000)
//
// Example (June 2026):
//   45,000 tons × 1,000 × (500 / 10,000) = 2,250,000 SAWIT tokens
//
// GORR = Gross Overriding Royalty Rate: % of CPO revenue allocated to SAWIT holders.
// For a $1M raise against $1.5M/month revenue → ~67 bps GORR needed for 12% APY.
//
// Architecture:
//   ProductionVault (epoch verified) → TokenMinter → SawitToken (CEP-18 mint)
//   Investors (CSPR deposits) → TokenMinter → Pro-rata SAWIT allocation

use odra::prelude::*;
use odra::casper_types::U256;
use odra::ContractRef;
use sawit_token::sawit_token::SawitTokenContractRef;
use production_vault::production_vault::SawitProductionVaultContractRef;

#[odra::odra_type]
pub struct EpochMintRecord {
    pub epoch_number: u64,
    pub tons_cpo: u64,
    pub revenue_usd: u64,
    pub tokens_minted: U256,
    pub tokens_allocated: U256,
    pub token_rate: u64,
    pub gorr_bps: u32,
    pub epoch_timestamp: u64,
    pub minted_at: u64,
    pub is_fully_allocated: bool,
}

#[odra::odra_error]
pub enum MinterError {
    UnauthorizedAuthority = 1,
    MinterInactive = 2,
    EpochAlreadyMinted = 3,
    InvalidEpochData = 4,
    ZeroMintAmount = 5,
    ZeroAllocation = 6,
    InsufficientEpochTokens = 7,
    InvalidTokenRate = 8,
    InvalidGorrBps = 9,
    Overflow = 10,
}

#[odra::event]
pub struct EpochMinted {
    pub epoch_number: u64,
    pub tons_cpo: u64,
    pub tokens_minted: U256,
    pub token_rate: u64,
    pub gorr_bps: u32,
    pub timestamp: u64,
}

#[odra::event]
pub struct TokensAllocated {
    pub epoch_number: u64,
    pub investor: Address,
    pub tokens_allocated: U256,
    pub investor_deposit_cspr: u64,
    pub total_round_deposits_cspr: u64,
    pub timestamp: u64,
}

const DEFAULT_TOKEN_RATE: u64 = 1_000;       // 1,000 SAWIT tokens per ton CPO
const DEFAULT_GORR_BPS: u32 = 500;           // 5% GORR (500 basis points)
const MAX_GORR_BPS: u32 = 10_000;

#[odra::module(events = [EpochMinted, TokensAllocated], errors = MinterError)]
pub struct SawitMinter {
    authority: Var<Address>,
    sawit_token: Var<Address>,              // SawitToken contract address
    production_vault: Var<Address>,          // ProductionVault contract address
    token_rate: Var<u64>,                    // SAWIT tokens per ton CPO
    gorr_bps: Var<u32>,                      // Gross Overriding Royalty Rate (bps)
    total_tokens_minted: Var<U256>,
    total_epochs_minted: Var<u64>,
    last_minted_epoch: Var<u64>,
    is_active: Var<bool>,
    epoch_mints: Mapping<u64, EpochMintRecord>,
}

#[odra::module]
impl SawitMinter {
    pub fn init(
        &mut self,
        sawit_token: Address,
        production_vault: Address,
        token_rate: u64,
        gorr_bps: u32,
    ) {
        if gorr_bps > MAX_GORR_BPS {
            self.env().revert(MinterError::InvalidGorrBps)
        }

        let caller = self.env().caller();
        self.authority.set(caller);
        self.sawit_token.set(sawit_token);
        self.production_vault.set(production_vault);
        self.token_rate
            .set(if token_rate > 0 { token_rate } else { DEFAULT_TOKEN_RATE });
        self.gorr_bps
            .set(if gorr_bps > 0 { gorr_bps } else { DEFAULT_GORR_BPS });
        self.total_tokens_minted.set(U256::zero());
        self.total_epochs_minted.set(0u64);
        self.last_minted_epoch.set(0u64);
        self.is_active.set(true);
    }

    /// Mint SAWIT tokens for a verified CPO production epoch.
    ///
    /// The minter reads the epoch data **directly from ProductionVault via CPI** —
    /// it does NOT trust caller-supplied figures. This cryptographically links the
    /// minted amount to the oracle-verified, on-chain production record: the caller
    /// only chooses *which* epoch to mint and *where* the tokens go.
    ///
    /// Formula: tokens = tons_cpo × token_rate × gorr_bps / 10,000
    pub fn mint_epoch(
        &mut self,
        epoch_number: u64,
        allocation_pool: Address,    // Address that receives the freshly minted SAWIT
    ) {
        if !self.is_active.get_or_default() {
            self.env().revert(MinterError::MinterInactive)
        }
        self.assert_authority();

        if epoch_number <= self.last_minted_epoch.get_or_default() {
            self.env().revert(MinterError::EpochAlreadyMinted)
        }

        // CPI: pull the verified production record straight from ProductionVault.
        // Any epoch present there has already passed the oracle's validation gate.
        let vault_address = self.production_vault.get().unwrap();
        let epoch = SawitProductionVaultContractRef::new(self.env(), vault_address)
            .get_epoch(epoch_number)
            .unwrap_or_else(|| self.env().revert(MinterError::InvalidEpochData));

        let tons_cpo = epoch.tons_cpo;
        let revenue_usd = epoch.revenue_usd;
        let epoch_timestamp = epoch.epoch_timestamp;

        if tons_cpo == 0 {
            self.env().revert(MinterError::InvalidEpochData)
        }

        // tokens = tons_cpo × token_rate × gorr_bps / 10,000
        let token_rate = self.token_rate.get_or_default();
        let gorr_bps = self.gorr_bps.get_or_default();

        let tokens_to_mint = U256::from(tons_cpo)
            * U256::from(token_rate)
            * U256::from(gorr_bps)
            / U256::from(10_000u64);

        if tokens_to_mint == U256::zero() {
            self.env().revert(MinterError::ZeroMintAmount)
        }

        // Cross-contract call (CPI): actually mint SAWIT on the token contract.
        // SawitToken's `minter` must be set to this contract's address, so the
        // mint() call here passes SawitToken's authorization check.
        let token_address = self.sawit_token.get().unwrap();
        SawitTokenContractRef::new(self.env(), token_address)
            .mint(&allocation_pool, &tokens_to_mint, epoch_number);

        let record = EpochMintRecord {
            epoch_number,
            tons_cpo,
            revenue_usd,
            tokens_minted: tokens_to_mint,
            tokens_allocated: U256::zero(),
            token_rate,
            gorr_bps,
            epoch_timestamp,
            minted_at: self.env().get_block_time(),
            is_fully_allocated: false,
        };

        self.epoch_mints.set(&epoch_number, record);

        let new_total = self.total_tokens_minted.get_or_default() + tokens_to_mint;
        self.total_tokens_minted.set(new_total);
        self.total_epochs_minted
            .set(self.total_epochs_minted.get_or_default() + 1);
        self.last_minted_epoch.set(epoch_number);

        self.env().emit_event(EpochMinted {
            epoch_number,
            tons_cpo,
            tokens_minted: tokens_to_mint,
            token_rate,
            gorr_bps,
            timestamp: self.env().get_block_time(),
        });
    }

    /// Allocate minted SAWIT tokens to an investor proportional to their CSPR deposit.
    ///
    /// allocation = epoch_tokens × (investor_deposit / total_round_deposits)
    pub fn allocate_tokens(
        &mut self,
        epoch_number: u64,
        investor: Address,
        investor_deposit_cspr: u64,
        total_round_deposits_cspr: u64,
    ) {
        self.assert_authority();

        if total_round_deposits_cspr == 0 {
            self.env().revert(MinterError::InvalidEpochData)
        }

        let mut record = self
            .epoch_mints
            .get(&epoch_number)
            .unwrap_or_else(|| self.env().revert(MinterError::InvalidEpochData));

        if record.is_fully_allocated {
            self.env().revert(MinterError::InsufficientEpochTokens)
        }

        // allocation = tokens_minted × (investor_deposit / total_deposits)
        let allocation = record.tokens_minted
            * U256::from(investor_deposit_cspr)
            / U256::from(total_round_deposits_cspr);

        if allocation == U256::zero() {
            self.env().revert(MinterError::ZeroAllocation)
        }

        let remaining = record.tokens_minted - record.tokens_allocated;
        if allocation > remaining {
            self.env().revert(MinterError::InsufficientEpochTokens)
        }

        record.tokens_allocated = record.tokens_allocated + allocation;
        if record.tokens_allocated >= record.tokens_minted {
            record.is_fully_allocated = true;
        }
        self.epoch_mints.set(&epoch_number, record);

        self.env().emit_event(TokensAllocated {
            epoch_number,
            investor,
            tokens_allocated: allocation,
            investor_deposit_cspr,
            total_round_deposits_cspr,
            timestamp: self.env().get_block_time(),
        });
    }

    pub fn update_config(
        &mut self,
        new_token_rate: Option<u64>,
        new_gorr_bps: Option<u32>,
    ) {
        self.assert_authority();
        if let Some(rate) = new_token_rate {
            if rate == 0 {
                self.env().revert(MinterError::InvalidTokenRate)
            }
            self.token_rate.set(rate);
        }
        if let Some(bps) = new_gorr_bps {
            if bps > MAX_GORR_BPS {
                self.env().revert(MinterError::InvalidGorrBps)
            }
            self.gorr_bps.set(bps);
        }
    }

    // ─── VIEW FUNCTIONS ───

    pub fn get_epoch_mint(&self, epoch_number: u64) -> Option<EpochMintRecord> {
        self.epoch_mints.get(&epoch_number)
    }

    pub fn get_total_tokens_minted(&self) -> U256 {
        self.total_tokens_minted.get_or_default()
    }

    pub fn get_token_rate(&self) -> u64 {
        self.token_rate.get_or_default()
    }

    pub fn get_gorr_bps(&self) -> u32 {
        self.gorr_bps.get_or_default()
    }

    pub fn calculate_tokens(&self, tons_cpo: u64) -> U256 {
        let rate = self.token_rate.get_or_default();
        let bps = self.gorr_bps.get_or_default();
        U256::from(tons_cpo) * U256::from(rate) * U256::from(bps) / U256::from(10_000u64)
    }

    fn assert_authority(&self) {
        if self.env().caller() != self.authority.get().unwrap() {
            self.env().revert(MinterError::UnauthorizedAuthority)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};
    use sawit_token::sawit_token::{SawitToken, SawitTokenInitArgs, SawitTokenHostRef};
    use production_vault::production_vault::{
        SawitProductionVault, SawitProductionVaultInitArgs, SawitProductionVaultHostRef,
    };

    /// Deploy a wired ProductionVault + SawitToken + SawitMinter system.
    /// The token's `minter` is set to the minter contract so CPI mint() is authorized,
    /// and the minter reads verified epoch data from the vault.
    fn setup(env: &HostEnv) -> (SawitMinterHostRef, SawitTokenHostRef, SawitProductionVaultHostRef) {
        let oracle = env.get_account(1);

        // 1. ProductionVault — source of verified epoch data
        let vault = SawitProductionVault::deploy(env, SawitProductionVaultInitArgs {
            oracle_agent: oracle,
        });

        // 2. Token with a placeholder minter (account 0 = deployer/authority)
        let mut token = SawitToken::deploy(env, SawitTokenInitArgs {
            minter: env.get_account(0),
        });

        // 3. Minter pointing at the real token + vault contracts
        let minter = SawitMinter::deploy(env, SawitMinterInitArgs {
            sawit_token: token.address(),
            production_vault: vault.address(),
            token_rate: 1_000u64,
            gorr_bps: 500u32,
        });

        // 4. Wire: token now only accepts mint() from the minter contract
        token.set_minter(minter.address());

        (minter, token, vault)
    }

    /// Record a verified epoch in the vault (as the whitelisted oracle).
    fn record_epoch(env: &HostEnv, vault: &mut SawitProductionVaultHostRef) {
        let oracle = env.get_account(1);
        env.set_caller(oracle);
        vault.record_production(
            "Jun-26".to_string(),
            45_000,          // tons CPO
            37_125_000_00,   // revenue (cents)
            1_500,           // daily output ton
            22,              // OER %
            82_500,          // CPO price cents/ton
            12, 8, 88,       // estates, mills, validation score
            "GAPKI+KPBN+MPOB".to_string(),
            1_751_000_000_000u64,
        );
        env.set_caller(env.get_account(0)); // restore authority as caller
    }

    #[test]
    fn test_calculate_tokens() {
        let env = odra_test::env();
        let (minter, _token, _vault) = setup(&env);

        // 45,000 tons × 1,000 rate × 500 bps / 10,000 = 2,250,000 tokens
        let tokens = minter.calculate_tokens(45_000);
        assert_eq!(tokens, U256::from(2_250_000u64));
    }

    #[test]
    fn test_mint_epoch_reads_vault_and_mints() {
        let env = odra_test::env();
        let (mut minter, token, mut vault) = setup(&env);
        let pool = env.get_account(3);

        // Oracle records the verified epoch in the vault
        record_epoch(&env, &mut vault);

        // Pool holds nothing before minting
        assert_eq!(token.balance_of(&pool), U256::zero());

        // Caller only chooses the epoch + destination — figures come from the vault
        minter.mint_epoch(1u64, pool);

        // The minted amount is derived from the VAULT's verified tons_cpo (45,000)
        let record = minter.get_epoch_mint(1).unwrap();
        assert_eq!(record.tons_cpo, 45_000);
        assert_eq!(record.tokens_minted, U256::from(2_250_000u64));

        // CPI worked: the pool actually received SAWIT, supply increased
        assert_eq!(token.balance_of(&pool), U256::from(2_250_000u64));
        assert_eq!(token.total_supply(), U256::from(2_250_000u64));
    }

    #[test]
    fn test_mint_unknown_epoch_rejected() {
        let env = odra_test::env();
        let (mut minter, _token, _vault) = setup(&env);
        let pool = env.get_account(3);

        // No epoch recorded in the vault → minter cannot fabricate one
        let result = minter.try_mint_epoch(1u64, pool);
        assert!(result.is_err());
    }
}
