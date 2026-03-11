'use strict';

const path = require('path');
const fs = require('fs');
const { createClient, loadOperator, loadInterface, readContractValue } = require('../utils/clientFactory');
const { contractExecuteFunction } = require('../utils/solidityHelpers');
const { estimateGas, logTransactionResult } = require('../utils/gasHelpers');

// Load ABIs
function loadABI(contractName) {
	const abiPath = path.resolve(__dirname, '..', 'abi', `${contractName}.json`);
	if (fs.existsSync(abiPath)) {
		return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
	}
	return null;
}

const LazyVoterABI = loadABI('LazyVoter');
const LazyDelegateRegistryABI = loadABI('LazyDelegateRegistry');

module.exports = {
	// ABIs for direct ethers.js / web3 usage
	LazyVoterABI,
	LazyDelegateRegistryABI,

	// Client utilities
	createClient,
	loadOperator,
	loadInterface,

	// Contract interaction
	readContractValue,
	contractExecuteFunction,

	// Gas utilities
	estimateGas,
	logTransactionResult,

	// Re-export for convenience
	LazyVoterClient: require('./LazyVoterClient'),
};
