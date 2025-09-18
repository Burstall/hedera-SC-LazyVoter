#!/usr/bin/env node

/**
 * Dual-path Hedera deployer for LazyVoter contract with interactive confirmation:
 * 1) Default: Ethers (via JSON-RPC) with gas estimation + EIP-1559 fees
 * 2) Fallback: Hedera SDK (HTS) ContractCreateFlow/Transaction
 *
 * Mirrors your original flow and preserves a readline-style confirmation so
 * users see WHAT will deploy, on WHICH network, and WITH WHAT gas/fees before paying.
 *
 * Usage examples:
 *   node deploy-LazyVoter.js --env TEST --rpc-url https://testnet.hashio.io/api --vote-message "Vote on Proposal" --nft-token 0x123... --quorum 10 --start-time 1695120000 --end-time 1695206400 --registry 0.0.12345 --eligible-serials 1,2,3
 *   node deploy-LazyVoter.js --env MAIN --rpc-url https://mainnet.hashio.io/api --gas-multiplier 1.2
 *   node deploy-LazyVoter.js --env TEST --use-hts --bytecode-file-id 0.0.12345
 *
 * Help:
 *   node deploy-LazyVoter.js --help
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
	ContractCreateFlow,
	ContractFunctionParameters,
	ContractCreateTransaction,
} = require('@hashgraph/sdk');


// Ethers v6
const { ethers } = require('ethers');

// ------- CLI ---------
const argv = yargs(hideBin(process.argv))
	.scriptName('deploy-LazyVoter')
	.option('env', {
		type: 'string',
		choices: ['TEST', 'MAIN', 'PREVIEW', 'LOCAL'],
		describe: 'Network environment (used for HTS path and logs)',
		default: (process.env.ENVIRONMENT ?? 'TEST').toUpperCase(),
	})
	.option('rpc-url', {
		type: 'string',
		describe: 'JSON-RPC endpoint (required for Ethers path)',
	})
	.option('use-hts', {
		type: 'boolean',
		describe: 'Use Hedera SDK (ContractCreateFlow/Transaction) instead of Ethers',
		default: false,
	})
	.option('bytecode-file-id', {
		type: 'string',
		describe: 'Deploy via existing Bytecode FileID (HTS path or ignored by Ethers)',
	})
	.option('gas-multiplier', {
		type: 'number',
		describe: 'Multiply the estimated gas by this factor for safety',
		default: 1.15,
	})
	.option('max-fee-gwei', {
		type: 'number',
		describe: 'Override maxFeePerGas (gwei) for Ethers deploy',
	})
	.option('max-priority-gwei', {
		type: 'number',
		describe: 'Override maxPriorityFeePerGas (gwei) for Ethers deploy',
	})
	.option('artifact-dir', {
		type: 'string',
		describe: 'Path to Hardhat-style artifacts directory',
		default: './artifacts/contracts',
	})
	.option('contract-name', {
		type: 'string',
		describe: 'Contract name (file and artifact stem)',
		default: process.env.CONTRACT_NAME || 'LazyVoter',
	})
	.option('vote-message', {
		type: 'string',
		describe: 'Vote message (string)',
		default: process.env.VOTE_MESSAGE || 'Default Vote Message',
	})
	.option('nft-token', {
		type: 'string',
		describe: 'NFT token address (e.g., 0x... or 0.0.x)',
		default: process.env.NFT_TOKEN,
	})
	.option('quorum', {
		type: 'number',
		describe: 'Quorum required (uint256)',
		default: Number(process.env.QUORUM || 1),
	})
	.option('start-time', {
		type: 'number',
		describe: 'Voting start time (unix timestamp)',
		default: Number(process.env.START_TIME || Math.floor(Date.now() / 1000)),
	})
	.option('end-time', {
		type: 'number',
		describe: 'Voting end time (unix timestamp)',
		// Default to +1 day from now
		default: Number(process.env.END_TIME || (Math.floor(Date.now() / 1000) + 86400)),
	})
	.option('registry', {
		type: 'string',
		describe: 'LazyDelegateRegistry contract ID (e.g., 0.0.x)',
		default: process.env.REGISTRY,
	})
	.option('eligible-serials', {
		type: 'string',
		describe: 'Comma-separated list of eligible serials (uint256[])',
		default: process.env.ELIGIBLE_SERIALS || '',
	})
	.check(args => {
		if (!process.env.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY in .env');
		if (!process.env.ACCOUNT_ID) throw new Error('Missing ACCOUNT_ID in .env');
		if (!args.useHts && !args.rpcUrl) {
			throw new Error('For Ethers deploy, --rpc-url is required');
		}
		if (!args.nftToken) {
			throw new Error('--nft-token (or NFT_TOKEN env) is required');
		}
		if (!args.registry) {
			throw new Error('--registry (or REGISTRY env) is required');
		}
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
		operatorKey = PrivateKey.fromStringECDSAsecp256k1(process.env.PRIVATE_KEY);
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

function humanGwei(bn) {
	if (!bn) return 'n/a';
	try {
		return `${ethers.formatUnits(bn, 'gwei')} gwei`;
	}
	catch {
		return bn.toString();
	}
}

function humanNative(bn) {
	if (!bn) return 'n/a';
	try {
		return `${ethers.formatUnits(bn, 18)} (1e18 units)`;
	}
	catch {
		return bn.toString();
	}
}

function askContinue(promptLabel = 'Proceed with deployment?') {
	const answer = readlineSync.question(`${promptLabel} (y/N): `);
	if (String(answer).toLowerCase() !== 'y') {
		console.log('Aborted by user.');
		process.exit(0);
	}
}

// ---------- ETHERS DEPLOY PATH ----------
async function deployWithEthers() {
	const provider = new ethers.JsonRpcProvider(argv.rpcUrl);
	const wallet = new ethers.Wallet('0x' + operatorKey.toBytes().toString('hex'), provider);

	const chainId = (await provider.getNetwork()).chainId;
	const feeData = await provider.getFeeData();

	// Parse eligible serials
	const eligibleSerials = argv.eligibleSerials ? argv.eligibleSerials.split(',').map(s => ethers.toBigInt(s.trim())) : [];

	// Format times for display
	const startTimeLocal = new Date(argv.startTime * 1000).toLocaleString();
	const endTimeLocal = new Date(argv.endTime * 1000).toLocaleString();

	printHeader({
		mode: 'Ethers + JSON-RPC',
		env: argv.env,
		rpcUrl: argv.rpcUrl,
		accountEvm: await wallet.getAddress(),
		chainId: chainId.toString(),
		feeData: {
			maxFeePerGas: humanGwei(feeData.maxFeePerGas),
			maxPriorityFeePerGas: humanGwei(feeData.maxPriorityFeePerGas),
			gasPrice: humanGwei(feeData.gasPrice),
		},
		constructor: {
			voteMessage: argv.voteMessage,
			nftToken: argv.nftToken,
			quorum: argv.quorum,
			startTime: `${argv.startTime} (${startTimeLocal})`,
			endTime: `${argv.endTime} (${endTimeLocal})`,
			registry: argv.registry,
			eligibleSerials: eligibleSerials.map(s => s.toString()),
		},
	});

	// Main contract estimate
	const art = loadArtifact(CONTRACT_NAME);
	const Factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
	const ctorArgs = [
		argv.voteMessage,
		argv.nftToken,
		ethers.toBigInt(argv.quorum),
		ethers.toBigInt(argv.startTime),
		ethers.toBigInt(argv.endTime),
		argv.registry,
		eligibleSerials,
	];
	const unsigned = await Factory.getDeployTransaction(...ctorArgs);
	const gasEstimate = await provider.estimateGas(unsigned);

	// Apply multiplier
	const gasLimit = gasEstimate * BigInt(Math.ceil(argv.gasMultiplier * 100)) / 100n;

	const maxFeePerGas = argv.maxFeeGwei
		? ethers.parseUnits(argv.maxFeeGwei.toString(), 'gwei')
		: (feeData.maxFeePerGas || feeData.gasPrice || null);
	const maxPriorityFeePerGas = argv.maxPriorityGwei
		? ethers.parseUnits(argv.maxPriorityGwei.toString(), 'gwei')
		: (feeData.maxPriorityFeePerGas || null);

	const costUpperBound = maxFeePerGas ? (maxFeePerGas * gasLimit) : null;

	console.log('\n—— Ethers Preflight ——');
	console.log('Gas estimate:', gasEstimate.toString());
	console.log('Gas limit (x multiplier):', gasLimit.toString());
	if (maxFeePerGas) console.log('maxFeePerGas:', humanGwei(maxFeePerGas));
	if (maxPriorityFeePerGas) console.log('maxPriorityFeePerGas:', humanGwei(maxPriorityFeePerGas));
	if (costUpperBound) {
		console.log('Upper-bound tx cost (gasLimit * maxFeePerGas):', humanNative(costUpperBound));
	}
	else {
		console.log('Note: Could not compute an upper-bound cost (missing maxFeePerGas).');
	}

	askContinue('Proceed with Ethers deployment');

	// Deploy
	const overrides = { gasLimit };
	if (maxFeePerGas) overrides.maxFeePerGas = maxFeePerGas;
	if (maxPriorityFeePerGas) overrides.maxPriorityFeePerGas = maxPriorityFeePerGas;

	const contract = await Factory.deploy(...ctorArgs, overrides);
	await contract.waitForDeployment();
	const tx = contract.deploymentTransaction();
	const receipt = await tx.wait();

	const address = await contract.getAddress();

	console.log('contract:', receipt.contractAddress);
	console.log('gasUsed:', receipt.gasUsed.toString());
	console.log('effectiveGasPrice:', receipt.effectiveGasPrice?.toString());

	console.log(`[ethers] Contract deployed at ${address} (tx: ${contract.deploymentTransaction().hash})`);
	return { address };
}

// ---------- HTS (SDK) DEPLOY PATH ----------
async function deployWithHTS() {
	let client;
	switch (argv.env) {
	case 'TEST': client = Client.forTestnet(); break;
	case 'MAIN': client = Client.forMainnet(); break;
	case 'PREVIEW': client = Client.forPreviewnet(); break;
	case 'LOCAL': {
		const node = { '127.0.0.1:50211': new AccountId(3) };
		client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
		break;
	}
	default: throw new Error('ENV must be MAIN | TEST | PREVIEW | LOCAL');
	}
	client.setOperator(operatorId, operatorKey);

	// Parse eligible serials
	const eligibleSerials = argv.eligibleSerials ? argv.eligibleSerials.split(',').map(s => Number(s.trim())) : [];

	// Format times for display
	const startTimeLocal = new Date(argv.startTime * 1000).toLocaleString();
	const endTimeLocal = new Date(argv.endTime * 1000).toLocaleString();

	printHeader({
		mode: 'HTS SDK',
		env: argv.env,
		operatorId: operatorId.toString(),
		constructor: {
			voteMessage: argv.voteMessage,
			nftToken: argv.nftToken,
			quorum: argv.quorum,
			startTime: `${argv.startTime} (${startTimeLocal})`,
			endTime: `${argv.endTime} (${endTimeLocal})`,
			registry: argv.registry,
			eligibleSerials: eligibleSerials,
		},
		note: 'HTS path uses a fixed gas limit; network fee schedules apply. No pre-create gas estimator available here.',
	});

	const gasLimit = 4_600_000;

	const art = loadArtifact(CONTRACT_NAME);

	const params = new ContractFunctionParameters()
		.addString(argv.voteMessage)
		.addAddress(argv.nftToken)
		.addUint256(argv.quorum)
		.addUint256(argv.startTime)
		.addUint256(argv.endTime)
		.addAddress(argv.registry)
		.addUint256Array(eligibleSerials);

	let contractId, contractAddress;

	if (argv.bytecodeFileId) {
		console.log('[hts] Deploying from Bytecode FileID:', argv.bytecodeFileId);
		const createTx = new ContractCreateTransaction()
			.setBytecodeFileId(argv.bytecodeFileId)
			.setGas(gasLimit)
			.setAutoRenewAccountId(operatorId)
			.setConstructorParameters(params);
		const submit = await createTx.execute(client);
		const rx = await submit.getReceipt(client);
		contractId = rx.contractId;
		contractAddress = contractId.toEvmAddress();
	}
	else {
		console.log('[hts] Uploading bytecode and deploying via ContractCreateFlow…');
		const createTx = new ContractCreateFlow()
			.setBytecode(art.bytecode)
			.setGas(gasLimit)
			.setAutoRenewAccountId(operatorId)
			.setConstructorParameters(params);
		const submit = await createTx.execute(client);
		const rx = await submit.getReceipt(client);
		contractId = rx.contractId;
		contractAddress = contractId.toEvmAddress();
	}

	console.log(`[hts] Contract created: ${contractId} / ${contractAddress}`);
	return { contractId: contractId.toString(), address: contractAddress };
}

// --------------- MAIN ----------------
(async () => {
	try {
		const header = {
			operatorId: operatorId.toString(),
			env: argv.env,
			mode: argv.useHts ? 'HTS SDK' : 'Ethers + JSON-RPC',
		};
		printHeader(header);

		if (argv.useHts) {
			await deployWithHTS();
		}
		else {
			await deployWithEthers();
		}
		process.exit(0);
	}
	catch (err) {
		console.error('Deployment failed:', err.message);
		console.error('Stack:', err.stack);
		process.exit(1);
	}
})();