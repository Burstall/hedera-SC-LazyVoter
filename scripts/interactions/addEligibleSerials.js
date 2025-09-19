#!/usr/bin/env node

/**
 * Add Eligible NFT Serials
 *
 * Adds NFT serials as eligible to vote in the LazyVoter contract.
 * Supports manual input, fetching owned serials, or fetching from specific token.
 *
 * Usage:
 *   node scripts/interactions/addEligibleSerials.js 1,2,3,4,5
 *   node scripts/interactions/addEligibleSerials.js --fetch-owned
 *   node scripts/interactions/addEligibleSerials.js --fetch-token 0.0.12345
 *   node scripts/interactions/addEligibleSerials.js --fetch-token 0.0.12345 --range 1-100
 *
 * Options:
 *   --fetch-owned: Fetch all NFT serials owned by the operator account
 *   --fetch-token <token-id>: Fetch all serials from specific NFT token
 *   --range <start-end>: Range of serials to fetch (e.g., 1-50)
 *   --batch-size <size>: Number of serials per batch (default: 200)
 *
 * Environment Variables:
 *   CONTRACT_ID - LazyVoter contract ID
 *   PRIVATE_KEY - Your Hedera private key
 *   ACCOUNT_ID - Your Hedera account ID
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
const { getArgFlag, getArgParam } = require('../../utils/nodeHelpers');
const { contractExecuteFunction, readOnlyEVMFromMirrorNode } = require('../../utils/solidityHelpers');
const { getSerialsOwned, getTokenDetails } = require('../../utils/hederaMirrorHelpers');

// Get operator from .env file
const operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? 'LazyVoter';

// ContractId will be set in main based on CLI or .env
const env = process.env.ENVIRONMENT ?? 'TEST';

let client;

const main = async () => {
	const args = process.argv.slice(2);

	// Check for help flag
	if (getArgFlag('-h') || getArgFlag('--help')) {
		console.log('Usage: addEligibleSerials.js <serials> [options]');
		console.log('  <serials>: Comma-separated list of NFT serial numbers (e.g., 1,2,3,4,5)');
		console.log('');
		console.log('Options:');
		console.log('  --fetch-owned: Fetch all NFT serials owned by the operator account');
		console.log('  --fetch-token: Fetch all serials from the contract\'s NFT token');
		console.log('  --range <start-end>: Range of serials to fetch (e.g., 1-50)');
		console.log('  --batch-size <size>: Number of serials per batch (default: 200)');
		console.log('  --contract-id <id>: Specify LazyVoter contract ID (overrides .env)');
		console.log('');
		console.log('Environment Variables Required:');
		console.log('  CONTRACT_ID - LazyVoter contract ID (if not specified via --contract-id)');
		console.log('  PRIVATE_KEY - Your Hedera private key');
		console.log('  ACCOUNT_ID - Your Hedera account ID');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/interactions/addEligibleSerials.js 1,2,3,4,5');
		console.log('  node scripts/interactions/addEligibleSerials.js --fetch-owned');
		console.log('  node scripts/interactions/addEligibleSerials.js --fetch-token');
		console.log('  node scripts/interactions/addEligibleSerials.js --fetch-token --range 1-100');
		console.log('  node scripts/interactions/addEligibleSerials.js --contract-id 0.0.12345 1,2,3,4,5');
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

	// Validate argument combinations
	if (getArgFlag('--range') && !getArgFlag('--fetch-token')) {
		console.log('❌ Error: --range can only be used with --fetch-token');
		console.log('   Example: node scripts/interactions/addEligibleSerials.js --fetch-token --range 1-100');
		process.exit(1);
	}

	let serials = [];
	let batchSize = 200;

	// Handle different input modes
	if (getArgFlag('--fetch-owned')) {
		console.log('\n🔍 Fetching NFT serials owned by operator account...');
		try {
			// First get the NFT token from the contract
			const lazyVoterJSON = JSON.parse(
				fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`),
			);
			const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

			// Setup temporary client for reading contract
			let tempClient;
			if (env.toUpperCase() == 'TEST') {
				tempClient = Client.forTestnet();
			}
			else if (env.toUpperCase() == 'MAIN') {
				tempClient = Client.forMainnet();
			}
			else if (env.toUpperCase() == 'PREVIEW') {
				tempClient = Client.forPreviewnet();
			}
			else {
				console.log('❌ Error: Invalid ENVIRONMENT. Must be TEST, MAIN, PREVIEW, or LOCAL');
				process.exit(1);
			}

			tempClient.setOperator(operatorId, operatorKey);

			const nftTokenCall = lazyVoterIface.encodeFunctionData('NFT_TOKEN', []);
			const nftTokenResult = await readOnlyEVMFromMirrorNode(
				env,
				contractId,
				nftTokenCall,
				operatorId,
				false,
			);
			const decodedNftToken = lazyVoterIface.decodeFunctionResult('NFT_TOKEN', nftTokenResult);
			const nftTokenId = TokenId.fromSolidityAddress(decodedNftToken[0]);
			console.log('   NFT Token ID:', nftTokenId.toString());

			// Fetch owned serials
			serials = await getSerialsOwned(env, operatorId, nftTokenId);
			console.log(`✅ Found ${serials.length} NFT serials owned by ${operatorId.toString()}`);

			if (serials.length === 0) {
				console.log('❌ No NFT serials found for this account');
				process.exit(1);
			}

		}
		catch (error) {
			console.error('❌ Error fetching owned serials:', error.message);
			process.exit(1);
		}

	}
	else if (getArgFlag('--fetch-token')) {
		try {
			// First get the NFT token from the contract
			const lazyVoterJSON = JSON.parse(
				fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`),
			);
			const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

			// Setup temporary client for reading contract
			let tempClient;
			if (env.toUpperCase() == 'TEST') {
				tempClient = Client.forTestnet();
			}
			else if (env.toUpperCase() == 'MAIN') {
				tempClient = Client.forMainnet();
			}
			else if (env.toUpperCase() == 'PREVIEW') {
				tempClient = Client.forPreviewnet();
			}
			else {
				console.log('❌ Error: Invalid ENVIRONMENT. Must be TEST, MAIN, PREVIEW, or LOCAL');
				process.exit(1);
			}

			tempClient.setOperator(operatorId, operatorKey);

			const nftTokenCall = lazyVoterIface.encodeFunctionData('NFT_TOKEN', []);
			const nftTokenResult = await readOnlyEVMFromMirrorNode(
				env,
				contractId,
				nftTokenCall,
				operatorId,
				false,
			);
			const decodedNftToken = lazyVoterIface.decodeFunctionResult('NFT_TOKEN', nftTokenResult);
			const tokenId = TokenId.fromSolidityAddress(decodedNftToken[0]);
			console.log(`\n🔍 Fetching all serials from contract's NFT token ${tokenId.toString()}...`);

			// Get token details first
			const tokenDetails = await getTokenDetails(env, tokenId);
			if (!tokenDetails) {
				console.log('❌ Error: Could not fetch token details');
				process.exit(1);
			}

			console.log(`   Token: ${tokenDetails.name} (${tokenDetails.symbol})`);
			console.log(`   Total Supply: ${tokenDetails.total_supply}`);

			// Check for range parameter
			let startSerial = 1;
			let endSerial = parseInt(tokenDetails.total_supply);

			if (getArgFlag('--range')) {
				const rangeStr = getArgParam('--range');
				const rangeMatch = rangeStr.match(/^(\d+)-(\d+)$/);
				if (!rangeMatch) {
					console.log('❌ Error: Invalid range format. Use: --range 1-100');
					process.exit(1);
				}
				startSerial = parseInt(rangeMatch[1]);
				endSerial = parseInt(rangeMatch[2]);

				if (startSerial < 1 || endSerial > parseInt(tokenDetails.total_supply) || startSerial > endSerial) {
					console.log(`❌ Error: Invalid range. Token has serials 1-${tokenDetails.total_supply}`);
					process.exit(1);
				}
			}

			// Generate serial range
			for (let i = startSerial; i <= endSerial; i++) {
				serials.push(i);
			}

			console.log(`✅ Generated ${serials.length} serials from range ${startSerial}-${endSerial}`);

		}
		catch (error) {
			console.error('❌ Error fetching token serials:', error.message);
			process.exit(1);
		}

	}
	else {
		// Manual serial input mode
		if (args.length !== 1) {
			console.log('❌ Error: Manual mode requires exactly one argument with comma-separated serials');
			console.log('   Example: node scripts/interactions/addEligibleSerials.js 1,2,3,4,5');
			process.exit(1);
		}

		// Parse serials from command line
		const serialsStr = args[0];
		serials = serialsStr.split(',').map(s => {
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
	}

	// Check batch size parameter
	if (getArgFlag('--batch-size')) {
		const batchSizeStr = getArgParam('--batch-size');
		const parsedBatchSize = parseInt(batchSizeStr);
		if (isNaN(parsedBatchSize) || parsedBatchSize < 1) {
			console.log('❌ Error: Invalid batch size. Must be a positive number.');
			process.exit(1);
		}
		batchSize = parsedBatchSize;
	}

	console.log('\n=== ADD ELIGIBLE NFT SERIALS ===');
	console.log('\n- Environment:', env);
	console.log('\n- Operator:', operatorId.toString());
	console.log('\n- Contract:', contractId.toString());
	console.log('\n- Serials to add:', serials.length > 10 ? `${serials.slice(0, 10).join(', ')}...` : serials.join(', '));
	console.log('\n- Total serials:', serials.length);
	console.log('\n- Batch size:', batchSize);

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
		fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`),
	);

	const lazyVoterIface = new ethers.Interface(lazyVoterJSON.abi);

	try {
		// Check if voting has started
		console.log('\n🔍 Checking voting status...');
		const startTimeCall = lazyVoterIface.encodeFunctionData('startTime', []);
		const startTimeResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			startTimeCall,
			operatorId,
			false,
		);
		const decodedStartTime = lazyVoterIface.decodeFunctionResult('startTime', startTimeResult);
		const startTime = Number(decodedStartTime[0]);
		const now = Math.floor(Date.now() / 1000);

		if (now >= startTime) {
			console.log('❌ Error: Cannot add eligible serials after voting has started');
			console.log('   Voting started at:', new Date(startTime * 1000).toLocaleString());
			process.exit(1);
		}

		console.log('✅ Voting has not started yet - serials can be added');

		// Split serials into batches
		const batches = [];
		for (let i = 0; i < serials.length; i += batchSize) {
			batches.push(serials.slice(i, i + batchSize));
		}

		console.log(`\n📦 Serials will be added in ${batches.length} batch(es) of up to ${batchSize} each`);

		// Confirm action
		console.log('\n⚠️  This action will add the following serials as eligible to vote:');
		console.log(`   Total serials: ${serials.length}`);
		console.log(`   Number of batches: ${batches.length}`);
		if (serials.length <= 20) {
			console.log(`   Serials: ${serials.join(', ')}`);
		}
		else {
			console.log(`   Serials: ${serials.slice(0, 10).join(', ')}...${serials.slice(-10).join(', ')}`);
		}

		const confirm = readlineSync.question('\nDo you want to proceed? (y/N): ');
		if (confirm.toLowerCase() !== 'y') {
			console.log('❌ Operation cancelled by user');
			process.exit(0);
		}

		// Execute batches
		let totalProcessed = 0;
		let totalTransactions = 0;

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			const batchNumber = i + 1;

			console.log(`\n⚙️  Executing batch ${batchNumber}/${batches.length} (${batch.length} serials)...`);

			const result = await contractExecuteFunction(
				contractId,
				lazyVoterIface,
				client,
				0,
				'addEligibleSerials',
				[batch],
			);

			console.log(`✅ Batch ${batchNumber} completed successfully!`);
			console.log(`   Transaction ID: ${result[2].transactionId.toString()}`);
			console.log(`   Serials in batch: ${batch.length}`);
			console.log(`   Serial range: ${batch[0]}-${batch[batch.length - 1]}`);

			totalProcessed += batch.length;
			totalTransactions++;

			// Small delay between batches to avoid rate limiting
			if (i < batches.length - 1) {
				console.log('   Waiting 2 seconds before next batch...');
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}

		console.log('\n🎉 All batches completed successfully!');
		console.log(`   Total transactions: ${totalTransactions}`);
		console.log(`   Total serials added: ${totalProcessed}`);

		// Verify the serials were added
		console.log('\n🔍 Verifying serials were added...');
		const verifyCall = lazyVoterIface.encodeFunctionData('totalEligibleVoters', []);
		const verifyResult = await readOnlyEVMFromMirrorNode(
			env,
			contractId,
			verifyCall,
			operatorId,
			false,
		);
		const decodedVerify = lazyVoterIface.decodeFunctionResult('totalEligibleVoters', verifyResult);
		const totalEligible = Number(decodedVerify[0]);
		console.log(`   Total eligible voters now: ${totalEligible}`);

	}
	catch (error) {
		console.error('\n❌ Error adding eligible serials:', error.message);

		// Provide helpful guidance based on error type
		if (error.message.includes('Ownable: caller is not the owner')) {
			console.log('\n💡 This error means:');
			console.log('   - Only the contract owner can add eligible serials');
			console.log('   - You need to use the contract owner account');
		}
		else if (error.message.includes('Voting has already started')) {
			console.log('\n💡 This error means:');
			console.log('   - Eligible serials can only be added before voting starts');
			console.log('   - Check the voting start time with getLazyVoterInfo.js');
		}
		else if (error.message.includes('Serial already eligible')) {
			console.log('\n💡 This error means:');
			console.log('   - One or more serials are already marked as eligible');
			console.log('   - Check current eligible serials with getEligibleSerials.js');
		}
		else if (error.message.includes('Invalid serial')) {
			console.log('\n💡 This error means:');
			console.log('   - One or more serial numbers are invalid');
			console.log('   - Serial numbers must be positive integers');
		}

		process.exit(1);
	}
};

main();