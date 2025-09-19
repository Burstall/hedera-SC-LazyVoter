#!/usr/bin/env node

/**
 * Hedera deployment script for LazyVoter contract using HTS (Hedera Token Service).
 * This script deploys the LazyVoter contract with delegation capabilities.
 *
 * Usage examples:
 *   node deploy-LazyVoter.js --env TEST --vote-message "Vote on Proposal" --nft-token 0x123... --quorum 10 --start-time 1695120000 --end-time 1695206400 --registry 0.0.12345 --eligible-serials 1,2,3
 *   node deploy-LazyVoter.js --env MAIN --bytecode-file-id 0.0.12345
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
	ContractId,
	TokenId,
	ContractFunctionParameters,
	ContractCreateTransaction,
} = require('@hashgraph/sdk');

// Import the reliable contractDeployFunction
const { contractDeployFunction } = require('../../utils/solidityHelpers');

// Import mirror helpers for NFT info
const { getTokenDetails } = require('../../utils/hederaMirrorHelpers');

// ------- CLI ---------
const argv = yargs(hideBin(process.argv))
	.scriptName('deploy-LazyVoter')
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
		default: process.env.CONTRACT_NAME || 'LazyVoter',
	})
	.option('vote-message', {
		type: 'string',
		describe: 'Vote message (string) - REQUIRED',
		default: process.env.VOTE_MESSAGE,
	})
	.option('nft-token', {
		type: 'string',
		describe: 'NFT token address (e.g., 0x... or 0.0.x) - REQUIRED',
		default: process.env.NFT_TOKEN,
	})
	.option('quorum', {
		type: 'number',
		describe: 'Quorum required (uint256)',
		default: process.env.QUORUM ? Number(process.env.QUORUM) : undefined,
	})
	.option('start-time', {
		type: 'number',
		describe: 'Voting start time (unix timestamp)',
		default: process.env.START_TIME ? Number(process.env.START_TIME) : undefined,
	})
	.option('end-time', {
		type: 'number',
		describe: 'Voting end time (unix timestamp)',
		default: process.env.END_TIME ? Number(process.env.END_TIME) : undefined,
	})
	.option('registry', {
		type: 'string',
		describe: 'LazyDelegateRegistry contract ID (e.g., 0.0.x) - REQUIRED',
		default: process.env.REGISTRY,
	})
	.option('eligible-serials', {
		type: 'string',
		describe: 'Comma-separated list of eligible serials (uint256[])',
		default: process.env.ELIGIBLE_SERIALS,
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

function promptRequired(promptLabel) {
	const answer = readlineSync.question(`${promptLabel}: `);
	if (!answer || answer.trim() === '') {
		console.log('This field is required. Aborted.');
		process.exit(1);
	}
	return answer.trim();
}

function promptWithDefault(promptLabel, defaultValue, valueDescription = '') {
	console.log(`${promptLabel}`);
	console.log(`Default: ${defaultValue}${valueDescription ? ` (${valueDescription})` : ''}`);
	const useDefault = promptYesNo('Use default value?', true);
	if (useDefault) {
		// Extract just the numeric part if default contains both timestamp and local time
		const timestampMatch = defaultValue.match(/^(\d+)/);
		return timestampMatch ? timestampMatch[1] : defaultValue;
	}
	else {
		const customValue = readlineSync.question('Enter custom value: ');
		if (!customValue || customValue.trim() === '') {
			console.log('No value provided, using default.');
			// Extract just the numeric part if default contains both timestamp and local time
			const timestampMatch = defaultValue.match(/^(\d+)/);
			return timestampMatch ? timestampMatch[1] : defaultValue;
		}
		return customValue.trim();
	}
}

function promptYesNo(promptLabel, defaultYes = false) {
	const defaultText = defaultYes ? 'Y/n' : 'y/N';
	const answer = readlineSync.question(`${promptLabel} (${defaultText}): `, { defaultInput: defaultYes ? 'y' : 'n' });
	return String(answer).toLowerCase() === 'y';
}

async function getNFTInfo(env, nftTokenId) {
	try {
		console.log(`\n📊 Fetching NFT information for ${nftTokenId}...`);
		const tokenDetails = await getTokenDetails(env, nftTokenId);

		if (!tokenDetails) {
			console.log('⚠️  Could not fetch NFT details from mirror node');
			return null;
		}

		const info = {
			name: tokenDetails.name,
			symbol: tokenDetails.symbol,
			totalSupply: tokenDetails.total_supply,
			maxSupply: tokenDetails.max_supply,
			type: tokenDetails.type,
		};

		console.log('✅ NFT Info:');
		console.log(`   Name: ${info.name}`);
		console.log(`   Symbol: ${info.symbol}`);
		console.log(`   Total Supply: ${info.totalSupply}`);
		console.log(`   Max Supply: ${info.maxSupply || 'Unlimited'}`);
		console.log(`   Type: ${info.type}`);

		return info;
	}
	catch (error) {
		console.log(`⚠️  Error fetching NFT info: ${error.message}`);
		return null;
	}
}

function calculateQuorumInfo(quorum, nftInfo, eligibleSerials) {
	const eligibleCount = eligibleSerials && eligibleSerials.length > 0 ? eligibleSerials.length : (nftInfo ? nftInfo.totalSupply : 0);

	if (eligibleCount === 0) {
		return {
			absoluteVotes: quorum,
			percentage: 'N/A (no eligible voters)',
			minimumVotes: quorum,
		};
	}

	const percentage = ((quorum / eligibleCount) * 100).toFixed(2);
	return {
		absoluteVotes: quorum,
		percentage: `${percentage}%`,
		minimumVotes: quorum,
		eligibleCount: eligibleCount,
	};
}

function parseSerialRanges(input) {
	if (!input || input.trim() === '') {
		return [];
	}

	const serials = new Set();

	// Split by comma and process each part
	const parts = input.split(',').map(part => part.trim());

	for (const part of parts) {
		if (part.includes('-')) {
			// Handle range like "1-5"
			const [start, end] = part.split('-').map(s => parseInt(s.trim()));
			if (!isNaN(start) && !isNaN(end) && start <= end) {
				for (let i = start; i <= end; i++) {
					serials.add(i);
				}
			}
		}
		else {
			// Handle single number
			const num = parseInt(part);
			if (!isNaN(num)) {
				serials.add(num);
			}
		}
	}

	return Array.from(serials).sort((a, b) => a - b);
}

// ---------- HTS (SDK) DEPLOY PATH ----------
async function deployWithHTS(eligibleSerials) {
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

	try {
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
				quorum: `${argv.quorum} votes (${calculateQuorumInfo(argv.quorum, null, eligibleSerials).percentage} of eligible voters)`,
				startTime: `${argv.startTime} seconds (${startTimeLocal})`,
				endTime: `${argv.endTime} seconds (${endTimeLocal})`,
				registry: argv.registry,
				eligibleSerials: eligibleSerials,
			},
			note: 'HTS path uses a fixed gas limit; network fee schedules apply.',
		});

		const gasLimit = 4_600_000;

		const art = loadArtifact(CONTRACT_NAME);

		const params = new ContractFunctionParameters()
			.addString(argv.voteMessage)
			.addAddress(TokenId.fromString(argv.nftToken).toSolidityAddress())
			.addUint256(argv.quorum)
			.addUint256(argv.startTime)
			.addUint256(argv.endTime)
			.addAddress(ContractId.fromString(argv.registry).toSolidityAddress())
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
			contractAddress = contractId.toSolidityAddress();
		}
		else {
			console.log('[hts] Using ContractCreateFlow for reliable deployment...');
			// Use the proven reliable contractDeployFunction with constructor parameters
			[contractId, contractAddress] = await contractDeployFunction(client, art.bytecode, gasLimit, params);
		}

		console.log(`[hts] Contract created: ${contractId} / ${contractAddress}`);
		return { contractId: contractId.toString(), address: contractAddress };
	}
	finally {
		// Ensure client is closed to prevent hanging
		if (client) {
			client.close();
		}
	}
}

// --------------- MAIN ----------------
(async () => {
	try {
		console.log('🚀 LazyVoter Deployment Script');
		console.log('================================');

		// Interactive prompts for required values
		if (!argv.voteMessage) {
			argv.voteMessage = promptRequired('Enter vote message');
		}

		if (!argv.nftToken) {
			argv.nftToken = promptRequired('Enter NFT token address (e.g., 0.0.x or 0x...)');
		}

		// need to make sure we deal with 0.0.XXX and 0x...
		if (argv.nftToken.startsWith('0x')) {
			// assume solidity address
			// convert to TokenId to validate
			try {
				argv.nftToken = TokenId.fromEvmAddress(0, 0, argv.nftToken);
			}
			catch {
				console.log('Invalid NFT token address format. Must be 0.0.x or 0x... Aborted.');
				process.exit(1);
			}
		}
		else {
			// assume 0.0.x format
			try {
				argv.nftToken = TokenId.fromString(argv.nftToken);
			}
			catch {
				console.log('Invalid NFT token address format. Must be 0.0.x or 0x... Aborted.');
				process.exit(1);
			}
		}

		// Fetch NFT information
		let nftInfo = null;
		try {
			nftInfo = await getNFTInfo(argv.env, argv.nftToken);
		}
		catch (error) {
			console.log(`⚠️  Could not fetch NFT info, continuing without it: ${error.message}`);
		}

		if (!argv.registry) {
			argv.registry = promptRequired('Enter LazyDelegateRegistry contract ID (e.g., 0.0.x)');
		}

		// Optional values with defaults
		if (argv.quorum === undefined) {
			let quorumDescription = 'minimum votes needed to pass';
			if (nftInfo) {
				const sampleQuorum = Math.ceil(nftInfo.totalSupply * 0.5);
				// 50% as example
				quorumDescription = `minimum votes needed to pass (NFT total supply: ${nftInfo.totalSupply}, 50% would be ${sampleQuorum} votes)`;
			}
			const quorumInput = promptWithDefault('Enter quorum required', '1', quorumDescription);
			argv.quorum = Number(quorumInput);
		}

		// +1 hour buffer
		const now = Math.floor(Date.now() / 1000) + 3600;
		if (argv.startTime === undefined) {
			const startTimeLocal = new Date(now * 1000).toLocaleString();
			const startInput = promptWithDefault(
				'Enter voting start time',
				`${now} (${startTimeLocal})`,
				'unix timestamp in seconds (+1 hour from now)',
			);
			argv.startTime = Number(startInput);
		}

		if (argv.endTime === undefined) {
			const defaultEnd = now + 86400;
			// +1 day in seconds
			const endTimeLocal = new Date(defaultEnd * 1000).toLocaleString();
			const endInput = promptWithDefault(
				'Enter voting end time',
				`${defaultEnd} (${endTimeLocal})`,
				'unix timestamp in seconds, +1 day from now',
			);
			argv.endTime = Number(endInput);
		}

		// Handle eligible serials
		let eligibleSerials = [];
		if (argv.eligibleSerials) {
			eligibleSerials = parseSerialRanges(argv.eligibleSerials);
		}
		else {
			const serialsInput = promptWithDefault(
				'Enter eligible serials',
				'',
				'leave empty to specify after deployment, supports ranges like 1-5 or comma-separated like 1,3,5',
			);
			if (serialsInput) {
				eligibleSerials = parseSerialRanges(serialsInput);
			}
		}

		// Confirm empty eligible serials
		if (eligibleSerials.length === 0) {
			const confirmEmpty = promptYesNo('No eligible serials specified. Nobody can vote until updated. Is this correct?', false);
			if (!confirmEmpty) {
				console.log('Please specify eligible serials. Aborted.');
				process.exit(0);
			}
		}

		// Format times for display
		const startTimeLocal = new Date(argv.startTime * 1000).toLocaleString();
		const endTimeLocal = new Date(argv.endTime * 1000).toLocaleString();

		// Show complete configuration
		const quorumInfo = calculateQuorumInfo(argv.quorum, nftInfo, eligibleSerials);
		const config = {
			environment: argv.env,
			operator: operatorId.toString(),
			bytecodeFileId: argv.bytecodeFileId || 'Using inline bytecode',
			nftInfo: nftInfo ? {
				name: nftInfo.name,
				symbol: nftInfo.symbol,
				totalSupply: nftInfo.totalSupply,
				maxSupply: nftInfo.maxSupply || 'Unlimited',
			} : 'Not available',
			constructor: {
				voteMessage: argv.voteMessage,
				nftToken: argv.nftToken,
				quorum: `${argv.quorum} votes (${quorumInfo.percentage} of eligible voters)`,
				startTime: `${argv.startTime} seconds (${startTimeLocal})`,
				endTime: `${argv.endTime} seconds (${endTimeLocal})`,
				registry: argv.registry,
				eligibleSerials: eligibleSerials.length > 0
					? `${eligibleSerials.length} serials: [${eligibleSerials.slice(0, 10).join(', ')}${eligibleSerials.length > 10 ? '...' : ''}]`
					: 'None (open to all NFT holders)',
			},
			gasLimit: '4,600,000',
			network: argv.env,
		};

		printHeader(config);

		// Confirm deployment
		askContinue('Deploy LazyVoter contract with the above configuration?');

		// Deploy using HTS
		const result = await deployWithHTS(eligibleSerials);

		console.log('\n🎉 Deployment successful!');
		console.log('========================');
		console.log(`Contract ID: ${result.contractId}`);
		console.log(`Contract Address: ${result.address}`);

		// Force exit to prevent hanging on Windows
		setTimeout(() => process.exit(0), 100);
	}
	catch (err) {
		console.error('Deployment failed:', err.message);
		console.error('Stack:', err.stack);
		process.exit(1);
	}
})();