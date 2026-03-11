'use strict';

/**
 * Parse a serial number string into an array of integers.
 * Supports comma-separated values and ranges.
 *
 * Examples:
 *   "1,2,3" → [1, 2, 3]
 *   "1-5" → [1, 2, 3, 4, 5]
 *   "1-3,7,10-12" → [1, 2, 3, 7, 10, 11, 12]
 *
 * @param {string} input - Serial number string
 * @returns {number[]} Array of serial numbers
 */
function parseSerials(input) {
	if (!input || typeof input !== 'string') {
		throw new Error('Serial numbers required. Example: "1,2,3" or "1-10"');
	}

	const serials = [];
	const parts = input.split(',').map(s => s.trim()).filter(Boolean);

	for (const part of parts) {
		if (part.includes('-')) {
			const [startStr, endStr] = part.split('-');
			const start = parseInt(startStr, 10);
			const end = parseInt(endStr, 10);
			if (isNaN(start) || isNaN(end) || start > end || start < 1) {
				throw new Error(`Invalid range "${part}". Use format: start-end (e.g., "1-10")`);
			}
			for (let i = start; i <= end; i++) {
				serials.push(i);
			}
		}
		else {
			const num = parseInt(part, 10);
			if (isNaN(num) || num < 1) {
				throw new Error(`Invalid serial number "${part}". Must be a positive integer.`);
			}
			serials.push(num);
		}
	}

	// Remove duplicates and sort
	return [...new Set(serials)].sort((a, b) => a - b);
}

module.exports = { parseSerials };
