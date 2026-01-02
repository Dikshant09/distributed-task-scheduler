// Output Truncation Utility
// Ensures execution output doesn't exceed size limits

const MAX_OUTPUT_BYTES = 16 * 1024; // 16KB

/**
 * Truncate output if it exceeds size limit
 * @param {Object} output - Execution output object
 * @returns {Object} { output, truncated }
 */
const truncateOutput = (output) => {
    if (!output) {
        return { output: null, truncated: false };
    }

    const outputStr = JSON.stringify(output);
    const sizeBytes = Buffer.byteLength(outputStr, 'utf8');

    if (sizeBytes <= MAX_OUTPUT_BYTES) {
        return { output, truncated: false };
    }

    // Truncate to fit within limit
    const maxChars = MAX_OUTPUT_BYTES - 200; // Reserve space for truncation marker
    const truncatedStr = outputStr.substring(0, maxChars);

    try {
        // Try to parse truncated JSON (may be invalid)
        const truncatedOutput = JSON.parse(truncatedStr + '}');
        return { output: truncatedOutput, truncated: true };
    } catch (err) {
        // If JSON is invalid after truncation, return string
        return {
            output: {
                _truncated: true,
                _partial: truncatedStr + '...[TRUNCATED]'
            },
            truncated: true
        };
    }
};

module.exports = { truncateOutput, MAX_OUTPUT_BYTES };
