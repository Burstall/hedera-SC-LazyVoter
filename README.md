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

### Views & Analytics
- `totalEligibleVoters()`
- `getAllVoters()`
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

## Extensibility
- Modular design: easy to add new analytics, controls, or voting logic.

## Deployment & Usage
- Deploy with constructor arguments.
- Fund contract with HBAR if needed.
- Owner manages eligible serials and controls before voting starts.
- Users vote with eligible NFT serials during the voting window.
- Owner can withdraw HBAR at any time.

## License
MIT