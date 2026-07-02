
use odra::prelude::*;
use odra::casper_types::U512;
use odra::ContractRef;
use production_vault::production_vault::SawitProductionVaultContractRef;

#[odra::odra_type]
pub struct DistributionEpoch {
    pub epoch_number: u64,
    pub epoch_label: String,
    pub total_distribution_cspr: U512,
    pub total_claimed_cspr: U512,
    pub total_eligible_holders: u64,
    pub claims_count: u64,
    pub created_at: u64,
    pub claim_deadline: u64,
    pub is_funded: bool,
    pub is_swept: bool,
    pub cpo_trigger_price_cents: u64,
}

#[odra::odra_error]
pub enum DistError {
    UnauthorizedAuthority = 1,
    UnauthorizedYieldRouter = 2,
    DistributorInactive = 3,
    EpochNotFound = 4,
    EpochNotFunded = 5,
    EpochAlreadySwept = 6,
    ClaimWindowExpired = 7,
    ClaimWindowNotExpired = 8,
    AlreadyClaimed = 9,
    NothingToClaim = 10,
    Overflow = 11,
    NotKycVerified = 12,
}

#[odra::event]
pub struct EpochCreated {
    pub epoch_number: u64,
    pub total_distribution_cspr: U512,
    pub total_eligible_holders: u64,
    pub claim_deadline: u64,
    pub cpo_trigger_price_cents: u64,
    pub timestamp: u64,
}

#[odra::event]
pub struct YieldClaimed {
    pub epoch_number: u64,
    pub holder: Address,
    pub amount_cspr: U512,
    pub timestamp: u64,
}

#[odra::event]
pub struct EpochSwept {
    pub epoch_number: u64,
    pub total_claimed: U512,
    pub unclaimed_swept: U512,
    pub timestamp: u64,
}

const DEFAULT_CLAIM_WINDOW: u64 = 7_776_000_000u64;

#[odra::module(events = [EpochCreated, YieldClaimed, EpochSwept], errors = DistError)]
pub struct SawitYieldDistributor {
    authority: Var<Address>,
    yield_router: Var<Address>,
    production_vault: Var<Address>,
    current_epoch: Var<u64>,
    claim_window_ms: Var<u64>,
    total_distributed_all_time: Var<U512>,
    total_claimed_all_time: Var<U512>,
    is_active: Var<bool>,
    epochs: Mapping<u64, DistributionEpoch>,
    claimable: Mapping<(u64, Address), U512>,
    claimed: Mapping<(u64, Address), bool>,
}

#[odra::module]
impl SawitYieldDistributor {
    pub fn init(&mut self, yield_router: Address, production_vault: Address) {
        let caller = self.env().caller();
        self.authority.set(caller);
        self.yield_router.set(yield_router);
        self.production_vault.set(production_vault);
        self.current_epoch.set(0u64);
        self.claim_window_ms.set(DEFAULT_CLAIM_WINDOW);
        self.total_distributed_all_time.set(U512::zero());
        self.total_claimed_all_time.set(U512::zero());
        self.is_active.set(true);
    }

    pub fn create_epoch(
        &mut self,
        epoch_label: String,
        total_distribution_cspr: U512,
        total_eligible_holders: u64,
        cpo_trigger_price_cents: u64,
    ) {
        if !self.is_active.get_or_default() {
            self.env().revert(DistError::DistributorInactive)
        }
        let caller = self.env().caller();
        if caller != self.authority.get().unwrap()
            && caller != self.yield_router.get().unwrap()
        {
            self.env().revert(DistError::UnauthorizedYieldRouter)
        }

        let epoch_number = self.current_epoch.get_or_default() + 1;
        let now = self.env().get_block_time();
        let claim_deadline = now + self.claim_window_ms.get_or_default();

        let epoch = DistributionEpoch {
            epoch_number,
            epoch_label,
            total_distribution_cspr,
            total_claimed_cspr: U512::zero(),
            total_eligible_holders,
            claims_count: 0,
            created_at: now,
            claim_deadline,
            is_funded: false,
            is_swept: false,
            cpo_trigger_price_cents,
        };

        self.epochs.set(&epoch_number, epoch);
        self.current_epoch.set(epoch_number);

        self.env().emit_event(EpochCreated {
            epoch_number,
            total_distribution_cspr,
            total_eligible_holders,
            claim_deadline,
            cpo_trigger_price_cents,
            timestamp: now,
        });
    }

    pub fn set_claimable(
        &mut self,
        epoch_number: u64,
        holder: Address,
        amount_cspr: U512,
    ) {
        self.assert_authority();
        self.claimable.set(&(epoch_number, holder), amount_cspr);
    }

    pub fn set_claimable_batch(
        &mut self,
        epoch_number: u64,
        holders: Vec<Address>,
        amounts: Vec<U512>,
    ) {
        self.assert_authority();
        for (holder, amount) in holders.into_iter().zip(amounts.into_iter()) {
            self.claimable.set(&(epoch_number, holder), amount);
        }
    }

    #[odra(payable)]
    pub fn fund_epoch(&mut self, epoch_number: u64) {
        self.assert_authority();
        let mut epoch = self.get_epoch_or_revert(epoch_number);
        epoch.is_funded = true;
        self.epochs.set(&epoch_number, epoch);
    }

    pub fn claim_yield(&mut self, epoch_number: u64) {
        if !self.is_active.get_or_default() {
            self.env().revert(DistError::DistributorInactive)
        }

        let holder = self.env().caller();
        let now = self.env().get_block_time();

        let vault = self.production_vault.get().unwrap();
        if !SawitProductionVaultContractRef::new(self.env(), vault).is_kyc_verified(&holder) {
            self.env().revert(DistError::NotKycVerified)
        }

        let mut epoch = self.get_epoch_or_revert(epoch_number);

        if !epoch.is_funded {
            self.env().revert(DistError::EpochNotFunded)
        }
        if epoch.is_swept {
            self.env().revert(DistError::EpochAlreadySwept)
        }
        if now > epoch.claim_deadline {
            self.env().revert(DistError::ClaimWindowExpired)
        }

        if self.claimed.get_or_default(&(epoch_number, holder)) {
            self.env().revert(DistError::AlreadyClaimed)
        }

        let claimable_amount = self
            .claimable
            .get_or_default(&(epoch_number, holder));

        if claimable_amount == U512::zero() {
            self.env().revert(DistError::NothingToClaim)
        }

        self.claimed.set(&(epoch_number, holder), true);
        epoch.total_claimed_cspr = epoch.total_claimed_cspr + claimable_amount;
        epoch.claims_count += 1;
        self.epochs.set(&epoch_number, epoch);

        self.env().transfer_tokens(&holder, &claimable_amount);

        self.total_claimed_all_time.set(
            self.total_claimed_all_time.get_or_default() + claimable_amount,
        );

        self.env().emit_event(YieldClaimed {
            epoch_number,
            holder,
            amount_cspr: claimable_amount,
            timestamp: now,
        });
    }

    pub fn sweep_unclaimed(&mut self, epoch_number: u64) {
        self.assert_authority();

        let mut epoch = self.get_epoch_or_revert(epoch_number);

        if epoch.is_swept {
            self.env().revert(DistError::EpochAlreadySwept)
        }
        if self.env().get_block_time() <= epoch.claim_deadline {
            self.env().revert(DistError::ClaimWindowNotExpired)
        }

        let unclaimed = epoch.total_distribution_cspr - epoch.total_claimed_cspr;
        epoch.is_swept = true;
        self.epochs.set(&epoch_number, epoch.clone());

        let new_total = self.total_distributed_all_time.get_or_default()
            + epoch.total_claimed_cspr;
        self.total_distributed_all_time.set(new_total);

        self.env().emit_event(EpochSwept {
            epoch_number,
            total_claimed: epoch.total_claimed_cspr,
            unclaimed_swept: unclaimed,
            timestamp: self.env().get_block_time(),
        });
    }

    pub fn update_yield_router(&mut self, new_router: Address) {
        self.assert_authority();
        self.yield_router.set(new_router);
    }

    pub fn get_epoch(&self, epoch_number: u64) -> Option<DistributionEpoch> {
        self.epochs.get(&epoch_number)
    }

    pub fn get_claimable(&self, epoch_number: u64, holder: &Address) -> U512 {
        self.claimable.get_or_default(&(epoch_number, *holder))
    }

    pub fn has_claimed(&self, epoch_number: u64, holder: &Address) -> bool {
        self.claimed.get_or_default(&(epoch_number, *holder))
    }

    pub fn get_current_epoch(&self) -> u64 {
        self.current_epoch.get_or_default()
    }

    pub fn get_total_distributed(&self) -> U512 {
        self.total_distributed_all_time.get_or_default()
    }

    pub fn get_yield_router(&self) -> Address {
        self.yield_router.get().unwrap()
    }

    pub fn get_production_vault(&self) -> Address {
        self.production_vault.get().unwrap()
    }

    fn get_epoch_or_revert(&self, epoch_number: u64) -> DistributionEpoch {
        self.epochs
            .get(&epoch_number)
            .unwrap_or_else(|| self.env().revert(DistError::EpochNotFound))
    }

    fn assert_authority(&self) {
        if self.env().caller() != self.authority.get().unwrap() {
            self.env().revert(DistError::UnauthorizedAuthority)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv, HostRef};
    use production_vault::production_vault::{
        SawitProductionVault, SawitProductionVaultInitArgs, SawitProductionVaultHostRef,
    };

    fn setup(env: &HostEnv) -> (SawitYieldDistributorHostRef, SawitProductionVaultHostRef) {
        let router = env.get_account(1);
        let oracle = env.get_account(5);

        let vault = SawitProductionVault::deploy(env, SawitProductionVaultInitArgs {
            oracle_agent: oracle,
        });

        let dist = SawitYieldDistributor::deploy(env, SawitYieldDistributorInitArgs {
            yield_router: router,
            production_vault: vault.address(),
        });

        (dist, vault)
    }

    #[test]
    fn test_init() {
        let env = odra_test::env();
        let (dist, _vault) = setup(&env);
        assert_eq!(dist.get_current_epoch(), 0);
    }

    #[test]
    fn test_create_epoch() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            100u64,
            85_000u64,
        );

        assert_eq!(dist.get_current_epoch(), 1);
        let epoch = dist.get_epoch(1).unwrap();
        assert_eq!(epoch.total_eligible_holders, 100);
        assert!(!epoch.is_funded);
    }

    #[test]
    fn test_kyc_holder_can_claim() {
        let env = odra_test::env();
        let (mut dist, mut vault) = setup(&env);
        let holder = env.get_account(2);

        vault.register_kyc(holder);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        dist.set_claimable(1u64, holder, U512::from(1_000_000_000u64));
        dist.with_tokens(U512::from(5_000_000_000u64)).fund_epoch(1u64);

        env.set_caller(holder);
        dist.claim_yield(1u64);

        assert!(dist.has_claimed(1u64, &holder));
    }

    #[test]
    fn test_non_kyc_holder_rejected() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let holder = env.get_account(2);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        dist.set_claimable(1u64, holder, U512::from(1_000_000_000u64));
        dist.with_tokens(U512::from(5_000_000_000u64)).fund_epoch(1u64);

        env.set_caller(holder);
        let result = dist.try_claim_yield(1u64);

        assert!(result.is_err());
        assert!(!dist.has_claimed(1u64, &holder));
    }
}
