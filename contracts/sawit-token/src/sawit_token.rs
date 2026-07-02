
use odra::prelude::*;
use odra::casper_types::U256;

#[odra::odra_error]
pub enum TokenError {
    InsufficientBalance = 1,
    InsufficientAllowance = 2,
    UnauthorizedMinter = 3,
    UnauthorizedAuthority = 4,
    TransfersPaused = 5,
    ZeroAmount = 6,
}

#[odra::event]
pub struct Transfer {
    pub from: Option<Address>,
    pub to: Option<Address>,
    pub amount: U256,
}

#[odra::event]
pub struct Approval {
    pub owner: Address,
    pub spender: Address,
    pub value: U256,
}

#[odra::event]
pub struct Mint {
    pub to: Address,
    pub amount: U256,
    pub epoch_number: u64,
}

#[odra::module(events = [Transfer, Approval, Mint], errors = TokenError)]
pub struct SawitToken {
    name: Var<String>,
    symbol: Var<String>,
    decimals: Var<u8>,
    total_supply: Var<U256>,
    balances: Mapping<Address, U256>,
    allowances: Mapping<(Address, Address), U256>,
    authority: Var<Address>,
    minter: Var<Address>,
    transfers_paused: Var<bool>,
    total_epochs_minted: Var<u64>,
}

#[odra::module]
impl SawitToken {
    pub fn init(&mut self, minter: Address) {
        let caller = self.env().caller();
        self.name.set("SAWIT Token".to_string());
        self.symbol.set("SAWIT".to_string());
        self.decimals.set(9u8);
        self.total_supply.set(U256::zero());
        self.authority.set(caller);
        self.minter.set(minter);
        self.transfers_paused.set(false);
        self.total_epochs_minted.set(0u64);
    }

    pub fn transfer(&mut self, recipient: &Address, amount: &U256) {
        if self.transfers_paused.get_or_default() {
            self.env().revert(TokenError::TransfersPaused)
        }
        if amount == &U256::zero() {
            self.env().revert(TokenError::ZeroAmount)
        }
        let caller = self.env().caller();
        self.raw_transfer(&caller, recipient, amount);
    }

    pub fn transfer_from(&mut self, owner: &Address, recipient: &Address, amount: &U256) {
        if self.transfers_paused.get_or_default() {
            self.env().revert(TokenError::TransfersPaused)
        }
        let spender = self.env().caller();
        self.spend_allowance(owner, &spender, amount);
        self.raw_transfer(owner, recipient, amount);
    }

    pub fn approve(&mut self, spender: &Address, amount: &U256) {
        let owner = self.env().caller();
        self.allowances.set(&(owner, *spender), *amount);
        self.env().emit_event(Approval {
            owner,
            spender: *spender,
            value: *amount,
        });
    }

    pub fn mint(&mut self, to: &Address, amount: &U256, epoch_number: u64) {
        if self.env().caller() != self.minter.get().unwrap() {
            self.env().revert(TokenError::UnauthorizedMinter)
        }
        if amount == &U256::zero() {
            self.env().revert(TokenError::ZeroAmount)
        }

        self.balances.add(to, *amount);
        self.total_supply.add(*amount);
        self.total_epochs_minted
            .set(self.total_epochs_minted.get_or_default() + 1);

        self.env().emit_event(Transfer {
            from: None,
            to: Some(*to),
            amount: *amount,
        });
        self.env().emit_event(Mint {
            to: *to,
            amount: *amount,
            epoch_number,
        });
    }

    pub fn set_minter(&mut self, new_minter: Address) {
        self.assert_authority();
        self.minter.set(new_minter);
    }

    pub fn pause_transfers(&mut self) {
        self.assert_authority();
        self.transfers_paused.set(true);
    }

    pub fn resume_transfers(&mut self) {
        self.assert_authority();
        self.transfers_paused.set(false);
    }

    pub fn name(&self) -> String {
        self.name.get_or_default()
    }

    pub fn symbol(&self) -> String {
        self.symbol.get_or_default()
    }

    pub fn decimals(&self) -> u8 {
        self.decimals.get_or_default()
    }

    pub fn total_supply(&self) -> U256 {
        self.total_supply.get_or_default()
    }

    pub fn balance_of(&self, address: &Address) -> U256 {
        self.balances.get_or_default(address)
    }

    pub fn allowance(&self, owner: &Address, spender: &Address) -> U256 {
        self.allowances.get_or_default(&(*owner, *spender))
    }

    pub fn get_minter(&self) -> Address {
        self.minter.get().unwrap()
    }

    pub fn is_paused(&self) -> bool {
        self.transfers_paused.get_or_default()
    }

    fn raw_transfer(&mut self, owner: &Address, recipient: &Address, amount: &U256) {
        let owner_balance = self.balances.get_or_default(owner);
        if *amount > owner_balance {
            self.env().revert(TokenError::InsufficientBalance)
        }
        self.balances.set(owner, owner_balance - *amount);
        self.balances.add(recipient, *amount);
        self.env().emit_event(Transfer {
            from: Some(*owner),
            to: Some(*recipient),
            amount: *amount,
        });
    }

    fn spend_allowance(&mut self, owner: &Address, spender: &Address, amount: &U256) {
        let allowance = self.allowance(owner, spender);
        if allowance < *amount {
            self.env().revert(TokenError::InsufficientAllowance)
        }
        let new_allowance = allowance - *amount;
        self.allowances.set(&(*owner, *spender), new_allowance);
        self.env().emit_event(Approval {
            owner: *owner,
            spender: *spender,
            value: new_allowance,
        });
    }

    fn assert_authority(&self) {
        if self.env().caller() != self.authority.get().unwrap() {
            self.env().revert(TokenError::UnauthorizedAuthority)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    fn setup(env: &HostEnv) -> SawitTokenHostRef {
        let minter = env.get_account(1);
        SawitToken::deploy(env, SawitTokenInitArgs { minter })
    }

    #[test]
    fn test_init() {
        let env = odra_test::env();
        let token = setup(&env);
        assert_eq!(token.name(), "SAWIT Token");
        assert_eq!(token.symbol(), "SAWIT");
        assert_eq!(token.total_supply(), U256::zero());
    }

    #[test]
    fn test_mint_and_transfer() {
        let env = odra_test::env();
        let mut token = setup(&env);
        let minter = env.get_account(1);
        let holder = env.get_account(2);
        let recipient = env.get_account(3);

        env.set_caller(minter);
        let amount = U256::from(1_000_000u64);
        token.mint(&holder, &amount, 1u64);

        assert_eq!(token.balance_of(&holder), amount);
        assert_eq!(token.total_supply(), amount);

        env.set_caller(holder);
        let transfer_amount = U256::from(500_000u64);
        token.transfer(&recipient, &transfer_amount);

        assert_eq!(token.balance_of(&holder), U256::from(500_000u64));
        assert_eq!(token.balance_of(&recipient), transfer_amount);
    }
}
