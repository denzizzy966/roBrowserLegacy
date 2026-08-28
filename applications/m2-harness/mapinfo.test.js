import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, validateSpawn } from './mapinfo.js';

// Membaca skema yang SAMA dengan yang dipakai server. Menyalin isi ro.proto
// ke dalam test akan membuatnya tetap lulus walau skema aslinya berubah.
const HERE        = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../../proto/ro.proto');

function types() {
	const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
	return {
		ClientMsg: root.lookupType('ro.v1.ClientMsg'),
		ServerMsg: root.lookupType('ro.v1.ServerMsg')
	};
}

function toArrayBuffer(u8) {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

describe('rswFileName', () => {
	it('menambahkan akhiran .rsw', () => {
		expect(rswFileName('geffen')).toBe('geffen.rsw');
	});

	it('tidak menggandakan akhiran yang sudah ada', () => {
		expect(rswFileName('geffen.rsw')).toBe('geffen.rsw');
	});

	it('menolak nama kosong', () => {
		expect(() => rswFileName('')).toThrow();
	});
});

describe('encodeEnterMap', () => {
	it('menghasilkan ArrayBuffer yang dapat didekode kembali', () => {
		const { ClientMsg } = types();

		const buf = encodeEnterMap(ClientMsg, 'geffen');
		expect(buf).toBeInstanceOf(ArrayBuffer);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.enterMap.mapName).toBe('geffen');
	});
});

describe('decodeMapInfo', () => {
	it('membaca EvtMapInfo menjadi objek biasa', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115 }
		})).finish();

		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw))).toEqual({
			mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115
		});
	});

	it('mengembalikan null bila body bukan EvtMapInfo', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			error: { reason: 'map tidak dikenal: xyz' }
		})).finish();

		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw))).toBeNull();
	});
});

describe('decodeServerError', () => {
	it('membaca EvtError menjadi string', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			error: { reason: 'map tidak dikenal: xyz' }
		})).finish();

		expect(decodeServerError(ServerMsg, toArrayBuffer(raw))).toBe('map tidak dikenal: xyz');
	});

	it('mengembalikan null bila body bukan EvtError', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115 }
		})).finish();

		expect(decodeServerError(ServerMsg, toArrayBuffer(raw))).toBeNull();
	});
});

describe('decodeMapInfo — dimensi tidak simetris', () => {
	it('tidak menukar xs dan ys', () => {
		// geffen 240x240 PERSEGI, sehingga transposisi xs/ys menghasilkan objek
		// yang deep-equal dengan yang diharapkan dan toEqual tidak dapat
		// membedakannya — terbukti lewat mutasi saat review Task 2. payon
		// 300x360 tidak simetris, begitu pula spawn-nya (149,179), sehingga
		// baik dimensi maupun koordinat yang tertukar akan tertangkap.
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179 }
		})).finish();

		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw))).toEqual({
			mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179
		});
	});
});

describe('validateSpawn', () => {
	const info = { mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115 };

	it('menerima spawn yang sah pada dimensi yang cocok', () => {
		expect(validateSpawn(info, 240, 240)).toEqual({ ok: true });
	});

	it('menolak bila dimensi server berbeda dari GRF', () => {
		// Ini kelas galat yang paling menyesatkan: map tetap tampil, tetapi
		// karakter berdiri di tempat yang salah, dan tidak ada yang mengeluh.
		const r = validateSpawn(info, 200, 240);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('240x240');
		expect(r.reason).toContain('200x240');
	});

	it('menolak spawn di luar batas', () => {
		const r = validateSpawn({ ...info, spawnX: 240 }, 240, 240);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('di luar batas');
	});

	it('membandingkan xs dengan lebar dan ys dengan tinggi, bukan tertukar', () => {
		// Seluruh fixture lain memakai 240x240 yang PERSEGI, sehingga
		// perbandingan tertukar (info.xs vs altitudeHeight) tidak dapat
		// dibedakan — terbukti lewat mutasi saat Task 3. payon 300x360
		// asimetris: bila tertukar, 300 != 360 dan validasi menolak map
		// yang sebenarnya sah.
		const payon = { mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179 };
		expect(validateSpawn(payon, 300, 360)).toEqual({ ok: true });
	});

	it('memeriksa batas spawn pada sumbu yang benar', () => {
		// spawnX 310 melampaui lebar 300 tetapi masih di bawah tinggi 360.
		// Dengan pemeriksaan batas yang benar ini ditolak; dengan sumbu
		// tertukar (spawnX diuji terhadap tinggi) ia keliru diterima.
		const payon = { mapName: 'payon', xs: 300, ys: 360, spawnX: 310, spawnY: 100 };
		const r = validateSpawn(payon, 300, 360);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('di luar batas');
	});

	it('menolak spawn negatif', () => {
		const r = validateSpawn({ ...info, spawnY: -1 }, 240, 240);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('di luar batas');
	});
});
