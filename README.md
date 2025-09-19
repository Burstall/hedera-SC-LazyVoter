# LazyVoter

A robust, snapshot-based NFT voting contract for Hedera, supporting owner controls, delegation, analytics, and secure HBAR withdrawal.

## Features

- **NFT-based voting**: Each eligible NFT serial can vote once per proposal.
- **Snapshotting**: Owner can batch add, remove, or update eligible NFT serials before voting starts.
- **Quorum**: Set as an absolute number; view returns quorum as basis points (bps).
- **Voting window**: Configurable start and end time; contract enforces voting period.
- **Custom errors/events**: For gas savings and transparency.
- **Owner controls**:
	- Pause/unpause voting
	- Update vote message
	- Update quorum
	- Withdraw HBAR
	- Manage eligible serials
- **Delegation**: Supports delegated voting via `ILazyDelegateRegistry`.
- **Vote types**: Yes, No, Abstain, None.
- **Vote analytics**:
	- Get all voters
	- Get votes by address
	- Paginated results
	- Last voter for serial
	- Total eligible voters
	- Voted serials
	- Results summary
- **Strict voting logic**: Reverts on invalid vote (ineligible, not delegated, outside window).
- **Receive HBAR**: Contract can receive and owner can withdraw HBAR.

## Usage

### Constructor
```solidity
constructor(
		string memory _voteMessage,
		address _nftToken,
		uint256 _quorum,
		uint256 _startTime,
		uint256 _endTime,
		address _lazyDelegateRegistry,
		uint256[] memory _eligibleSerials
)
```
- `_voteMessage`: Description of the vote/proposal.
- `_nftToken`: Address of the NFT contract.
- `_quorum`: Number of Yes votes required to pass.
- `_startTime`, `_endTime`: Voting window (unix timestamps).
- `_lazyDelegateRegistry`: Address of delegation registry.
- `_eligibleSerials`: NFT serials eligible to vote (snapshot).

### Owner Functions
- `pauseVoting()` / `unpauseVoting()`
- `updateVoteMessage(string)`
- `updateQuorum(uint256)`
- `withdrawHbar(address payable, uint256)`
- `addEligibleSerials(uint256[] calldata)`
- `removeEligibleSerials(uint256[] calldata)`
- `updateEligibleSerials(uint256[] calldata addSerials, uint256[] calldata removeSerials)`

### Voting
- `vote(uint256[] calldata serials, VoteType voteType)`
	- Only eligible serials, only once per serial, only by owner or delegated address.
	- **Exclusive delegation**: Once delegated, only the delegate can vote on that serial (owner cannot).
	- **Vote state tracking**: Uses `hasVoted` flag to prevent arithmetic underflow and ensure one-vote-per-serial.

### Views & Analytics
- `totalEligibleVoters()`
- `getAllVoters()` → `(address[] voters, uint256[] voteCounts)`
- `timeRemaining()`
- `getEligibleSerials(uint256 offset, uint256 limit)`
- `getVotesByAddress(address)`
- `votingStatus()`
- `quorumPercent()`
- `lastVoterForSerial(uint256)`
- `getAllVotes(uint256 offset, uint256 limit)`
- `hasQuorum()`
- `getVoteInfo(uint256)`
- `getVotedSerials()`
- `getResults()`

### Events
- `VoteMessageUpdated(string)`
- `QuorumUpdated(uint256)`
- `VoteCasted(address, uint256[], uint8)`
- `HbarWithdrawn(address, uint256)`
- `VotingPaused(bool)`
- `EligibleSerialsAdded(uint256[])`
- `EligibleSerialsRemoved(uint256[])`

### Errors
- `ZeroAddress()`
- `InvalidTime()`
- `RegistryRequired()`
- `NFTTokenRequired()`
- `VotingIsPaused()`
- `VoteStarted()`
- `InsufficientBalance()`
- `NotOwnerOrDelegated(uint256)`
- `VoteWindowClosed()`
- `MaxSerialsExceeded()`
- `SerialNotEligible(uint256)`

## Security
- No reentrancy risk in HBAR withdrawal (uses OpenZeppelin Address).
- All state changes emit events for transparency.
- Voting logic strictly enforces eligibility, delegation, and time window.

## Testing
Comprehensive test suite in `test/LazyVoter.test.js` covers:

### Setup
- Deploy `LazyDelegateRegistry` contract (or use existing via env var).
- Create test accounts (operator, alice, bob) using Hedera `accountCreator`.
- Mint NFT collection using Hedera `mintNFT` helper.
- Associate NFT to accounts and transfer serials for voting scenarios.

### Test Cases
1. **Deployment & Constructor**
   - Valid deployment with all parameters.
   - Reverts on invalid inputs (zero addresses, invalid times).
   - Eligible serials added correctly.

2. **Owner Controls (Pre-Voting)**
   - Add/remove/update eligible serials before `startTime`.
   - Update vote message and quorum before `startTime`.
   - Reverts after voting starts.

3. **Owner Emergency Controls**
   - Pause/unpause voting (anytime).
   - Withdraw HBAR (anytime, with balance checks).

4. **Voting Logic**
   - Valid votes: owner votes on eligible serials.
   - Delegated votes: delegate votes on behalf of owner (exclusive - owner cannot vote once delegated).
   - Vote changes: update existing votes, counts adjust correctly (prevents underflow with `hasVoted` flag).
   - Invalid votes: ineligible serials, non-owner/non-delegate, outside window, paused, max serials exceeded, already voted serials.

5. **Analytics & Views**
   - `getAllVoters` (returns voters + vote counts), `getEligibleSerials` (paginated).
   - `getVotesByAddress`, `getAllVotes` (paginated).
   - `totalEligibleVoters`, `votingStatus`, `timeRemaining`.
   - `quorumPercent`, `hasQuorum`, `getResults`.
   - `lastVoterForSerial`, `getVoteInfo`.

6. **Edge Cases**
   - Empty serial arrays, duplicate serials (gas waste but no state change).
   - Time windows: before start, during, after end.
   - Max 40 serials per vote.
   - Zero quorum, no eligible voters.

7. **Security & Access Control**
   - Only owner can call owner functions.
   - Non-owners cannot vote on non-owned/non-delegated serials.
   - Proper reverts with custom errors.
   - Event emission for all state changes.

### Running Tests
```bash
npm test
# or
npx hardhat test
```
Requires `.env` with `PRIVATE_KEY` and `ACCOUNT_ID` for Hedera network.

## Extensibility
- Modular design: easy to add new analytics, controls, or voting logic.

## Deployment & Usage

### Deployment Scripts
Two deployment scripts are provided for reliable HTS-based deployment:

1. **Deploy LazyDelegateRegistry** (required first):
   ```bash
   node scripts/deployment/deploy-LazyDelegateRegistry.js --env TEST
   ```

2. **Deploy LazyVoter** (requires registry address):
   ```bash
   node scripts/deployment/deploy-LazyVoter.js \
     --env TEST \
     --vote-message "Your proposal here" \
     --nft-token 0x123... \
     --registry 0.0.12345
   ```

### Environment Options
- `--env TEST`: Deploy to Hedera Testnet
- `--env MAIN`: Deploy to Hedera Mainnet
- `--env PREVIEW`: Deploy to Hedera Previewnet
- `--env LOCAL`: Deploy to local Hedera network

### Required Environment Variables
Create a `.env` file with:
```
PRIVATE_KEY=your_private_key_here
ACCOUNT_ID=your_account_id_here
```

### Optional Parameters
- `--bytecode-file-id`: Deploy using existing bytecode file ID instead of inline bytecode
- `--start-time`: Voting start time (unix timestamp, defaults to now)
- `--end-time`: Voting end time (unix timestamp, defaults to +1 day)
- `--quorum`: Required quorum (defaults to 1)
- `--eligible-serials`: Comma-separated list of eligible NFT serials

See `scripts/deployment/README.md` for detailed usage instructions.

### Manual Deployment
- Deploy contracts using Hedera SDK with HTS (Hedera Token Service)
- Fund contract with HBAR if needed
- Owner manages eligible serials and controls before voting starts
- Users vote with eligible NFT serials during the voting window
- Owner can withdraw HBAR at any time

## License
MIT