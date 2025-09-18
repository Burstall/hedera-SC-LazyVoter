#!/usr/bin/env node

/**
 * Pause Voting
 *
 * Pauses voting in the LazyVoter contract (owner only).
 * When paused, no votes can be cast until unpaused.
 *
 * Usage:
 *   node scripts/interactions/pauseVoting.js
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
	if (getArgFlag('-h') || args.length != 0) {
		console.log('Usage: pauseVoting.js');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/pauseVoting.js');
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

	console.log('\n=== PAUSE VOTING ===');
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
		const pausedResult = await contractExecuteFunction(
			client,
			contractId,
			pausedCall,
			0,
			lazyVoterJSON.abi,
			'votingPaused',
		);

		const isPaused = pausedResult[0];
		console.log('   Current status:', isPaused ? 'PAUSED' : 'ACTIVE');

		if (isPaused) {
			console.log('⚠️  Voting is already paused');
			const confirm = readlineSync.question('Do you still want to proceed? (y/N): ');
			if (confirm.toLowerCase() !== 'y') {
				console.log('❌ Operation cancelled by user');
				process.exit(0);
			}
		}

		// Confirm action
		console.log('\n⚠️  This action will PAUSE voting:');
		console.log('   - No new votes can be cast');
		console.log('   - Existing votes remain valid');
		console.log('   - Only the contract owner can unpause');

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Operation cancelled by user');
			process.exit(0);
		}

		// Execute the transaction
		console.log('\n⚙️  Executing pauseVoting transaction...');

		const encodedFunctionCall = lazyVoterIface.encodeFunctionData('pauseVoting', []);

		const result = await contractExecuteFunction(
			client,
			contractId,
			encodedFunctionCall,
			0,
			lazyVoterJSON.abi,
			'pauseVoting',
		);

		console.log('✅ Successfully paused voting!');
		console.log('   Transaction ID:', result.transactionId.toString());

		// Verify the pause was successful
		console.log('\n🔍 Verifying pause status...');
		const verifyResult = await contractExecuteFunction(
			client,
			contractId,
			pausedCall,
			0,
			lazyVoterJSON.abi,
			'votingPaused',
		);

		const newPausedStatus = verifyResult[0];
		if (newPausedStatus) {
			console.log('   ✅ Voting is now PAUSED');
		}
		else {
			console.log('   ❌ Pause verification failed');
		}

	}
	catch (error) {
		console.error('\n❌ Error pausing voting:', error.message);
		process.exit(1);
	}
};

main();