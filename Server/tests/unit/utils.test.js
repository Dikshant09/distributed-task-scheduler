const { generateId } = require('../../common/utils/uuid');
const { now } = require('../../common/utils/time');

describe('UUID Utility', () => {
    it('should generate valid UUIDs', () => {
        const id1 = generateId();
        const id2 = generateId();

        expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(id1).not.toBe(id2);
    });
});

describe('Time Utility', () => {
    it('should return current date', () => {
        const currentTime = now();
        expect(currentTime).toBeInstanceOf(Date);
        expect(currentTime.getTime()).toBeLessThanOrEqual(Date.now());
    });
});
