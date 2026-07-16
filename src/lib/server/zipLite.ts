import zlib from 'node:zlib';

/**
 * Minimal ZIP writer/reader for the backup feature — no dependencies.
 * Writes STORE (uncompressed; SQLite pages barely compress and photos are
 * already compressed). Reads STORE and DEFLATE so hand-made zips work too.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	name: string;
	data: Buffer;
}

export function createZip(entries: ZipEntry[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const crc = crc32(entry.data);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(0, 6); // flags
		local.writeUInt16LE(0, 8); // method: store
		local.writeUInt32LE(0, 10); // dos time/date
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(entry.data.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28); // extra len
		locals.push(local, name, entry.data);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10); // method
		central.writeUInt32LE(0, 12);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(entry.data.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42); // local header offset (28-42 zero)
		centrals.push(central, name);

		offset += 30 + name.length + entry.data.length;
	}

	const centralSize = centrals.reduce((n, b) => n + b.length, 0);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(centralSize, 12);
	eocd.writeUInt32LE(offset, 16);

	return Buffer.concat([...locals, ...centrals, eocd]);
}

export function readZip(buf: Buffer): ZipEntry[] {
	// EOCD is at the end, possibly preceded by a comment — scan backwards.
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('Not a zip file.');

	const count = buf.readUInt16LE(eocd + 10);
	let pos = buf.readUInt32LE(eocd + 16);
	const entries: ZipEntry[] = [];

	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
		const method = buf.readUInt16LE(pos + 10);
		const compressedSize = buf.readUInt32LE(pos + 20);
		const nameLen = buf.readUInt16LE(pos + 28);
		const extraLen = buf.readUInt16LE(pos + 30);
		const commentLen = buf.readUInt16LE(pos + 32);
		const localOffset = buf.readUInt32LE(pos + 42);
		const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

		const localNameLen = buf.readUInt16LE(localOffset + 26);
		const localExtraLen = buf.readUInt16LE(localOffset + 28);
		const dataStart = localOffset + 30 + localNameLen + localExtraLen;
		const raw = buf.subarray(dataStart, dataStart + compressedSize);

		if (method === 0) entries.push({ name, data: Buffer.from(raw) });
		else if (method === 8) entries.push({ name, data: zlib.inflateRawSync(raw) });
		else throw new Error(`Unsupported zip compression method ${method}.`);

		pos += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}
