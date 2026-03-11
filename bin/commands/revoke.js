'use strict';

const { ContractId, AccountId } = require('@hashgraph/sdk');
const { loadInterface, createClient, loadOperator } = require('../../utils/clientFactory');
const { contractExecuteFunction } = require('../../utils/solidityHelpers');
const { estimateGas, logTransactionResult } = require('../../utils/gasHelpers');
const { parseSerials } = require('../../lib/serialParser');
const Output = require('../../lib/output');
require('dotenv').config();

module.exports = {
	command: 'revoke <token> <serials>',
	describe: 'Revoke NFT delegation',
	builder: {
		token: { type: 'string', description: 'NFT token ID (e.g., 0.0.12345)' },
		serials: { type: 'string', description: 'Serial numbers to revoke delegation for' },
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

			out.info(`\n  Revoking delegation for serials ${serials.join(', ')} of token ${argv.token}`);

			const gasInfo = await estimateGas(
				network, registryId, iface, operatorId,
				'revokeDelegateNFT', [tokenAddress, serials],
				200_000 + 120_000 * serials.length,
			);

			const result = await contractExecuteFunction(
				registryId, iface, client, gasInfo.gasLimit,
				'revokeDelegateNFT', [tokenAddress, serials],
			);

			logTransactionResult(result, 'Revoke Delegation', gasInfo);

			const statusStr = typeof result[0] === 'object' && result[0].status
				? result[0].status.toString() : result[0]?.toString();
			if (statusStr === 'SUCCESS') {
				out.success({ token: argv.token, serials });
			} else {
				out.error('REVOKE_FAILED', `Revocation failed: ${result[0]?.message || statusStr}`);
				process.exit(3);
			}
		} catch (err) {
			out.error('REVOKE_ERROR', err.message);
			process.exit(1);
		}
	},
};
