const { Client, AccountId, PrivateKey } = require('@hashgraph/sdk');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { readOnlyEVMFromMirrorNode } = require('./solidityHelpers');
require('dotenv').config();

/**
 * Create a Hedera client for the specified environment
 * @param {string} env - Environment: TEST, MAIN, PREVIEW, LOCAL
 * @param {AccountId} [operatorId] - Operator account ID
 * @param {PrivateKey} [operatorKey] - Operator private key
 * @returns {Client}
 */
function createClient(env, operatorId, operatorKey) {
	let client;
	switch (env.toUpperCase()) {
	case 'TEST':
		client = Client.forTestnet();
		break;
	case 'MAIN':
		client = Client.forMainnet();
		break;
	case 'PREVIEW':
		client = Client.forPreviewnet();
		break;
	case 'LOCAL': {
		const node = { '127.0.0.1:50211': new AccountId(3) };
		client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
		break;
	}
	default:
		throw new Error(`Invalid ENVIRONMENT "${env}". Must be TEST, MAIN, PREVIEW, or LOCAL`);
	}
	if (operatorId && operatorKey) {
		client.setOperator(operatorId, operatorKey);
	}
	return client;
}

/**
 * Load operator credentials from environment variables
 * Supports both ED25519 and ECDSA key formats
 * @returns {{ operatorId: AccountId, operatorKey: PrivateKey }}
 */
function loadOperator() {
	if (!process.env.ACCOUNT_ID || !process.env.PRIVATE_KEY) {
		throw new Error('Must specify ACCOUNT_ID and PRIVATE_KEY in .env file');
	}
	let operatorKey;
	try {
		operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
	}
	catch {
		try {
			operatorKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY);
		}
		catch {
			throw new Error('PRIVATE_KEY must be a valid ED25519 or ECDSA private key');
		}
	}
	const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
	return { operatorId, operatorKey };
}

/**
 * Load a contract's ABI interface
 * Tries bundled ABI first (for npm package), falls back to Hardhat artifacts
 * @param {string} contractName - Contract name (e.g., 'LazyVoter')
 * @param {string} [artifactDir='./artifacts/contracts'] - Hardhat artifacts directory
 * @returns {ethers.Interface}
 */
function loadInterface(contractName, artifactDir = './artifacts/contracts') {
	// Try bundled ABI first (for npm-installed usage)
	const bundledPath = path.resolve(__dirname, '..', 'abi', `${contractName}.json`);
	if (fs.existsSync(bundledPath)) {
		const json = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
		// ABI files may have { abi: [...] } or be the array directly
		const abi = json.abi || json;
		return new ethers.Interface(abi);
	}
	// Fall back to Hardhat artifacts
	const artifactPath = path.join(artifactDir, `${contractName}.sol`, `${contractName}.json`);
	if (fs.existsSync(artifactPath)) {
		const json = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
		return new ethers.Interface(json.abi);
	}
	throw new Error(`Cannot find ABI for ${contractName}. Run 'npx hardhat compile' or check abi/ directory.`);
}

/**
 * Read a value from a contract via mirror node (no gas cost, no signing needed)
 * @param {string} env - Environment
 * @param {ContractId|string} contractId - Contract ID
 * @param {ethers.Interface} iface - Contract interface
 * @param {string} functionName - Function name to call
 * @param {Array} [params=[]] - Function parameters
 * @param {AccountId|string} [operatorId] - Operator account for 'from' field
 * @returns {Promise<ethers.Result>} Decoded result
 */
async function readContractValue(env, contractId, iface, functionName, params = [], operatorId) {
	const encoded = iface.encodeFunctionData(functionName, params);
	const result = await readOnlyEVMFromMirrorNode(env, contractId, encoded, operatorId, false);
	return iface.decodeFunctionResult(functionName, result);
}

module.exports = {
	createClient,
	loadOperator,
	loadInterface,
	readContractValue,
};
