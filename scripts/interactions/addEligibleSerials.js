#!/usr/bin/env node

/**
 * Add Eligible NFT Serials
 *
 * Adds eligible NFT serials to the LazyVoter contract (owner only).
 * Can only be called before voting starts.
 *
 * Usage:
 *   node scripts/interactions/addEligibleSerials.js 1,2,3,4,5
 *
 * Parameters:
 *   serials: Comma-separated list of NFT serial numbers to add
 *
 * Environment Variables:
 *   PRIVATE_KEY - Your Hedera private key (required)
 *   ACCOUNT_ID - Your Hedera account ID (required)
 *   CONTRACT_ID - LazyVoter contract ID (required)
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

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? 'LazyVoter';

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const env = process.env.ENVIRONMENT ?? 'TEST';

let client;

const main = async () => {
	const args = process.argv.slice(2);
	if (getArgFlag('-h') || args.length != 1) {
		console.log('Usage: addEligibleSerials.js <serials>');
		console.log('  <serials>: Comma-separated list of NFT serial numbers (e.g., 1,2,3,4,5)');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/addEligibleSerials.js 1,2,3,4,5');
		return;
	}

	if (operatorId === undefined || operatorId == null) {
		console.log('Environment required, please specify ACCOUNT_ID in the .env file');
		return;
	}
	if (contractId === undefined || contractId == null) {
		console.log('Contract ID required, please specify CONTRACT_ID in the .env file');
		return;
	}

	// Parse serials
	const serialsStr = args[0];
	const serials = serialsStr.split(',').map(s => {
		const num = parseInt(s.trim());
		if (isNaN(num) || num < 0) {
			console.log('❌ Error: Invalid serial number:', s.trim());
			process.exit(1);
		}
		return num;
	});

	if (serials.length === 0) {
		console.log('❌ Error: No valid serials provided');
		process.exit(1);
	}

	console.log('\n=== ADD ELIGIBLE NFT SERIALS ===');
	console.log('\n- Environment:', env);
	console.log('\n- Operator:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());
	console.log('\n- Serials to add:', serials.join(', '));
	console.log('\n- Number of serials:', serials.length);

	// Setup client
	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('interacting in *MAINNET*');
	}
	else if (env.toUpperCase() == 'PREVIEW') {
		client = Client.forPreviewnet();
		console.log('interacting in *PREVIEWNET*');
	}
	else if (env.toUpperCase() == 'LOCAL') {
		const node = { '127.0.0.1:50211': new AccountId(3) };
		client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
		console.log('interacting in *LOCAL*');
	}
	else {
		console.log('❌ Error: Invalid ENVIRONMENT. Must be TEST, MAIN, PREVIEW, or LOCAL');
		process.exit(1);
	}

	client.setOperator(operatorId, operatorKey);

	// Import ABI
	const lazyVoterJSON = JSON.parse(
		fs.readFileSync(
			`./artifacts/contracts/${contractName}.sol/${contractName}.json`,
		),
	);

	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	try {
		// Check if voting has started
		console.log('\n🔍 Checking voting status...');
		const encodedCall = lazyVoterIface.encodeFunctionData('startTime', []);
		const startTimeResult = await contractExecuteFunction(
			client,
			contractId,
			encodedCall,
			0,
			lazyVoterJSON.abi,
			'startTime',
		);

		const startTime = Number(startTimeResult[0]);
		const now = Math.floor(Date.now() / 1000);

		if (now >= startTime) {
			console.log('❌ Error: Cannot add eligible serials after voting has started');
			console.log('   Voting started at:', new Date(startTime * 1000).toLocaleString());
			process.exit(1);
		}

		console.log('✅ Voting has not started yet - serials can be added');

		// Confirm action
		console.log('\n⚠️  This action will add the following serials as eligible to vote:');
		console.log('   Serials:', serials.join(', '));

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Operation cancelled by user');
			process.exit(0);
		}

		// Execute the transaction
		console.log('\n⚙️  Executing addEligibleSerials transaction...');

		const encodedFunctionCall = lazyVoterIface.encodeFunctionData('addEligibleSerials', [serials]);

		const result = await contractExecuteFunction(
			client,
			contractId,
			encodedFunctionCall,
			0,
			lazyVoterJSON.abi,
			'addEligibleSerials',
		);

		console.log('✅ Successfully added eligible serials!');
		console.log('   Transaction ID:', result.transactionId.toString());
		console.log('   Serials added:', serials.length);
		console.log('   Serial numbers:', serials.join(', '));

		// Verify the serials were added
		console.log('\n🔍 Verifying serials were added...');
		const verifyCall = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		const verifyResult = await contractExecuteFunction(
			client,
			contractId,
			verifyCall,
			0,
			lazyVoterJSON.abi,
			'totalEligibleVoters',
		);

		const totalEligible = Number(verifyResult[0]);
		console.log('   Total eligible voters now:', totalEligible);

	}
	catch (error) {
		console.error('\n❌ Error adding eligible serials:', error.message);
		process.exit(1);
	}
};

main();