const fs = require('fs');
const { ethers } = require('ethers');
const { expect } = require('chai');
const { describe, it, after } = require('mocha');
const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractFunctionParameters,
	Hbar,
	HbarUnit,
} = require('@hashgraph/sdk');

const {
	contractDeployFunction,
	contractExecuteFunction,
	contractExecuteQuery,
} = require('../utils/solidityHelpers');
const {
	accountCreator,
	associateTokensToAccount,
	mintNFT,
	sendNFT,
	sweepHbar,
} = require('../utils/hederaHelpers');
const { sleep } = require('../utils/nodeHelpers');
const { checkMirrorHbarBalance } = require('../utils/hederaMirrorHelpers');
const { fail } = require('assert');
require('dotenv').config();

// Get operator from .env file
let operatorKey;
let operatorId;

let env;

const contractName = 'LazyVoter';
const lazyDelegateRegistryName = 'LazyDelegateRegistry';

const addressRegex = /(\d+\.\d+\.[1-9]\d+)/i;

// reused variables
let lazyVoterAddress, lazyVoterId;
let lazyVoterIface, lazyDelegateRegistryIface;
let nftTokenId;
let alicePK, aliceId;
let bobPK, bobId;
let client;
let lazyDelegateRegistryId;
let startTime;

describe('LazyVoter Contract Tests', () => {
	it('Should deploy contracts and setup test environment', async () => {
		// Get operator from .env file (may be overridden for LOCAL)
		try {
			operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
			try {
				operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
			}
			catch {
				operatorKey = PrivateKey.fromStringECDSA(process.env.PRIVATE_KEY);
			}
		}
		catch {
			console.log('ERROR: Must specify PRIVATE_KEY & ACCOUNT_ID in the .env file (unless using LOCAL environment)');
		}

		// Determine environment
		env = process.env.ENVIRONMENT || 'TEST';
		console.log('\n-Using ENVIRONMENT:', env);

		if (env.toUpperCase() == 'TEST') {
			client = Client.forTestnet();
			console.log('testing in *TESTNET*');
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			console.log('testing in *MAINNET*');
		}
		else if (env.toUpperCase() == 'PREVIEW') {
			client = Client.forPreviewnet();
			console.log('testing in *PREVIEWNET*');
		}
		else if (env.toUpperCase() == 'LOCAL') {
			const node = { '127.0.0.1:50211': new AccountId(3) };
			client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
			console.log('testing in *LOCAL*');
			const rootId = AccountId.fromString('0.0.2');
			const rootKey = PrivateKey.fromStringED25519(
				'302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137',
			);

			// create an operator account on the local node and use this for testing as operator
			client.setOperator(rootId, rootKey);
			operatorKey = PrivateKey.generateED25519();
			operatorId = await accountCreator(client, operatorKey, 1000);
		}
		else {
			throw new Error(
				'ERROR: Must specify either MAIN or TEST or PREVIEW or LOCAL as ENVIRONMENT in .env file',
			);
		}

		if (!operatorKey || !operatorId) {
			throw new Error('Must specify PRIVATE_KEY & ACCOUNT_ID in the .env file (or use LOCAL environment)');
		}

		client.setOperator(operatorId, operatorKey);
		// deploy the contract
		console.log('\n-Using Operator:', operatorId.toString());

		// Create test accounts
		console.log('\n- Creating test accounts...');
		alicePK = PrivateKey.generateECDSA();
		aliceId = await accountCreator(client, alicePK, 300);

		bobPK = PrivateKey.generateECDSA();
		bobId = await accountCreator(client, bobPK, 50);

		console.log(`Alice ID: ${aliceId}`);
		console.log(`Bob ID: ${bobId}`);

		// Deploy LazyDelegateRegistry
		let ldrAddress;
		if (process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID) {
			console.log(
				'\n- Using existing Lazy Delegate Registry:',
				process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID,
			);
			ldrAddress = ContractId.fromString(
				process.env.LAZY_DELEGATE_REGISTRY_CONTRACT_ID,
			);
		}
		else {
			const gasLimit = 3_500_000;

			const ldrJson = JSON.parse(
				fs.readFileSync(
					`./artifacts/contracts/${lazyDelegateRegistryName}.sol/${lazyDelegateRegistryName}.json`,
				),
			);

			const ldrBytecode = ldrJson.bytecode;

			console.log('\n- Deploying LazyDelegateRegistry...', '\n\tgas@', gasLimit);

			[ldrAddress] = await contractDeployFunction(client, ldrBytecode, gasLimit);

			console.log(
				`Lazy Delegate Registry deployed: ${ldrAddress} / ${ldrAddress.toSolidityAddress()}`,
			);

			expect(ldrAddress.toString().match(addressRegex).length == 2).to.be.true;
		}

		lazyDelegateRegistryId = ldrAddress;

		// Import LazyDelegateRegistry ABI
		const ldrJson = JSON.parse(
			fs.readFileSync(
				`./artifacts/contracts/${lazyDelegateRegistryName}.sol/${lazyDelegateRegistryName}.json`,
			),
		);
		lazyDelegateRegistryIface = ethers.Interface.from(ldrJson.abi);

		// Mint NFT for voting
		console.log('\n- Minting NFT collection for voting...');
		client.setOperator(aliceId, alicePK);
		const [result, tokenId] = await mintNFT(
			client,
			aliceId,
			'Vote NFT',
			'VOTE',
			10,
		);
		expect(result).to.be.equal('SUCCESS');
		nftTokenId = tokenId;
		console.log(`NFT Token ID: ${nftTokenId}`);

		// Associate NFT to Bob
		client.setOperator(bobId, bobPK);
		await associateTokensToAccount(client, bobId, bobPK, [nftTokenId]);

		// Transfer some serials to Bob for delegation testing
		client.setOperator(aliceId, alicePK);
		await sendNFT(client, aliceId, bobId, nftTokenId, [2]);

		// Deploy LazyVoter
		console.log('\n- Deploying LazyVoter...');
		client.setOperator(operatorId, operatorKey);

		const gasLimit = 4_500_000;

		const lazyVoterJson = JSON.parse(
			fs.readFileSync(
				`./artifacts/contracts/${contractName}.sol/${contractName}.json`,
			),
		);

		const lazyVoterBytecode = lazyVoterJson.bytecode;
		lazyVoterIface = ethers.Interface.from(lazyVoterJson.abi);

		startTime = Math.floor(Date.now() / 1000) + 30;
		const endTime = startTime + 3600;
		const quorum = 3;
		const eligibleSerials = [1, 2, 3, 4, 5];

		const constructorParams = new ContractFunctionParameters()
			.addString('Test Vote Proposal')
			.addAddress(nftTokenId.toSolidityAddress())
			.addUint256(quorum)
			.addUint256(startTime)
			.addUint256(endTime)
			.addAddress(lazyDelegateRegistryId.toSolidityAddress())
			.addUint256Array(eligibleSerials);

		[lazyVoterAddress] = await contractDeployFunction(
			client,
			lazyVoterBytecode,
			gasLimit,
			constructorParams,
		);

		lazyVoterId = lazyVoterAddress;

		console.log(
			`LazyVoter deployed: ${lazyVoterAddress} / ${lazyVoterAddress.toSolidityAddress()}`,
		);

		expect(lazyVoterAddress.toString().match(addressRegex).length == 2).to.be.true;

		// need to unpause for testing
		const unpauseResult = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			300_000,
			'unpauseVoting',
			[],
		);

		if (unpauseResult[0]?.status?.toString() != 'SUCCESS') {
			console.log('Unpause Error:', unpauseResult[0]);
			fail();
		}

	});

	it('Should reject votes before voting starts', async () => {
		// Try to vote before startTime
		client.setOperator(aliceId, alicePK);
		const result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[1], 1],
		);
		if (result[0]?.status?.toString() == 'SUCCESS') {
			expect.fail('Should have failed with VoteWindowClosed');
		}
		else {
			console.log(' - Vote rejected before start time as expected', result);
			expect(result[0].message || result[0]?.status?.name).to.include('VoteWindowClosed');
		}
	});

	it('Should test owner controls before voting starts', async () => {
		// Test adding eligible serials
		client.setOperator(operatorId, operatorKey);
		let result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'addEligibleSerials',
			[[6, 7]],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Test updating vote message
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'updateVoteMessage',
			['Updated Proposal'],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Test updating quorum
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'updateQuorum',
			[4],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Verify changes
		let queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			100_000,
			'voteMessage',
			[],
		);
		expect(queryResult[0]).to.equal('Updated Proposal');

		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			100_000,
			'quorum',
			[],
		);
		expect(queryResult[0]).to.equal(4n);

		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			100_000,
			'totalEligibleVoters',
			[],
		);
		expect(queryResult[0]).to.equal(7n);
	});

	it('Should test voting logic', async () => {
		// Wait for voting to start
		console.log('\n- Waiting for voting to start...');
		// check how long until startTime
		const now = Math.floor(Date.now() / 1000);
		const waitTime = (startTime - now) * 1000;
		if (waitTime > 0) {
			await sleep(waitTime + 1000);
		}

		// Alice votes on her serials (3,4) with Yes
		client.setOperator(aliceId, alicePK);
		let result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[3, 4], 1],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Alice votes on her serial (5) with No
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[5], 0],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Bob votes on his serial (2) with Abstain
		client.setOperator(bobId, bobPK);
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[2], 2],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Check results
		let queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			300_000,
			'getResults',
			[],
		);
		// Yes votes
		expect(queryResult[0]).to.equal(2n);
		// No votes
		expect(queryResult[1]).to.equal(1n);
		// Abstain votes
		expect(queryResult[2]).to.equal(1n);

		// Check that non-voted serial returns default values
		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			300_000,
			'lastVoterForSerial',
			[1],
		);
		expect(queryResult[0]).to.equal('0x0000000000000000000000000000000000000000');
		expect(queryResult[1]).to.equal(0n);

		// Check quorum
		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			300_000,
			'hasQuorum',
			[],
		);
		expect(queryResult[0]).to.be.false;
	});

	it('Should test delegation voting', async () => {

		// Alice delegates serial 1 to Bob
		client.setOperator(aliceId, alicePK);
		let result = await contractExecuteFunction(
			lazyDelegateRegistryId,
			lazyDelegateRegistryIface,
			client,
			950_000,
			'delegateNFT',
			[bobId.toSolidityAddress(), nftTokenId.toSolidityAddress(), [1]],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Bob votes on Alice's serial 1 as delegate
		client.setOperator(bobId, bobPK);
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[1], 1],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Check results updated
		const queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'getResults',
			[],
		);

		console.log('Results after delegation vote: Yes, No, Abstain');
		console.log('Yes votes:', queryResult[0]);
		console.log('No votes:', queryResult[1]);
		console.log('Abstain votes:', queryResult[2]);
		expect(queryResult[0]).to.equal(3n);
		expect(queryResult[1]).to.equal(1n);
		expect(queryResult[2]).to.equal(1n);
	});

	it('Should prevent original owner from voting on delegated serial', async () => {
		// Alice should not be able to vote on serial 1 after delegating it to Bob
		client.setOperator(aliceId, alicePK);
		const result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			500_000,
			'vote',
			[[1], 1],
		);
		if (result[0]?.status?.toString() == 'SUCCESS') {
			expect.fail('Should have failed with NotOwnerOrDelegated - owner cannot vote on delegated serial');
		}
		else {
			expect(result[0].message || result[0]?.status?.name).to.include('NotOwnerOrDelegated');
		}
	});

	it('Should test view functions', async () => {
		let errorCount = 0;
		const errors = [];

		// Test getAllVoters
		let queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			300_000,
			'getAllVoters',
			[],
		);
		const expectedVoters = 2;
		if (queryResult[0].length !== expectedVoters) {
			errorCount++;
			errors.push(`getAllVoters: expected ${expectedVoters} voters, got ${queryResult[0].length}`);
		}
		// Check that vote counts are returned
		if (queryResult[1].length !== expectedVoters) {
			errorCount++;
			errors.push(`getAllVoters: expected ${expectedVoters} vote counts, got ${queryResult[1].length}`);
		}
		// Check total votes
		const totalVotes = queryResult[1].reduce((sum, count) => sum + Number(count), 0);
		if (totalVotes !== 5) {
			errorCount++;
			errors.push(`getAllVoters: expected total of 5 votes, got ${totalVotes}`);
		}

		// Test getEligibleSerials
		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			100_000,
			'getEligibleSerials',
			[0, 10],
		);
		const expectedSerials = 7;
		if (queryResult[0].length !== expectedSerials) {
			errorCount++;
			errors.push(`getEligibleSerials: expected ${expectedSerials} serials, got ${queryResult[0].length}`);
		}

		// Test votingStatus
		queryResult = await contractExecuteQuery(
			lazyVoterId,
			lazyVoterIface,
			client,
			100_000,
			'votingStatus',
			[],
		);
		const expectedStatus = 'Active';
		if (queryResult[0] !== expectedStatus) {
			errorCount++;
			errors.push(`votingStatus: expected '${expectedStatus}', got '${queryResult[0]}'`);
		}

		// Report all errors
		if (errorCount > 0) {
			console.log(`\nView functions test found ${errorCount} error(s):`);
			errors.forEach(error => console.log(`- ${error}`));
			expect.fail(`View functions test failed with ${errorCount} error(s). See console output above.`);
		}
	});

	it('Should test error cases', async () => {
		// Try to vote on ineligible serial
		client.setOperator(aliceId, alicePK);
		let result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'vote',
			[[10], 1],
		);
		if (result[0]?.status?.toString() == 'SUCCESS') {
			expect.fail('Should have failed with SerialNotEligible');
		}
		else {
			expect(result[0].message || result[0]?.status?.name).to.include('SerialNotEligible');
		}

		// Try to vote without ownership/delegation
		client.setOperator(bobId, bobPK);
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'vote',
			[[3], 1],
		);
		if (result[0]?.status?.toString() == 'SUCCESS') {
			expect.fail('Should have failed with NotOwnerOrDelegated');
		}
		else {
			expect(result[0].message || result[0]?.status?.name).to.include('NotOwnerOrDelegated');
		}
	});

	it('Should test owner emergency controls', async () => {
		// Pause voting
		client.setOperator(operatorId, operatorKey);
		let result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'pauseVoting',
			[],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}

		// Try to vote while paused
		client.setOperator(aliceId, alicePK);
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'vote',
			[[5], 1],
		);
		if (result[0]?.status?.toString() == 'SUCCESS') {
			expect.fail('Should have failed with VotingIsPaused');
		}
		else {
			expect(result[0].message || result[0]?.status?.name).to.include('VotingIsPaused');
		}

		// Unpause
		client.setOperator(operatorId, operatorKey);
		result = await contractExecuteFunction(
			lazyVoterId,
			lazyVoterIface,
			client,
			200_000,
			'unpauseVoting',
			[],
		);
		if (result[0]?.status?.toString() != 'SUCCESS') {
			console.log('Error:', result);
			fail();
		}
	});
});

after(async () => {
	// Reclaim HBAR from test accounts
	console.log('\n- Reclaiming HBAR from test accounts...');

	// ensure mirror has caught up
	await sleep(4000);

	env = process.env.ENVIRONMENT || 'TEST';

	// Reclaim from Alice
	let balance = await checkMirrorHbarBalance(env, aliceId);
	// Leave 0.01 HBAR
	balance -= 1_000_000;
	if (balance > 0) {
		console.log(`Reclaiming ${balance / 10 ** 8} HBAR from Alice`);
		const result = await sweepHbar(client, aliceId, alicePK, operatorId, new Hbar(balance, HbarUnit.Tinybar));
		console.log('Alice HBAR reclaim:', result);
	}

	// Reclaim from Bob
	balance = await checkMirrorHbarBalance(env, bobId);
	// Leave 0.01 HBAR
	balance -= 1_000_000;
	if (balance > 0) {
		console.log(`Reclaiming ${balance / 10 ** 8} HBAR from Bob`);
		const result = await sweepHbar(client, bobId, bobPK, operatorId, new Hbar(balance, HbarUnit.Tinybar));
		console.log('Bob HBAR reclaim:', result);
	}
});