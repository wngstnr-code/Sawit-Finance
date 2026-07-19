
use odra::prelude::*;

#[odra::odra_type]
pub struct EpochRecord {
    pub epoch_number: u64,
    pub epoch_label: String,
    pub tons_cpo: u64,
    pub revenue_usd: u64,
    pub daily_output_ton: u32,
    pub oer_pct: u8,
    pub cpo_price_cents: u64,
    pub estate_count: u8,
    pub active_mills: u8,
    pub validation_score: u8,
    pub data_source: String,
    pub epoch_timestamp: u64,
    pub recorded_at: u64,
    pub oracle_agent: Address,
}

#[odra::odra_error]
pub enum VaultError {
    UnauthorizedAuthority = 1,
    UnauthorizedOracleAgent = 2,
    LowValidationScore = 3,
    DuplicateEpoch = 4,
    VaultInactive = 5,
    InvalidEpochData = 6,
    // New variants must always be appended at the end — the contract is
    // upgradable in-place and existing error codes must never shift, or
    // already-integrated tooling/tests would misinterpret reverts.
    TonsExceedsLimit = 7,
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

#[odra::event]
pub struct MaxTonsPerEpochUpdated {
    pub old_max_tons: u64,
    pub new_max_tons: u64,
    pub timestamp: u64,
}

const MIN_VALIDATION_SCORE: u8 = 60;

// Conservative ceiling on tons_cpo accepted in a single record_production
// call, guarding against an oracle key typo/compromise minting a 10x+
// dilution event. Applies whenever max_tons_per_epoch has not been
// explicitly configured (Var unset reads as 0 via get_or_default).
const DEFAULT_MAX_TONS_PER_EPOCH: u64 = 100_000;

#[odra::event]
pub struct OracleReputationUpdated {
    pub oracle_agent: Address,
    pub new_reputation_score: u8,
    pub total_submissions: u64,
    pub timestamp: u64,
}

#[odra::event]
pub struct KycRegistered {
    pub investor: Address,
    pub timestamp: u64,
}

#[odra::event]
pub struct KycRevoked {
    pub investor: Address,
    pub timestamp: u64,
}

#[odra::module(events = [ProductionRecorded, OracleAgentUpdated, OracleReputationUpdated, KycRegistered, KycRevoked, MaxTonsPerEpochUpdated], errors = VaultError)]
pub struct SawitProductionVault {
    authority: Var<Address>,
    oracle_agent: Var<Address>,
    epoch_count: Var<u64>,
    last_epoch_timestamp: Var<u64>,
    total_tons_cpo_all_time: Var<u64>,
    total_revenue_all_time: Var<u64>,
    is_active: Var<bool>,
    epochs: Mapping<u64, EpochRecord>,
    kyc_whitelist: Mapping<Address, bool>,
    oracle_total_score: Var<u64>,
    oracle_submission_count: Var<u64>,
    // Appended field: unset (reads as 0 via get_or_default) on epochs/vaults
    // deployed before this upgrade — max_tons_per_epoch() falls back to
    // DEFAULT_MAX_TONS_PER_EPOCH in that case, so the guard is active
    // immediately after upgrade without requiring an operator call.
    max_tons_per_epoch: Var<u64>,
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
        self.max_tons_per_epoch.set(DEFAULT_MAX_TONS_PER_EPOCH);
    }

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

        if tons_cpo > self.max_tons_per_epoch_or_default() {
            self.env().revert(VaultError::TonsExceedsLimit)
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

    pub fn register_kyc(&mut self, investor: Address) {
        self.assert_authority();
        self.kyc_whitelist.set(&investor, true);
        self.env().emit_event(KycRegistered {
            investor,
            timestamp: self.env().get_block_time(),
        });
    }

    pub fn revoke_kyc(&mut self, investor: Address) {
        self.assert_authority();
        self.kyc_whitelist.set(&investor, false);
        self.env().emit_event(KycRevoked {
            investor,
            timestamp: self.env().get_block_time(),
        });
    }

    pub fn set_active(&mut self, active: bool) {
        self.assert_authority();
        self.is_active.set(active);
    }

    pub fn set_max_tons_per_epoch(&mut self, max_tons: u64) {
        self.assert_authority();
        if max_tons == 0 {
            self.env().revert(VaultError::InvalidEpochData)
        }
        let old_max_tons = self.max_tons_per_epoch_or_default();
        self.max_tons_per_epoch.set(max_tons);
        self.env().emit_event(MaxTonsPerEpochUpdated {
            old_max_tons,
            new_max_tons: max_tons,
            timestamp: self.env().get_block_time(),
        });
    }

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

    pub fn get_max_tons_per_epoch(&self) -> u64 {
        self.max_tons_per_epoch_or_default()
    }

    fn max_tons_per_epoch_or_default(&self) -> u64 {
        let stored = self.max_tons_per_epoch.get_or_default();
        if stored == 0 {
            DEFAULT_MAX_TONS_PER_EPOCH
        } else {
            stored
        }
    }

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
            45_000,
            36_000_000,
            1_500,
            22,
            80_000,
            12,
            8,
            85,
            "GAPKI+KPBN".to_string(),
            1_751_000_000_000u64,
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
        vault.record_production(
            "May-26".to_string(), 40_000, 32_000_000, 1_300, 22, 80_000,
            10, 7, 80, "GAPKI+KPBN".to_string(), 1_748_000_000_000u64,
        );
        assert_eq!(vault.get_oracle_reputation(), 80);
        assert_eq!(vault.get_oracle_submission_count(), 1);

        vault.record_production(
            "Jun-26".to_string(), 45_000, 36_000_000, 1_500, 22, 80_000,
            12, 8, 90, "GAPKI+KPBN+MPOB".to_string(), 1_751_000_000_000u64,
        );
        assert_eq!(vault.get_oracle_reputation(), 85);
        assert_eq!(vault.get_oracle_submission_count(), 2);
    }

    #[test]
    fn test_revoke_kyc_unverifies_holder() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let investor = env.get_account(2);

        vault.register_kyc(investor);
        assert!(vault.is_kyc_verified(&investor));

        vault.revoke_kyc(investor);
        assert!(!vault.is_kyc_verified(&investor));
    }

    #[test]
    fn test_update_oracle_agent_swaps_authorization() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let old_oracle = env.get_account(1);
        let new_oracle = env.get_account(4);

        vault.update_oracle_agent(new_oracle);
        assert_eq!(vault.get_oracle_agent(), new_oracle);

        // Old agent can no longer record production.
        env.set_caller(old_oracle);
        let rejected = vault.try_record_production(
            "Jun-26".to_string(),
            45_000, 36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert!(rejected.is_err());

        // New agent can record production.
        env.set_caller(new_oracle);
        vault.record_production(
            "Jun-26".to_string(),
            45_000, 36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert_eq!(vault.get_epoch_count(), 1);
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

    #[test]
    fn test_record_production_within_max_tons_ok() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        assert_eq!(vault.get_max_tons_per_epoch(), 100_000);

        env.set_caller(oracle);
        vault.record_production(
            "Jun-26".to_string(),
            100_000,
            36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert_eq!(vault.get_epoch_count(), 1);
        assert_eq!(vault.get_total_tons_cpo(), 100_000);
    }

    #[test]
    fn test_record_production_over_max_tons_rejected() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        env.set_caller(oracle);
        let result = vault.try_record_production(
            "Jun-26".to_string(),
            100_001,
            36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert!(result.is_err());
        assert_eq!(vault.get_epoch_count(), 0);
    }

    #[test]
    fn test_set_max_tons_per_epoch_non_authority_rejected() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let attacker = env.get_account(2);

        env.set_caller(attacker);
        let result = vault.try_set_max_tons_per_epoch(50_000);
        assert!(result.is_err());
        assert_eq!(vault.get_max_tons_per_epoch(), 100_000);
    }

    #[test]
    fn test_set_max_tons_per_epoch_authority_updates_bound() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        vault.set_max_tons_per_epoch(50_000);
        assert_eq!(vault.get_max_tons_per_epoch(), 50_000);

        env.set_caller(oracle);
        let rejected = vault.try_record_production(
            "Jun-26".to_string(),
            50_001,
            36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert!(rejected.is_err());
    }

    #[test]
    fn test_set_max_tons_per_epoch_rejects_zero() {
        let env = odra_test::env();
        let mut vault = setup(&env);

        let result = vault.try_set_max_tons_per_epoch(0);
        assert!(result.is_err());
        assert_eq!(vault.get_max_tons_per_epoch(), 100_000);
    }

    #[test]
    fn test_set_active_false_blocks_record_production() {
        let env = odra_test::env();
        let mut vault = setup(&env);
        let oracle = env.get_account(1);

        vault.set_active(false);

        env.set_caller(oracle);
        let result = vault.try_record_production(
            "Jun-26".to_string(),
            45_000, 36_000_000, 1_500, 22, 80_000, 12, 8, 85,
            "GAPKI+KPBN".to_string(), 1_751_000_000_000u64,
        );
        assert!(result.is_err());
        assert_eq!(vault.get_epoch_count(), 0);
    }
}
