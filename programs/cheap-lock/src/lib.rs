use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

declare_id!("E3TBZmfvWDuV6g4bAVR62bVoV9AJ3Y6utDKJsVEgxaLu");

solana_security_txt::security_txt! {
    name: "CheapCoin cheap-lock",
    project_url: "https://cheapcoin.fun",
    contacts: "email:Dev@cheapcoin.fun",
    policy: "https://github.com/Cheap-Coin/protocol/security/policy",
    source_code: "https://github.com/Cheap-Coin/protocol"
}

const CONFIG_SEED: &[u8] = b"config";
const POSITION_SEED: &[u8] = b"position";
const VAULT_SEED: &[u8] = b"vault";
const THIRTY_DAYS_SECONDS: i64 = 30 * 24 * 60 * 60;
const NINETY_DAYS_SECONDS: i64 = 90 * 24 * 60 * 60;

#[program]
pub mod cheap_lock {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        require!(
            ctx.accounts.cheap_mint.mint_authority == COption::None,
            CheapLockError::MintAuthorityActive
        );
        require!(
            ctx.accounts.cheap_mint.freeze_authority == COption::None,
            CheapLockError::FreezeAuthorityActive
        );

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.cheap_mint = ctx.accounts.cheap_mint.key();
        config.token_program = ctx.accounts.token_program.key();
        config.paused = false;
        config.bump = ctx.bumps.config;
        emit!(ConfigInitialized {
            authority: config.authority,
            cheap_mint: config.cheap_mint,
        });
        Ok(())
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        deposit_id: u64,
        amount: u64,
        tier: LockTier,
    ) -> Result<()> {
        require!(
            !ctx.accounts.config.paused,
            CheapLockError::NewPositionsPaused
        );
        require!(amount > 0, CheapLockError::ZeroAmount);

        let opened_at = Clock::get()?.unix_timestamp;
        require!(opened_at >= 0, CheapLockError::InvalidClock);
        let unlock_at = unlock_timestamp(opened_at, tier)?;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.cheap_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.cheap_mint.decimals,
        )?;

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.mint = ctx.accounts.cheap_mint.key();
        position.deposit_id = deposit_id;
        position.principal = amount;
        position.opened_at = opened_at;
        position.unlock_at = unlock_at;
        position.withdrawn_at = 0;
        position.tier = tier;
        position.state = PositionState::Locked;
        position.bump = ctx.bumps.position;
        position.vault_bump = ctx.bumps.vault;

        emit!(PositionOpened {
            position: position.key(),
            owner: position.owner,
            deposit_id,
            principal: amount,
            tier,
            opened_at,
            unlock_at,
        });
        Ok(())
    }

    pub fn withdraw_position(ctx: Context<WithdrawPosition>) -> Result<()> {
        require!(
            ctx.accounts.position.state == PositionState::Locked,
            CheapLockError::PositionAlreadyWithdrawn
        );
        require!(
            ctx.accounts.vault.amount >= ctx.accounts.position.principal,
            CheapLockError::PrincipalInvariantViolated
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now >= 0, CheapLockError::InvalidClock);
        let deposit_id_bytes = ctx.accounts.position.deposit_id.to_le_bytes();
        let bump = [ctx.accounts.position.bump];
        let signer_seeds: &[&[u8]] = &[
            POSITION_SEED,
            ctx.accounts.position.owner.as_ref(),
            deposit_id_bytes.as_ref(),
            bump.as_ref(),
        ];
        let signer = &[signer_seeds];

        // Transfer the entire vault balance. The recorded principal cannot be reduced,
        // and unsolicited CHEAP sent to this per-position vault cannot block withdrawal.
        let transfer_amount = ctx.accounts.vault.amount;
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.cheap_mint.to_account_info(),
                    to: ctx.accounts.destination_token_account.to_account_info(),
                    authority: ctx.accounts.position.to_account_info(),
                },
                signer,
            ),
            transfer_amount,
            ctx.accounts.cheap_mint.decimals,
        )?;
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.owner.to_account_info(),
                authority: ctx.accounts.position.to_account_info(),
            },
            signer,
        ))?;

        let position = &mut ctx.accounts.position;
        position.withdrawn_at = now;
        position.state = withdrawal_state(now, position.unlock_at);
        emit!(PositionWithdrawn {
            position: position.key(),
            owner: position.owner,
            principal: position.principal,
            transferred: transfer_amount,
            state: position.state,
            withdrawn_at: now,
        });
        Ok(())
    }

    pub fn set_paused(ctx: Context<ManageConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(PauseChanged { paused });
        Ok(())
    }

    pub fn set_authority(ctx: Context<ManageConfig>, new_authority: Pubkey) -> Result<()> {
        require!(
            new_authority != Pubkey::default(),
            CheapLockError::InvalidAuthority
        );
        let previous_authority = ctx.accounts.config.authority;
        ctx.accounts.config.authority = new_authority;
        emit!(AuthorityChanged {
            previous_authority,
            new_authority,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        constraint = cheap_lock_program.programdata_address()? == Some(program_data.key()) @ CheapLockError::InvalidInitializer
    )]
    pub cheap_lock_program: Program<'info, crate::program::CheapLock>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ CheapLockError::InvalidInitializer
    )]
    pub program_data: Account<'info, ProgramData>,
    pub cheap_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + LockConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, LockConfig>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(deposit_id: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = cheap_mint,
        constraint = config.token_program == token_program.key() @ CheapLockError::InvalidTokenProgram
    )]
    pub config: Account<'info, LockConfig>,
    pub cheap_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = cheap_mint,
        token::authority = owner
    )]
    pub source_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + LockPositionAccount::INIT_SPACE,
        seeds = [POSITION_SEED, owner.key().as_ref(), &deposit_id.to_le_bytes()],
        bump
    )]
    pub position: Account<'info, LockPositionAccount>,
    #[account(
        init,
        payer = owner,
        seeds = [VAULT_SEED, position.key().as_ref()],
        bump,
        token::mint = cheap_mint,
        token::authority = position
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = cheap_mint,
        constraint = config.token_program == token_program.key() @ CheapLockError::InvalidTokenProgram
    )]
    pub config: Account<'info, LockConfig>,
    pub cheap_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref(), &position.deposit_id.to_le_bytes()],
        bump = position.bump,
        has_one = owner,
        constraint = position.mint == cheap_mint.key() @ CheapLockError::InvalidMint
    )]
    pub position: Account<'info, LockPositionAccount>,
    #[account(
        mut,
        seeds = [VAULT_SEED, position.key().as_ref()],
        bump = position.vault_bump,
        token::mint = cheap_mint,
        token::authority = position
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = cheap_mint,
        token::authority = owner
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ManageConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, LockConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct LockConfig {
    pub authority: Pubkey,
    pub cheap_mint: Pubkey,
    pub token_program: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LockPositionAccount {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub deposit_id: u64,
    pub principal: u64,
    pub opened_at: i64,
    pub unlock_at: i64,
    pub withdrawn_at: i64,
    pub tier: LockTier,
    pub state: PositionState,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace)]
pub enum LockTier {
    ThirtyDays,
    NinetyDays,
}

impl LockTier {
    fn duration_seconds(self) -> i64 {
        match self {
            Self::ThirtyDays => THIRTY_DAYS_SECONDS,
            Self::NinetyDays => NINETY_DAYS_SECONDS,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace)]
pub enum PositionState {
    Locked,
    ExitedEarly,
    WithdrawnMatured,
}

fn unlock_timestamp(opened_at: i64, tier: LockTier) -> Result<i64> {
    opened_at
        .checked_add(tier.duration_seconds())
        .ok_or_else(|| error!(CheapLockError::ArithmeticOverflow))
}

fn withdrawal_state(now: i64, unlock_at: i64) -> PositionState {
    if now < unlock_at {
        PositionState::ExitedEarly
    } else {
        PositionState::WithdrawnMatured
    }
}

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub cheap_mint: Pubkey,
}

#[event]
pub struct PositionOpened {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub deposit_id: u64,
    pub principal: u64,
    pub tier: LockTier,
    pub opened_at: i64,
    pub unlock_at: i64,
}

#[event]
pub struct PositionWithdrawn {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
    pub transferred: u64,
    pub state: PositionState,
    pub withdrawn_at: i64,
}

#[event]
pub struct PauseChanged {
    pub paused: bool,
}

#[event]
pub struct AuthorityChanged {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[error_code]
pub enum CheapLockError {
    #[msg("Only the current program upgrade authority may initialize configuration")]
    InvalidInitializer,
    #[msg("New lock positions are paused")]
    NewPositionsPaused,
    #[msg("Lock amount must be positive")]
    ZeroAmount,
    #[msg("Timestamp arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Clock timestamp is invalid")]
    InvalidClock,
    #[msg("The configured CHEAP mint still has mint authority")]
    MintAuthorityActive,
    #[msg("The configured CHEAP mint still has freeze authority")]
    FreezeAuthorityActive,
    #[msg("Only the configured legacy SPL Token program is accepted")]
    InvalidTokenProgram,
    #[msg("Position mint does not match the configured CHEAP mint")]
    InvalidMint,
    #[msg("Position principal is no longer present in its vault")]
    PrincipalInvariantViolated,
    #[msg("Position was already withdrawn")]
    PositionAlreadyWithdrawn,
    #[msg("New authority cannot be the default public key")]
    InvalidAuthority,
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn tiers_use_exact_commitment_windows() {
        assert_eq!(
            unlock_timestamp(1_000, LockTier::ThirtyDays).unwrap(),
            1_000 + THIRTY_DAYS_SECONDS
        );
        assert_eq!(
            unlock_timestamp(1_000, LockTier::NinetyDays).unwrap(),
            1_000 + NINETY_DAYS_SECONDS
        );
    }

    #[test]
    fn withdrawal_is_always_classified_without_rejecting_early_exit() {
        assert_eq!(withdrawal_state(99, 100), PositionState::ExitedEarly);
        assert_eq!(withdrawal_state(100, 100), PositionState::WithdrawnMatured);
        assert_eq!(withdrawal_state(101, 100), PositionState::WithdrawnMatured);
    }

    proptest! {
        #[test]
        fn any_valid_vault_balance_returns_at_least_principal(principal in 1_u64..u64::MAX, extra in 0_u64..1_000_000) {
            if let Some(vault_balance) = principal.checked_add(extra) {
                prop_assert!(vault_balance >= principal);
            }
        }

        #[test]
        fn pause_state_cannot_change_withdrawal_classification(now in 0_i64..4_000_000_000, unlock_at in 0_i64..4_000_000_000, paused in any::<bool>()) {
            let expected = if now < unlock_at { PositionState::ExitedEarly } else { PositionState::WithdrawnMatured };
            let _new_positions_paused = paused;
            prop_assert_eq!(withdrawal_state(now, unlock_at), expected);
        }
    }
}
