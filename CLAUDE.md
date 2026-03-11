# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LazyVoter is an NFT-based on-chain voting system for the Hedera blockchain, published as `@lazysuperheroes/lazy-voter`. Two core Solidity contracts:

- **LazyVoter** (`contracts/LazyVoter.sol`) — Main voting contract. NFT holders vote on proposals (yes/no/abstain) using eligible serial numbers. Supports quorum, pause/unpause, re-voting, and paginated analytics. **Vote follows the NFT** — no snapshot at start time. Whoever holds the NFT during the voting window can vote or re-vote. This is an intentional design choice.
- **LazyDelegateRegistry** (`contracts/LazyDelegateRegistry.sol`) — Pre-existing delegation system (from a separate project, considered already tested). Supports wallet-wide and per-serial NFT delegation. Exclusive — once delegated, only the delegate can vote.

Interface: `contracts/interfaces/ILazyDelegateRegistry.sol`

## Build & Test Commands

```bash
npm install                    # Install dependencies
npx hardhat compile            # Compile contracts
npm test                       # Run all tests (requires .env with Hedera credentials)
npm run test-voter             # Run LazyVoter tests only
npm run solhint                # Lint Solidity (table format)
npm run extract-abi            # Extract ABIs to abi/ directory
npm pack --dry-run             # Preview NPM package contents
node bin/lazyvote.js --help    # CLI help
```

Tests run against a live Hedera network (testnet/mainnet/previewnet/local node) — they are slow (~2 min) and require `ACCOUNT_ID` and `PRIVATE_KEY` in `.env`. The test includes a 5-second minimum sleep for Hedera consensus timestamp lag when waiting for vote window to open.

## Deployment

Two-step process (registry first, then voter):

```bash
node scripts/deployment/deploy-LazyDelegateRegistry.js --env TEST
node scripts/deployment/deploy-LazyVoter.js --env TEST --vote-message "..." --nft-token 0.0.x --registry 0.0.x --quorum 10 --start-time <unix> --end-time <unix> --eligible-serials 1,2,3
```

All deployment and interaction scripts use `yargs` for CLI args. Run with `--help` for usage.

## Architecture

### Contract Design
- Solidity 0.8.18, compiled with optimizer (200 runs, viaIR enabled)
- OpenZeppelin v4.9.6: `Ownable`, `EnumerableSet` (UintSet + AddressSet), `Address`, `IERC721`
- Custom errors (not `require` strings) for gas efficiency
- All state mutations emit events
- Max 40 serials per `vote()` call to prevent gas exhaustion
- NFT token address is immutable after deployment
- `VoteType.None` is rejected — only Yes/No/Abstain accepted
- `getAllVoters()` uses O(n) `EnumerableSet.AddressSet` with a `voterCounts` mapping

### Delegation Flow
Delegation is exclusive: if a serial is delegated, only the delegate can vote it (prevents double voting). The registry validates NFT ownership — delegation becomes invalid if the NFT is transferred.

### NPM Package (`lib/`)
Published as `@lazysuperheroes/lazy-voter`:
- `lib/index.js` — Package entry point. Exports ABIs, SDK client, and utility functions.
- `lib/LazyVoterClient.js` — High-level SDK wrapper with typed methods (getResults, getStatus, vote, pauseVoting, etc.)
- `lib/output.js` — Output formatter supporting JSON mode
- `lib/serialParser.js` — Parses serial ranges like "1-3,7,10-12" into arrays
- `abi/` — Standalone ABI JSON files for LazyVoter and LazyDelegateRegistry

### CLI (`bin/`)
Unified `lazyvote` command (entry: `bin/lazyvote.js`) with yargs subcommands:
- `lazyvote query <subcommand>` — results, status, info, eligible, voters, votes-by (read-only)
- `lazyvote vote <serials> <choice>` — cast votes with gas estimation
- `lazyvote admin <subcommand>` — pause, unpause, add-serials, set-message, set-quorum (owner-only)
- `lazyvote delegate / revoke` — NFT delegation management
- `lazyvote deploy` — delegates to deployment scripts

### Utilities (`utils/`)
- `clientFactory.js` — Shared client factory: `createClient`, `loadOperator` (ED25519/ECDSA auto-detect), `loadInterface`, `readContractValue`
- `solidityHelpers.js` — Contract deployment and interaction via Hedera SDK + ethers
- `hederaMirrorHelpers.js` — Hedera Mirror Node REST API queries
- `nodeHelpers.js` — General Node.js utilities (sleep, arg parsing)
- `gasHelpers.js` — Gas estimation via mirror node with tiered buffers (50% < 600K, 20% >= 600K, 14.5M cap)

### Scripts
- `scripts/deployment/` — Contract deployment (LazyVoter, LazyDelegateRegistry, ABI extraction)
- `scripts/interactions/` — Individual CLI scripts for casting votes, delegation, querying results, admin controls
- `scripts/debug/` — Error decoding, contract info, log retrieval

## Environment Setup

Copy `.env.example` to `.env`. Required variables:
- `ENVIRONMENT` — `TEST`, `MAIN`, `PREVIEW`, or `LOCAL`
- `ACCOUNT_ID` / `PRIVATE_KEY` — Hedera operator credentials (not needed for LOCAL)

Key handling: All scripts use try/catch ED25519 → ECDSA fallback pattern for private key parsing.

## Solidity Conventions
- `not-rely-on-time` rule is disabled in solhint (voting uses block timestamps intentionally)
- Max 18 state variables per contract (solhint warning threshold)
- Constructor visibility warnings ignored
- Compiler version constraint: `^0.8.12`
