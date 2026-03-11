'use strict';

const { createClient, loadOperator, loadInterface, readContractValue } = require('../utils/clientFactory');
const { contractExecuteFunction } = require('../utils/solidityHelpers');
const { estimateGas } = require('../utils/gasHelpers');

/**
 * High-level client for interacting with a deployed LazyVoter contract.
 * Provides typed methods for voting, querying, and admin operations.
 */
class LazyVoterClient {
	/**
	 * @param {object} options
	 * @param {string} options.contractId - LazyVoter contract ID (e.g., '0.0.12345')
	 * @param {string} [options.network='TEST'] - Network: TEST, MAIN, PREVIEW, LOCAL
	 * @param {string} [options.accountId] - Operator account ID (from env if not provided)
	 * @param {string} [options.privateKey] - Operator private key (from env if not provided)
	 */
	constructor(options = {}) {
		this.contractId = options.contractId;
		this.network = (options.network || process.env.ENVIRONMENT || 'TEST').toUpperCase();
		this.iface = loadInterface('LazyVoter');

		if (options.accountId && options.privateKey) {
			const { AccountId, PrivateKey } = require('@hashgraph/sdk');
			this.operatorId = AccountId.fromString(options.accountId);
			let operatorKey;
			try {
				operatorKey = PrivateKey.fromStringED25519(options.privateKey);
			}
			catch {
				operatorKey = PrivateKey.fromStringECDSA(options.privateKey);
			}
			this.operatorKey = operatorKey;
			this.client = createClient(this.network, this.operatorId, this.operatorKey);
		}
		else {
			try {
				const { operatorId, operatorKey } = loadOperator();
				this.operatorId = operatorId;
				this.operatorKey = operatorKey;
				this.client = createClient(this.network, operatorId, operatorKey);
			}
			catch {
				// Read-only mode — no operator credentials
				this.operatorId = null;
				this.operatorKey = null;
				this.client = null;
			}
		}
	}

	// --- READ METHODS (no signing needed) ---

	/**
	 * Get vote results
	 * @returns {Promise<{yes: number, no: number, abstain: number}>}
	 */
	async getResults() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'getResults', [], this.operatorId,
		);
		return {
			yes: Number(result[0]),
			no: Number(result[1]),
			abstain: Number(result[2]),
		};
	}

	/**
	 * Get voting status
	 * @returns {Promise<string>} 'NotStarted' | 'Active' | 'Paused' | 'Ended'
	 */
	async getStatus() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'votingStatus', [], this.operatorId,
		);
		return result[0];
	}

	/**
	 * Get the vote message / proposal text
	 * @returns {Promise<string>}
	 */
	async getVoteMessage() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'voteMessage', [], this.operatorId,
		);
		return result[0];
	}

	/**
	 * Check if quorum has been reached
	 * @returns {Promise<boolean>}
	 */
	async hasQuorum() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'hasQuorum', [], this.operatorId,
		);
		return result[0];
	}

	/**
	 * Get total eligible voters
	 * @returns {Promise<number>}
	 */
	async totalEligibleVoters() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'totalEligibleVoters', [], this.operatorId,
		);
		return Number(result[0]);
	}

	/**
	 * Get time remaining in the vote
	 * @returns {Promise<number>} seconds remaining
	 */
	async timeRemaining() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'timeRemaining', [], this.operatorId,
		);
		return Number(result[0]);
	}

	/**
	 * Get eligible serials with pagination
	 * @param {number} [offset=0]
	 * @param {number} [limit=100]
	 * @returns {Promise<number[]>}
	 */
	async getEligibleSerials(offset = 0, limit = 100) {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'getEligibleSerials', [offset, limit], this.operatorId,
		);
		return result[0].map(Number);
	}

	/**
	 * Get all voters and their vote counts
	 * @returns {Promise<{voters: string[], voteCounts: number[]}>}
	 */
	async getAllVoters() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'getAllVoters', [], this.operatorId,
		);
		return {
			voters: Array.from(result[0]),
			voteCounts: result[1].map(Number),
		};
	}

	/**
	 * Get votes by a specific address
	 * @param {string} voterAddress - EVM address or Hedera account ID
	 * @returns {Promise<{serials: number[], votes: number[]}>}
	 */
	async getVotesByAddress(voterAddress) {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'getVotesByAddress', [voterAddress], this.operatorId,
		);
		return {
			serials: result[0].map(Number),
			votes: result[1].map(Number),
		};
	}

	/**
	 * Get vote info for a specific serial
	 * @param {number} serial
	 * @returns {Promise<{voteType: number, voter: string, timestamp: number}>}
	 */
	async getVoteInfo(serial) {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'getVoteInfo', [serial], this.operatorId,
		);
		return {
			voteType: Number(result[0]),
			voter: result[1],
			timestamp: Number(result[2]),
		};
	}

	/**
	 * Get quorum requirement
	 * @returns {Promise<number>}
	 */
	async getQuorum() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'quorum', [], this.operatorId,
		);
		return Number(result[0]);
	}

	/**
	 * Get quorum as basis points of eligible voters
	 * @returns {Promise<number>} basis points (10000 = 100%)
	 */
	async getQuorumPercent() {
		const result = await readContractValue(
			this.network, this.contractId, this.iface, 'quorumPercent', [], this.operatorId,
		);
		return Number(result[0]);
	}

	// --- WRITE METHODS (require operator credentials) ---

	/**
	 * Cast a vote
	 * @param {number[]} serials - Serial numbers to vote with (max 40)
	 * @param {'yes'|'no'|'abstain'|number} voteType - Vote type
	 * @returns {Promise<object>} Transaction result
	 */
	async vote(serials, voteType) {
		this._requireOperator();
		const voteTypeNum = this._resolveVoteType(voteType);
		const gasInfo = await estimateGas(
			this.network, this.contractId, this.iface, this.operatorId,
			'vote', [serials, voteTypeNum], 200_000 + 100_000 * serials.length,
		);
		return contractExecuteFunction(
			this.contractId, this.iface, this.client, gasInfo.gasLimit,
			'vote', [serials, voteTypeNum],
		);
	}

	/**
	 * Pause voting (owner only)
	 * @returns {Promise<object>}
	 */
	async pauseVoting() {
		this._requireOperator();
		return contractExecuteFunction(
			this.contractId, this.iface, this.client, 200_000,
			'pauseVoting', [],
		);
	}

	/**
	 * Unpause voting (owner only)
	 * @returns {Promise<object>}
	 */
	async unpauseVoting() {
		this._requireOperator();
		return contractExecuteFunction(
			this.contractId, this.iface, this.client, 200_000,
			'unpauseVoting', [],
		);
	}

	/**
	 * Withdraw HBAR from contract (owner only)
	 * @param {string} receiverAddress - Receiver EVM address
	 * @param {number} amount - Amount in tinybars
	 * @returns {Promise<object>}
	 */
	async withdrawHbar(receiverAddress, amount) {
		this._requireOperator();
		return contractExecuteFunction(
			this.contractId, this.iface, this.client, 300_000,
			'withdrawHbar', [receiverAddress, amount],
		);
	}

	// --- INTERNAL HELPERS ---

	_requireOperator() {
		if (!this.client || !this.operatorId) {
			throw new Error('Operator credentials required for write operations. Provide accountId and privateKey.');
		}
	}

	_resolveVoteType(voteType) {
		if (typeof voteType === 'number') return voteType;
		const map = { no: 0, yes: 1, abstain: 2 };
		const resolved = map[voteType.toLowerCase()];
		if (resolved === undefined) {
			throw new Error(`Invalid vote type "${voteType}". Must be: yes, no, or abstain`);
		}
		return resolved;
	}
}

module.exports = LazyVoterClient;
