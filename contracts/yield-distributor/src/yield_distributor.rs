
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
    ClaimableExceedsPool = 13,
    InvalidClaimWindow = 14,
    // New variants must always be appended at the end — the contract is
    // upgradable in-place and existing error codes (notably 13) must never
    // shift, or already-integrated tooling/tests would misinterpret reverts.
    BatchLengthMismatch = 15,
    OverfundsPool = 16,
    EpochAlreadyFunded = 17,
    PoolBelowCommitted = 18,
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

#[odra::event]
pub struct EpochFunded {
    pub epoch_number: u64,
    pub amount_cspr: U512,
    pub cumulative_funded_cspr: U512,
    pub is_fully_funded: bool,
    pub timestamp: u64,
}

#[odra::event]
pub struct ClaimWindowUpdated {
    pub window_ms: u64,
}

#[odra::event]
pub struct EpochResized {
    pub epoch_number: u64,
    pub old_pool_cspr: U512,
    pub new_pool_cspr: U512,
    pub funded_cspr: U512,
    pub is_fully_funded: bool,
    pub timestamp: u64,
}

// 30 days, in milliseconds. Applies to epochs created from now on; already
// stored epochs keep their previously computed claim_deadline untouched.
const DEFAULT_CLAIM_WINDOW: u64 = 2_592_000_000u64;

#[odra::module(events = [EpochCreated, YieldClaimed, EpochSwept, EpochFunded, ClaimWindowUpdated, EpochResized], errors = DistError)]
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
    // Sum of claimable amounts currently set per epoch, so allocations can be
    // capped at the epoch's funded pool. Note: entries set before the cap was
    // introduced (pre-upgrade) are not reflected here — the cap protects every
    // allocation made from the upgrade onwards.
    claimable_total: Mapping<u64, U512>,
    // Cumulative CSPR actually deposited into an epoch via fund_epoch, so
    // funding can arrive in multiple top-up payments and only flips the
    // stored `is_funded` flag once the pool is fully covered. Appended
    // field: legacy epochs 1-3 funded before this upgrade have no entry
    // here (reads as zero) — their solvency is governed entirely by the
    // already-stored `is_funded` flag, which this module keeps reading and
    // writing everywhere else for backward compatibility.
    funded_amount: Mapping<u64, U512>,
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
        let epoch = self.get_epoch_or_revert(epoch_number);
        let old = self.claimable.get_or_default(&(epoch_number, holder));
        let prev_total = self.claimable_total.get_or_default(&epoch_number);
        // Saturating: pre-cap entries may exist that this counter never saw.
        let new_total =
            if prev_total > old { prev_total - old } else { U512::zero() } + amount_cspr;
        if new_total > epoch.total_distribution_cspr {
            self.env().revert(DistError::ClaimableExceedsPool)
        }
        self.claimable.set(&(epoch_number, holder), amount_cspr);
        self.claimable_total.set(&epoch_number, new_total);
    }

    pub fn set_claimable_batch(
        &mut self,
        epoch_number: u64,
        holders: Vec<Address>,
        amounts: Vec<U512>,
    ) {
        self.assert_authority();
        if holders.len() != amounts.len() {
            self.env().revert(DistError::BatchLengthMismatch)
        }
        let epoch = self.get_epoch_or_revert(epoch_number);
        let mut new_total = self.claimable_total.get_or_default(&epoch_number);
        for (holder, amount) in holders.into_iter().zip(amounts.into_iter()) {
            let old = self.claimable.get_or_default(&(epoch_number, holder));
            // Saturating: pre-cap entries may exist that this counter never saw.
            new_total = if new_total > old { new_total - old } else { U512::zero() } + amount;
            if new_total > epoch.total_distribution_cspr {
                self.env().revert(DistError::ClaimableExceedsPool)
            }
            self.claimable.set(&(epoch_number, holder), amount);
        }
        self.claimable_total.set(&epoch_number, new_total);
    }

    #[odra(payable)]
    pub fn fund_epoch(&mut self, epoch_number: u64) {
        self.assert_authority();
        let mut epoch = self.get_epoch_or_revert(epoch_number);

        let attached = self.env().attached_value();
        let cumulative = self.funded_amount.get_or_default(&epoch_number) + attached;
        if cumulative > epoch.total_distribution_cspr {
            self.env().revert(DistError::OverfundsPool)
        }
        self.funded_amount.set(&epoch_number, cumulative);

        // Preserve the legacy top-up use case: funding may arrive across
        // multiple fund_epoch calls, and the stored is_funded flag (which
        // every other code path still reads) only flips once the cumulative
        // amount covers the epoch's declared pool.
        let is_fully_funded = cumulative >= epoch.total_distribution_cspr;
        if is_fully_funded {
            epoch.is_funded = true;
        }
        self.epochs.set(&epoch_number, epoch);

        self.env().emit_event(EpochFunded {
            epoch_number,
            amount_cspr: attached,
            cumulative_funded_cspr: cumulative,
            is_fully_funded,
            timestamp: self.env().get_block_time(),
        });
    }

    /// Lower (or raise) the declared pool of an epoch whose funding never completed.
    ///
    /// Exists because `create_epoch` fixes the pool up front, so a mis-sized epoch —
    /// e.g. one created from a stale config default whose `fund_epoch` then failed —
    /// is otherwise permanently stuck: `is_funded` can never flip, which blocks both
    /// `claim_yield` and `sweep_unclaimed`, and the router's reuse path keeps
    /// targeting it instead of opening a new epoch.
    ///
    /// Resizing down to what was actually deposited completes the funding, so the
    /// flag flips exactly as `fund_epoch` would have. The pool may never drop below
    /// the CSPR already allocated to holders (that is the invariant `ClaimableExceedsPool`
    /// protects) nor below what has already been deposited (which would strand it
    /// above the ceiling `fund_epoch` enforces).
    pub fn resize_unfunded_epoch(&mut self, epoch_number: u64, new_pool_cspr: U512) {
        self.assert_authority();
        let mut epoch = self.get_epoch_or_revert(epoch_number);

        if epoch.is_funded {
            self.env().revert(DistError::EpochAlreadyFunded)
        }
        if epoch.is_swept {
            self.env().revert(DistError::EpochAlreadySwept)
        }

        let allocated = self.claimable_total.get_or_default(&epoch_number);
        let funded = self.funded_amount.get_or_default(&epoch_number);
        if new_pool_cspr < allocated || new_pool_cspr < funded {
            self.env().revert(DistError::PoolBelowCommitted)
        }

        let old_pool_cspr = epoch.total_distribution_cspr;
        epoch.total_distribution_cspr = new_pool_cspr;

        let is_fully_funded = funded >= new_pool_cspr;
        if is_fully_funded {
            epoch.is_funded = true;
        }
        self.epochs.set(&epoch_number, epoch);

        self.env().emit_event(EpochResized {
            epoch_number,
            old_pool_cspr,
            new_pool_cspr,
            funded_cspr: funded,
            is_fully_funded,
            timestamp: self.env().get_block_time(),
        });
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
        let caller = self.env().caller();

        let mut epoch = self.get_epoch_or_revert(epoch_number);

        if !epoch.is_funded {
            self.env().revert(DistError::EpochNotFunded)
        }
        if epoch.is_swept {
            self.env().revert(DistError::EpochAlreadySwept)
        }
        if self.env().get_block_time() <= epoch.claim_deadline {
            self.env().revert(DistError::ClaimWindowNotExpired)
        }

        // Saturating: epoch 1 on testnet was over-allocated before the
        // set_claimable cap existed (claimed 125 > pool 100); a plain
        // subtraction would panic and make the epoch unsweepable forever.
        let unclaimed = epoch
            .total_distribution_cspr
            .checked_sub(epoch.total_claimed_cspr)
            .unwrap_or_default();
        epoch.is_swept = true;
        self.epochs.set(&epoch_number, epoch.clone());

        let new_total = self.total_distributed_all_time.get_or_default()
            + epoch.total_claimed_cspr;
        self.total_distributed_all_time.set(new_total);

        // Send the unclaimed remainder back to the authority so it doesn't
        // stay locked in the contract purse forever. Historical/over-claimed
        // epochs (unclaimed == 0, via the checked_sub fallback above) skip
        // the transfer entirely and remain a bookkeeping-only sweep.
        if unclaimed > U512::zero() {
            self.env().transfer_tokens(&caller, &unclaimed);
        }

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

    pub fn set_active(&mut self, active: bool) {
        self.assert_authority();
        self.is_active.set(active);
    }

    pub fn set_claim_window(&mut self, window_ms: u64) {
        self.assert_authority();
        if window_ms == 0 {
            self.env().revert(DistError::InvalidClaimWindow)
        }
        self.claim_window_ms.set(window_ms);
        self.env().emit_event(ClaimWindowUpdated { window_ms });
    }

    pub fn get_epoch(&self, epoch_number: u64) -> Option<DistributionEpoch> {
        self.epochs.get(&epoch_number)
    }

    pub fn get_claimable(&self, epoch_number: u64, holder: &Address) -> U512 {
        self.claimable.get_or_default(&(epoch_number, *holder))
    }

    pub fn get_claimable_total(&self, epoch_number: u64) -> U512 {
        self.claimable_total.get_or_default(&epoch_number)
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

    pub fn get_claim_window(&self) -> u64 {
        self.claim_window_ms.get_or_default()
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
    fn test_set_claimable_capped_at_pool() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let a = env.get_account(2);
        let b = env.get_account(3);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            2u64,
            85_000u64,
        );

        // Allocations within the pool are fine, including overwriting a holder.
        dist.set_claimable(1u64, a, U512::from(3_000_000_000u64));
        dist.set_claimable(1u64, a, U512::from(4_000_000_000u64));
        assert_eq!(dist.get_claimable_total(1u64), U512::from(4_000_000_000u64));

        // Pushing the epoch's summed allocations past the pool must revert.
        let over = dist.try_set_claimable(1u64, b, U512::from(2_000_000_000u64));
        assert!(over.is_err());
        assert_eq!(dist.get_claimable(1u64, &b), U512::zero());

        // Exactly filling the pool is allowed.
        dist.set_claimable(1u64, b, U512::from(1_000_000_000u64));
        assert_eq!(dist.get_claimable_total(1u64), U512::from(5_000_000_000u64));

        // Batch over-allocation must also revert.
        let batch = dist.try_set_claimable_batch(
            1u64,
            vec![a, b],
            vec![U512::from(4_000_000_000u64), U512::from(2_000_000_000u64)],
        );
        assert!(batch.is_err());
    }

    #[test]
    fn test_set_claimable_unknown_epoch_rejected() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let holder = env.get_account(2);
        let r = dist.try_set_claimable(9u64, holder, U512::from(1u64));
        assert!(r.is_err());
    }

    #[test]
    fn test_sweep_after_deadline() {
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
        env.set_caller(env.get_account(0));

        // Before the deadline sweep must refuse; after it, sweep succeeds and
        // total_distributed counts the claimed amount.
        assert!(dist.try_sweep_unclaimed(1u64).is_err());
        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);
        dist.sweep_unclaimed(1u64);
        assert!(dist.get_epoch(1).unwrap().is_swept);
        assert_eq!(dist.get_total_distributed(), U512::from(1_000_000_000u64));
    }

    #[test]
    fn test_partial_funding_blocks_claim_and_second_topup_enables_it() {
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

        // Partial funding must not flip is_funded, and claims must be blocked.
        dist.with_tokens(U512::from(2_000_000_000u64)).fund_epoch(1u64);
        assert!(!dist.get_epoch(1).unwrap().is_funded);

        env.set_caller(holder);
        let blocked = dist.try_claim_yield(1u64);
        assert!(blocked.is_err());
        env.set_caller(env.get_account(0));

        // Completing the funding via a second top-up must flip is_funded and
        // unblock claims.
        dist.with_tokens(U512::from(3_000_000_000u64)).fund_epoch(1u64);
        assert!(dist.get_epoch(1).unwrap().is_funded);

        env.set_caller(holder);
        dist.claim_yield(1u64);
        assert!(dist.has_claimed(1u64, &holder));
    }

    /// Reproduces the live epoch-4 situation: an epoch created with an oversized
    /// pool from a stale config default, partially funded, then stuck.
    #[test]
    fn test_resize_unfunded_epoch_unblocks_claim() {
        let env = odra_test::env();
        let (mut dist, mut vault) = setup(&env);
        let holder = env.get_account(2);

        vault.register_kyc(holder);
        // Pool declared far above what the purse can cover.
        dist.create_epoch("Jul-26".to_string(), U512::from(5_000_000_000u64), 1u64, 85_000u64);
        dist.set_claimable(1u64, holder, U512::from(100_000_000u64));
        dist.with_tokens(U512::from(100_000_000u64)).fund_epoch(1u64);

        // Stuck: not funded, so neither claiming nor sweeping is possible.
        assert!(!dist.get_epoch(1).unwrap().is_funded);
        env.set_caller(holder);
        assert!(dist.try_claim_yield(1u64).is_err());
        env.set_caller(env.get_account(0));

        // Resizing to what was actually deposited completes the funding.
        dist.resize_unfunded_epoch(1u64, U512::from(100_000_000u64));
        let epoch = dist.get_epoch(1).unwrap();
        assert!(epoch.is_funded);
        assert_eq!(epoch.total_distribution_cspr, U512::from(100_000_000u64));

        env.set_caller(holder);
        dist.claim_yield(1u64);
        assert!(dist.has_claimed(1u64, &holder));
    }

    #[test]
    fn test_resize_cannot_strand_allocated_or_funded_cspr() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let holder = env.get_account(2);

        dist.create_epoch("Jul-26".to_string(), U512::from(5_000_000_000u64), 1u64, 85_000u64);
        dist.set_claimable(1u64, holder, U512::from(2_000_000_000u64));
        dist.with_tokens(U512::from(1_000_000_000u64)).fund_epoch(1u64);

        // Below the 2 CSPR already allocated to the holder.
        assert!(dist.try_resize_unfunded_epoch(1u64, U512::from(1_500_000_000u64)).is_err());
        // Below the 1 CSPR already deposited (allocation lowered first so only
        // the funded floor is under test).
        dist.set_claimable(1u64, holder, U512::from(500_000_000u64));
        assert!(dist.try_resize_unfunded_epoch(1u64, U512::from(900_000_000u64)).is_err());
        // Exactly at the deposited amount is allowed and completes funding.
        dist.resize_unfunded_epoch(1u64, U512::from(1_000_000_000u64));
        assert!(dist.get_epoch(1).unwrap().is_funded);
    }

    #[test]
    fn test_resize_rejects_funded_epoch_and_non_authority() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        dist.create_epoch("Jul-26".to_string(), U512::from(1_000_000_000u64), 1u64, 85_000u64);
        dist.with_tokens(U512::from(1_000_000_000u64)).fund_epoch(1u64);
        assert!(dist.get_epoch(1).unwrap().is_funded);

        // A fully funded epoch is immutable.
        assert!(dist.try_resize_unfunded_epoch(1u64, U512::from(500_000_000u64)).is_err());

        // And only the authority may resize at all.
        dist.create_epoch("Aug-26".to_string(), U512::from(5_000_000_000u64), 1u64, 85_000u64);
        env.set_caller(env.get_account(3));
        assert!(dist.try_resize_unfunded_epoch(2u64, U512::from(100_000_000u64)).is_err());
    }

    #[test]
    fn test_sweep_reverts_on_unfunded_epoch() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );

        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);
        let result = dist.try_sweep_unclaimed(1u64);
        assert!(result.is_err());
        assert!(!dist.get_epoch(1).unwrap().is_swept);
    }

    #[test]
    fn test_claim_window_expired() {
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

        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);

        env.set_caller(holder);
        let result = dist.try_claim_yield(1u64);
        assert!(result.is_err());
        assert!(!dist.has_claimed(1u64, &holder));
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

    #[test]
    fn test_set_claim_window_rejects_non_authority() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);

        env.set_caller(stranger);
        let result = dist.try_set_claim_window(1_000u64);
        assert!(result.is_err());
        env.set_caller(env.get_account(0));
        assert_eq!(dist.get_claim_window(), DEFAULT_CLAIM_WINDOW);
    }

    #[test]
    fn test_set_claim_window_rejects_zero() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        let result = dist.try_set_claim_window(0u64);
        assert!(result.is_err());
        assert_eq!(dist.get_claim_window(), DEFAULT_CLAIM_WINDOW);
    }

    #[test]
    fn test_set_claimable_batch_length_mismatch_rejected() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let a = env.get_account(2);
        let b = env.get_account(3);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            2u64,
            85_000u64,
        );

        let result = dist.try_set_claimable_batch(
            1u64,
            vec![a, b],
            vec![U512::from(1_000_000_000u64)],
        );
        assert!(result.is_err());
        assert_eq!(dist.get_claimable_total(1u64), U512::zero());
    }

    #[test]
    fn test_fund_epoch_overfund_rejected() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );

        // Overfunding a single call must revert.
        let over = dist.with_tokens(U512::from(6_000_000_000u64)).try_fund_epoch(1u64);
        assert!(over.is_err());
        assert!(!dist.get_epoch(1).unwrap().is_funded);

        // Exact-fill across a partial top-up must still be allowed.
        dist.with_tokens(U512::from(3_000_000_000u64)).fund_epoch(1u64);
        let exact_topup = dist.with_tokens(U512::from(2_000_000_000u64)).try_fund_epoch(1u64);
        assert!(exact_topup.is_ok());
        assert!(dist.get_epoch(1).unwrap().is_funded);

        // Any further funding on an already fully-funded epoch overflows the pool.
        let post_full = dist.with_tokens(U512::from(1u64)).try_fund_epoch(1u64);
        assert!(post_full.is_err());
    }

    #[test]
    fn test_sweep_transfers_unclaimed_to_authority() {
        let env = odra_test::env();
        let (mut dist, mut vault) = setup(&env);
        let holder = env.get_account(2);
        let authority = env.get_account(0);

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
        env.set_caller(authority);

        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);
        let balance_before = env.balance_of(&authority);
        dist.sweep_unclaimed(1u64);
        let balance_after = env.balance_of(&authority);

        // 5B pool - 1B claimed = 4B unclaimed swept back to the authority.
        assert_eq!(balance_after - balance_before, U512::from(4_000_000_000u64));
    }

    #[test]
    fn test_sweep_zero_unclaimed_skips_transfer() {
        let env = odra_test::env();
        let (mut dist, mut vault) = setup(&env);
        let holder = env.get_account(2);
        let authority = env.get_account(0);

        vault.register_kyc(holder);
        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        dist.set_claimable(1u64, holder, U512::from(5_000_000_000u64));
        dist.with_tokens(U512::from(5_000_000_000u64)).fund_epoch(1u64);

        env.set_caller(holder);
        dist.claim_yield(1u64);
        env.set_caller(authority);

        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);
        let balance_before = env.balance_of(&authority);
        dist.sweep_unclaimed(1u64);
        let balance_after = env.balance_of(&authority);

        assert!(dist.get_epoch(1).unwrap().is_swept);
        assert_eq!(balance_after, balance_before);
    }

    #[test]
    fn test_inactive_distributor_blocks_create_epoch_and_claim() {
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

        dist.set_active(false);

        let create_blocked = dist.try_create_epoch(
            "Jul-26".to_string(),
            U512::from(1_000_000_000u64),
            1u64,
            85_000u64,
        );
        assert!(create_blocked.is_err());

        env.set_caller(holder);
        let claim_blocked = dist.try_claim_yield(1u64);
        assert!(claim_blocked.is_err());
        assert!(!dist.has_claimed(1u64, &holder));
    }

    #[test]
    fn test_set_claim_window_applies_to_new_epochs() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);

        let new_window: u64 = 30 * 24 * 60 * 60 * 1000; // 30 days
        dist.set_claim_window(new_window);
        assert_eq!(dist.get_claim_window(), new_window);

        dist.create_epoch(
            "Jul-26".to_string(),
            U512::from(5_000_000_000u64),
            10u64,
            85_000u64,
        );

        let epoch = dist.get_epoch(1).unwrap();
        assert_eq!(epoch.claim_deadline, epoch.created_at + new_window);
    }

    #[test]
    fn test_set_claimable_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);
        let holder = env.get_account(3);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );

        env.set_caller(stranger);
        let result = dist.try_set_claimable(1u64, holder, U512::from(1_000_000_000u64));
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));
        assert_eq!(dist.get_claimable(1u64, &holder), U512::zero());
    }

    #[test]
    fn test_set_claimable_batch_happy_path() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let a = env.get_account(2);
        let b = env.get_account(3);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            2u64,
            85_000u64,
        );

        dist.set_claimable_batch(
            1u64,
            vec![a, b],
            vec![U512::from(2_000_000_000u64), U512::from(3_000_000_000u64)],
        );

        assert_eq!(dist.get_claimable(1u64, &a), U512::from(2_000_000_000u64));
        assert_eq!(dist.get_claimable(1u64, &b), U512::from(3_000_000_000u64));
        assert_eq!(dist.get_claimable_total(1u64), U512::from(5_000_000_000u64));
    }

    #[test]
    fn test_set_claimable_batch_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);
        let a = env.get_account(3);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );

        env.set_caller(stranger);
        let result =
            dist.try_set_claimable_batch(1u64, vec![a], vec![U512::from(1_000_000_000u64)]);
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));
        assert_eq!(dist.get_claimable_total(1u64), U512::zero());
    }

    #[test]
    fn test_fund_epoch_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );

        env.set_caller(stranger);
        let result = dist
            .with_tokens(U512::from(1_000_000_000u64))
            .try_fund_epoch(1u64);
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));
        assert!(!dist.get_epoch(1).unwrap().is_funded);
    }

    #[test]
    fn test_sweep_unclaimed_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);

        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        dist.with_tokens(U512::from(5_000_000_000u64)).fund_epoch(1u64);
        env.advance_block_time(DEFAULT_CLAIM_WINDOW + 1);

        env.set_caller(stranger);
        let result = dist.try_sweep_unclaimed(1u64);
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));
        assert!(!dist.get_epoch(1).unwrap().is_swept);
    }

    #[test]
    fn test_create_epoch_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);

        env.set_caller(stranger);
        let result = dist.try_create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        assert_eq!(result.err(), Some(DistError::UnauthorizedYieldRouter.into()));
        env.set_caller(env.get_account(0));
        assert_eq!(dist.get_current_epoch(), 0);
    }

    #[test]
    fn test_dist_set_active_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);

        env.set_caller(stranger);
        let result = dist.try_set_active(false);
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));

        // Guard held: distributor stayed active because the stranger's call
        // was rejected, so create_epoch still succeeds.
        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        assert_eq!(dist.get_current_epoch(), 1);
    }

    #[test]
    fn test_update_yield_router_rejects_unauthorized_caller() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let stranger = env.get_account(2);
        let new_router = env.get_account(4);
        let original_router = env.get_account(1);

        env.set_caller(stranger);
        let result = dist.try_update_yield_router(new_router);
        assert_eq!(result.err(), Some(DistError::UnauthorizedAuthority.into()));
        env.set_caller(env.get_account(0));
        assert_eq!(dist.get_yield_router(), original_router);
    }

    #[test]
    fn test_update_yield_router_authority_can_update() {
        let env = odra_test::env();
        let (mut dist, _vault) = setup(&env);
        let new_router = env.get_account(4);

        dist.update_yield_router(new_router);
        assert_eq!(dist.get_yield_router(), new_router);

        // The new router is now authorized to create epochs.
        env.set_caller(new_router);
        dist.create_epoch(
            "Jun-26".to_string(),
            U512::from(5_000_000_000u64),
            1u64,
            85_000u64,
        );
        assert_eq!(dist.get_current_epoch(), 1);
    }
}
