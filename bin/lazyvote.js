#!/usr/bin/env node
'use strict';

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
	.scriptName('lazyvote')
	.usage('$0 <command> [options]')
	.command(require('./commands/vote'))
	.command(require('./commands/query'))
	.command(require('./commands/admin'))
	.command(require('./commands/delegate'))
	.command(require('./commands/revoke'))
	.command(require('./commands/deploy'))
	.option('contract-id', {
		alias: 'c',
		type: 'string',
		description: 'LazyVoter contract ID (overrides LAZYVOTE_CONTRACT_ID or CONTRACT_ID env var)',
	})
	.option('network', {
		alias: 'n',
		type: 'string',
		description: 'Network: test, main, preview, local (overrides ENVIRONMENT env var)',
	})
	.option('json', {
		type: 'boolean',
		description: 'Output results as JSON',
		default: false,
	})
	.option('yes', {
		alias: 'y',
		type: 'boolean',
		description: 'Skip confirmation prompts',
		default: false,
	})
	.demandCommand(1, 'Please specify a command. Run with --help for usage.')
	.strict()
	.help()
	.alias('h', 'help')
	.version()
	.argv;
