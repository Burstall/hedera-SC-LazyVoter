#!/usr/bin/env node

/**
 * Unpause Voting
 *
 * Unpauses voting in the LazyVoter contract (owner only).
 * When unpaused, voting resumes if within the active time window.
 *
 * Usage:
 *   node scripts/interactions/unpauseVoting.js
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
const { getArgFlag, sleep } = require('../../utils/nodeHelpers');
const { contractExecuteFunction, readOnlyEVMFromMirrorNode } = require('../../utils/solidityHelpers');

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? 'LazyVoter';

// ContractId will be set in main based on CLI or .env
const env = process.env.ENVIRONMENT ?? 'TEST';

let client;

const main = async () => {
	const args = process.argv.slice(2);
	if (getArgFlag('-h')) {
		console.log('Usage: unpauseVoting.js [options]');
		console.log('');
		console.log('Options:');
		console.log('  --contract-id <id>: Specify LazyVoter contract ID (overrides .env)');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID (if not specified via --contract-id)');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/interactions/unpauseVoting.js');
		console.log('  node scripts/interactions/unpauseVoting.js --contract-id 0.0.12345');
		return;
	}

	// Parse --contract-id flag
	let contractIdFromCLI = null;
	const contractIdIndex = args.indexOf('--contract-id');
	if (contractIdIndex > -1 && contractIdIndex + 1 < args.length) {
		contractIdFromCLI = args[contractIdIndex + 1];
		// Remove the flag and value from args
		args.splice(contractIdIndex, 2);
	}

	// Check for unexpected arguments
	if (args.length > 0) {
		console.log('❌ Error: Unexpected arguments. Use --help for usage information.');
		process.exit(1);
	}

	// Set contractId: prioritize CLI, then .env
	const contractIdStr = contractIdFromCLI || process.env.CONTRACT_ID;
	if (!contractIdStr) {
		console.log('❌ Contract ID required: please specify --contract-id <id> or CONTRACT_ID in the .env file');
		process.exit(1);
	}

	// Override the global contractId
	const contractId = ContractId.fromString(contractIdStr);

	if (operatorId === undefined || operatorId == null) {
		console.log('❌ Environment required: please specify ACCOUNT_ID in the .env file');
		process.exit(1);
	}

	console.log('\n=== UNPAUSE VOTING ===');
	console.log('\n- Environment:', env);
	console.log('\n- Operator:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());

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
		// Check current pause status
		console.log('\n🔍 Checking current pause status...');
		const pausedCall = lazyVoterIface.encodeFunctionData('votingPaused', []);
		const pausedResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			pausedCall,
			operatorId,
			false,
		);
		const decodedPaused = lazyVoterIface.decodeFunctionResult('votingPaused', pausedResult);
		const isPaused = decodedPaused[0];
		console.log('   Current status:', isPaused ? 'PAUSED' : 'ACTIVE');

		if (!isPaused) {
			console.log('⚠️  Voting is already active');
			const confirm = readlineSync.question('\nDo you want to proceed anyway? (y/N): ');
			if (confirm.toLowerCase() !== 'y') {
				console.log('❌ Operation cancelled by user');
				process.exit(0);
			}
		}

		// Check if we're within voting time window
		console.log('\n🔍 Checking voting time window...');
		const timeCall = lazyVoterIface.encodeFunctionData('timeRemaining', []);
		const timeResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			timeCall,
			operatorId,
			false,
		);
		const decodedTime = lazyVoterIface.decodeFunctionResult('timeRemaining', timeResult);
		const timeRemaining = Number(decodedTime[0]);
		if (timeRemaining <= 0) {
			console.log('⚠️  Warning: Voting time window has ended');
			console.log('   Unpausing will not allow new votes');
		}
		else {
			console.log('   ✅ Within active voting time window');
		}

		// Confirm action
		console.log('\n⚠️  This action will UNPAUSE voting:');
		console.log('   ✅ Voting will resume if within time window');
		console.log('   🗳️  Users can cast votes again');

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Operation cancelled by user');
			process.exit(0);
		}

		// Execute the transaction
		console.log('\n⚙️  Executing unpauseVoting transaction...');

		const result = await contractExecuteFunction(
			contractId,
			lazyVoterIface,
			client,
			0,
			'unpauseVoting',
			[],
		);

		console.log('✅ Successfully unpaused voting!');
		console.log('   Transaction ID:', result[2].transactionId.toString());

		// wait 5 seconds for state to update
		await sleep(5000);

		// Verify the unpause was successful
		console.log('\n🔍 Verifying pause status...');
		const verifyResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			pausedCall,
			operatorId,
			false,
		);
		const decodedVerify = lazyVoterIface.decodeFunctionResult('votingPaused', verifyResult);
		const newPausedStatus = decodedVerify[0];
		if (!newPausedStatus) {
			console.log('   ✅ Voting is now ACTIVE');
		}
		else {
			console.log('   ❌ Unpause verification failed');
		}

	}
	catch (error) {
		console.error('\n❌ Error unpausing voting:', error.message);

		// Provide helpful guidance based on error type
		if (error.message.includes('Ownable: caller is not the owner')) {
			console.log('\n💡 This error means:');
			console.log('   - Only the contract owner can unpause voting');
			console.log('   - You need to use the contract owner account');
		}
		else if (error.message.includes('Voting is not paused')) {
			console.log('\n💡 This error means:');
			console.log('   - Voting is already active (not paused)');
			console.log('   - No action needed, voting is already running');
		}

		process.exit(1);
	}
};

main();