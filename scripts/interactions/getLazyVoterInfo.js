#!/usr/bin/env node

/**
 * Get LazyVoter Contract Information
 *
 * Reads basic contract information from the LazyVoter contract using Hedera Mirror Node.
 * This includes vote message, quorum, voting times, NFT token, registry, and pause status.
 *
 * Usage:
 *   node scripts/interactions/getLazyVoterInfo.js 0.0.12345
 *
 * Environment Variables:
 *   ACCOUNT_ID - Your Hedera account ID (required for mirror node queries)
 *   ENVIRONMENT - Network environment (TEST, MAIN, PREVIEW, LOCAL)
 */

const {
	AccountId,
	ContractId,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const { ethers } = require('ethers');
const { getArgFlag } = require('../../utils/nodeHelpers');
const { readOnlyEVMFromMirrorNode } = require('../../utils/solidityHelpers');

// Get operator from .env file
let operatorId;
try {
	operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
}
catch (err) {
	console.log('ERROR: Must specify ACCOUNT_ID in the .env file', err);
}

const contractName = 'LazyVoter';
const env = process.env.ENVIRONMENT ?? 'TEST';

const main = async () => {
	// configure the client object
	if (
		operatorId === undefined ||
		operatorId == null
	) {
		console.log(
			'Environment required, please specify ACCOUNT_ID in the .env file',
		);
		process.exit(1);
	}

	const args = process.argv.slice(2);
	if (args.length != 1 || getArgFlag('h')) {
		console.log('Usage: getLazyVoterInfo.js <contract-id>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/getLazyVoterInfo.js 0.0.12345');
		return;
	}

	const contractId = ContractId.fromString(args[0]);

	console.log('\n=== LAZYVOTER CONTRACT INFORMATION ===');
	console.log('\n- Environment:', env);
	console.log('\n- Contract ID:', contractId.toString());
	console.log('\n- Operator Account:', operatorId.toString());

	// Import ABI
	const lazyVoterJSON = JSON.parse(
		fs.readFileSync(
			`./artifacts/contracts/${contractName}.sol/${contractName}.json`,
		),
	);

	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	try {
		// Query mirror nodes to call the following methods:

		// voteMessage
		let encodedCall = lazyVoterIface.encodeFunctionData('voteMessage', []);
		let result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const voteMessage = lazyVoterIface.decodeFunctionResult('voteMessage', result);
		console.log('\n📝 Vote Message:', voteMessage[0]);

		// NFT_TOKEN
		encodedCall = lazyVoterIface.encodeFunctionData('NFT_TOKEN', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const nftToken = lazyVoterIface.decodeFunctionResult('NFT_TOKEN', result);
		console.log('\n🎨 NFT Token:', nftToken[0]);

		// quorum
		encodedCall = lazyVoterIface.encodeFunctionData('quorum', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const quorum = lazyVoterIface.decodeFunctionResult('quorum', result);
		console.log('\n🎯 Quorum Required:', Number(quorum[0]), 'votes');

		// startTime
		encodedCall = lazyVoterIface.encodeFunctionData('startTime', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const startTime = lazyVoterIface.decodeFunctionResult('startTime', result);
		const startTimeDate = new Date(Number(startTime[0]) * 1000);
		console.log('\n🕐 Voting Starts:', startTimeDate.toLocaleString());

		// endTime
		encodedCall = lazyVoterIface.encodeFunctionData('endTime', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const endTime = lazyVoterIface.decodeFunctionResult('endTime', result);
		const endTimeDate = new Date(Number(endTime[0]) * 1000);
		console.log('\n🕐 Voting Ends:', endTimeDate.toLocaleString());

		// lazyDelegateRegistry
		encodedCall = lazyVoterIface.encodeFunctionData('lazyDelegateRegistry', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const registry = lazyVoterIface.decodeFunctionResult('lazyDelegateRegistry', result);
		console.log('\n📋 Delegate Registry:', registry[0]);

		// votingPaused
		encodedCall = lazyVoterIface.encodeFunctionData('votingPaused', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const votingPaused = lazyVoterIface.decodeFunctionResult('votingPaused', result);
		console.log('\n⏸️  Voting Paused:', votingPaused[0] ? 'YES' : 'NO');

		// totalEligibleVoters
		encodedCall = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const totalEligible = lazyVoterIface.decodeFunctionResult('totalEligibleVoters', result);
		console.log('\n👥 Total Eligible Voters:', Number(totalEligible[0]));

		// Current vote counts
		encodedCall = lazyVoterIface.encodeFunctionData('yesCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const yesCount = lazyVoterIface.decodeFunctionResult('yesCount', result);

		encodedCall = lazyVoterIface.encodeFunctionData('noCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const noCount = lazyVoterIface.decodeFunctionResult('noCount', result);

		encodedCall = lazyVoterIface.encodeFunctionData('abstainCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const abstainCount = lazyVoterIface.decodeFunctionResult('abstainCount', result);

		console.log('\n📊 Current Vote Counts:');
		console.log('  ✅ Yes:', Number(yesCount[0]));
		console.log('  ❌ No:', Number(noCount[0]));
		console.log('  🤐 Abstain:', Number(abstainCount[0]));
		console.log('  📈 Total Votes:', Number(yesCount[0]) + Number(noCount[0]) + Number(abstainCount[0]));

		// votingStatus
		encodedCall = lazyVoterIface.encodeFunctionData('votingStatus', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const votingStatus = lazyVoterIface.decodeFunctionResult('votingStatus', result);
		console.log('\n📊 Voting Status:', votingStatus[0]);

		// quorumPercent
		encodedCall = lazyVoterIface.encodeFunctionData('quorumPercent', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const quorumPercent = lazyVoterIface.decodeFunctionResult('quorumPercent', result);
		console.log('\n📊 Quorum Percentage:', Number(quorumPercent[0]), 'bps (', (Number(quorumPercent[0]) / 100).toFixed(2), '%)');

		console.log('\n✅ Contract information retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving contract information:', error.message);
		process.exit(1);
	}
};

main();