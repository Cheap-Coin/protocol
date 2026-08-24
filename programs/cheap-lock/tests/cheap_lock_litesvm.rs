use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{
            instruction::Instruction, program_option::COption, program_pack::Pack, system_program,
        },
        AccountDeserialize, AccountSerialize, InstructionData, Space, ToAccountMetas,
    },
    anchor_spl::token::spl_token::{
        self,
        state::{Account as SplTokenAccount, AccountState, Mint as SplMint},
    },
    cheap_lock::{LockConfig, LockPositionAccount, LockTier, PositionState},
    litesvm::LiteSVM,
    solana_account::Account,
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const CONFIG_SEED: &[u8] = b"config";
const POSITION_SEED: &[u8] = b"position";
const VAULT_SEED: &[u8] = b"vault";
const INITIAL_TIMESTAMP: i64 = 1_800_000_000;

struct Fixture {
    svm: LiteSVM,
    authority: Keypair,
    mint: Pubkey,
    source: Pubkey,
    destination: Pubkey,
    config: Pubkey,
}

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/cheap_lock.so"
    ))
}

fn rent_exempt_account(svm: &LiteSVM, owner: Pubkey, data: Vec<u8>) -> Account {
    Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()),
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

fn set_mint(svm: &mut LiteSVM, mint: Pubkey, supply: u64) {
    let mut data = vec![0_u8; SplMint::LEN];
    SplMint::pack(
        SplMint {
            mint_authority: COption::None,
            supply,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    svm.set_account(mint, rent_exempt_account(svm, spl_token::ID, data))
        .unwrap();
}

fn token_state(mint: Pubkey, owner: Pubkey, amount: u64) -> SplTokenAccount {
    SplTokenAccount {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
}

fn set_token_account(svm: &mut LiteSVM, address: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
    let mut data = vec![0_u8; SplTokenAccount::LEN];
    SplTokenAccount::pack(token_state(mint, owner, amount), &mut data).unwrap();
    svm.set_account(address, rent_exempt_account(svm, spl_token::ID, data))
        .unwrap();
}

fn set_config(svm: &mut LiteSVM, authority: Pubkey, mint: Pubkey, token_program: Pubkey) -> Pubkey {
    let (config, bump) = Pubkey::find_program_address(&[CONFIG_SEED], &cheap_lock::id());
    let state = LockConfig {
        authority,
        cheap_mint: mint,
        token_program,
        paused: false,
        bump,
    };
    let mut data = Vec::with_capacity(8 + LockConfig::INIT_SPACE);
    state.try_serialize(&mut data).unwrap();
    data.resize(8 + LockConfig::INIT_SPACE, 0);
    svm.set_account(config, rent_exempt_account(svm, cheap_lock::id(), data))
        .unwrap();
    config
}

fn fixture(configured_token_program: Pubkey) -> Fixture {
    let authority = Keypair::new();
    let mint = Pubkey::new_unique();
    let source = Pubkey::new_unique();
    let destination = Pubkey::new_unique();
    let mut svm = LiteSVM::new();
    svm.add_program(cheap_lock::id(), program_bytes()).unwrap();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = INITIAL_TIMESTAMP;
    svm.set_sysvar(&clock);

    set_mint(&mut svm, mint, 2_000);
    set_token_account(&mut svm, source, mint, authority.pubkey(), 2_000);
    set_token_account(&mut svm, destination, mint, authority.pubkey(), 0);
    let config = set_config(&mut svm, authority.pubkey(), mint, configured_token_program);

    Fixture {
        svm,
        authority,
        mint,
        source,
        destination,
        config,
    }
}

fn position_address(owner: Pubkey, deposit_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[POSITION_SEED, owner.as_ref(), &deposit_id.to_le_bytes()],
        &cheap_lock::id(),
    )
    .0
}

fn vault_address(position: Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[VAULT_SEED, position.as_ref()], &cheap_lock::id()).0
}

fn open_instruction(
    owner: Pubkey,
    config: Pubkey,
    mint: Pubkey,
    source: Pubkey,
    deposit_id: u64,
    amount: u64,
) -> Instruction {
    let position = position_address(owner, deposit_id);
    Instruction::new_with_bytes(
        cheap_lock::id(),
        &cheap_lock::instruction::OpenPosition {
            deposit_id,
            amount,
            tier: LockTier::ThirtyDays,
        }
        .data(),
        cheap_lock::accounts::OpenPosition {
            owner,
            config,
            cheap_mint: mint,
            source_token_account: source,
            position,
            vault: vault_address(position),
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn withdraw_instruction(
    owner: Pubkey,
    config: Pubkey,
    mint: Pubkey,
    destination: Pubkey,
    position: Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        cheap_lock::id(),
        &cheap_lock::instruction::WithdrawPosition {}.data(),
        cheap_lock::accounts::WithdrawPosition {
            owner,
            config,
            cheap_mint: mint,
            position,
            vault: vault_address(position),
            destination_token_account: destination,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    )
}

fn pause_instruction(authority: Pubkey, config: Pubkey, paused: bool) -> Instruction {
    Instruction::new_with_bytes(
        cheap_lock::id(),
        &cheap_lock::instruction::SetPaused { paused }.data(),
        cheap_lock::accounts::ManageConfig { authority, config }.to_account_metas(None),
    )
}

fn transaction(
    svm: &LiteSVM,
    payer: &Keypair,
    instructions: &[Instruction],
) -> VersionedTransaction {
    let message =
        Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &svm.latest_blockhash());
    VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[payer]).unwrap()
}

fn send_success(svm: &mut LiteSVM, payer: &Keypair, instructions: &[Instruction]) {
    let transaction = transaction(svm, payer, instructions);
    let simulated = svm.simulate_transaction(transaction.clone()).unwrap();
    let executed = svm.send_transaction(transaction).unwrap();
    assert_eq!(simulated.meta, executed);
}

fn send_failure(svm: &mut LiteSVM, payer: &Keypair, instructions: &[Instruction]) {
    let transaction = transaction(svm, payer, instructions);
    assert!(svm.simulate_transaction(transaction.clone()).is_err());
    assert!(svm.send_transaction(transaction).is_err());
}

fn read_position(svm: &LiteSVM, address: Pubkey) -> LockPositionAccount {
    let account = svm.get_account(&address).unwrap();
    let mut data: &[u8] = &account.data;
    LockPositionAccount::try_deserialize(&mut data).unwrap()
}

fn read_token_amount(svm: &LiteSVM, address: Pubkey) -> u64 {
    let account = svm.get_account(&address).unwrap();
    SplTokenAccount::unpack(&account.data).unwrap().amount
}

fn add_unsolicited_tokens(svm: &mut LiteSVM, address: Pubkey, amount: u64) {
    let mut account = svm.get_account(&address).unwrap();
    let mut state = SplTokenAccount::unpack(&account.data).unwrap();
    state.amount = state.amount.checked_add(amount).unwrap();
    SplTokenAccount::pack(state, &mut account.data).unwrap();
    svm.set_account(address, account).unwrap();
}

#[test]
fn positions_remain_isolated_and_withdrawable_while_paused() {
    let mut fixture = fixture(spl_token::ID);
    let first_deposit_id = 7;
    let second_deposit_id = 8;
    let first_position = position_address(fixture.authority.pubkey(), first_deposit_id);
    let second_position = position_address(fixture.authority.pubkey(), second_deposit_id);
    let first_vault = vault_address(first_position);
    let second_vault = vault_address(second_position);

    let zero_deposit_id = 6;
    send_failure(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            zero_deposit_id,
            0,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, fixture.source), 2_000);
    assert!(fixture
        .svm
        .get_account(&position_address(
            fixture.authority.pubkey(),
            zero_deposit_id,
        ))
        .is_none());

    send_success(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            first_deposit_id,
            400,
        )],
    );
    send_success(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            second_deposit_id,
            300,
        )],
    );

    assert_ne!(first_position, second_position);
    assert_ne!(first_vault, second_vault);
    assert_eq!(read_position(&fixture.svm, first_position).principal, 400);
    assert_eq!(read_position(&fixture.svm, second_position).principal, 300);
    assert_eq!(read_token_amount(&fixture.svm, first_vault), 400);
    assert_eq!(read_token_amount(&fixture.svm, second_vault), 300);
    assert_eq!(read_token_amount(&fixture.svm, fixture.source), 1_300);

    send_failure(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            second_deposit_id,
            1,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, fixture.source), 1_300);

    let attacker = Keypair::new();
    let attacker_destination = Pubkey::new_unique();
    fixture
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    set_token_account(
        &mut fixture.svm,
        attacker_destination,
        fixture.mint,
        attacker.pubkey(),
        0,
    );
    send_failure(
        &mut fixture.svm,
        &attacker,
        &[pause_instruction(attacker.pubkey(), fixture.config, true)],
    );
    send_failure(
        &mut fixture.svm,
        &attacker,
        &[withdraw_instruction(
            attacker.pubkey(),
            fixture.config,
            fixture.mint,
            attacker_destination,
            second_position,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, second_vault), 300);

    send_success(
        &mut fixture.svm,
        &fixture.authority,
        &[pause_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            true,
        )],
    );
    send_failure(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            9,
            100,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, fixture.source), 1_300);

    add_unsolicited_tokens(&mut fixture.svm, first_vault, 25);
    send_success(
        &mut fixture.svm,
        &fixture.authority,
        &[withdraw_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.destination,
            first_position,
        )],
    );

    let first_state = read_position(&fixture.svm, first_position);
    assert_eq!(first_state.state, PositionState::ExitedEarly);
    assert_eq!(first_state.principal, 400);
    assert_eq!(first_state.withdrawn_at, INITIAL_TIMESTAMP);
    assert!(fixture.svm.get_account(&first_vault).is_none());
    assert_eq!(read_token_amount(&fixture.svm, fixture.destination), 425);
    assert_eq!(
        read_position(&fixture.svm, second_position).state,
        PositionState::Locked
    );
    assert_eq!(read_token_amount(&fixture.svm, second_vault), 300);

    send_failure(
        &mut fixture.svm,
        &fixture.authority,
        &[withdraw_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.destination,
            first_position,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, fixture.destination), 425);

    let second_unlock = read_position(&fixture.svm, second_position).unlock_at;
    let mut clock = fixture.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = second_unlock;
    fixture.svm.set_sysvar(&clock);
    send_success(
        &mut fixture.svm,
        &fixture.authority,
        &[withdraw_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.destination,
            second_position,
        )],
    );

    let second_state = read_position(&fixture.svm, second_position);
    assert_eq!(second_state.state, PositionState::WithdrawnMatured);
    assert_eq!(second_state.principal, 300);
    assert_eq!(second_state.withdrawn_at, second_unlock);
    assert!(fixture.svm.get_account(&second_vault).is_none());
    assert_eq!(read_token_amount(&fixture.svm, fixture.destination), 725);
}

#[test]
fn configured_token_program_mismatch_fails_closed_before_transfer() {
    let mut fixture = fixture(system_program::ID);
    send_failure(
        &mut fixture.svm,
        &fixture.authority,
        &[open_instruction(
            fixture.authority.pubkey(),
            fixture.config,
            fixture.mint,
            fixture.source,
            1,
            100,
        )],
    );
    assert_eq!(read_token_amount(&fixture.svm, fixture.source), 2_000);
    assert!(fixture
        .svm
        .get_account(&position_address(fixture.authority.pubkey(), 1))
        .is_none());
}
