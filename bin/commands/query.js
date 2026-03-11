'use strict';

const { ContractId, AccountId } = require('@hashgraph/sdk');
const { loadInterface, readContractValue } = require('../../utils/clientFactory');
const Output = require('../../lib/output');
require('dotenv').config();

function resolveConfig(argv) {
	const network = (argv.network || process.env.ENVIRONMENT || 'TEST').toUpperCase();
	const contractIdStr = argv.contractId || argv['contract-id'] || process.env.LAZYVOTE_CONTRACT_ID || process.env.CONTRACT_ID;
	if (!contractIdStr) {
		console.error('Error: Contract ID required. Use --contract-id or set CONTRACT_ID in .env');
		process.exit(2);
	}
	const contractId = ContractId.fromString(contractIdStr);
	const operatorId = process.env.ACCOUNT_ID ? AccountId.fromString(process.env.ACCOUNT_ID) : null;
	const iface = loadInterface('LazyVoter');
	return { network, contractId, operatorId, iface };
}

async function read(config, fnName, params = []) {
	return readContractValue(config.network, config.contractId, config.iface, fnName, params, config.operatorId);
}

module.exports = {
	command: 'query <subcommand>',
	describe: 'Query voting contract (read-only, no credentials needed)',
	builder: (yargs) => {
		return yargs
			.command({
				command: 'results',
				describe: 'Show vote tallies and quorum status',
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						const results = await read(config, 'getResults');
						const quorum = await read(config, 'quorum');
						const hasQuorum = await read(config, 'hasQuorum');
						const eligible = await read(config, 'totalEligibleVoters');
						const data = {
							yes: Number(results[0]),
							no: Number(results[1]),
							abstain: Number(results[2]),
							total: Number(results[0]) + Number(results[1]) + Number(results[2]),
							eligible: Number(eligible[0]),
							quorum: Number(quorum[0]),
							quorumReached: hasQuorum[0],
						};
						out.success(data, (d) => {
							console.log('\n  VOTING RESULTS\n');
							console.log(`  Yes:      ${d.yes} votes`);
							console.log(`  No:       ${d.no} votes`);
							console.log(`  Abstain:  ${d.abstain} votes`);
							console.log(`  Total:    ${d.total} of ${d.eligible} eligible`);
							console.log(`\n  Quorum:   ${d.quorum} required - ${d.quorumReached ? 'REACHED' : 'NOT REACHED'}`);
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.command({
				command: 'status',
				describe: 'Show voting status and time remaining',
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						const status = await read(config, 'votingStatus');
						const timeLeft = await read(config, 'timeRemaining');
						const message = await read(config, 'voteMessage');
						const data = {
							status: status[0],
							timeRemaining: Number(timeLeft[0]),
							voteMessage: message[0],
						};
						out.success(data, (d) => {
							console.log('\n  VOTING STATUS\n');
							console.log(`  Status:         ${d.status}`);
							console.log(`  Time Remaining: ${d.timeRemaining > 0 ? `${Math.floor(d.timeRemaining / 60)}m ${d.timeRemaining % 60}s` : 'Ended'}`);
							console.log(`  Proposal:       ${d.voteMessage}`);
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.command({
				command: 'info',
				describe: 'Show full contract information',
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						const [message, quorum, status, eligible, timeLeft, startTime, endTime] = await Promise.all([
							read(config, 'voteMessage'),
							read(config, 'quorum'),
							read(config, 'votingStatus'),
							read(config, 'totalEligibleVoters'),
							read(config, 'timeRemaining'),
							read(config, 'startTime'),
							read(config, 'endTime'),
						]);
						const data = {
							contractId: config.contractId.toString(),
							network: config.network,
							voteMessage: message[0],
							quorum: Number(quorum[0]),
							status: status[0],
							eligible: Number(eligible[0]),
							timeRemaining: Number(timeLeft[0]),
							startTime: Number(startTime[0]),
							endTime: Number(endTime[0]),
						};
						out.success(data, (d) => {
							console.log('\n  CONTRACT INFO\n');
							console.log(`  Contract:       ${d.contractId} (${d.network})`);
							console.log(`  Proposal:       ${d.voteMessage}`);
							console.log(`  Status:         ${d.status}`);
							console.log(`  Quorum:         ${d.quorum}`);
							console.log(`  Eligible:       ${d.eligible} serials`);
							console.log(`  Start:          ${new Date(d.startTime * 1000).toISOString()}`);
							console.log(`  End:            ${new Date(d.endTime * 1000).toISOString()}`);
							console.log(`  Time Remaining: ${d.timeRemaining > 0 ? `${Math.floor(d.timeRemaining / 60)}m ${d.timeRemaining % 60}s` : 'Ended'}`);
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.command({
				command: 'eligible',
				describe: 'List eligible serial numbers',
				builder: {
					offset: { type: 'number', default: 0, description: 'Pagination offset' },
					limit: { type: 'number', default: 100, description: 'Max results to return' },
				},
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						const result = await read(config, 'getEligibleSerials', [argv.offset, argv.limit]);
						const serials = result[0].map(Number);
						out.success({ serials, count: serials.length, offset: argv.offset }, (d) => {
							console.log(`\n  ELIGIBLE SERIALS (${d.count} shown, offset ${d.offset})\n`);
							console.log(`  ${d.serials.join(', ')}`);
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.command({
				command: 'voters',
				describe: 'List all voters and vote counts',
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						const result = await read(config, 'getAllVoters');
						const voters = Array.from(result[0]);
						const counts = result[1].map(Number);
						const data = voters.map((v, i) => ({ address: v, votes: counts[i] }));
						out.success({ voters: data, total: voters.length }, (d) => {
							console.log(`\n  ALL VOTERS (${d.total})\n`);
							d.voters.forEach(v => console.log(`  ${v.address}  ${v.votes} vote(s)`));
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.command({
				command: 'votes-by <address>',
				describe: 'Show votes cast by a specific address',
				handler: async (argv) => {
					const out = new Output(argv);
					try {
						const config = resolveConfig(argv);
						let address = argv.address;
						// Convert 0.0.X to EVM address if needed
						if (address.startsWith('0.0.')) {
							address = AccountId.fromString(address).toSolidityAddress();
						}
						const result = await read(config, 'getVotesByAddress', [address]);
						const voteTypes = ['No', 'Yes', 'Abstain', 'None'];
						const serials = result[0].map(Number);
						const votes = result[1].map(v => voteTypes[Number(v)] || 'Unknown');
						const data = serials.map((s, i) => ({ serial: s, vote: votes[i] }));
						out.success({ votes: data, total: serials.length }, (d) => {
							console.log(`\n  VOTES BY ${argv.address} (${d.total})\n`);
							d.votes.forEach(v => console.log(`  Serial ${v.serial}: ${v.vote}`));
							console.log();
						});
					} catch (err) {
						out.error('QUERY_FAILED', err.message);
						process.exit(1);
					}
				},
			})
			.demandCommand(1, 'Specify a query subcommand. Run with --help for options.');
	},
	handler: () => {},
};
