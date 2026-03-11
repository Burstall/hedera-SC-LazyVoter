function getArgFlag(argOrArray, flagName) {
	if (flagName !== undefined) {
		// Two-argument form: getArgFlag(args, 'flag-name')
		const searchArray = Array.isArray(argOrArray) ? argOrArray : process.argv;
		return searchArray.includes(`--${flagName}`) || searchArray.includes(`-${flagName}`);
	}
	// Single-argument form: getArgFlag('--flag')
	return process.argv.includes(argOrArray);
}

function getArg(arg) {
	const customidx = process.argv.indexOf(arg);
	let customValue;

	if (customidx > -1) {
		// Retrieve the value after the flag
		customValue = process.argv[customidx + 1];
	}

	return customValue;
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getArgFlag, getArg, sleep };