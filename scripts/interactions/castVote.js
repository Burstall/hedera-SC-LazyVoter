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
 *   node scripts/interactions/castVote.js --show-options
 *   node scripts/interactions/castVote.js --contract-id 0.0.12345 1,2,3 yes
 *
 * Options:
 *   --show-options: Display all available voting options for the user
 *
 * Parameters:
 *   serials: Comma-separated list of NFT serial numbers to vote with
 *   vote-type: Vote type (yes, no, abstain)
 *
 * Environment Variables:
 *   PRIVATE_KEY - Your Hedera private key (required)
 *   ACCOUNT_ID - Your Hedera account ID (required)
 *   CONTRACT_ID - LazyVoter contract ID (optional if --contract-id is used)
 *   LAZY_DELEGATE_REGISTRY_CONTRACT_ID - Delegate registry contract ID (optional)
 *   ENVIRONMENT - Network environment (TEST, MAIN, PREVIEW, LOCAL)
 */

const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	TokenId,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const { ethers } = require('ethers');
const readlineSync = require('readline-sync');
const { getArgFlag } = require('../../utils/nodeHelpers');
const { contractExecuteFunction, readOnlyEVMFromMirrorNode } = require('../../utils/solidityHelpers');
const { getSerialsOwned } = require('../../utils/hederaMirrorHelpers');

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? 'LazyVoter';

// ContractId will be set in main based on CLI or .env
const delegateRegistryId = process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID
	? ContractId.fromString(process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID)
	: null;
const env = process.env.ENVIRONMENT ?? 'TEST';

let client;

// Vote type mapping
const VOTE_TYPES = {
	'yes': 0,
	'no': 1,
	'abstain': 2,
};

const VOTE_NAMES = ['Yes', 'No', 'Abstain'];

async function showVotingOptions(lazyVoterIface, delegateRegistryIface, nftTokenId, contractId) {
	console.log('\n=== VOTING OPTIONS ===');
	console.log('\n- Environment:', env);
	console.log('\n- Voter:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());
	console.log('\n- NFT Token:', nftTokenId.toString());

	try {
		// Get owned serials
		console.log('\n🔍 Checking your NFT ownership...');
		const ownedSerials = await getSerialsOwned(env, operatorId, nftTokenId);
		console.log(`   You own ${ownedSerials.length} serial(s): ${ownedSerials.join(', ') || 'none'}`);

		// Get eligible serials from contract
		console.log('\n🔍 Checking eligible serials...');
		const eligibleCall = lazyVoterIface.encodeFunctionData('getEligibleSerials', [0, 1000]);
		const eligibleResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			eligibleCall,
			operatorId,
			false,
		);
		const decodedEligible = lazyVoterIface.decodeFunctionResult('getEligibleSerials', eligibleResult);
		// getEligibleSerials returns an array of arrays, we want the first array
		const eligibleSerialsArray = Array.isArray(decodedEligible) && decodedEligible.length > 0 ? decodedEligible[0] : [];
		const eligibleSerials = Array.isArray(eligibleSerialsArray) ? eligibleSerialsArray.map(s => Number(s)) : [];
		console.log(`   Total eligible serials: ${eligibleSerials.length}`);
		console.log(`   Eligible serials: ${eligibleSerials.slice(0, 20).join(', ')}${eligibleSerials.length > 20 ? '...' : ''}`);

		// Find owned eligible serials
		const ownedEligibleSerials = ownedSerials.filter(serial => eligibleSerials.includes(serial));
		console.log(`   Your owned eligible serials: ${ownedEligibleSerials.join(', ') || 'none'}`);

		// Check delegation if registry is available
		let delegatedToUser = [];
		let delegatedByUser = [];

		if (delegateRegistryIface && delegateRegistryId) {
			console.log('\n🔍 Checking delegation status...');

			// Check serials delegated to the user
			try {
				const delegatedToCall = delegateRegistryIface.encodeFunctionData('getNFTsDelegatedTo', [operatorId.toSolidityAddress()]);
				const delegatedToResult = await readOnlyEVMFromMirrorNode(
					env,
					delegateRegistryId,
					delegatedToCall,
					operatorId,
					false,
				);
				const decodedToResult = delegateRegistryIface.decodeFunctionResult('getNFTsDelegatedTo', delegatedToResult);
				const tokens = decodedToResult[0];
				const serialArrays = decodedToResult[1];

				for (let i = 0; i < tokens.length; i++) {
					const tokenAddress = tokens[i];
					if (tokenAddress.toLowerCase() === nftTokenId.toSolidityAddress().toLowerCase()) {
						delegatedToUser = delegatedToUser.concat(serialArrays[i].map(s => Number(s)));
					}
				}

				if (delegatedToUser.length > 0) {
					console.log(`   Serials delegated to you: ${delegatedToUser.join(', ')}`);
				}
				else {
					console.log('   No serials delegated to you');
				}
			}
			catch (error) {
				console.log('   Could not check delegations to you:', error.message);
			}

			// Check serials delegated by the user
			try {
				const delegatedByCall = delegateRegistryIface.encodeFunctionData('getDelegatedNFTsBy', [operatorId.toSolidityAddress(), false]);
				const delegatedByResult = await readOnlyEVMFromMirrorNode(
					env,
					delegateRegistryId,
					delegatedByCall,
					operatorId,
					false,
				);
				const decodedByResult = delegateRegistryIface.decodeFunctionResult('getDelegatedNFTsBy', delegatedByResult);
				const tokens = decodedByResult[0];
				const serialArrays = decodedByResult[1];

				for (let i = 0; i < tokens.length; i++) {
					const tokenAddress = tokens[i];
					if (tokenAddress.toLowerCase() === nftTokenId.toSolidityAddress().toLowerCase()) {
						delegatedByUser = delegatedByUser.concat(serialArrays[i].map(s => Number(s)));
					}
				}

				if (delegatedByUser.length > 0) {
					console.log(`   Serials you delegated: ${delegatedByUser.join(', ')}`);
				}
				else {
					console.log('   You have not delegated any serials');
				}
			}
			catch (error) {
				console.log('   Could not check your delegations:', error.message);
			}
		}
		else {
			console.log('\n⚠️  Delegate registry not configured - delegation features limited');
		}

		// Calculate available voting options
		const availableSerials = [...new Set([...ownedEligibleSerials, ...delegatedToUser])];
		const unavailableSerials = ownedSerials.filter(serial => !eligibleSerials.includes(serial));

		console.log('\n📊 SUMMARY:');
		console.log(`   ✅ Available to vote: ${availableSerials.length} serial(s)`);
		if (availableSerials.length > 0) {
			console.log(`      Serials: ${availableSerials.join(', ')}`);
		}

		if (unavailableSerials.length > 0) {
			console.log(`   ❌ Not eligible: ${unavailableSerials.length} serial(s)`);
			console.log(`      Serials: ${unavailableSerials.join(', ')}`);
		}

		if (delegatedByUser.length > 0) {
			console.log(`   🔄 Delegated away: ${delegatedByUser.length} serial(s)`);
			console.log(`      Serials: ${delegatedByUser.join(', ')}`);
		}

		if (availableSerials.length > 0) {
			console.log('\n💡 To vote, use commands like:');
			console.log(`   node scripts/interactions/castVote.js ${availableSerials.slice(0, 3).join(',')} yes`);
			console.log(`   node scripts/interactions/castVote.js ${availableSerials.slice(0, 2).join(',')} no`);
			console.log(`   node scripts/interactions/castVote.js ${availableSerials[0]} abstain`);
		}
		else {
			console.log('\n❌ No serials available for voting');
			process.exit(1);
		}

	}
	catch (error) {
		console.error('\n❌ Error getting voting options:', error.message);
		process.exit(1);
	}
}

const main = async () => {
	const args = process.argv.slice(2);

	// Check for help flag
	if (getArgFlag('-h') || getArgFlag('--help')) {
		console.log('Usage: castVote.js <serials> <vote-type> [options]');
		console.log('  <serials>: Comma-separated list of NFT serial numbers (e.g., 1,2,3)');
		console.log('  <vote-type>: Vote type (yes, no, abstain)');
		console.log('');
		console.log('Options:');
		console.log('  --show-options: Display all available voting options for the user');
		console.log('  --contract-id <id>: Specify LazyVoter contract ID (overrides .env)');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID (if not specified via --contract-id)');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Optional Environment Variables:');
		console.log('  LAZY_DELEGATE_REGISTRY_CONTRACT_ID - Delegate registry contract ID');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/interactions/castVote.js 1,2,3 yes');
		console.log('  node scripts/interactions/castVote.js --show-options');
		console.log('  node scripts/interactions/castVote.js --contract-id 0.0.12345 1,2,3 yes');
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

	// Import ABIs
	const lazyVoterJSON = JSON.parse(
		fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`),
	);
	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	let delegateRegistryIface = null;
	if (delegateRegistryId) {
		try {
			const delegateRegistryJSON = JSON.parse(
				fs.readFileSync('./artifacts/contracts/LazyDelegateRegistry.sol/LazyDelegateRegistry.json'),
			);
			delegateRegistryIface = new ethers.Interface(delegateRegistryJSON.abi);
		}
		catch {
			console.log('⚠️  Could not load delegate registry ABI, delegation features will be limited');
		}
	}

	// Get NFT token from contract
	console.log('\n🔍 Getting NFT token from contract...');
	const nftTokenCall = lazyVoterIface.encodeFunctionData('NFT_TOKEN', []);
	const nftTokenResult = await readOnlyEVMFromMirrorNode(
		env,
		contractId,
		nftTokenCall,
		operatorId,
		false,
	);
	const nftTokenId = TokenId.fromSolidityAddress(lazyVoterIface.decodeFunctionResult('NFT_TOKEN', nftTokenResult)[0]);
	console.log('   NFT Token ID:', nftTokenId.toString());

	// Handle --show-options flag
	if (getArgFlag('--show-options')) {
		await showVotingOptions(lazyVoterIface, delegateRegistryIface, nftTokenId, contractId);
		return;
	}

	// Regular voting flow
	if (args.length !== 2) {
		console.log('❌ Error: Voting requires exactly 2 arguments: <serials> <vote-type>');
		console.log('   Example: node scripts/interactions/castVote.js 1,2,3 yes');
		process.exit(1);
	}

	// Parse serials
	const serialsStr = args[0];
	const serials = serialsStr.split(',').map(s => {
		const num = parseInt(s.trim());
		if (isNaN(num) || num < 1) {
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

	try {
		// Check voting status
		console.log('\n🔍 Checking voting status...');
		const statusCall = lazyVoterIface.encodeFunctionData('votingStatus', []);
		const statusResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			statusCall,
			operatorId,
			false,
		);
		const votingStatus = lazyVoterIface.decodeFunctionResult('votingStatus', statusResult)[0];
		console.log('   Voting status:', votingStatus);

		if (votingStatus.includes('not started') || votingStatus.includes('ended')) {
			console.log('❌ Error: Voting is not currently active');
			console.log('   Status:', votingStatus);
			process.exit(1);
		}

		// Check if voting is paused
		const pausedCall = lazyVoterIface.encodeFunctionData('votingPaused', []);
		const pausedResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			pausedCall,
			operatorId,
			false,
		);
		const isPaused = lazyVoterIface.decodeFunctionResult('votingPaused', pausedResult)[0];

		if (isPaused) {
			console.log('❌ Error: Voting is currently paused');
			process.exit(1);
		}

		// Verify NFT ownership before proceeding
		console.log('\n🔍 Verifying NFT ownership...');

		// Check ownership of each serial
		const ownedSerials = await getSerialsOwned(env, operatorId, nftTokenId);
		console.log(`   You own ${ownedSerials.length} serial(s) of this token`);

		const unownedSerials = [];
		for (const serial of serials) {
			if (!ownedSerials.includes(serial)) {
				unownedSerials.push(serial);
			}
		}

		if (unownedSerials.length > 0) {
			console.log('❌ Error: You do not own the following serial(s):', unownedSerials.join(', '));
			console.log('\n💡 This could mean:');
			console.log('   - You don\'t own these NFT serials');
			console.log('   - The serials are not eligible to vote');
			console.log('   - You need to be delegated voting rights for these serials');
			process.exit(1);
		}

		console.log('✅ NFT ownership verified for all serials');

		// Get current vote message
		const messageCall = lazyVoterIface.encodeFunctionData('voteMessage', []);
		const messageResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			messageCall,
			operatorId,
			false,
		);
		const voteMessage = lazyVoterIface.decodeFunctionResult('voteMessage', messageResult)[0];
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

		const result = await contractExecuteFunction(
			contractId,
			lazyVoterIface,
			client,
			0,
			'vote',
			[serials, voteType],
		);

		console.log('✅ Vote cast successfully!');
		console.log('   Transaction ID:', result[2].transactionId.toString());
		console.log('   Serials voted:', serials.length);
		console.log('   Vote type:', voteName);

		// Show updated vote counts
		console.log('\n📊 Updated vote results:');

		const yesCall = lazyVoterIface.encodeFunctionData('yesCount', []);
		const yesResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			yesCall,
			operatorId,
			false,
		);
		console.log('   ✅ Yes votes:', Number(lazyVoterIface.decodeFunctionResult('yesCount', yesResult)[0]));

		const noCall = lazyVoterIface.encodeFunctionData('noCount', []);
		const noResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			noCall,
			operatorId,
			false,
		);
		console.log('   ❌ No votes:', Number(lazyVoterIface.decodeFunctionResult('noCount', noResult)[0]));

		const abstainCall = lazyVoterIface.encodeFunctionData('abstainCount', []);
		const abstainResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			abstainCall,
			operatorId,
			false,
		);
		console.log('   🤐 Abstain votes:', Number(lazyVoterIface.decodeFunctionResult('abstainCount', abstainResult)[0]));

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