'use strict';

const { ContractId } = require('@hashgraph/sdk');
const { loadInterface, createClient, loadOperator } = require('../../utils/clientFactory');
const { contractExecuteFunction } = require('../../utils/solidityHelpers');
const { estimateGas, logTransactionResult } = require('../../utils/gasHelpers');
const { parseSerials } = require('../../lib/serialParser');
const Output = require('../../lib/output');
require('dotenv').config();

function resolveWriteConfig(argv) {
	const network = (argv.network || process.env.ENVIRONMENT || 'TEST').toUpperCase();
	const contractIdStr = argv.contractId || argv['contract-id'] || process.env.LAZYVOTE_CONTRACT_ID || process.env.CONTRACT_ID;
	if (!contractIdStr) {
		console.error('Error: Contract ID required. Use --contract-id or set CONTRACT_ID in .env');
		process.exit(2);
	}
	const { operatorId, operatorKey } = loadOperator();
	const client = createClient(network, operatorId, operatorKey);
	const iface = loadInterface('LazyVoter');
	return { network, contractId: ContractId.fromString(contractIdStr), client, operatorId, iface };
}

async function execAdmin(argv, fnName, params, gasLimit, label) {
	const out = new Output(argv);
	try {
		const config = resolveWriteConfig(argv);
		const gasInfo = await estimateGas(
			config.network, config.contractId, config.iface, config.operatorId,
			fnName, params, gasLimit,
		);
		const result = await contractExecuteFunction(
			config.contractId, config.iface, config.client, gasInfo.gasLimit,
			fnName, params,
		);
		logTransactionResult(result, label, gasInfo);
		const statusStr = typeof result[0] === 'object' && result[0].status
			? result[0].status.toString() : result[0]?.toString();
		if (statusStr === 'SUCCESS') {
			out.success({ action: label, transactionId: result[2]?.transactionId?.toString() });
		} else {
			out.error('ADMIN_FAILED', `${label} failed: ${result[0]?.message || statusStr}`);
			process.exit(3);
		}
	} catch (err) {
		out.error('ADMIN_ERROR', err.message);
		process.exit(1);
	}
}

module.exports = {
	command: 'admin <subcommand>',
	describe: 'Owner-only admin operations',
	builder: (yargs) => {
		return yargs
			.command({
				command: 'pause',
				describe: 'Pause voting',
				handler: (argv) => execAdmin(argv, 'pauseVoting', [], 200_000, 'Pause Voting'),
			})
			.command({
				command: 'unpause',
				describe: 'Unpause voting',
				handler: (argv) => execAdmin(argv, 'unpauseVoting', [], 200_000, 'Unpause Voting'),
			})
			.command({
				command: 'add-serials <serials>',
				describe: 'Add eligible serial numbers (before voting starts)',
				builder: { serials: { type: 'string', description: 'Comma-separated serials or ranges' } },
				handler: (argv) => {
					const serials = parseSerials(argv.serials);
					return execAdmin(argv, 'addEligibleSerials', [serials], 80_000 + serials.length * 50_000, 'Add Eligible Serials');
				},
			})
			.command({
				command: 'set-message <message>',
				describe: 'Update the vote message (before voting starts)',
				builder: { message: { type: 'string', description: 'New vote message' } },
				handler: (argv) => execAdmin(argv, 'updateVoteMessage', [argv.message], 300_000, 'Update Vote Message'),
			})
			.command({
				command: 'set-quorum <quorum>',
				describe: 'Update the quorum requirement (before voting starts)',
				builder: { quorum: { type: 'number', description: 'New quorum value' } },
				handler: (argv) => execAdmin(argv, 'updateQuorum', [argv.quorum], 200_000, 'Update Quorum'),
			})
			.demandCommand(1, 'Specify an admin subcommand. Run with --help for options.');
	},
	handler: () => {},
};
