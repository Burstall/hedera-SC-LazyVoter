#!/usr/bin/env node

/**
 * Get LazyVoter Voting Status
 *
 * Reads current voting status, time remaining, and voting analytics from the LazyVoter contract.
 *
 * Usage:
 *   node scripts/interactions/getVotingStatus.js 0.0.12345
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
		console.log('Usage: getVotingStatus.js <contract-id>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/getVotingStatus.js 0.0.12345');
		return;
	}

	const contractId = ContractId.fromString(args[0]);

	console.log('\n=== LAZYVOTER VOTING STATUS ===');
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
		// Get current timestamp for time calculations
		const now = Math.floor(Date.now() / 1000);
		const nowDate = new Date(now * 1000);

		console.log('\n🕐 Current Time:', nowDate.toLocaleString());

		// votingStatus
		let encodedCall = lazyVoterIface.encodeFunctionData('votingStatus', []);
		let result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const votingStatus = lazyVoterIface.decodeFunctionResult('votingStatus', result);
		console.log('\n📊 Voting Status:', votingStatus[0]);

		// timeRemaining
		encodedCall = lazyVoterIface.encodeFunctionData('timeRemaining', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const timeRemaining = lazyVoterIface.decodeFunctionResult('timeRemaining', result);
		const timeRemainingValue = Number(timeRemaining[0]);

		if (timeRemainingValue > 0) {
			const remainingDate = new Date((now + timeRemainingValue) * 1000);
			console.log('\n⏱️  Time Remaining:', timeRemainingValue, 'seconds');
			console.log('   Voting ends at:', remainingDate.toLocaleString());

			// Calculate days, hours, minutes
			const days = Math.floor(timeRemainingValue / 86400);
			const hours = Math.floor((timeRemainingValue % 86400) / 3600);
			const minutes = Math.floor((timeRemainingValue % 3600) / 60);
			const seconds = timeRemainingValue % 60;

			console.log('   Time breakdown:', `${days}d ${hours}h ${minutes}m ${seconds}s`);
		}
		else {
			console.log('\n⏱️  Time Remaining: Voting period has ended');
		}

		// Get voting times for context
		encodedCall = lazyVoterIface.encodeFunctionData('startTime', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const startTime = Number(lazyVoterIface.decodeFunctionResult('startTime', result)[0]);

		encodedCall = lazyVoterIface.encodeFunctionData('endTime', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const endTime = Number(lazyVoterIface.decodeFunctionResult('endTime', result)[0]);

		const startDate = new Date(startTime * 1000);
		const endDate = new Date(endTime * 1000);

		console.log('\n📅 Voting Period:');
		console.log('   Start:', startDate.toLocaleString());
		console.log('   End:', endDate.toLocaleString());
		console.log('   Duration:', Math.floor((endTime - startTime) / 86400), 'days');

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
		console.log('\n⏸️  Voting Paused:', votingPaused[0] ? 'YES ⚠️' : 'NO ✅');

		// Current vote counts
		encodedCall = lazyVoterIface.encodeFunctionData('yesCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const yesCount = Number(lazyVoterIface.decodeFunctionResult('yesCount', result)[0]);

		encodedCall = lazyVoterIface.encodeFunctionData('noCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const noCount = Number(lazyVoterIface.decodeFunctionResult('noCount', result)[0]);

		encodedCall = lazyVoterIface.encodeFunctionData('abstainCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const abstainCount = Number(lazyVoterIface.decodeFunctionResult('abstainCount', result)[0]);

		const totalVotes = yesCount + noCount + abstainCount;

		console.log('\n📊 Current Vote Results:');
		console.log('   ✅ Yes votes:', yesCount);
		console.log('   ❌ No votes:', noCount);
		console.log('   🤐 Abstain votes:', abstainCount);
		console.log('   📈 Total votes cast:', totalVotes);

		// quorum information
		encodedCall = lazyVoterIface.encodeFunctionData('quorum', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const quorum = Number(lazyVoterIface.decodeFunctionResult('quorum', result)[0]);

		encodedCall = lazyVoterIface.encodeFunctionData('quorumPercent', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const quorumPercent = Number(lazyVoterIface.decodeFunctionResult('quorumPercent', result)[0]);

		console.log('\n🎯 Quorum Information:');
		console.log('   Required votes:', quorum);
		console.log('   Current percentage:', (quorumPercent / 100).toFixed(2) + '%');
		console.log('   Quorum reached:', yesCount >= quorum ? 'YES ✅' : 'NO ❌');

		// totalEligibleVoters
		encodedCall = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const totalEligible = Number(lazyVoterIface.decodeFunctionResult('totalEligibleVoters', result)[0]);

		console.log('\n👥 Voter Participation:');
		console.log('   Eligible voters:', totalEligible);
		console.log('   Votes cast:', totalVotes);
		console.log('   Participation rate:', totalEligible > 0 ? ((totalVotes / totalEligible) * 100).toFixed(2) + '%' : 'N/A');

		console.log('\n✅ Voting status retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving voting status:', error.message);
		process.exit(1);
	}
};

main();