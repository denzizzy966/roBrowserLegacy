import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, validateSpawn, spawnPlacement, decodeZoneTick, lompatanTick, tickTerbuang, decodeMove, pathKeInt16, encodeMove, arahLangkah } from './mapinfo.js';

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

describe('encodeMove', () => {
	it('menghasilkan ArrayBuffer, sesuai JSDoc dan kontrak GoSocket.send', () => {
		// encodeEnterMap membungkus dengan toArrayBuffer(); encodeMove harus
		// mengikuti pola yang sama, bukan mengembalikan Uint8Array telanjang
		// dari ClientMsg.encode(...).finish().
		const { ClientMsg } = types();

		const buf = encodeMove(ClientMsg, 118, 115);
		expect(buf).toBeInstanceOf(ArrayBuffer);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.move.x).toBe(118);
		expect(decoded.move.y).toBe(115);
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
	it('membaca tick, entities, dan waktu server dari buffer terenkripsi', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			zoneTick: { tick: 40, entities: 2, serverTimeMs: 1735689600000 }
		})).finish();

		expect(decodeZoneTick(ServerMsg, toArrayBuffer(raw))).toEqual({
			tick: 40, entities: 2, serverTimeMs: 1735689600000
		});
	});

	it('mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'prontera', xs: 312, ys: 392, spawnX: 156, spawnY: 196 }
		})).finish();

		expect(decodeZoneTick(ServerMsg, toArrayBuffer(raw))).toBeNull();
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

	it('memberi delta bukan 20 saat heartbeat message hilang dalam transit', () => {
		// Delta tick != 20 berarti heartbeat MESSAGE hilang dalam transit,
		// bukan zone yang membuang tick (lihat komentar lompatanTick). Nilai
		// "sekarang" di sini tetap kelipatan 20, karena zone HANYA pernah
		// menerbitkan heartbeat pada tick kelipatan 20 -- delta yang bukan
		// kelipatan 20 (mis. 14) tidak pernah bisa terjadi sungguhan, jadi
		// bukan kasus yang layak diuji.
		expect(lompatanTick(20, 60)).toBe(40); // satu heartbeat hilang
		expect(lompatanTick(40, 100)).toBe(60); // dua heartbeat hilang
	});
});

describe('decodeMove', () => {
	it('membaca entityId, jalur, dan kecepatan', () => {
		const msg = {
			move: {
				entityId: 7,
				path: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 5 }],
				speedMs: 150
			}
		};
		expect(decodeMove(msg)).toEqual({
			entityId: 7,
			path: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 5 }],
			speedMs: 150
		});
	});

	it('mengembalikan null untuk pesan lain', () => {
		expect(decodeMove({ mapInfo: { mapName: 'prontera' } })).toBeNull();
		expect(decodeMove({})).toBeNull();
	});
});

describe('pathKeInt16', () => {
	it('meratakan jalur menjadi pasangan x,y', () => {
		const out = pathKeInt16([{ x: 4, y: 4 }, { x: 5, y: 4 }]);
		expect(Array.from(out)).toEqual([4, 4, 5, 4]);
	});

	it('menghasilkan Int16Array, bukan Array biasa', () => {
		// walk.path milik client adalah Int16Array; memberinya Array biasa
		// bekerja sampai sesuatu membaca .buffer.
		expect(pathKeInt16([{ x: 1, y: 2 }])).toBeInstanceOf(Int16Array);
	});

	it('panjangnya dua kali jumlah langkah, tanpa batas 32', () => {
		// MAX_WALKPATH = 32 hanya muncul di dua alokasi buffer upstream;
		// walkProcess sendiri cuma membaca walk.total. Kita memberi buffer
		// kita sendiri seukuran jalur yang datang.
		const jalur = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
		expect(pathKeInt16(jalur).length).toBe(100);
	});
});

describe('arahLangkah', () => {
	it('memetakan kedelapan offset satu-petak ke arah roBrowserLegacy yang benar', () => {
		// Konvensi arah roBrowserLegacy: 0=selatan, 2=barat, 4=utara, 6=timur
		// (EntityWalk.js:131), dengan +Y=utara dan +X=timur. Kedelapan arah
		// diuji sekaligus dengan namanya tertulis supaya tabel yang
		// salah-transpose (baris/kolom tertukar) atau salah-cermin (tanda
		// dx/dy terbalik) gagal -- bukan cuma lolos kebetulan pada satu dua
		// arah yang simetris.
		expect(arahLangkah(0, -1)).toBe(0); // selatan
		expect(arahLangkah(-1, -1)).toBe(1); // barat daya
		expect(arahLangkah(-1, 0)).toBe(2); // barat
		expect(arahLangkah(-1, 1)).toBe(3); // barat laut
		expect(arahLangkah(0, 1)).toBe(4); // utara
		expect(arahLangkah(1, 1)).toBe(5); // timur laut
		expect(arahLangkah(1, 0)).toBe(6); // timur
		expect(arahLangkah(1, -1)).toBe(7); // tenggara
	});

	it('mengembalikan 0 untuk offset di luar satu petak', () => {
		expect(arahLangkah(2, 0)).toBe(0);
		expect(arahLangkah(0, -2)).toBe(0);
		expect(arahLangkah(3, 3)).toBe(0);
	});
});

describe('tabel walkable upstream', () => {
	it('cocok dengan Walkable() di Go', () => {
		// Server mengikuti TYPE_TABLE upstream (keputusan P1). Bila
		// git pull upstream mengubah tabel itu, Walkable() di Go
		// menyimpang DIAM-DIAM dan klik-mati-senyap kembali: pemain
		// melihat kursor jalan, mengklik, dan tidak terjadi apa-apa.
		//
		// Test ini hidup di JS karena yang dibacanya JS.
		const src = readFileSync(
			new URL('../../src/Renderer/Map/Altitude.js', import.meta.url),
			'utf8'
		);
		const tabel = src.slice(src.indexOf('const TYPE_TABLE'));

		const walkable = {};
		for (const m of tabel.matchAll(/^\s*(\d+):\s*([^,\n]+),/gm)) {
			walkable[Number(m[1])] = m[2].includes('WALKABLE');
		}

		expect(walkable).toEqual({
			0: true,   // tanah
			1: false,  // tembok
			2: true,
			3: true,   // air
			4: true,
			5: false,  // hanya bisa ditembus panah
			6: true
		});
	});
});

describe('tickTerbuang', () => {
	it('mengembalikan null untuk heartbeat pertama', () => {
		// Yang pertama tidak punya pembanding.
		expect(tickTerbuang(null, 1000)).toBeNull();
		expect(tickTerbuang(undefined, 1000)).toBeNull();
	});

	it('memberi 0 saat gap serverTimeMs sekitar 1000 ms (sehat)', () => {
		expect(tickTerbuang(1000, 2000)).toBe(0);
		expect(tickTerbuang(5000, 6000)).toBe(0);
	});

	it('memberi 0 saat gap di bawah 1000 ms (sehat)', () => {
		expect(tickTerbuang(1000, 1999)).toBe(0);
		expect(tickTerbuang(5000, 5500)).toBe(0);
	});

	it('mengestimasi tick terbuang dari excess waktu', () => {
		// Gap 1400 ms = 400 ms excess → 400/50 = 8 tick terbuang.
		expect(tickTerbuang(1000, 2400)).toBe(8);
		// Gap 1500 ms = 500 ms excess → 500/50 = 10 tick terbuang.
		expect(tickTerbuang(5000, 6500)).toBe(10);
	});
});
