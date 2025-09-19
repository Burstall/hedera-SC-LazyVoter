#!/usr/bin/env node

/**
 * Update Vote Message
 *
 * Updates the vote message/proposal text in the LazyVoter contract (owner only).
 *
 * Usage:
 *   node scripts/interactions/updateVoteMessage.js "New vote message here"
 *
 * Parameters:
 *   message: New vote message text
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
	if (getArgFlag('-h') || args.length < 1) {
		console.log('Usage: updateVoteMessage.js "<message>" [options]');
		console.log('  <message>: New vote message text (use quotes for multi-word messages)');
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
		console.log('  node scripts/interactions/updateVoteMessage.js "Should we implement the new feature?"');
		console.log('  node scripts/interactions/updateVoteMessage.js --contract-id 0.0.12345 "New message"');
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

	const newMessage = args[0];

	if (!newMessage || newMessage.trim().length === 0) {
		console.log('❌ Error: Vote message cannot be empty');
		process.exit(1);
	}

	console.log('\n=== UPDATE VOTE MESSAGE ===');
	console.log('\n- Environment:', env);
	console.log('\n- Operator:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());
	console.log('\n- New Message:', newMessage);

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
		// Get current message for comparison
		console.log('\n🔍 Getting current vote message...');
		const currentCall = lazyVoterIface.encodeFunctionData('voteMessage', []);
		const currentResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			currentCall,
			operatorId,
			false,
		);
		const decodedCurrent = lazyVoterIface.decodeFunctionResult('voteMessage', currentResult);
		const currentMessage = decodedCurrent[0];
		console.log('   Current message:', currentMessage);

		if (currentMessage === newMessage) {
			console.log('⚠️  The new message is the same as the current message');
			const confirm = readlineSync.question('\nDo you want to proceed anyway? (y/N): ');
			if (confirm.toLowerCase() !== 'y') {
				console.log('❌ Operation cancelled by user');
				process.exit(0);
			}
		}

		// Confirm action
		console.log('\n⚠️  This action will update the vote message:');
		console.log('   📝 From:', `"${currentMessage}"`);
		console.log('   📝 To:  ', `"${newMessage}"`);

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Operation cancelled by user');
			process.exit(0);
		}

		// Execute the transaction
		console.log('\n⚙️  Executing updateVoteMessage transaction...');

		const result = await contractExecuteFunction(
			contractId,
			lazyVoterIface,
			client,
			0,
			'updateVoteMessage',
			[newMessage],
		);

		console.log('✅ Successfully updated vote message!');
		console.log('   Transaction ID:', result[2].transactionId.toString());
		console.log('   New message:', newMessage);

		console.log('\n✅ Vote message update completed successfully!');
		process.exit(0);

		// Verify the message was updated
		console.log('\n🔍 Verifying message was updated...');
		const verifyResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			currentCall,
			operatorId,
			false,
		);
		const decodedVerify = lazyVoterIface.decodeFunctionResult('voteMessage', verifyResult);
		const updatedMessage = decodedVerify[0];
		if (updatedMessage === newMessage) {
			console.log('   ✅ Message successfully updated');
		}
		else {
			console.log('   ❌ Message update verification failed');
		}

	}
	catch (error) {
		console.error('\n❌ Error updating vote message:', error.message);

		// Provide helpful guidance based on error type
		if (error.message.includes('Ownable: caller is not the owner')) {
			console.log('\n💡 This error means:');
			console.log('   - Only the contract owner can update the vote message');
			console.log('   - You need to use the contract owner account');
		}
		else if (error.message.includes('Message too long')) {
			console.log('\n💡 This error means:');
			console.log('   - The vote message exceeds the maximum allowed length');
			console.log('   - Try a shorter message');
		}
		else if (error.message.includes('Empty message')) {
			console.log('\n💡 This error means:');
			console.log('   - The vote message cannot be empty');
			console.log('   - Provide a non-empty message');
		}

		process.exit(1);
	}
};

// Handle main function execution and unhandled promise rejections
main().catch((error) => {
	console.error('❌ Unhandled error:', error.message);
	process.exit(1);
});