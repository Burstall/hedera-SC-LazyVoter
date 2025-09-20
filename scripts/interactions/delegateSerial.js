#!/usr/bin/env node

/**
 * Delegate Serial Numbers
 *
 * Delegates NFT serials to another wallet using the LazyDelegateRegistry contract.
 * The delegator must own the NFT serials being delegated.
 *
 * Usage:
 *   node scripts/interactions/delegateSerial.js 0.0.12345 1,2,3 0.0.67890
 *   node scripts/interactions/delegateSerial.js 0x1234...abcd 5 0x5678...efgh
 *   node scripts/interactions/delegateSerial.js --show-owned
 *   node scripts/interactions/delegateSerial.js --delegate-registry-id 0.0.12345 0.0.54321 1,2,3 0.0.67890
 *
 * Options:
 *   --show-owned: Display all NFTs owned by the current account
 *   --delegate-registry-id: Specify the delegate registry contract ID
 *
 * Parameters:
 *   nft-token: The NFT token contract ID (0.0.12345) or address (0x...)
 *   serials: Comma-separated list of NFT serial numbers to delegate
 *   delegate-address: The Hedera account ID or Ethereum address to delegate to
 *
 * Environment Variables:
 *   PRIVATE_KEY - Your Hedera private key (required)
 *   ACCOUNT_ID - Your Hedera account ID (required)
 *   LAZY_DELEGATE_REGISTRY_CONTRACT_ID - Delegate registry contract ID (required)
 *   ENVIRONMENT - Network environment (TEST, MAIN, PREVIEW, LOCAL)
 */

const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const { ethers } = require('ethers');
const readlineSync = require('readline-sync');
const { getArgFlag } = require('../../utils/nodeHelpers');
const { contractExecuteFunction } = require('../../utils/solidityHelpers');
const { getSerialsOwned, convertToEthereumAddress } = require('../../utils/hederaMirrorHelpers');

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const delegateRegistryContractName = 'LazyDelegateRegistry';

// Define vote type mappings
const ENVIRONMENT = process.env.ENVIRONMENT ?? 'TEST';

let client;
switch (ENVIRONMENT.toUpperCase()) {
case 'TEST':
	client = Client.forTestnet();
	console.log('Using Hedera Testnet');
	break;
case 'MAIN':
	client = Client.forMainnet();
	console.log('Using Hedera Mainnet');
	break;
case 'PREVIEW':
	client = Client.forPreviewnet();
	console.log('Using Hedera Previewnet');
	break;
case 'LOCAL': {
	const { LocalProvider } = require('@hashgraph/hedera-local');
	client = LocalProvider.getClient();
	console.log('Using Hedera Local');
	break;
}
default:
	throw new Error(`Unknown environment: ${ENVIRONMENT}`);
}

client.setOperator(operatorId, operatorKey);

async function main() {
	try {
		console.log('\n-----------------------');
		console.log('DELEGATE NFT SERIALS');
		console.log('-----------------------');
		console.log(`Using account: ${operatorId.toString()}`);

		const args = process.argv.slice(2);

		// Handle --show-owned flag
		if (getArgFlag(args, 'show-owned')) {
			const filteredArgs = args.filter(arg => !arg.startsWith('--'));
			if (filteredArgs.length >= 1) {
				const nftTokenInput = filteredArgs[0];
				let tokenAddress;
				try {
					if (nftTokenInput.startsWith('0.0.')) {
						const tokenId = ContractId.fromString(nftTokenInput);
						tokenAddress = tokenId.toSolidityAddress();
					}
					else if (nftTokenInput.startsWith('0x')) {
						if (!ethers.isAddress(nftTokenInput)) {
							throw new Error('Invalid Ethereum address format');
						}
						tokenAddress = nftTokenInput.toLowerCase();
					}
					else {
						throw new Error('Invalid token address format');
					}
					await showOwnedNFTs(tokenAddress);
				}
				catch {
					console.error('ERROR: Invalid NFT token address format');
				}
			}
			else {
				console.log('\n-----------------------');
				console.log('YOUR OWNED NFTs');
				console.log('-----------------------');
				console.log('To show owned NFTs, please provide the NFT token address:');
				console.log('Usage: node scripts/interactions/delegateSerial.js 0.0.12345 --show-owned');
				console.log('This will show all NFTs you own for token 0.0.12345');
			}
			process.exit(0);
		}

		// Get contract ID
		const delegateRegistryContractId = getArgFlag(args, 'delegate-registry-id') ||
			process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID;

		if (!delegateRegistryContractId) {
			console.error('ERROR: LazyDelegateRegistry contract ID is required. Set LAZY_DELEGATE_REGISTRY_CONTRACT_ID or use --delegate-registry-id');
			process.exit(1);
		}

		// Parse arguments
		const filteredArgs = args.filter(arg => !arg.startsWith('--'));

		if (filteredArgs.length < 3) {
			console.error('ERROR: Please provide NFT token address, serial numbers, and delegate address');
			console.error('Usage: node scripts/interactions/delegateSerial.js 0.0.12345 1,2,3 0.0.67890');
			process.exit(1);
		}

		const nftTokenInput = filteredArgs[0];
		const serialsInput = filteredArgs[1];
		const delegateAddressInput = filteredArgs[2];

		// Parse NFT token address
		let tokenAddress;
		let tokenId;
		try {
			if (nftTokenInput.startsWith('0.0.')) {
				// Convert Hedera token ID to Ethereum address
				tokenId = ContractId.fromString(nftTokenInput);
				tokenAddress = tokenId.toSolidityAddress();
			}
			else if (nftTokenInput.startsWith('0x')) {
				// Already an Ethereum address
				if (!ethers.isAddress(nftTokenInput)) {
					throw new Error('Invalid Ethereum address format');
				}
				tokenAddress = nftTokenInput.toLowerCase();
				tokenId = ContractId.fromEvmAddress(0, 0, tokenAddress);
			}
			else {
				throw new Error('Invalid token address format');
			}
		}
		catch {
			console.error('ERROR: Invalid NFT token address. Please provide a Hedera token ID (0.0.12345) or Ethereum address (0x...)');
			process.exit(1);
		}

		// Parse serial numbers
		let serials;
		try {
			serials = serialsInput.split(',').map(s => parseInt(s.trim()));
			if (serials.some(s => isNaN(s) || s <= 0)) {
				throw new Error('Invalid serial number');
			}
		}
		catch {
			console.error('ERROR: Invalid serial numbers. Please provide comma-separated positive integers.');
			console.error('Example: 1,2,3');
			process.exit(1);
		}

		// Parse delegate address
		let delegateAddress;
		try {
			if (delegateAddressInput.startsWith('0.0.')) {
				// Convert Hedera account ID to Ethereum address
				const accountId = AccountId.fromString(delegateAddressInput);
				delegateAddress = convertToEthereumAddress(accountId);
			}
			else if (delegateAddressInput.startsWith('0x')) {
				// Already an Ethereum address
				if (!ethers.isAddress(delegateAddressInput)) {
					throw new Error('Invalid Ethereum address format');
				}
				delegateAddress = delegateAddressInput.toLowerCase();
			}
			else {
				throw new Error('Invalid address format');
			}
		}
		catch {
			console.error('ERROR: Invalid delegate address. Please provide a Hedera account ID (0.0.12345) or Ethereum address (0x...)');
			process.exit(1);
		}

		console.log('\nDelegation Details:');
		console.log(`- NFT Token: ${tokenId} / ${tokenAddress}`);
		console.log(`- Serials: ${serials.join(', ')}`);
		console.log(`- Delegate Address: ${delegateAddress}`);
		console.log(`- Delegate Registry: ${delegateRegistryContractId}`);

		// Verify ownership of serials
		console.log('\nVerifying ownership of serials...');
		const ownedSerials = await verifyOwnership(tokenId, serials);

		if (ownedSerials.length === 0) {
			console.error('ERROR: You do not own any of the specified serial numbers');
			process.exit(1);
		}

		if (ownedSerials.length < serials.length) {
			const notOwned = serials.filter(s => !ownedSerials.includes(s));
			console.warn(`WARNING: You do not own serials: ${notOwned.join(', ')}`);
			console.log(`Will proceed with owned serials: ${ownedSerials.join(', ')}`);

			const proceed = readlineSync.keyInYN('Continue with owned serials only?');
			if (!proceed) {
				console.log('Operation cancelled');
				process.exit(0);
			}
		}

		// Confirm delegation
		console.log('\n=== DELEGATION CONFIRMATION ===');
		console.log(`You are about to delegate ${ownedSerials.length} NFT serial(s) to: ${delegateAddress}`);
		console.log(`Serials: ${ownedSerials.join(', ')}`);
		console.log('\nThis will allow the delegate to vote with these NFTs on your behalf.');
		console.log('You can revoke this delegation at any time.');

		const confirm = readlineSync.keyInYN('\nProceed with delegation?');
		if (!confirm) {
			console.log('Delegation cancelled');
			process.exit(0);
		}

		// Execute delegation
		await executeDelegation(delegateRegistryContractId, delegateAddress, tokenAddress, ownedSerials);

		console.log('\n✅ Delegation completed successfully!');
		console.log(`Delegated ${ownedSerials.length} serial(s) to ${delegateAddress}`);

	}
	catch (error) {
		console.error('\n❌ Error during delegation:', error.message);
		if (error.stack) {
			console.error('Stack trace:', error.stack);
		}
		process.exit(1);
	}

	process.exit(0);
}

/**
 * Show all NFTs owned by the current account for a specific token
 */
async function showOwnedNFTs(tokenAddress) {
	try {
		console.log('\n-----------------------');
		console.log('YOUR OWNED NFTs');
		console.log('-----------------------');

		console.log(`NFT Token Address: ${tokenAddress}`);

		const ownedSerials = await getSerialsOwned(tokenAddress, operatorId.toString());

		if (ownedSerials.length === 0) {
			console.log('You do not own any NFTs for this token');
		}
		else {
			console.log(`You own ${ownedSerials.length} NFT(s):`);
			console.log(`Serial numbers: ${ownedSerials.sort((a, b) => a - b).join(', ')}`);
		}

	}
	catch (error) {
		console.error('Error retrieving owned NFTs:', error.message);
	}
}

/**
 * Verify ownership of serial numbers
 */
async function verifyOwnership(tokenAddress, serials) {
	try {
		const ownedSerials = await getSerialsOwned(ENVIRONMENT, operatorId.toString(), tokenAddress);
		return serials.filter(serial => ownedSerials.includes(serial));
	}
	catch (error) {
		console.error('Error verifying ownership:', error.message);
		return [];
	}
}

/**
 * Execute the delegation transaction
 */
async function executeDelegation(delegateRegistryContractId, delegateAddress, tokenAddress, serials) {
	try {
		console.log('\nExecuting delegation transaction...');

		// Read the delegate registry ABI
		const delegateRegistryABI = JSON.parse(fs.readFileSync(`artifacts/contracts/${delegateRegistryContractName}.sol/${delegateRegistryContractName}.json`, 'utf8'));
		const iface = new ethers.Interface(delegateRegistryABI.abi);

		// Execute the contract function
		// Dynamic gas limit: base cost + per-serial cost
		const gasLimit = 300_000 + 180_000 * serials.length;
		const returnObj = await contractExecuteFunction(
			delegateRegistryContractId,
			iface,
			client,
			gasLimit,
			'delegateNFT',
			[delegateAddress, tokenAddress, serials],
		);

		if (returnObj[0]?.status?.toString() !== 'SUCCESS') {
			throw new Error(`Transaction failed with status: ${returnObj}`);
		}
		console.log('✅ Transaction completed successfully');
		console.log(`Transaction ID: ${returnObj[2]?.transactionId?.toString()}`);

		return { receipt: returnObj[0], results: returnObj[1], record: returnObj[2] };

	}
	catch (error) {
		console.error('Error executing delegation:', error.message);
		throw error;
	}
}

// Run the main function
if (require.main === module) {
	main().catch((error) => {
		console.error('Unhandled error:', error);
		process.exit(1);
	});
}

module.exports = {
	main,
	showOwnedNFTs,
	verifyOwnership,
	executeDelegation,
};