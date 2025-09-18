#!/usr/bin/env node

/**
 * Get Vote Results Summary
 *
 * Reads the current voting results (yes/no/abstain counts) and provides analytics.
 *
 * Usage:
 *   node scripts/interactions/getVoteResults.js 0.0.12345
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
		console.log('Usage: getVoteResults.js <contract-id>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('');
		console.log('Example:');
		console.log('  node scripts/interactions/getVoteResults.js 0.0.12345');
		return;
	}

	const contractId = ContractId.fromString(args[0]);

	console.log('\n=== VOTING RESULTS SUMMARY ===');
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
		// Get vote counts
		const encodedCall = lazyVoterIface.encodeFunctionData('yesCount', []);
		let result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const yesCount = Number(lazyVoterIface.decodeFunctionResult('yesCount', result)[0]);

		const encodedCall2 = lazyVoterIface.encodeFunctionData('noCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall2,
			operatorId,
			false,
		);
		const noCount = Number(lazyVoterIface.decodeFunctionResult('noCount', result)[0]);

		const encodedCall3 = lazyVoterIface.encodeFunctionData('abstainCount', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall3,
			operatorId,
			false,
		);
		const abstainCount = Number(lazyVoterIface.decodeFunctionResult('abstainCount', result)[0]);

		const totalVotes = yesCount + noCount + abstainCount;

		// Get quorum information
		const encodedCall4 = lazyVoterIface.encodeFunctionData('quorum', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall4,
			operatorId,
			false,
		);
		const quorum = Number(lazyVoterIface.decodeFunctionResult('quorum', result)[0]);

		// Get total eligible voters
		const encodedCall5 = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall5,
			operatorId,
			false,
		);
		const totalEligible = Number(lazyVoterIface.decodeFunctionResult('totalEligibleVoters', result)[0]);

		// Display results
		console.log('\n📊 VOTE RESULTS:');
		console.log('   ╔══════════════════════════════════════════════════════════════╗');
		console.log('   ║                        VOTING RESULTS                       ║');
		console.log('   ╠══════════════════════════════════════════════════════════════╣');

		// Yes votes
		const yesBar = '█'.repeat(Math.min(50, Math.floor((yesCount / Math.max(totalVotes, 1)) * 50)));
		const yesPercent = totalVotes > 0 ? ((yesCount / totalVotes) * 100).toFixed(1) : '0.0';
		console.log(`   ║ ✅ YES:     ${yesCount.toString().padStart(6)} votes (${yesPercent.padStart(4)}%) ${yesBar.padEnd(50)} ║`);

		// No votes
		const noBar = '█'.repeat(Math.min(50, Math.floor((noCount / Math.max(totalVotes, 1)) * 50)));
		const noPercent = totalVotes > 0 ? ((noCount / totalVotes) * 100).toFixed(1) : '0.0';
		console.log(`   ║ ❌ NO:      ${noCount.toString().padStart(6)} votes (${noPercent.padStart(4)}%) ${noBar.padEnd(50)} ║`);

		// Abstain votes
		const abstainBar = '█'.repeat(Math.min(50, Math.floor((abstainCount / Math.max(totalVotes, 1)) * 50)));
		const abstainPercent = totalVotes > 0 ? ((abstainCount / totalVotes) * 100).toFixed(1) : '0.0';
		console.log(`   ║ 🤐 ABSTAIN: ${abstainCount.toString().padStart(6)} votes (${abstainPercent.padStart(4)}%) ${abstainBar.padEnd(50)} ║`);

		console.log('   ╠══════════════════════════════════════════════════════════════╣');

		// Total
		console.log(`   ║ 📈 TOTAL:   ${totalVotes.toString().padStart(6)} votes cast                           ║`);
		console.log(`   ║ 👥 ELIGIBLE:${totalEligible.toString().padStart(6)} voters                           ║`);
		console.log('   ╚══════════════════════════════════════════════════════════════╝');

		// Quorum status
		console.log('\n🎯 QUORUM STATUS:');
		console.log('   Required votes:', quorum);
		console.log('   Yes votes:', yesCount);
		console.log('   Quorum reached:', yesCount >= quorum ? 'YES ✅' : 'NO ❌');

		if (totalVotes > 0) {
			const quorumPercent = (quorum / totalVotes) * 100;
			console.log('   Quorum percentage of total votes:', quorumPercent.toFixed(1) + '%');
		}

		// Participation rate
		console.log('\n📊 PARTICIPATION:');
		if (totalEligible > 0) {
			const participationRate = (totalVotes / totalEligible) * 100;
			console.log('   Participation rate:', participationRate.toFixed(1) + '%');
			console.log('   Voters participated:', totalVotes, 'of', totalEligible, 'eligible');
		}
		else {
			console.log('   No eligible voters configured');
		}

		// Determine winner
		console.log('\n🏆 RESULT:');
		if (totalVotes === 0) {
			console.log('   No votes cast yet');
		}
		else if (yesCount > noCount) {
			console.log('   ✅ PROPOSAL PASSED - Yes votes exceed No votes');
		}
		else if (noCount > yesCount) {
			console.log('   ❌ PROPOSAL REJECTED - No votes exceed Yes votes');
		}
		else {
			console.log('   🤝 TIED - Equal Yes and No votes');
		}

		console.log('\n✅ Vote results retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving vote results:', error.message);
		process.exit(1);
	}
};

main();