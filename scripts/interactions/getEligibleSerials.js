#!/usr/bin/env node

/**
 * Get Eligible NFT Serials
 *
 * Reads the list of eligible NFT serials from the LazyVoter contract with pagination support.
 *
 * Usage:
 *   node scripts/interactions/getEligibleSerials.js 0.0.12345 [offset] [limit]
 *   node scripts/interactions/getEligibleSerials.js --contract-id 0.0.12345 [offset] [limit]
 *
 * Parameters:
 *   contract-id: LazyVoter contract ID (required)
 *   offset: Starting index for pagination (optional, default: 0)
 *   limit: Maximum number of serials to return (optional, default: 50, max: 100)
 *
 * Options:
 *   --contract-id: Specify contract ID using flag
 *   --help, -h: Show help message
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

// Show usage information
function showUsage() {
	console.log('');
	console.log('=== GET ELIGIBLE NFT SERIALS ===');
	console.log('');
	console.log('Usage:');
	console.log('  node scripts/interactions/getEligibleSerials.js <contract-id> [offset] [limit]');
	console.log('  node scripts/interactions/getEligibleSerials.js --contract-id <contract-id> [offset] [limit]');
	console.log('');
	console.log('Parameters:');
	console.log('  <contract-id>    LazyVoter contract ID (e.g., 0.0.12345)');
	console.log('  [offset]         Starting index for pagination (default: 0)');
	console.log('  [limit]          Maximum serials to return (default: 50, max: 100)');
	console.log('');
	console.log('Options:');
	console.log('  --contract-id    Specify contract ID using flag');
	console.log('  --help, -h       Show this help message');
	console.log('');
	console.log('Examples:');
	console.log('  node scripts/interactions/getEligibleSerials.js 0.0.12345');
	console.log('  node scripts/interactions/getEligibleSerials.js 0.0.12345 0 25');
	console.log('  node scripts/interactions/getEligibleSerials.js 0.0.12345 50 50');
	console.log('  node scripts/interactions/getEligibleSerials.js --contract-id 0.0.12345');
	console.log('');
}

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

	// Show help if requested
	if (getArgFlag(args, 'help') || getArgFlag(args, 'h')) {
		showUsage();
		return;
	}

	// Get contract ID from either flag or positional argument
	let contractIdString;
	const contractIdFlag = getArgFlag(args, 'contract-id');
	const filteredArgs = args.filter(arg => !arg.startsWith('--'));

	if (contractIdFlag) {
		contractIdString = contractIdFlag;
	}
	else if (filteredArgs.length >= 1) {
		contractIdString = filteredArgs[0];
	}
	else {
		console.log('❌ Error: Contract ID is required\n');
		showUsage();
		process.exit(1);
	}

	// Parse and validate contract ID
	let contractId;
	try {
		contractId = ContractId.fromString(contractIdString);
	}
	catch {
		console.log(`❌ Error: Invalid contract ID format "${contractIdString}"`);
		console.log('   Expected format: 0.0.12345\n');
		showUsage();
		process.exit(1);
	}

	// Parse offset and limit from remaining positional arguments
	const offset = filteredArgs.length >= 2 ? parseInt(filteredArgs[1]) : 0;
	const limit = filteredArgs.length >= 3 ? parseInt(filteredArgs[2]) : 200;

	// Validate parameters
	if (isNaN(offset) || offset < 0) {
		console.log('❌ Error: offset must be a non-negative number');
		process.exit(1);
	}
	if (isNaN(limit) || limit < 1 || limit > 200) {
		console.log('❌ Error: limit must be between 1 and 200');
		process.exit(1);
	}

	console.log('\n=== ELIGIBLE NFT SERIALS ===');
	console.log('\n- Environment:', env);
	console.log('\n- Contract ID:', contractId.toString());
	console.log('\n- Operator Account:', operatorId.toString());
	console.log('\n- Pagination: offset =', offset, ', limit =', limit);

	// Import ABI
	const lazyVoterJSON = JSON.parse(
		fs.readFileSync(
			`./artifacts/contracts/${contractName}.sol/${contractName}.json`,
		),
	);

	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	try {
		// Get total eligible voters first
		let encodedCall = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		let result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const totalEligible = Number(lazyVoterIface.decodeFunctionResult('totalEligibleVoters', result)[0]);

		console.log('\n👥 Total Eligible Voters:', totalEligible);

		if (totalEligible === 0) {
			console.log('\n📝 No eligible serials found.');
			console.log('\n✅ Query completed successfully!');
			return;
		}

		// Get eligible serials with pagination
		encodedCall = lazyVoterIface.encodeFunctionData('getEligibleSerials', [offset, limit]);
		result = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			encodedCall,
			operatorId,
			false,
		);
		const eligibleSerials = lazyVoterIface.decodeFunctionResult('getEligibleSerials', result)[0];

		console.log('\n📋 Eligible NFT Serials:');
		console.log('   Showing', eligibleSerials.length, 'serials (', offset, 'to', Math.min(offset + limit - 1, totalEligible - 1), 'of', totalEligible - 1, ')');

		if (eligibleSerials.length === 0) {
			console.log('   No serials found in this range.');
		}
		else {
			// Display serials in a formatted way
			const serialsPerLine = 10;
			for (let i = 0; i < eligibleSerials.length; i += serialsPerLine) {
				const chunk = eligibleSerials.slice(i, i + serialsPerLine);
				const serialNumbers = chunk.map(serial => Number(serial)).join(', ');
				console.log('   ', serialNumbers);
			}

			console.log('\n📊 Summary:');
			console.log('   First serial:', Number(eligibleSerials[0]));
			console.log('   Last serial:', Number(eligibleSerials[eligibleSerials.length - 1]));
			console.log('   Range:', Number(eligibleSerials[eligibleSerials.length - 1]) - Number(eligibleSerials[0]) + 1, 'serials');

			// Check if there are more pages
			const hasMorePages = (offset + limit) < totalEligible;
			if (hasMorePages) {
				const nextOffset = offset + limit;
				console.log('\n📄 More pages available. Next page:');
				console.log('   node scripts/interactions/getEligibleSerials.js', contractId.toString(), nextOffset, limit);
			}
		}

		console.log('\n✅ Eligible serials retrieved successfully!');

	}
	catch (error) {
		console.error('\n❌ Error retrieving eligible serials:', error.message);
		process.exit(1);
	}
};

main();