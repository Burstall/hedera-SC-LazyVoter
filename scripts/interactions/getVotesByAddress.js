#!/usr/bin/env node

/**
 * Get Votes by Address
 *
 * Reads all votes cast by a specific address from the LazyVoter contract.
 *
 * Usage:
 *   node scripts/interactions/getVotesByAddress.js 0.0.12345 0x1234567890123456789012345678901234567890
 *
 * Parameters:
 *   contract-id: LazyVoter contract ID (required)
 *   voter-address: Address to check votes for (required)
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
	if (args.length != 2 || getArgFlag('h')) {
		console.log('Usage: getVotesByAddress.js <contract-id> <voter-address>');
		console.log('  <contract-id>: LazyVoter contract ID (e.g., 0.0.12345)');
		console.log('  <voter-address>: Voter address to check (Hedera: 0.0.X or Ethereum: 0x...)');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/interactions/getVotesByAddress.js 0.0.12345 0.0.123456');
		console.log('  node scripts/interactions/getVotesByAddress.js 0.0.12345 0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
		return;
	}

	const contractId = ContractId.fromString(args[0]);
	let voterAddress = args[1];

	// Convert Hedera account ID format (0.0.X) to Ethereum address format
	if (voterAddress.startsWith('0.0.')) {
		try {
			const accountId = AccountId.fromString(voterAddress);
			voterAddress = accountId.toSolidityAddress();
		}
		catch {
			console.log('❌ Error: Invalid account ID format:', voterAddress);
			process.exit(1);
		}
	}
	// Validate Ethereum address format
	else if (!voterAddress.startsWith('0x') || voterAddress.length !== 42) {
		console.log('❌ Error: Invalid address format. Use Hedera format (0.0.X) or Ethereum format (0x...)');
		process.exit(1);
	}

	console.log('\n=== VOTES BY ADDRESS ===');
	console.log('\n- Environment:', env);
	console.log('\n- Contract ID:', contractId.toString());
	console.log('\n- Voter Address:', voterAddress);
	console.log('\n- Operator Account:', operatorId.toString());

	// Import ABI
	const lazyVoterJSON = JSON.parse(
		fs.readFileSync(
			`./artifacts/contracts/${contractName}.sol/${contractName}.json`,
		),
	);

	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	try {
		// Get votes by address
		const encodedCall = lazyVoterIface.encodeFunctionData('getVotesByAddress', [voterAddress]);
		const result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const votesResult = lazyVoterIface.decodeFunctionResult('getVotesByAddress', result);

		const voteSerials = votesResult[0];
		const voteTypes = votesResult[1];

		console.log('\n🗳️  Votes cast by', voterAddress + ':');
		console.log('   Total votes:', voteSerials.length);

		if (voteSerials.length === 0) {
			console.log('\n📝 This address has not cast any votes.');
			console.log('\n✅ Query completed successfully!');
			process.exit(0);
		}

		console.log('\n📊 Vote Details:');
		console.log('   ┌────────────┬────────────┐');
		console.log('   │ Serial     │ Vote Type  │');
		console.log('   ├────────────┼────────────┤');

		let yesVotes = 0;
		let noVotes = 0;
		let abstainVotes = 0;

		for (let i = 0; i < voteSerials.length; i++) {
			const serial = Number(voteSerials[i]);
			const voteTypeNum = Number(voteTypes[i]);

			// Convert vote type number to string
			let voteTypeStr;
			switch (voteTypeNum) {
			case 0:
				voteTypeStr = 'No';
				noVotes++;
				break;
			case 1:
				voteTypeStr = 'Yes';
				yesVotes++;
				break;
			case 2:
				voteTypeStr = 'Abstain';
				abstainVotes++;
				break;
			default:
				voteTypeStr = 'Unknown';
			}

			console.log(`   │ ${serial.toString().padStart(10)} │ ${voteTypeStr.padStart(10)} │`);
		}

		console.log('   └────────────┴────────────┘');

		console.log('\n📈 Vote Summary:');
		console.log('   ✅ Yes votes:', yesVotes);
		console.log('   ❌ No votes:', noVotes);
		console.log('   🤐 Abstain votes:', abstainVotes);
		console.log('   📊 Total votes:', voteSerials.length);

		console.log('\n✅ Query completed successfully!');
		process.exit(0);

		// Show unique serials voted on
		const uniqueSerials = [...new Set(voteSerials.map(s => Number(s)))];
		console.log('   🎫 Unique serials voted on:', uniqueSerials.length);

		console.log('\n✅ Votes by address retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving votes by address:', error.message);
		process.exit(1);
	}
};

// Handle main function execution and unhandled promise rejections
main().catch((error) => {
	console.error('❌ Unhandled error:', error.message);
	process.exit(1);
});