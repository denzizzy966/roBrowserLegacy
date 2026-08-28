import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, validateSpawn, spawnPlacement, decodeZoneTick, lompatanTick } from './mapinfo.js';

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

		// Sengaja BUKAN 'geffen': bila nama map di-hardcode, test dengan
		// fixture 'geffen' akan lolos karena nilainya kebetulan sama.
		const buf = encodeEnterMap(ClientMsg, 'payon');
		expect(buf).toBeInstanceOf(ArrayBuffer);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.enterMap.mapName).toBe('payon');
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

	it('menolak bila TINGGI berbeda, bukan hanya lebar', () => {
		// Setiap fixture ketidakcocokan lain berbeda pada LEBAR, sehingga
		// menghapus separuh pemeriksaan tinggi lolos seluruh test.
		const r = validateSpawn(info, 240, 200);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('240x200');
	});

	it('menolak spawnY yang melampaui tinggi', () => {
		// Setiap fixture di-luar-batas lain melampaui pada X; satu-satunya
		// fixture Y bernilai negatif. Tanpa kasus ini, menghapus separuh
		// pemeriksaan batas Y lolos seluruh test — dan spawnY yang tak
		// terbatas menghasilkan NaN di spot.position[2], yang ditulis
		// Camera.init() ke matriks model-view: kanvas kosong.
		const payon = { mapName: 'payon', xs: 300, ys: 360, spawnX: 100, spawnY: 360 };
		const r = validateSpawn(payon, 300, 360);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain('di luar batas');
	});
});

describe('spawnPlacement', () => {
	it('memakai spawn server bila valid', () => {
		// payon 300x360 asimetris, spawn (149,179) juga asimetris — x dan y
		// yang tertukar tidak dapat lolos.
		const payon = { mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179 };
		expect(spawnPlacement(payon, 300, 360)).toEqual({ ok: true, x: 149, y: 179 });
	});

	it('jatuh ke titik tengah pada sumbu yang benar bila spawn ditolak', () => {
		// Dimensi GRF 300x400 tidak cocok dengan server 300x360, sehingga
		// spawn ditolak. Titik tengahnya (150,200) — bukan (200,150) — jadi
		// sumbu cadangan yang tertukar pun tertangkap.
		const payon = { mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179 };
		const p = spawnPlacement(payon, 300, 400);
		expect(p.ok).toBe(false);
		expect(p.x).toBe(150);
		expect(p.y).toBe(200);
		expect(p.reason).toContain('300x360');
	});
});

describe('decodeZoneTick', () => {
	it('membaca tick, entities, dan waktu server', () => {
		const msg = {
			zoneTick: { tick: 40, entities: 2, serverTimeMs: 1735689600000 }
		};
		expect(decodeZoneTick(msg)).toEqual({
			tick: 40, entities: 2, serverTimeMs: 1735689600000
		});
	});

	it('mengembalikan null untuk pesan lain', () => {
		expect(decodeZoneTick({ mapInfo: { mapName: 'prontera' } })).toBeNull();
		expect(decodeZoneTick({})).toBeNull();
	});
});

describe('lompatanTick', () => {
	it('mengembalikan null untuk heartbeat pertama', () => {
		// Yang pertama tidak punya pembanding.
		expect(lompatanTick(null, 20)).toBeNull();
		expect(lompatanTick(undefined, 20)).toBeNull();
	});

	it('memberi 20 saat zone berdetak penuh', () => {
		expect(lompatanTick(20, 40)).toBe(20);
		expect(lompatanTick(40, 60)).toBe(20);
	});

	it('memberi angka lebih kecil saat zone membuang tick', () => {
		// Inilah alasan heartbeat membawa hitungan tick sesungguhnya.
		// Menghitung pesan yang datang tidak akan memperlihatkan apa pun:
		// pesannya tetap tiba sekali per detik meski zone tersendat.
		expect(lompatanTick(40, 54)).toBe(14);
	});
});
