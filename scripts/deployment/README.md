# LazyVoter Deployment Scripts

This directory contains deployment scripts for the LazyVoter smart contract and its dependencies on the Hedera network using the Hedera Token Service (HTS).

## Overview

The deployment scripts use the Hedera SDK to deploy contracts directly through the Hedera Smart Contract Service. This approach provides:

- **Native Hedera Integration**: Direct interaction with Hedera services
- **Key Type Flexibility**: Support for both ED25519 and ECDSA keys
- **Simplified Deployment**: No need for JSON-RPC endpoints or gas estimation
- **Fixed Gas Limits**: Predictable deployment costs

## Scripts

### deploy-LazyDelegateRegistry.js

Deploys the LazyDelegateRegistry contract, which manages NFT delegation for voting purposes.

**Usage:**
```bash
node scripts/deployment/deploy-LazyDelegateRegistry.js --env TEST
```

**Options:**
- `--env`: Network environment (TEST, MAIN, PREVIEW, LOCAL)
- `--bytecode-file-id`: Optional existing bytecode file ID for deployment
- `--artifact-dir`: Path to contract artifacts (default: ./artifacts/contracts)
- `--contract-name`: Contract name (default: LazyDelegateRegistry)

### deploy-LazyVoter.js

Deploys the LazyVoter contract with full voting configuration.

**Usage:**
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --vote-message "Should we implement feature X?" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 10 \
  --start-time 1695120000 \
  --end-time 1695206400 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5
```

**Options:**
- `--env`: Network environment (TEST, MAIN, PREVIEW, LOCAL)
- `--vote-message`: The voting proposal text
- `--nft-token`: NFT contract address (0x... or 0.0.x format)
- `--quorum`: Minimum votes required
- `--start-time`: Voting start time (Unix timestamp)
- `--end-time`: Voting end time (Unix timestamp)
- `--registry`: LazyDelegateRegistry contract ID
- `--eligible-serials`: Comma-separated NFT serial numbers
- `--bytecode-file-id`: Optional existing bytecode file ID
- `--artifact-dir`: Path to contract artifacts
- `--contract-name`: Contract name (default: LazyVoter)

## Prerequisites

1. **Environment Setup**:
   ```bash
   cp .env.example .env
   ```

2. **Required Environment Variables**:
   - `PRIVATE_KEY`: Your Hedera private key (ED25519 or ECDSA format)
   - `ACCOUNT_ID`: Your Hedera account ID (e.g., 0.0.12345)

3. **Dependencies**:
   ```bash
   npm install
   ```

4. **Compiled Contracts**:
   ```bash
   npx hardhat compile
   ```

## Environment Variables

You can set any command-line options as environment variables:

```bash
export VOTE_MESSAGE="Approve budget increase"
export NFT_TOKEN="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
export QUORUM=50
export REGISTRY="0.0.54321"
export ELIGIBLE_SERIALS="1,2,3,4,5,10,15,20"
```

## Network Environments

- `TEST`: Hedera testnet
- `MAIN`: Hedera mainnet
- `PREVIEW`: Hedera previewnet
- `LOCAL`: Local Hedera network

## Key Types

The scripts automatically detect your key type:

- **ED25519 keys**: Work natively with HTS deployment
- **ECDSA keys**: Also supported by HTS deployment

Both key types are handled seamlessly by the Hedera SDK.

## Deployment Flow

1. **Configuration Display**: Shows all deployment parameters
2. **Interactive Confirmation**: Asks for user confirmation before proceeding
3. **Contract Deployment**: Deploys using HTS with fixed gas limits
4. **Result Display**: Shows contract ID and Solidity address

## Gas and Fees

- **Fixed Gas Limits**: LazyDelegateRegistry uses 3.5M gas, LazyVoter uses 4.6M gas
- **Network Fees**: Determined by Hedera network fee schedules
- **No Gas Estimation**: HTS deployment doesn't require gas estimation

## Examples

### Basic Registry Deployment
```bash
node scripts/deployment/deploy-LazyDelegateRegistry.js --env TEST
```

### Full LazyVoter Deployment
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --vote-message "Upgrade to v2.0" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 25 \
  --registry 0.0.12345
```

### Using Environment Variables
```bash
export PRIVATE_KEY="your-private-key-here"
export ACCOUNT_ID="0.0.your-account-id"
export VOTE_MESSAGE="Implement decentralized governance"
export NFT_TOKEN="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
export QUORUM=100
export REGISTRY="0.0.54321"

node scripts/deployment/deploy-LazyVoter.js --env MAIN
```

### Deployment with Specific Times
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --vote-message "Community proposal #42" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 50 \
  --start-time 1696118400 \
  --end-time 1698720000 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5,6,7,8,9,10
```

## Time Handling

- Start and end times are Unix timestamps (seconds since epoch)
- The script displays both Unix timestamps and local time for clarity
- Example: `1695120000 (9/19/2023, 12:00:00 PM)`

## Eligible Serials

- **Optional**: Can be empty at deployment
- **Format**: Comma-separated list of NFT serial numbers
- **Post-deployment**: Can be added later using contract functions
- **Use case**: Restrict voting to specific NFT holders

## Error Handling

The scripts provide detailed error messages for:
- Missing required parameters
- Invalid private key format
- Network connection issues
- Contract deployment failures

## Troubleshooting

1. **"Missing PRIVATE_KEY"**: Ensure your `.env` file contains the correct private key
2. **"Missing ACCOUNT_ID"**: Ensure your `.env` file contains your Hedera account ID
3. **"Invalid PRIVATE_KEY format"**: Ensure your key is in the correct format (ED25519 base64/hex or ECDSA hex)
4. **Network connection issues**: Check your internet connection and Hedera network status
5. **Contract deployment failures**: Verify your account has sufficient HBAR balance

## Post-Deployment

After successful deployment:
1. Note the contract ID and Solidity address
2. Update your frontend/configuration with the new contract address
3. If needed, add eligible serials using the contract's `addEligibleSerials` function
4. Monitor the voting period and results

For more information about the LazyVoter contract functionality, see the main project README.

### Examples

#### Basic Registry Deployment
```bash
node scripts/deployment/deploy-LazyDelegateRegistry.js \
  --env TEST \
  --rpc-url https://testnet.hashio.io/api
```

#### HTS Deployment
```bash
node scripts/deployment/deploy-LazyDelegateRegistry.js \
  --env MAIN \
  --use-hts
```

### Post-Deployment

After deploying the registry:
1. Save the contract address/ID
2. Use this address as the `--registry` parameter when deploying LazyVoter
3. The registry is now ready to handle delegation operations

---

## LazyVoter Contract Overview

The LazyVoter contract enables NFT-based voting with delegation capabilities. It requires several parameters at deployment:

- **Vote Message**: The proposal or question being voted on
- **NFT Token**: The ERC-721 token contract address used for voting rights
- **Quorum**: Minimum number of votes required for the proposal to pass
- **Start Time**: When voting begins (Unix timestamp)
- **End Time**: When voting ends (Unix timestamp)
- **Registry**: LazyDelegateRegistry contract address for delegation functionality
- **Eligible Serials**: Optional list of NFT serial numbers eligible to vote (can be added later)

## Deployment Script: deploy-LazyVoter.js

### Prerequisites

1. **Environment Setup**: Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. **Required Environment Variables**:
   - `PRIVATE_KEY`: Your Hedera private key (ED25519 or ECDSA format)
   - `ACCOUNT_ID`: Your Hedera account ID (e.g., 0.0.12345)

3. **Dependencies**: Ensure all npm packages are installed:
   ```bash
   npm install
   ```

4. **Compiled Contracts**: Make sure contracts are compiled:
   ```bash
   npx hardhat compile
   ```

### Usage

The script supports two deployment methods:

#### 1. Ethers Path (JSON-RPC)
Recommended for most deployments with gas estimation and EIP-1559 fees.

```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --vote-message "Should we implement feature X?" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 10 \
  --start-time 1695120000 \
  --end-time 1695206400 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5
```

Or with custom RPC URL:
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --rpc-url https://testnet.hashio.io/api \
  --vote-message "Should we implement feature X?" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 10 \
  --start-time 1695120000 \
  --end-time 1695206400 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5
```

#### 2. HTS Path (Hedera SDK)
Use when JSON-RPC is not available or for direct Hedera Smart Contract Service integration.

```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --use-hts \
  --vote-message "Should we implement feature X?" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 10 \
  --start-time 1695120000 \
  --end-time 1695206400 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5
```

### Command Line Options

| Option | Type | Required | Description | Default |
|--------|------|----------|-------------|---------|
| `--env` | string | Yes | Network: TEST, MAIN, PREVIEW, LOCAL | TEST |
| `--rpc-url` | string | No* | JSON-RPC endpoint (*optional for Ethers path, uses default based on --env) | Auto** |
| `--use-hts` | boolean | No | Use Hedera SDK instead of Ethers | false |
| `--vote-message` | string | No | The voting proposal text | "Default Vote Message" |
| `--nft-token` | string | Yes | NFT contract address | - |
| `--quorum` | number | No | Minimum votes required | 1 |
| `--start-time` | number | No | Voting start (Unix timestamp) | Current time |
| `--end-time` | number | No | Voting end (Unix timestamp) | Start time + 1 day |
| `--registry` | string | Yes | LazyDelegateRegistry contract ID | - |
| `--eligible-serials` | string | No | Comma-separated NFT serials | Empty array |
| `--gas-multiplier` | number | No | Gas estimation multiplier | 1.15 |
| `--max-fee-gwei` | number | No | Override maxFeePerGas (Ethers only) | Auto |
| `--max-priority-gwei` | number | No | Override maxPriorityFeePerGas (Ethers only) | Auto |
| `--bytecode-file-id` | string | No | Use existing bytecode file (HTS only) | - |

**Default RPC URLs by environment:**
- TEST: `https://testnet.hashio.io/api`
- MAIN: `https://mainnet.hashio.io/api`
- PREVIEW: `https://previewnet.hashio.io/api`
- LOCAL: `http://127.0.0.1:7546`

### Environment Variables

You can set any of the above options as environment variables (uppercase, prefixed with script name if needed):

```bash
export VOTE_MESSAGE="Approve budget increase"
export NFT_TOKEN="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
export QUORUM=50
export REGISTRY="0.0.54321"
export ELIGIBLE_SERIALS="1,2,3,4,5,6,7,8,9,10"
```

### Important Notes

#### Time Handling
- Start and end times are Unix timestamps (seconds since epoch)
- The script displays both Unix timestamps and local time for clarity
- Example: `1695120000 (9/19/2023, 12:00:00 PM)`

#### Eligible Serials
- **Optional**: Can be empty at deployment
- **Format**: Comma-separated list of NFT serial numbers
- **Post-deployment**: Can be added later using contract functions
- **Use case**: Restrict voting to specific NFT holders

#### Gas and Fees
- **Ethers path**: Estimates gas and shows cost breakdown
- **HTS path**: Uses fixed gas limit (4,600,000)
- Gas multiplier helps prevent out-of-gas errors

#### Network Selection
- `TEST`: Hedera testnet
- `MAIN`: Hedera mainnet
- `PREVIEW`: Hedera previewnet
- `LOCAL`: Local Hedera network

### Interactive Confirmation

The script will:
1. Display all deployment parameters
2. Show gas estimates and costs (Ethers path)
3. Ask for confirmation before proceeding
4. Display the deployment transaction hash upon success

### Error Handling

The script provides detailed error messages for:
- Missing required parameters
- Invalid private key format
- Network connection issues
- Contract deployment failures

### Examples

#### Basic Deployment
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --rpc-url https://testnet.hashio.io/api \
  --vote-message "Upgrade to v2.0" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 25 \
  --registry 0.0.12345
```

#### Full Configuration with Environment Variables
```bash
export PRIVATE_KEY="your-private-key-here"
export ACCOUNT_ID="0.0.your-account-id"
export VOTE_MESSAGE="Implement decentralized governance"
export NFT_TOKEN="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
export QUORUM=100
export REGISTRY="0.0.54321"
export ELIGIBLE_SERIALS="1,2,3,4,5,10,15,20"

node scripts/deployment/deploy-LazyVoter.js \
  --env MAIN \
  --rpc-url https://mainnet.hashio.io/api \
  --gas-multiplier 1.2
```

#### HTS Deployment with Specific Times
```bash
node scripts/deployment/deploy-LazyVoter.js \
  --env TEST \
  --use-hts \
  --vote-message "Community proposal #42" \
  --nft-token 0x1234567890123456789012345678901234567890 \
  --quorum 50 \
  --start-time 1696118400 \
  --end-time 1698720000 \
  --registry 0.0.12345 \
  --eligible-serials 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
```

### Troubleshooting

1. **"Missing PRIVATE_KEY"**: Ensure your `.env` file contains the correct private key
2. **"Missing ACCOUNT_ID"**: Ensure your `.env` file contains your Hedera account ID
3. **"ED25519 key detected" (Ethers path)**:
   - Use `--use-hts` flag (recommended for ED25519 keys)
   - ECDSA keys work with both Ethers and HTS paths
   - ED25519 keys work natively with HTS but need ECDSA for Ethers
4. **Custom RPC URL needed**: If you want to use a different RPC endpoint, specify `--rpc-url`
5. **Gas estimation failures**: Try increasing `--gas-multiplier` or use HTS path
6. **Invalid timestamp**: Ensure start time is before end time and in the future

### Post-Deployment

After successful deployment:
1. Note the contract address and transaction hash
2. Update your frontend/configuration with the new contract address
3. If needed, add eligible serials using the contract's `addEligibleSerials` function
4. Monitor the voting period and results

For more information about the LazyVoter contract functionality, see the main project README.</content>
<parameter name="filePath">d:\github\hedera-SC-LazyVoter\scripts\deployment\README.md