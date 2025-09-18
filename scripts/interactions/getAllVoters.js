#!/usr/bin/env node

/**
 * Get All Voters and Vote Counts
 *
 * Reads all voters and their vote counts from the LazyVoter contract.
 *
 * Usage:
 *   node scripts/interactions/getAllVoters.js 0.0.12345
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
		console.log('Usage: getAllVoters.js <contract-id>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/getAllVoters.js 0.0.12345');
		return;
	}

	const contractId = ContractId.fromString(args[0]);

	console.log('\n=== ALL VOTERS AND VOTE COUNTS ===');
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
		// Get all voters
		const encodedCall = lazyVoterIface.encodeFunctionData('getAllVoters', []);
		const result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const allVotersResult = lazyVoterIface.decodeFunctionResult('getAllVoters', result);

		const voters = allVotersResult[0];
		const voteCounts = allVotersResult[1];

		console.log('\n👥 Total Voters:', voters.length);

		if (voters.length === 0) {
			console.log('\n📝 No voters found.');
			console.log('\n✅ Query completed successfully!');
			return;
		}

		console.log('\n📊 Voters and Vote Counts:');
		console.log('   ┌─────────────────────────────────────────────────────────────┬─────────────┐');
		console.log('   │ Voter Address                                               │ Vote Count  │');
		console.log('   ├─────────────────────────────────────────────────────────────┼─────────────┤');

		let totalVotes = 0;
		for (let i = 0; i < voters.length; i++) {
			const voter = voters[i];
			const voteCount = Number(voteCounts[i]);
			totalVotes += voteCount;

			// Format address for display (show first 6 and last 4 characters)
			const shortAddress = voter.length > 10 ? voter.substring(0, 6) + '...' + voter.substring(voter.length - 4) : voter;

			console.log(`   │ ${shortAddress.padEnd(59)} │ ${voteCount.toString().padStart(11)} │`);
		}

		console.log('   └─────────────────────────────────────────────────────────────┴─────────────┘');
		console.log('\n📈 Summary:');
		console.log('   Total voters:', voters.length);
		console.log('   Total votes cast:', totalVotes);
		console.log('   Average votes per voter:', voters.length > 0 ? (totalVotes / voters.length).toFixed(2) : '0');

		// Show top voters
		if (voters.length > 1) {
			console.log('\n🏆 Top Voters:');

			// Create array of voter objects for sorting
			const voterData = voters.map((voter, index) => ({
				address: voter,
				voteCount: Number(voteCounts[index]),
			}));

			// Sort by vote count descending
			voterData.sort((a, b) => b.voteCount - a.voteCount);

			const topCount = Math.min(5, voterData.length);
			for (let i = 0; i < topCount; i++) {
				const voter = voterData[i];
				const shortAddress = voter.address.length > 10 ? voter.address.substring(0, 6) + '...' + voter.address.substring(voter.address.length - 4) : voter.address;
				console.log(`   ${i + 1}. ${shortAddress}: ${voter.voteCount} votes`);
			}
		}

		console.log('\n✅ All voters retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving voters:', error.message);
		process.exit(1);
	}
};

main();