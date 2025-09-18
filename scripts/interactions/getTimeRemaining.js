#!/usr/bin/env node

/**
 * Get Time Remaining in Voting Period
 *
 * Reads the time remaining until voting ends from the LazyVoter contract.
 *
 * Usage:
 *   node scripts/interactions/getTimeRemaining.js 0.0.12345
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
		console.log('Usage: getTimeRemaining.js <contract-id>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/getTimeRemaining.js 0.0.12345');
		return;
	}

	const contractId = ContractId.fromString(args[0]);

	console.log('\n=== TIME REMAINING IN VOTING PERIOD ===');
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
		// Get current time for reference
		const now = Math.floor(Date.now() / 1000);
		const nowDate = new Date(now * 1000);

		console.log('\n🕐 Current Time:', nowDate.toLocaleString());

		// Get time remaining
		const encodedCall = lazyVoterIface.encodeFunctionData('timeRemaining', []);
		const result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const timeRemaining = Number(lazyVoterIface.decodeFunctionResult('timeRemaining', result)[0]);

		// Get voting end time for context
		const encodedCall2 = lazyVoterIface.encodeFunctionData('endTime', []);
		const result2 = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall2,
			operatorId,
			false,
		);
		const endTime = Number(lazyVoterIface.decodeFunctionResult('endTime', result2)[0]);

		const endDate = new Date(endTime * 1000);

		console.log('\n⏱️  Voting Period Status:');

		if (timeRemaining <= 0) {
			console.log('   ❌ VOTING HAS ENDED');
			console.log('   Voting ended at:', endDate.toLocaleString());
			console.log('   Time since end:', Math.abs(timeRemaining), 'seconds');

			// Calculate how long ago it ended
			const secondsAgo = Math.abs(timeRemaining);
			const minutesAgo = Math.floor(secondsAgo / 60);
			const hoursAgo = Math.floor(minutesAgo / 60);
			const daysAgo = Math.floor(hoursAgo / 24);

			if (daysAgo > 0) {
				console.log('   Ended', daysAgo, 'days ago');
			}
			else if (hoursAgo > 0) {
				console.log('   Ended', hoursAgo, 'hours ago');
			}
			else if (minutesAgo > 0) {
				console.log('   Ended', minutesAgo, 'minutes ago');
			}
			else {
				console.log('   Ended', secondsAgo, 'seconds ago');
			}
		}
		else {
			console.log('   ✅ VOTING IS ACTIVE');
			console.log('   Time remaining:', timeRemaining, 'seconds');
			console.log('   Voting ends at:', endDate.toLocaleString());

			// Break down the time remaining
			const days = Math.floor(timeRemaining / 86400);
			const hours = Math.floor((timeRemaining % 86400) / 3600);
			const minutes = Math.floor((timeRemaining % 3600) / 60);
			const seconds = timeRemaining % 60;

			console.log('\n📅 Time Breakdown:');
			if (days > 0) {
				console.log('   📆 Days remaining:', days);
			}
			if (hours > 0 || days > 0) {
				console.log('   🕐 Hours remaining:', hours);
			}
			if (minutes > 0 || hours > 0 || days > 0) {
				console.log('   🕒 Minutes remaining:', minutes);
			}
			console.log('   ⏱️  Seconds remaining:', seconds);

			// Progress bar
			const totalDuration = endTime - (endTime - timeRemaining);
			const progressPercent = totalDuration > 0 ? ((totalDuration - timeRemaining) / totalDuration) * 100 : 0;

			console.log('\n📊 Voting Progress:');
			const progressBar = '█'.repeat(Math.floor(progressPercent / 2)) + '░'.repeat(50 - Math.floor(progressPercent / 2));
			console.log('   [' + progressBar + '] ' + progressPercent.toFixed(1) + '% complete');
		}

		// Get voting status for additional context
		const encodedCall3 = lazyVoterIface.encodeFunctionData('votingStatus', []);
		const result3 = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall3,
			operatorId,
			false,
		);
		const votingStatus = lazyVoterIface.decodeFunctionResult('votingStatus', result3)[0];

		console.log('\n📋 Voting Status:', votingStatus);

		console.log('\n✅ Time remaining retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving time remaining:', error.message);
		process.exit(1);
	}
};

main();