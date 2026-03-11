'use strict';

const { ContractId, AccountId } = require('@hashgraph/sdk');
const { loadInterface, createClient, loadOperator } = require('../../utils/clientFactory');
const { contractExecuteFunction } = require('../../utils/solidityHelpers');
const { estimateGas, logTransactionResult } = require('../../utils/gasHelpers');
const { parseSerials } = require('../../lib/serialParser');
const Output = require('../../lib/output');
require('dotenv').config();

module.exports = {
	command: 'delegate <token> <serials> <to>',
	describe: 'Delegate NFT voting rights to another address',
	builder: {
		token: { type: 'string', description: 'NFT token ID (e.g., 0.0.12345)' },
		serials: { type: 'string', description: 'Serial numbers to delegate' },
		to: { type: 'string', description: 'Delegate address (0.0.X or 0x...)' },
	},
	handler: async (argv) => {
		const out = new Output(argv);
		try {
			const network = (argv.network || process.env.ENVIRONMENT || 'TEST').toUpperCase();
			const registryIdStr = process.env.LAZYVOTE_DELEGATE_REGISTRY_ID || process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID;
			if (!registryIdStr) {
				out.error('MISSING_CONFIG', 'Delegate registry ID required. Set LAZY_DELEGATE_REGISTRY_CONTRACT_ID in .env');
				process.exit(2);
			}
			const registryId = ContractId.fromString(registryIdStr);
			const { operatorId, operatorKey } = loadOperator();
			const client = createClient(network, operatorId, operatorKey);
			const iface = loadInterface('LazyDelegateRegistry');

			const serials = parseSerials(argv.serials);
			const tokenAddress = AccountId.fromString(argv.token).toSolidityAddress();
			let delegateAddress = argv.to;
			if (delegateAddress.startsWith('0.0.')) {
				delegateAddress = AccountId.fromString(delegateAddress).toSolidityAddress();
			}

			out.info(`\n  Delegating serials ${serials.join(', ')} of token ${argv.token} to ${argv.to}`);

			const gasInfo = await estimateGas(
				network, registryId, iface, operatorId,
				'delegateNFT', [delegateAddress, tokenAddress, serials],
				300_000 + 180_000 * serials.length,
			);

			const result = await contractExecuteFunction(
				registryId, iface, client, gasInfo.gasLimit,
				'delegateNFT', [delegateAddress, tokenAddress, serials],
			);

			logTransactionResult(result, 'Delegate NFT', gasInfo);

			const statusStr = typeof result[0] === 'object' && result[0].status
				? result[0].status.toString() : result[0]?.toString();
			if (statusStr === 'SUCCESS') {
				out.success({ token: argv.token, serials, delegate: argv.to });
			} else {
				out.error('DELEGATE_FAILED', `Delegation failed: ${result[0]?.message || statusStr}`);
				process.exit(3);
			}
		} catch (err) {
			out.error('DELEGATE_ERROR', err.message);
			process.exit(1);
		}
	},
};
