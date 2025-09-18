#!/usr/bin/env node

/**
 * Cast Vote
 *
 * Casts a vote using eligible NFT serials in the LazyVoter contract.
 * The voter must own or be delegated the NFT serials.
 *
 * Usage:
 *   node scripts/interactions/castVote.js 1,2,3 yes
 *   node scripts/interactions/castVote.js 5 no
 *   node scripts/interactions/castVote.js 10 abstain
 *
 * Parameters:
 *   serials: Comma-separated list of NFT serial numbers to vote with
 *   vote-type: Vote type (yes, no, abstain)
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

// Vote type mapping
const VOTE_TYPES = {
	'yes': 0,
	'no': 1,
	'abstain': 2,
};

const VOTE_NAMES = ['Yes', 'No', 'Abstain'];

const main = async () => {
	const args = process.argv.slice(2);
	if (getArgFlag('-h') || args.length != 2) {
		console.log('Usage: castVote.js <serials> <vote-type>');
		console.log('  <serials>: Comma-separated list of NFT serial numbers (e.g., 1,2,3)');
		console.log('  <vote-type>: Vote type (yes, no, abstain)');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/interactions/castVote.js 1,2,3 yes');
		console.log('  node scripts/interactions/castVote.js 5 no');
		console.log('  node scripts/interactions/castVote.js 10 abstain');
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

	// Parse vote type
	const voteTypeStr = args[1].toLowerCase();
	if (!Object.prototype.hasOwnProperty.call(VOTE_TYPES, voteTypeStr)) {
		console.log('❌ Error: Invalid vote type. Must be: yes, no, or abstain');
		process.exit(1);
	}

	const voteType = VOTE_TYPES[voteTypeStr];
	const voteName = VOTE_NAMES[voteType];

	console.log('\n=== CAST VOTE ===');
	console.log('\n- Environment:', env);
	console.log('\n- Voter:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());
	console.log('\n- Serials:', serials.join(', '));
	console.log('\n- Vote Type:', voteName, '(' + voteTypeStr + ')');
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
		// Check voting status
		console.log('\n🔍 Checking voting status...');
		const statusCall = lazyVoterIface.encodeFunctionData('votingStatus', []);
		const statusResult = await contractExecuteFunction(
			client,
			contractId,
			statusCall,
			0,
			lazyVoterJSON.abi,
			'votingStatus',
		);

		const votingStatus = statusResult[0];
		console.log('   Voting status:', votingStatus);

		if (votingStatus.includes('not started') || votingStatus.includes('ended')) {
			console.log('❌ Error: Voting is not currently active');
			console.log('   Status:', votingStatus);
			process.exit(1);
		}

		// Check if voting is paused
		const pausedCall = lazyVoterIface.encodeFunctionData('votingPaused', []);
		const pausedResult = await contractExecuteFunction(
			client,
			contractId,
			pausedCall,
			0,
			lazyVoterJSON.abi,
			'votingPaused',
		);

		if (pausedResult[0]) {
			console.log('❌ Error: Voting is currently paused');
			process.exit(1);
		}

		// Get current vote message
		const messageCall = lazyVoterIface.encodeFunctionData('voteMessage', []);
		const messageResult = await contractExecuteFunction(
			client,
			contractId,
			messageCall,
			0,
			lazyVoterJSON.abi,
			'voteMessage',
		);

		const voteMessage = messageResult[0];
		console.log('\n📝 Vote Message:', voteMessage);

		// Confirm action
		console.log('\n⚠️  You are about to cast a vote:');
		console.log('   Serials:', serials.join(', '));
		console.log('   Vote:', voteName);
		console.log('   Message:', voteMessage);

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Vote cancelled by user');
			process.exit(0);
		}

		// Execute the vote
		console.log('\n⚙️  Executing vote transaction...');

		const encodedFunctionCall = lazyVoterIface.encodeFunctionData('vote', [serials, voteType]);

		const result = await contractExecuteFunction(
			client,
			contractId,
			encodedFunctionCall,
			0,
			lazyVoterJSON.abi,
			'vote',
		);

		console.log('✅ Vote cast successfully!');
		console.log('   Transaction ID:', result.transactionId.toString());
		console.log('   Serials voted:', serials.length);
		console.log('   Vote type:', voteName);

		// Show updated vote counts
		console.log('\n📊 Updated vote results:');

		const yesCall = lazyVoterIface.encodeFunctionData('yesCount', []);
		const yesResult = await contractExecuteFunction(
			client,
			contractId,
			yesCall,
			0,
			lazyVoterJSON.abi,
			'yesCount',
		);
		console.log('   ✅ Yes votes:', Number(yesResult[0]));

		const noCall = lazyVoterIface.encodeFunctionData('noCount', []);
		const noResult = await contractExecuteFunction(
			client,
			contractId,
			noCall,
			0,
			lazyVoterJSON.abi,
			'noCount',
		);
		console.log('   ❌ No votes:', Number(noResult[0]));

		const abstainCall = lazyVoterIface.encodeFunctionData('abstainCount', []);
		const abstainResult = await contractExecuteFunction(
			client,
			contractId,
			abstainCall,
			0,
			lazyVoterJSON.abi,
			'abstainCount',
		);
		console.log('   🤐 Abstain votes:', Number(abstainResult[0]));

	}
	catch (error) {
		console.error('\n❌ Error casting vote:', error.message);
		if (error.message.includes('NotOwnerOrDelegated')) {
			console.log('\n💡 This error usually means:');
			console.log('   - You don\'t own the NFT serial(s)');
			console.log('   - The serial(s) are not eligible to vote');
			console.log('   - You haven\'t been delegated voting rights for these serials');
		}
		process.exit(1);
	}
};

main();