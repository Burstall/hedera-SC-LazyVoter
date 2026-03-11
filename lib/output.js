'use strict';

/**
 * Output formatter that supports human-readable and JSON output modes.
 */
class Output {
	constructor(options = {}) {
		this.json = options.json || false;
		this.quiet = options.quiet || false;
	}

	/**
	 * Output a successful result
	 * @param {object} data - Data to output
	 * @param {function} [humanFormatter] - Function to format human-readable output
	 */
	success(data, humanFormatter) {
		if (this.json) {
			console.log(JSON.stringify({ success: true, data }, null, 2));
		}
		else if (!this.quiet && humanFormatter) {
			humanFormatter(data);
		}
	}

	/**
	 * Output an error
	 * @param {string} code - Error code
	 * @param {string} message - Error message
	 * @param {string[]} [suggestions=[]] - Helpful suggestions
	 */
	error(code, message, suggestions = []) {
		if (this.json) {
			console.error(JSON.stringify({ success: false, error: { code, message, suggestions } }, null, 2));
		}
		else {
			console.error(`Error: ${message}`);
			suggestions.forEach(s => console.error(`  Suggestion: ${s}`));
		}
	}

	/**
	 * Output informational text (suppressed in quiet mode)
	 * @param {string} text
	 */
	info(text) {
		if (!this.quiet && !this.json) {
			console.log(text);
		}
	}
}

module.exports = Output;
