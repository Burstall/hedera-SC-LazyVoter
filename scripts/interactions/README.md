# LazyVoter Interaction Scripts

This directory contains command-line scripts for interacting with the LazyVoter smart contract on Hedera. These scripts allow you to read contract state, manage voting parameters, and cast votes.

## Overview

The LazyVoter contract enables NFT-based voting with delegation support. These scripts provide a user-friendly interface to interact with all contract functions.

## Prerequisites

### Environment Setup

1. **Copy environment template**:
   ```bash
   cp .env.example .env
   ```

2. **Configure your `.env` file**:
   ```bash
   # Required for all scripts
   PRIVATE_KEY=your-hedera-private-key
   ACCOUNT_ID=0.0.your-account-id
   CONTRACT_ID=0.0.lazyvoter-contract-id
   ENVIRONMENT=TEST

   # Optional
   CONTRACT_NAME=LazyVoter
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Compile contracts**:
   ```bash
   npx hardhat compile
   ```

## Script Categories

### 📖 Read-Only Scripts (Free via Mirror Node)

These scripts read contract state without requiring gas fees:

#### `getLazyVoterInfo.js`
Get comprehensive contract information including vote message, quorum, voting times, NFT token, registry, and current vote counts.

```bash
node scripts/interactions/getLazyVoterInfo.js 0.0.12345
```

#### `getVotingStatus.js`
Get current voting status, time remaining, participation analytics, and quorum status.

```bash
node scripts/interactions/getVotingStatus.js 0.0.12345
```

#### `getEligibleSerials.js`
Get list of eligible NFT serials with pagination support.

```bash
# Get first 50 serials
node scripts/interactions/getEligibleSerials.js 0.0.12345

# Get serials 50-99
node scripts/interactions/getEligibleSerials.js 0.0.12345 50 50
```

#### `getAllVoters.js`
Get all voters and their vote counts with summary statistics.

```bash
node scripts/interactions/getAllVoters.js 0.0.12345
```

#### `getVoteResults.js`
Get detailed voting results with visual breakdown and winner determination.

```bash
node scripts/interactions/getVoteResults.js 0.0.12345
```

#### `getVotesByAddress.js`
Get all votes cast by a specific address.

```bash
node scripts/interactions/getVotesByAddress.js 0.0.12345 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

#### `getTimeRemaining.js`
Get time remaining in voting period with detailed breakdown.

```bash
node scripts/interactions/getTimeRemaining.js 0.0.12345
```

### ⚙️ Write Scripts (Require Gas)

These scripts modify contract state and require transaction fees:

#### `addEligibleSerials.js`
Add NFT serials to the eligible voters list (owner only, before voting starts).

```bash
node scripts/interactions/addEligibleSerials.js 1,2,3,4,5
```

#### `updateVoteMessage.js`
Update the voting proposal message (owner only).

```bash
node scripts/interactions/updateVoteMessage.js "Should we implement the new governance system?"
```

#### `castVote.js`
Cast a vote using eligible NFT serials.

```bash
# Vote yes with multiple serials
node scripts/interactions/castVote.js 1,2,3 yes

# Vote no with single serial
node scripts/interactions/castVote.js 5 no

# Abstain
node scripts/interactions/castVote.js 10 abstain
```

#### `pauseVoting.js`
Pause voting temporarily (owner only). When paused, no new votes can be cast.

```bash
node scripts/interactions/pauseVoting.js
```

#### `unpauseVoting.js`
Unpause voting to resume the voting process (owner only).

```bash
node scripts/interactions/unpauseVoting.js
```

## Common Usage Patterns

### Setting Up a Vote

1. **Deploy the contract** using the deployment script
2. **Add eligible serials** before voting starts:
   ```bash
   node scripts/interactions/addEligibleSerials.js 1,2,3,4,5,10,15,20
   ```
3. **Check voting status**:
   ```bash
   node scripts/interactions/getVotingStatus.js 0.0.12345
   ```

### During Voting Period

1. **Check time remaining**:
   ```bash
   node scripts/interactions/getTimeRemaining.js 0.0.12345
   ```
2. **View current results**:
   ```bash
   node scripts/interactions/getVoteResults.js 0.0.12345
   ```
3. **Cast your vote**:
   ```bash
   node scripts/interactions/castVote.js 1,2 yes
   ```

### After Voting

1. **Get final results**:
   ```bash
   node scripts/interactions/getVoteResults.js 0.0.12345
   ```
2. **See all voters**:
   ```bash
   node scripts/interactions/getAllVoters.js 0.0.12345
   ```

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PRIVATE_KEY` | Yes | Your Hedera private key | `302e020100300506032b657004220420...` |
| `ACCOUNT_ID` | Yes | Your Hedera account ID | `0.0.12345` |
| `CONTRACT_ID` | Yes* | LazyVoter contract ID | `0.0.54321` |
| `ENVIRONMENT` | No | Network (TEST/MAIN/PREVIEW/LOCAL) | `TEST` |
| `CONTRACT_NAME` | No | Contract artifact name | `LazyVoter` |

*Required for write scripts, optional for read scripts if you pass contract ID as argument

## Error Handling

### Common Errors

#### `Environment required, please specify ACCOUNT_ID in the .env file`
- **Cause**: Missing or invalid `.env` file
- **Solution**: Ensure `.env` file exists with correct `ACCOUNT_ID`

#### `Contract ID required, please specify CONTRACT_ID in the .env file`
- **Cause**: Write script needs contract ID
- **Solution**: Set `CONTRACT_ID` in `.env` or pass as argument

#### `NotOwnerOrDelegated`
- **Cause**: Trying to vote with serials you don't own or aren't delegated
- **Solution**: Ensure you own the NFTs or have been delegated voting rights

#### `VotingIsPaused`
- **Cause**: Contract owner has paused voting
- **Solution**: Wait for owner to unpause or contact contract owner

#### `VoteStarted`
- **Cause**: Trying to add eligible serials after voting has begun
- **Solution**: Add serials before the voting start time

#### `VoteWindowClosed`
- **Cause**: Trying to vote outside the voting time window
- **Solution**: Vote during the active voting period

## Security Notes

### Owner-Only Functions
- `addEligibleSerials.js`
- `updateVoteMessage.js`
- `pauseVoting.js`
- `unpauseVoting.js`

These scripts require the caller to be the contract owner.

### Voting Requirements
- Must own the NFT serial or be delegated voting rights
- Serial must be eligible to vote
- Voting must be active (not paused, within time window)
- Cannot vote multiple times with the same serial

## Advanced Usage

### Batch Operations
```bash
# Add many serials at once
node scripts/interactions/addEligibleSerials.js 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
```

### Monitoring Votes
```bash
# Check results frequently
watch -n 30 'node scripts/interactions/getVoteResults.js 0.0.12345'
```

### Multi-Network Setup
Create multiple `.env` files for different networks:
```bash
# .env.test
ENVIRONMENT=TEST
CONTRACT_ID=0.0.12345

# .env.main
ENVIRONMENT=MAIN
CONTRACT_ID=0.0.67890
```

## Troubleshooting

### Mirror Node Issues
- **Symptom**: Read scripts fail with network errors
- **Solution**: Check network connectivity and Hedera status

### Transaction Failures
- **Symptom**: Write scripts fail with "INSUFFICIENT_PAYER_BALANCE"
- **Solution**: Ensure your account has sufficient HBAR for gas fees

### Permission Errors
- **Symptom**: "NotOwnerOrDelegated" when you should have access
- **Solution**: Verify NFT ownership and delegation status

## Contributing

When adding new interaction scripts:

1. Follow the existing patterns for error handling
2. Include comprehensive help text (`-h` flag)
3. Add user confirmation for destructive operations
4. Include verification steps after transactions
5. Update this README with the new script

## Related Files

- `../deployment/deploy-LazyVoter.js` - Contract deployment script
- `../../contracts/LazyVoter.sol` - Smart contract source
- `../../test/LazyVoter.test.js` - Contract tests
- `../../README.md` - Main project documentation