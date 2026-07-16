import { createZip, readZip } from '$lib/server/zipLite';
import { describe, expect, it } from 'vitest';

describe('zipLite', () => {
	it('round-trips entries byte-for-byte', () => {
		const entries = [
			{ name: 'chores.db', data: Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00, 0xff]) },
			{ name: 'uploads/aabbccdd00112233.jpg', data: Buffer.alloc(1024, 7) },
			{ name: 'empty.txt', data: Buffer.alloc(0) }
		];

		const restored = readZip(createZip(entries));

		expect(restored.map((e) => e.name)).toEqual(entries.map((e) => e.name));
		for (let i = 0; i < entries.length; i++) {
			expect(restored[i].data.equals(entries[i].data)).toBe(true);
		}
	});

	it('produces a file starting with the PK local-header signature', () => {
		const zip = createZip([{ name: 'a', data: Buffer.from('hi') }]);
		expect(zip.readUInt32LE(0)).toBe(0x04034b50);
	});

	it('rejects non-zip data', () => {
		expect(() => readZip(Buffer.from('definitely not a zip file'))).toThrow();
	});
});
