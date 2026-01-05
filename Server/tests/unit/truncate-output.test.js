const { truncateOutput, MAX_OUTPUT_BYTES } = require('../../common/utils/truncate-output');

describe('Truncate Output Utility', () => {
    it('should not truncate small output', () => {
        const smallOutput = { message: 'Hello, world!' };
        const result = truncateOutput(smallOutput);

        expect(result.truncated).toBe(false);
        expect(result.output).toEqual(smallOutput);
    });

    it('should truncate large output exceeding 16KB', () => {
        const largeOutput = {
            data: 'x'.repeat(20000) // ~20KB
        };

        const result = truncateOutput(largeOutput);

        expect(result.truncated).toBe(true);
        const outputStr = JSON.stringify(result.output);
        expect(Buffer.byteLength(outputStr, 'utf8')).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    });

    it('should handle null output', () => {
        const result = truncateOutput(null);

        expect(result.output).toBeNull();
        expect(result.truncated).toBe(false);
    });

    it('should handle undefined output', () => {
        const result = truncateOutput(undefined);

        expect(result.output).toBeNull();
        expect(result.truncated).toBe(false);
    });

    it('should preserve structure when truncating nested objects', () => {
        const nestedOutput = {
            level1: {
                level2: {
                    data: 'x'.repeat(20000)
                }
            }
        };

        const result = truncateOutput(nestedOutput);

        expect(result.truncated).toBe(true);
        expect(result.output).toHaveProperty('_truncated');
    });

    it('should handle arrays', () => {
        const arrayOutput = Array(1000).fill({ data: 'x'.repeat(100) });
        const result = truncateOutput(arrayOutput);

        const outputStr = JSON.stringify(arrayOutput);
        if (Buffer.byteLength(outputStr, 'utf8') > MAX_OUTPUT_BYTES) {
            expect(result.truncated).toBe(true);
        }
    });
});
