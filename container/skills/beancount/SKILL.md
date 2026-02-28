---
name: beancount
description: Read and edit James's personal beancount accounting files. Use for questions about finances, transactions, account balances, expenses, and income. Use proactively whenever the user asks about their accounts, spending, money, or financial data.
---

# Beancount Accounts

James's beancount ledger is at `/home/nanobot/src/james_accounts/`.

## Key files

| File | Purpose |
|------|---------|
| `journal.beancount` | Main entry point — includes all others |
| `src/transactions.beancount` | Most recent transactions |
| `src/transactions_2.beancount`, `src/transactions_3.beancount` | Older transactions |
| `src/manual.beancount` | Manually entered transactions |
| `src/accounts.beancount` | Account definitions |
| `src/balance.beancount` | Balance assertions |
| `src/prices.beancount`, `src/prices_new.beancount` | Commodity prices |
| `src/vanguard.beancount` | Vanguard investments |
| `src/hl_sipp.beancount` | HL SIPP pension |
| `src/hsbc_mortgage.beancount` | HSBC mortgage |
| `src/santander.beancount` | Santander account |

Operating currency is **GBP**.

## CLI tools (in the venv)

Activate the venv first, then use any beancount tool:

```bash
cd /home/nanobot/src/james_accounts
source .venv/bin/activate

bean-check journal.beancount              # Validate the ledger (no output = no errors)
bean-query journal.beancount '<query>'    # SQL-like queries
bean-format src/manual.beancount         # Auto-format a file (outputs to stdout)
```

### Useful bean-query examples

```bash
# All transactions in the last 30 days
bean-query journal.beancount "SELECT date, narration, position WHERE date >= 2026-01-01 ORDER BY date DESC LIMIT 20"

# Balance of all accounts
bean-query journal.beancount "SELECT account, sum(position) GROUP BY account ORDER BY account"

# Expenses by category this month
bean-query journal.beancount "SELECT account, sum(cost(position)) WHERE account ~ 'Expenses' AND date >= 2026-02-01 GROUP BY account ORDER BY account"

# Search transactions by payee/narration
bean-query journal.beancount "SELECT date, narration, position WHERE narration ~ 'Amazon' ORDER BY date DESC"

# Income summary
bean-query journal.beancount "SELECT account, sum(cost(position)) WHERE account ~ 'Income' GROUP BY account"
```

## Beancount file format

```beancount
; This is a comment

; Transaction
2026-02-15 * "Payee" "Description"
  Assets:Current:Monzo        -25.00 GBP
  Expenses:Food:Restaurants    25.00 GBP

; Uncleared transaction (use ! instead of *)
2026-02-15 ! "Payee" "Unclear"
  Assets:Current:Monzo        -25.00 GBP
  Expenses:Misc                25.00 GBP

; Balance assertion
2026-02-01 balance Assets:Current:Monzo  1234.56 GBP

; Open an account
2020-01-01 open Assets:Current:Monzo  GBP
```

**Rules:**
- Transactions must balance to zero (or leave one leg empty — beancount auto-fills it)
- Dates are YYYY-MM-DD
- `*` = cleared, `!` = pending
- Account names use `:` as separator and must be opened before use

## Editing workflow

To add a manual transaction:

1. Read the relevant file first to understand the context:
   ```bash
   tail -20 /home/nanobot/src/james_accounts/src/manual.beancount
   ```
2. Edit the file directly using the Edit or Write tool
3. Validate after editing:
   ```bash
   cd /home/nanobot/src/james_accounts && source .venv/bin/activate && bean-check journal.beancount
   ```
