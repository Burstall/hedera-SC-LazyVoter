'use strict';

const { ContractId, AccountId } = require('@hashgraph/sdk');
const { loadInterface, readContractValue, createClient, loadOperator } = require('../../utils/clientFactory');
const { contractExecuteFunction } = require('../../utils/solidityHelpers');
const { estimateGas, logTransactionResult } = require('../../utils/gasHelpers');
const { parseSerials } = require('../../lib/serialParser');
const Output = require('../../lib/output');
require('dotenv').config();

const VOTE_TYPES = { yes: 1, no: 0, abstain: 2 };

module.exports = {
	command: 'vote <serials> <choice>',
	describe: 'Cast a vote with your eligible NFT serials',
	builder: {
		serials: { type: 'string', description: 'Comma-separated serials or ranges (e.g., "1,2,3" or "1-10")' },
		choice: { type: 'string', description: 'Vote choice: yes, no, or abstain', choices: ['yes', 'no', 'abstain'] },
	},
	handler: async (argv) => {
		const out = new Output(argv);
		try {
			const network = (argv.network || process.env.ENVIRONMENT || 'TEST').toUpperCase();
			const contractIdStr = argv.contractId || argv['contract-id'] || process.env.LAZYVOTE_CONTRACT_ID || process.env.CONTRACT_ID;
			if (!contractIdStr) {
				out.error('MISSING_CONFIG', 'Contract ID required. Use --contract-id or set CONTRACT_ID in .env');
				process.exit(2);
			}
			const contractId = ContractId.fromString(contractIdStr);
			const { operatorId, operatorKey } = loadOperator();
			const client = createClient(network, operatorId, operatorKey);
			const iface = loadInterface('LazyVoter');

			const serials = parseSerials(argv.serials);
			const voteType = VOTE_TYPES[argv.choice.toLowerCase()];

			out.info(`\n  Voting ${argv.choice.toUpperCase()} with serials: ${serials.join(', ')}`);
			out.info(`  Contract: ${contractId} on ${network}\n`);

			// Confirmation
			if (!argv.yes && !argv.json) {
				const readlineSync = require('readline-sync');
				const confirm = readlineSync.keyInYNStrict('  Proceed with vote?');
				if (!confirm) {
					out.info('  Vote cancelled.');
					process.exit(0);
				}
			}

			const gasInfo = await estimateGas(
				network, contractId, iface, operatorId,
				'vote', [serials, voteType],
				200_000 + 100_000 * serials.length,
			);

			const result = await contractExecuteFunction(
				contractId, iface, client, gasInfo.gasLimit,
				'vote', [serials, voteType],
			);

			logTransactionResult(result, 'Vote', gasInfo);

			const statusStr = typeof result[0] === 'object' && result[0].status
				? result[0].status.toString() : result[0]?.toString();

			if (statusStr === 'SUCCESS') {
				out.success({ serials, choice: argv.choice, transactionId: result[2]?.transactionId?.toString() }, (d) => {
					console.log(`\n  Vote ${d.choice.toUpperCase()} cast successfully for serials: ${d.serials.join(', ')}`);
					if (d.transactionId) console.log(`  Transaction: ${d.transactionId}`);
					console.log();
				});
			} else {
				out.error('VOTE_FAILED', `Vote failed: ${result[0]?.message || statusStr}`);
				process.exit(3);
			}
		} catch (err) {
			out.error('VOTE_ERROR', err.message);
			process.exit(1);
		}
	},
};
