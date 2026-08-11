import type { Address, TrackedHolder } from "./types.js";

function key(address: Address): string {
  return address.toLowerCase();
}

export class HoldingWindow {
  readonly #holders = new Map<string, TrackedHolder>();

  constructor(initialBalances: ReadonlyMap<Address, bigint>) {
    for (const [address, balance] of initialBalances) {
      if (balance < 0n) throw new RangeError("Initial balance cannot be negative");
      const normalized = key(address);
      if (this.#holders.has(normalized)) {
        throw new Error(`Duplicate initial holder address: ${address}`);
      }
      this.#holders.set(normalized, {
        address,
        balance,
        minimumBalance: balance,
      });
    }
  }

  applyTransfer(from: Address | null, to: Address | null, amount: bigint): void {
    if (amount <= 0n) throw new RangeError("Transfer amount must be positive");
    if (from && to && key(from) === key(to)) return;

    if (from) {
      const sender = this.#getOrCreate(from);
      if (sender.balance < amount) {
        throw new RangeError(`Transfer exceeds tracked balance for ${from}`);
      }
      sender.balance -= amount;
      sender.minimumBalance =
        sender.balance < sender.minimumBalance
          ? sender.balance
          : sender.minimumBalance;
    }

    if (to) {
      const recipient = this.#getOrCreate(to);
      recipient.balance += amount;
      // A wallet absent at the window start begins at zero. Its minimum stays
      // zero, so it becomes eligible in the following window—not retroactively.
      recipient.minimumBalance =
        recipient.balance < recipient.minimumBalance
          ? recipient.balance
          : recipient.minimumBalance;
    }
  }

  get(address: Address): Readonly<TrackedHolder> {
    const holder = this.#holders.get(key(address));
    return holder ? { ...holder } : { address, balance: 0n, minimumBalance: 0n };
  }

  snapshot(): ReadonlyArray<Readonly<TrackedHolder>> {
    return [...this.#holders.values()]
      .map((holder) => ({ ...holder }))
      .sort((left, right) => key(left.address).localeCompare(key(right.address)));
  }

  #getOrCreate(address: Address): TrackedHolder {
    const normalized = key(address);
    const existing = this.#holders.get(normalized);
    if (existing) return existing;

    const created = { address, balance: 0n, minimumBalance: 0n };
    this.#holders.set(normalized, created);
    return created;
  }
}
