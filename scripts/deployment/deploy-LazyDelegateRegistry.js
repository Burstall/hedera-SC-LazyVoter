#!/usr/bin/env node

/**
 * Hedera deployment script for LazyDelegateRegistry contract using HTS (Hedera Token Service).
 * This script deploys the LazyDelegateRegistry contract which is required for LazyVoter functionality.
 *
 * Usage examples:
 *   node deploy-LazyDelegateRegistry.js --env TEST
 *   node deploy-LazyDelegateRegistry.js --env MAIN --bytecode-file-id 0.0.12345
 *
 * Help:
 *   node deploy-LazyDelegateRegistry.js --help
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const readlineSync = require('readline-sync');

// --- Hedera SDK (HTS) ---
const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateTransaction,
} = require('@hashgraph/sdk');

// Import the reliable contractDeployFunction
const { contractDeployFunction } = require('../../utils/solidityHelpers');

// ------- CLI ---------
const argv = yargs(hideBin(process.argv))
	.scriptName('deploy-LazyDelegateRegistry')
	.option('env', {
		type: 'string',
		choices: ['TEST', 'MAIN', 'PREVIEW', 'LOCAL'],
		describe: 'Network environment',
		default: (process.env.ENVIRONMENT ?? 'TEST').toUpperCase(),
	})
	.option('bytecode-file-id', {
		type: 'string',
		describe: 'Deploy via existing Bytecode FileID',
	})
	.option('artifact-dir', {
		type: 'string',
		describe: 'Path to Hardhat-style artifacts directory',
		default: './artifacts/contracts',
	})
	.option('contract-name', {
		type: 'string',
		describe: 'Contract name (file and artifact stem)',
		default: process.env.CONTRACT_NAME || 'LazyDelegateRegistry',
	})
	.check(() => {
		if (!process.env.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY in .env');
		if (!process.env.ACCOUNT_ID) throw new Error('Missing ACCOUNT_ID in .env');
		return true;
	})
	.help()
	.argv;

// ----------- Shared config -----------
let operatorKey;
try {
	operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
	console.log('[config] Detected ED25519 private key');
}
catch (err) {
	try {
		operatorKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY);
		console.log('[config] Detected ECDSA private key');
	}
	catch (ecdsaErr) {
		throw new Error(`Invalid PRIVATE_KEY format. Must be ED25519 (base64/hex) or ECDSA (hex). ED25519 error: ${err.message}, ECDSA error: ${ecdsaErr.message}`);
	}
}
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const CONTRACT_NAME = argv.contractName;
const ARTIFACT_DIR = argv.artifactDir;

function loadArtifact(name) {
	const p = path.join(ARTIFACT_DIR, `${name}.sol`, `${name}.json`);
	const json = JSON.parse(fs.readFileSync(p));
	if (!json.abi || !json.bytecode) {
		throw new Error(`Artifact for ${name} missing abi/bytecode at ${p}`);
	}
	return json;
}

function printHeader(obj) {
	console.log('\n=== Deploy Config ===');
	console.log(JSON.stringify(obj, null, 2));
}

function askContinue(promptLabel = 'Proceed with deployment?') {
	const answer = readlineSync.question(`${promptLabel} (y/N): `, { defaultInput: 'n' });
	if (String(answer).toLowerCase() !== 'y') {
		console.log('Aborted by user.');
		process.exit(0);
	}
}

// ----------- HTS Deploy Path -----------
async function deployWithHTS() {
	console.log('\n[hts] Starting HTS deployment...');

	// Setup client
	let client;
	if (argv.env === 'TEST') {
		client = Client.forTestnet();
		console.log('[hts] Using Testnet');
	}
	else if (argv.env === 'MAIN') {
		client = Client.forMainnet();
		console.log('[hts] Using Mainnet');
	}
	else if (argv.env === 'PREVIEW') {
		client = Client.forPreviewnet();
		console.log('[hts] Using Previewnet');
	}
	else if (argv.env === 'LOCAL') {
		const node = { '127.0.0.1:50211': new AccountId(3) };
		client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
		console.log('[hts] Using Local network');
	}
	else {
		throw new Error(`Unsupported environment: ${argv.env}`);
	}

	client.setOperator(operatorId, operatorKey);
	console.log(`[hts] Operator: ${operatorId.toString()}`);

	try {
		// Load artifact
		const artifact = loadArtifact(CONTRACT_NAME);
		const bytecode = artifact.bytecode;

		// Use the reliable contractDeployFunction from solidityHelpers
		let contractId, contractAddress;
		const gasLimit = 3_500_000;

		if (argv.bytecodeFileId) {
			console.log(`[hts] Using bytecode file: ${argv.bytecodeFileId}`);
			// For bytecode file deployment, use ContractCreateTransaction
			const contractCreateTx = new ContractCreateTransaction()
				.setBytecodeFileId(argv.bytecodeFileId)
				.setGas(gasLimit)
				.setAutoRenewAccountId(operatorId);

			const response = await contractCreateTx.execute(client);
			const receipt = await response.getReceipt(client);
			contractId = receipt.contractId;
			contractAddress = contractId.toSolidityAddress();
		}
		else {
			console.log('[hts] Using ContractCreateFlow for reliable deployment...');
			// Use the proven reliable contractDeployFunction
			[contractId, contractAddress] = await contractDeployFunction(client, bytecode, gasLimit);
		}

		console.log(`[hts] ✅ Deployed contract: ${contractId.toString()}`);
		console.log(`[hts] Solidity address: ${contractAddress}`);

		return {
			contractId: contractId.toString(),
			solidityAddress: contractAddress,
		};
	}
	finally {
		// Ensure client is closed to prevent hanging
		if (client) {
			client.close();
		}
	}
}

// ----------- Main -----------
async function main() {
	try {
		console.log('🚀 LazyDelegateRegistry Deployment Script');
		console.log('=====================================');

		// Print config
		const config = {
			environment: argv.env,
			contractName: CONTRACT_NAME,
			bytecodeFileId: argv.bytecodeFileId || 'n/a',
			operator: operatorId.toString(),
		};

		printHeader(config);

		// Confirm deployment
		askContinue('Deploy LazyDelegateRegistry contract?');

		// Deploy using HTS
		const result = await deployWithHTS();

		// Success message
		console.log('\n🎉 Deployment successful!');
		console.log('========================');

		console.log(`Contract ID: ${result.contractId}`);
		console.log(`Solidity Address: ${result.solidityAddress}`);

		console.log('\n💡 Next steps:');
		console.log('1. Save the contract address/ID for your LazyVoter deployment');
		console.log('2. You can now deploy LazyVoter using this registry address');
		console.log('3. Example: node deploy-LazyVoter.js --registry', result.contractId);

		// Force exit to prevent hanging on Windows
		setTimeout(() => process.exit(0), 100);
	}
	catch (error) {
		console.error('\n❌ Deployment failed:', error.message);
		if (error.cause) {
			console.error('Cause:', error.cause);
		}
		process.exit(1);
	}
}

main();