'use strict';

const Output = require('../../lib/output');

module.exports = {
	command: 'deploy <subcommand>',
	describe: 'Deploy contracts (delegates to deployment scripts)',
	builder: (yargs) => {
		return yargs
			.command({
				command: 'registry',
				describe: 'Deploy a new LazyDelegateRegistry',
				handler: (argv) => {
					const out = new Output(argv);
					out.info('\n  To deploy a LazyDelegateRegistry, run:');
					out.info('  node scripts/deployment/deploy-LazyDelegateRegistry.js --env TEST\n');
					out.info('  Full deployment via CLI will be available in v1.1.');
					out.info('  Run with --help for the deployment script options.\n');
				},
			})
			.command({
				command: 'voter',
				describe: 'Deploy a new LazyVoter contract',
				handler: (argv) => {
					const out = new Output(argv);
					out.info('\n  To deploy a LazyVoter, run:');
					out.info('  node scripts/deployment/deploy-LazyVoter.js --help\n');
					out.info('  Required options: --vote-message, --nft-token, --registry, --quorum, --start-time, --end-time');
					out.info('  Full deployment via CLI will be available in v1.1.\n');
				},
			})
			.demandCommand(1, 'Specify: registry or voter');
	},
	handler: () => {},
};
