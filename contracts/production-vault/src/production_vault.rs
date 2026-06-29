// Sawit Finance — ProductionVault Odra Contract
// ==========================================
// On-chain contract that stores verified CPO (Crude Palm Oil) production data
// submitted by the AI Oracle Agent. Token holders can verify production data
// that backs their SAWIT tokens.
//
// Architecture:
//   AI Oracle Agent → record_production() → ProductionVault → SAWIT holders verify
//
// Key differences from oil wells:
//   - Barrels (BBL) → Metric tons of CPO (tons_cpo)
//   - WTI price → CPO benchmark price (KPBN/MPOB, per ton)
//   - BOED → Daily CPO output (ton/day)
//   - Oil Cut % → Oil Extraction Rate (OER %, typically 20-25%)
//   - Wells → Palm oil mills (PKS)
//   - Fields → Estates (kebun kelapa sawit)
//
// Oracle: AI Oracle Agent (Python) — scrapes GAPKI/KPBN/MPOB data,
//         verifies against multiple sources, posts on-chain via CSPR.cloud.
//         x402 micropayments used for each off-chain API call.

use odra::prelude::*;

#[odra::odra_type]
pub struct EpochRecord {
    pub epoch_number: u64,
    pub epoch_label: String,        // e.g., "Jun-26"
    pub tons_cpo: u64,              // Metric tons of CPO produced
    pub revenue_usd: u64,           // Revenue in USD (cents)
    pub daily_output_ton: u32,      // Average daily CPO output (ton/day)
    pub oer_pct: u8,                // Oil Extraction Rate % (typically 20-25)
    pub cpo_price_cents: u64,       // CPO benchmark price per ton (USD cents)
    pub estate_count: u8,           // Number of active palm oil estates
    pub active_mills: u8,           // Number of active PKS mills
    pub validation_score: u8,       // Oracle confidence score (0-100)
    pub data_source: String,        // e.g., "GAPKI+KPBN+MPOB"
    pub epoch_timestamp: u64,       // End-of-month timestamp (ms)
    pub recorded_at: u64,           // Block time when recorded
    pub oracle_agent: Address,      // Which AI agent submitted this
}

#[odra::odra_error]
pub enum VaultError {
    UnauthorizedAuthority = 1,
    UnauthorizedOracleAgent = 2,
    LowValidationScore = 3,
    DuplicateEpoch = 4,
    VaultInactive = 5,
    InvalidEpochData = 6,
}

#[odra::event]
pub struct ProductionRecorded {
    pub epoch_number: u64,
    pub epoch_label: String,
    pub tons_cpo: u64,
    pub revenue_usd: u64,
    pub cpo_price_cents: u64,
    pub validation_score: u8,
    pub oracle_agent: Address,
    pub timestamp: u64,
}

#[odra::event]
pub struct OracleAgentUpdated {
    pub old_agent: Address,
    pub new_agent: Address,
    pub timestamp: u64,
}

const MIN_VALIDATION_SCORE: u8 = 60;

#[odra::event]
pub struct OracleReputationUpdated {
    pub oracle_agent: Address,
    pub new_reputation_score: u8,
    pub total_submissions: u64,
    pub timestamp: u64,
}

#[odra::module(events = [ProductionRecorded, OracleAgentUpdated, OracleReputationUpdated], errors = VaultError)]
pub struct SawitProductionVault {
    authority: Var<Address>,
    oracle_agent: Var<Address>,         // Whitelisted AI Oracle Agent address
    epoch_count: Var<u64>,
    last_epoch_timestamp: Var<u64>,
    total_tons_cpo_all_time: Var<u64>,
    total_revenue_all_time: Var<u64>,
    is_active: Var<bool>,
    epochs: Mapping<u64, EpochRecord>,
    kyc_whitelist: Mapping<Address, bool>,
    // Oracle reputation: rolling average of validation scores across all submissions
    oracle_total_score: Var<u64>,       // Accumulated sum of all validation scores
    oracle_submission_count: Var<u64>,  // Total successful submissions by oracle
}

#[odra::module]
impl SawitProductionVault {
    pub fn init(&mut self, oracle_agent: Address) {
        let caller = self.env().caller();
        self.authority.set(caller);
        self.oracle_agent.set(oracle_agent);
        self.epoch_count.set(0u64);
        self.last_epoch_timestamp.set(0u64);
        self.total_tons_cpo_all_time.set(0u64);
        self.total_revenue_all_time.set(0u64);
        self.is_active.set(true);
        self.oracle_total_score.set(0u64);
        self.oracle_submission_count.set(0u64);
    }

    /// Record a new CPO production epoch. Only the whitelisted AI Oracle Agent can call this.
    /// The agent scrapes GAPKI/KPBN/MPOB data and calls this after cross-source verification.
    pub fn record_production(
        &mut self,
        epoch_label: String,
        tons_cpo: u64,
        revenue_usd: u64,
        daily_output_ton: u32,
        oer_pct: u8,
        cpo_price_cents: u64,
        estate_count: u8,
        active_mills: u8,
        validation_score: u8,
        data_source: String,
        epoch_timestamp: u64,
    ) {
        if !self.is_active.get_or_default() {
            self.env().revert(VaultError::VaultInactive)
        }

        let caller = self.env().caller();
        if caller != self.oracle_agent.get().unwrap() {
            self.env().revert(VaultError::UnauthorizedOracleAgent)
        }

        if validation_score < MIN_VALIDATION_SCORE {
            self.env().revert(VaultError::LowValidationScore)
        }

        if epoch_timestamp <= self.last_epoch_timestamp.get_or_default() {
            self.env().revert(VaultError::DuplicateEpoch)
        }

        if tons_cpo == 0 {
            self.env().revert(VaultError::InvalidEpochData)
        }

        let epoch_number = self.epoch_count.get_or_default() + 1;
        let now = self.env().get_block_time();

        let record = EpochRecord {
            epoch_number,
            epoch_label: epoch_label.clone(),
            tons_cpo,
            revenue_usd,
            daily_output_ton,
            oer_pct,
            cpo_price_cents,
            estate_count,
            active_mills,
            validation_score,
            data_source,
            epoch_timestamp,
            recorded_at: now,
            oracle_agent: caller,
        };

        self.epochs.set(&epoch_number, record);
        self.epoch_count.set(epoch_number);
        self.last_epoch_timestamp.set(epoch_timestamp);
        self.total_tons_cpo_all_time
            .set(self.total_tons_cpo_all_time.get_or_default() + tons_cpo);
        self.total_revenue_all_time
            .set(self.total_revenue_all_time.get_or_default() + revenue_usd);

        // Update oracle reputation: rolling average of validation scores
        let new_total_score = self.oracle_total_score.get_or_default() + validation_score as u64;
        let new_submission_count = self.oracle_submission_count.get_or_default() + 1;
        self.oracle_total_score.set(new_total_score);
        self.oracle_submission_count.set(new_submission_count);
        let reputation = (new_total_score / new_submission_count) as u8;

        self.env().emit_event(OracleReputationUpdated {
            oracle_agent: caller,
            new_reputation_score: reputation,
            total_submissions: new_submission_count,
            timestamp: now,
        });

        self.env().emit_event(ProductionRecorded {
            epoch_number,
            epoch_label,
            tons_cpo,
            revenue_usd,
            cpo_price_cents,
            validation_score,
            oracle_agent: caller,
            timestamp: now,
        });
    }

    /// Update the AI Oracle Agent address. Only authority can call.
    pub fn update_oracle_agent(&mut self, new_agent: Address) {
        self.assert_authority();
        let old_agent = self.oracle_agent.get().unwrap();
        self.oracle_agent.set(new_agent);
        self.env().emit_event(OracleAgentUpdated {
            old_agent,
            new_agent,
            timestamp: self.env().get_block_time(),
        });
    }

    /// Register an investor as KYC-verified. Only authority can call.
    pub fn register_kyc(&mut self, investor: Address) {
        self.assert_authority();
        self.kyc_whitelist.set(&investor, true);
    }

    /// Revoke KYC for an investor. Only authority can call.
    pub fn revoke_kyc(&mut self, investor: Address) {
        self.assert_authority();
        self.kyc_whitelist.set(&investor, false);
    }

    pub fn set_active(&mut self, active: bool) {
        self.assert_authority();
        self.is_active.set(active);
    }

    // ─── VIEW FUNCTIONS ───

    pub fn get_epoch(&self, epoch_number: u64) -> Option<EpochRecord> {
        self.epochs.get(&epoch_number)
    }

    pub fn get_epoch_count(&self) -> u64 {
        self.epoch_count.get_or_default()
    }

    pub fn get_total_tons_cpo(&self) -> u64 {
        self.total_tons_cpo_all_time.get_or_default()
    }

    pub fn get_total_revenue(&self) -> u64 {
        self.total_revenue_all_time.get_or_default()
    }

    pub fn is_kyc_verified(&self, investor: &Address) -> bool {
        self.kyc_whitelist.get_or_default(investor)
    }

    pub fn get_oracle_agent(&self) -> Address {
        self.oracle_agent.get().unwrap()
    }

    pub fn get_authority(&self) -> Address {
        self.authority.get().unwrap()
    }

    /// Returns the oracle's on-chain reputation score (0-100).
    /// Computed as rolling average of validation scores across all successful submissions.
    /// A score ≥80 indicates a highly reliable oracle agent.
    pub fn get_oracle_reputation(&self) -> u8 {
        let count = self.oracle_submission_count.get_or_default();
        if count == 0 {
            return 0;
        }
        (self.oracle_total_score.get_or_default() / count) as u8
    }

    pub fn get_oracle_submission_count(&self) -> u64 {
        self.oracle_submission_count.get_or_default()
    }

    // ─── INTERNAL ───

    fn assert_authority(&self) {
        if self.env().caller() != self.authority.get().unwrap() {
            self.env().revert(VaultError::UnauthorizedAuthority)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    fn setup(env: &HostEnv) -> SawitProductionVaultHostRef {
        let oracle = env.get_account(1);
        SawitProductionVault::deploy(env, SawitProductionVaultInitArgs {
            oracle_agent: oracle,
        })
    }

    #[test]
    fn test_init() {
        let env = odra_test::env();
        let vault = setup(&env);
        assert_eq!(vault.get_epoch_count(), 0);
        assert_eq!(vault.get_total_tons_cpo(), 0);
    }

    #[test]
    fn test_record_production() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        env.set_caller(oracle);
        vault.record_production(
            "Jun-26".to_string(),
            45_000,               // 45,000 tons CPO
            36_000_000,           // $360,000 revenue (cents)
            1_500,                // 1,500 ton/day
            22,                   // 22% OER
            80_000,               // $800/ton CPO price (cents)
            12,                   // 12 estates
            8,                    // 8 active mills
            85,                   // 85% validation score
            "GAPKI+KPBN".to_string(),
            1_751_000_000_000u64, // timestamp ms
        );

        assert_eq!(vault.get_epoch_count(), 1);
        assert_eq!(vault.get_total_tons_cpo(), 45_000);

        let epoch = vault.get_epoch(1).unwrap();
        assert_eq!(epoch.tons_cpo, 45_000);
        assert_eq!(epoch.oer_pct, 22);
        assert_eq!(epoch.active_mills, 8);
    }

    #[test]
    fn test_oracle_reputation_accumulates() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        assert_eq!(vault.get_oracle_reputation(), 0);
        assert_eq!(vault.get_oracle_submission_count(), 0);

        env.set_caller(oracle);
        // First submission: score 80
        vault.record_production(
            "May-26".to_string(), 40_000, 32_000_000, 1_300, 22, 80_000,
            10, 7, 80, "GAPKI+KPBN".to_string(), 1_748_000_000_000u64,
        );
        assert_eq!(vault.get_oracle_reputation(), 80);
        assert_eq!(vault.get_oracle_submission_count(), 1);

        // Second submission: score 90 → avg = (80+90)/2 = 85
        vault.record_production(
            "Jun-26".to_string(), 45_000, 36_000_000, 1_500, 22, 80_000,
            12, 8, 90, "GAPKI+KPBN+MPOB".to_string(), 1_751_000_000_000u64,
        );
        assert_eq!(vault.get_oracle_reputation(), 85);
        assert_eq!(vault.get_oracle_submission_count(), 2);
    }

    #[test]
    fn test_unauthorized_oracle_rejected() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let attacker = env.get_account(2);

        env.set_caller(attacker);
        let result = vault.try_record_production(
            "Jun-26".to_string(),
            45_000, 36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI".to_string(), 1_751_000_000_000u64,
        );
        assert!(result.is_err());
    }
}
