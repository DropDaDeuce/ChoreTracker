/**
 * Generates the PWA icons (static/icons/*.png) with zero image dependencies —
 * a tiny hand-rolled PNG encoder drawing a rounded blue tile + white check.
 * Re-run with: node scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0; // filter: none
		for (let x = 0; x < size; x++) {
			const [r, g, b, a] = pixelAt(x, y);
			const o = y * (size * 4 + 1) + 1 + x * 4;
			raw[o] = r;
			raw[o + 1] = g;
			raw[o + 2] = b;
			raw[o + 3] = a;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/** Distance from point to line segment, all in 0..1 space. */
function segmentDistance(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const BG = [59, 130, 246]; // tailwind blue-500
const CHECK = [
	[0.28, 0.53, 0.44, 0.68],
	[0.44, 0.68, 0.74, 0.36]
];

function makeIcon(size, { maskable }) {
	const cornerRadius = maskable ? 0 : 0.2;
	// Maskable icons must keep content inside the central 80% safe zone.
	const scale = maskable ? 0.72 : 1;

	return encodePng(size, (xPx, yPx) => {
		const x = (xPx + 0.5) / size;
		const y = (yPx + 0.5) / size;

		if (cornerRadius > 0) {
			const r = cornerRadius;
			const cx = Math.max(r, Math.min(1 - r, x));
			const cy = Math.max(r, Math.min(1 - r, y));
			if (Math.hypot(x - cx, y - cy) > r) return [0, 0, 0, 0];
		}

		const sx = (x - 0.5) / scale + 0.5;
		const sy = (y - 0.5) / scale + 0.5;
		const dist = Math.min(...CHECK.map(([ax, ay, bx, by]) => segmentDistance(sx, sy, ax, ay, bx, by)));
		const thickness = 0.075;
		const aa = 1.5 / (size * scale); // anti-aliasing band
		const t = Math.max(0, Math.min(1, (thickness - dist) / aa));
		const mix = (bg, fg) => Math.round(bg + (fg - bg) * t);
		return [mix(BG[0], 255), mix(BG[1], 255), mix(BG[2], 255), 255];
	});
}

mkdirSync('static/icons', { recursive: true });
writeFileSync('static/icons/icon-192.png', makeIcon(192, { maskable: false }));
writeFileSync('static/icons/icon-512.png', makeIcon(512, { maskable: false }));
writeFileSync('static/icons/icon-maskable-512.png', makeIcon(512, { maskable: true }));
console.log('Wrote static/icons/icon-192.png, icon-512.png, icon-maskable-512.png');
