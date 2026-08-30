import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, validateSpawn, spawnPlacement, decodeZoneTick, lompatanTick, tickTerbuang, decodeMove, decodeSpawn, decodeDespawn, pathKeInt16, encodeMove, arahLangkah, buatAntrean, objecttypeDari } from './mapinfo.js';

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
			mapInfo: { mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115, entityId: 7 }
		})).finish();

		// toEqual, bukan toMatchObject: field yang DIBUANG dekoder harus
		// gagal di sini. entityId sempat hilang justru karena assertion
		// yang longgar tidak akan pernah menyadarinya.
		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw))).toEqual({
			mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115, entityId: 7
		});
	});

	it('meneruskan entity_id, yang M4 pakai untuk mencocokkan EvtMove', () => {
		// proto/ro.proto:47-48 menyatakan tujuannya secara eksplisit.
		// Tanpa ini harness tidak bisa membedakan gerak miliknya dari
		// gerak pemain lain, dan tidak punya GID untuk mendaftarkan
		// sprite-nya ke EntityManager.
		//
		// Nilainya sengaja BUKAN 0 dan bukan sama dengan field lain mana
		// pun di pesan ini: entityId yang tertukar dengan spawnX harus
		// gagal, bukan lolos kebetulan.
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'prontera', xs: 200, ys: 200, spawnX: 150, spawnY: 150, entityId: 42 }
		})).finish();

		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw)).entityId).toBe(42);
	});

	it('memberi entityId 0 bila server tidak mengirimnya', () => {
		// proto3 tidak membedakan "tidak dikirim" dari nol. Yang penting
		// di sini: hasilnya angka, bukan undefined -- penjaga di main.js
		// membandingkannya dengan ===, dan undefined === undefined akan
		// membuat SETIAP EvtMove diterima.
		const { ServerMsg } = types();
		const raw = ServerMsg.encode(ServerMsg.create({
			mapInfo: { mapName: 'geffen', xs: 240, ys: 240, spawnX: 118, spawnY: 115 }
		})).finish();

		const info = decodeMapInfo(ServerMsg, toArrayBuffer(raw));
		expect(info.entityId).toBe(0);
		expect(typeof info.entityId).toBe('number');
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
			mapInfo: { mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179, entityId: 11 }
		})).finish();

		expect(decodeMapInfo(ServerMsg, toArrayBuffer(raw))).toEqual({
			mapName: 'payon', xs: 300, ys: 360, spawnX: 149, spawnY: 179, entityId: 11
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

describe('decodeSpawn', () => {
	it('membaca entityId, x, dan y', () => {
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(
			ServerMsg.encode(
				ServerMsg.create({ spawn: { entityId: 7, x: 123, y: 45 } })
			).finish()
		);
		// Nilai sengaja berbeda satu sama lain: field yang tertukar harus
		// gagal, bukan lolos karena kebetulan sama.
		//
		// type dan job tidak diisi di sini, jadi keduanya bawaan proto3
		// (0) -- lihat describe 'decodeSpawn membawa tipe dan job' di
		// bawah untuk kasus di mana keduanya diisi.
		expect(decodeSpawn(msg)).toEqual({ entityId: 7, x: 123, y: 45, type: 0, job: 0, hp: 0, maxHp: 0 });
	});

	it('mengembalikan null untuk pesan yang bukan spawn', () => {
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(
			ServerMsg.encode(
				ServerMsg.create({ despawn: { entityId: 7 } })
			).finish()
		);
		expect(decodeSpawn(msg)).toBeNull();
	});

	it('mengembalikan angka 0, bukan undefined, untuk bawaan proto3', () => {
		// Penting: penjaga di main.js memakai ===, dan undefined !== 0.
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(
			ServerMsg.encode(
				ServerMsg.create({ spawn: { entityId: 3 } })
			).finish()
		);
		expect(decodeSpawn(msg)).toEqual({ entityId: 3, x: 0, y: 0, type: 0, job: 0, hp: 0, maxHp: 0 });
	});
});

describe('decodeSpawn membawa tipe dan job', () => {
	it('membaca kelima field', () => {
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(ServerMsg.encode(ServerMsg.create({
			spawn: { entityId: 7, x: 123, y: 45, type: 2, job: 1002 }
		})).finish());
		expect(decodeSpawn(msg)).toEqual({ entityId: 7, x: 123, y: 45, type: 2, job: 1002, hp: 0, maxHp: 0 });
	});

	it('bawaan proto3 adalah angka 0, bukan undefined', () => {
		// Penjaga di main.js memakai ===, dan undefined !== 0.
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(ServerMsg.encode(ServerMsg.create({
			spawn: { entityId: 3 }
		})).finish());
		expect(decodeSpawn(msg)).toEqual({ entityId: 3, x: 0, y: 0, type: 0, job: 0, hp: 0, maxHp: 0 });
	});
});

describe('objecttypeDari', () => {
	it('memetakan PC dan MOB ke konstanta roBrowserLegacy', () => {
		expect(objecttypeDari(1)).toBe(0); // PC
		expect(objecttypeDari(2)).toBe(5); // MOB
	});

	it('mengembalikan null untuk tipe yang tidak dikenal', () => {
		// Termasuk nilai nol proto3. Menggambar tebakan lebih buruk
		// daripada tidak menggambar: sprite yang salah tidak menunjuk
		// sebabnya.
		expect(objecttypeDari(0)).toBeNull();
		expect(objecttypeDari(99)).toBeNull();
	});
});

describe('decodeDespawn', () => {
	it('membaca entityId', () => {
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(
			ServerMsg.encode(
				ServerMsg.create({ despawn: { entityId: 9 } })
			).finish()
		);
		expect(decodeDespawn(msg)).toEqual({ entityId: 9 });
	});

	it('mengembalikan null untuk pesan yang bukan despawn', () => {
		const { ServerMsg } = types();
		const msg = ServerMsg.decode(
			ServerMsg.encode(
				ServerMsg.create({ spawn: { entityId: 9, x: 1, y: 2 } })
			).finish()
		);
		expect(decodeDespawn(msg)).toBeNull();
	});
});


/**
 * Mengambil peta "tipe cell -> bisa dilewati?" dari sebuah berkas upstream.
 *
 * Anchor-nya regex DEKLARASI, bukan indexOf('TYPE_TABLE'): di
 * Renderer/Map/Altitude.js nama itu muncul lebih dulu sebagai PEMAKAIAN di
 * setCellType (baris 131-132), jauh sebelum deklarasinya di baris 328.
 * indexOf akan berhenti di sana dan menyaring badan fungsi, bukan tabel.
 *
 * Blok literalnya dibatasi sampai `};` terdekat supaya scraper tidak
 * meneruskan ke sisa berkas dan menangkap pola `angka:` yang bukan entri
 * tabel.
 */
function tabelWalkable(relPath) {
	const src = readFileSync(new URL(relPath, import.meta.url), 'utf8');
	const deklarasi = /TYPE_TABLE\s*=\s*\{/.exec(src);
	if (!deklarasi) {
		throw new Error(`TYPE_TABLE tidak ditemukan di ${relPath} — upstream memindahkan atau mengganti namanya`);
	}
	const blok = /\{[\s\S]*?\n\s*\};/.exec(src.slice(deklarasi.index));
	if (!blok) {
		throw new Error(`literal TYPE_TABLE di ${relPath} tidak berbentuk seperti dugaan scraper`);
	}

	const walkable = {};
	for (const m of blok[0].matchAll(/^\s*(\d+):\s*([^,\n]+),/gm)) {
		walkable[Number(m[1])] = m[2].includes('WALKABLE');
	}
	if (Object.keys(walkable).length === 0) {
		throw new Error(`tidak satu entri pun terbaca dari TYPE_TABLE di ${relPath} — scraper-nya yang rusak, bukan tabelnya`);
	}
	return walkable;
}

// Tabel yang SESUNGGUHNYA MENDEKODE cell GAT saat runtime: dipakai di
// Loaders/Altitude.js:91, di dalam load(), untuk tiap cell yang diurai
// dari berkas .gat.
const TABEL_RUNTIME = '../../src/Loaders/Altitude.js';

// Salinan kedua, yang HANYA dipakai setCellType (Renderer/Map/Altitude.js:131-132)
// untuk mengubah satu cell setelah map termuat. Ia tidak pernah mendekode
// apa pun dari berkas.
const TABEL_SETCELL = '../../src/Renderer/Map/Altitude.js';

// Server mengikuti TYPE_TABLE upstream (keputusan P1). Bila git pull
// upstream mengubah tabel itu, Walkable() di Go menyimpang DIAM-DIAM dan
// klik-mati-senyap kembali: pemain melihat kursor jalan, mengklik, dan
// tidak terjadi apa-apa (§6.3).
const WALKABLE_MENURUT_GO = {
	0: true,   // tanah
	1: false,  // tembok
	2: true,
	3: true,   // air
	4: true,
	5: false,  // hanya bisa ditembus panah
	6: true
};

describe('tabel walkable upstream', () => {
	// Penjaga ini dulu HANYA mengintai Renderer/Map/Altitude.js, dan itu
	// berkas yang salah. Reviewer membuktikannya dengan mutasi: mengubah
	// tipe 6 menjadi NONE di tabel RUNTIME membuat 3.891 cell nyata jadi
	// tidak bisa dilewati di client sementara server masih menganggapnya
	// bisa -- dan suite tetap hijau seluruhnya. Mutasi yang sama pada
	// salinan setCellType menjatuhkan satu tes. Jadi penjaganya bekerja;
	// ia hanya diarahkan ke salinan yang tidak mendekode apa pun.
	//
	// Sekarang KEDUANYA diintai. Test ini hidup di JS karena yang
	// dibacanya JS.
	it('tabel runtime Loaders/Altitude.js cocok dengan Walkable() di Go', () => {
		expect(tabelWalkable(TABEL_RUNTIME)).toEqual(WALKABLE_MENURUT_GO);
	});

	it('salinan setCellType Renderer/Map/Altitude.js cocok dengan Walkable() di Go', () => {
		expect(tabelWalkable(TABEL_SETCELL)).toEqual(WALKABLE_MENURUT_GO);
	});

	it('kedua salinan upstream sepakat satu sama lain', () => {
		// Satu peta harapan melayani keduanya karena hari ini keduanya
		// identik untuk tipe 0-6. Bila upstream membuat keduanya
		// menyimpang, ITU SENDIRI temuan: satu berkas akan mendekode cell
		// dengan aturan yang berbeda dari yang dipakai setCellType untuk
		// menimpanya, dan cell yang sama punya dua jawaban di dalam satu
		// client.
		expect(tabelWalkable(TABEL_RUNTIME)).toEqual(tabelWalkable(TABEL_SETCELL));
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

describe('buatAntrean', () => {
	// Bug yang diperbaiki antrean ini tidak terlihat oleh satu tes pun:
	// MapRenderer.setMap memuat map secara asinkron, dan EntityManager.free()
	// yang berjalan DI DALAM callback-nya menghapus entity yang dibuat
	// EvtSpawn beberapa ratus milidetik SEBELUMNYA. Karena itu logikanya
	// ditaruh di sini -- perbaikan yang sama tak terujinya dengan bugnya
	// tidak membeli apa-apa.

	it('menahan pesan selama map belum siap', () => {
		const a = buatAntrean();
		let jalan = 0;

		a.jalankan(() => jalan++);
		a.jalankan(() => jalan++);

		expect(jalan).toBe(0);
		expect(a.jumlahTertunda()).toBe(2);
	});

	it('menguras dalam urutan tiba, bukan terbalik', () => {
		// Urutan itu SYARAT KEBENARAN, bukan kerapian: spec 5.4 menuntut
		// EvtSpawn tiba sebelum EvtMove untuk entity yang sama. Antrean
		// yang menguras terbalik akan membuang gerak pemain lain persis
		// seperti bug yang sedang diperbaiki.
		const a = buatAntrean();
		const urut = [];

		a.jalankan(() => urut.push('spawn'));
		a.jalankan(() => urut.push('move'));
		a.jalankan(() => urut.push('despawn'));

		expect(a.siapkan()).toBe(3);
		expect(urut).toEqual(['spawn', 'move', 'despawn']);
	});

	it('menjalankan SEGERA sesudah siapkan, bukan mengantre lagi', () => {
		// Bila ini gagal, pesan sesudah map termuat akan menumpuk selamanya
		// dan pemain lain membeku -- kegagalan yang persis sama besarnya
		// dengan yang sedang diperbaiki, hanya arahnya terbalik.
		const a = buatAntrean();
		a.siapkan();

		let jalan = 0;
		a.jalankan(() => jalan++);

		expect(jalan).toBe(1);
		expect(a.jumlahTertunda()).toBe(0);
	});

	it('siapkan dua kali tidak menjalankan ulang apa pun', () => {
		const a = buatAntrean();
		let jalan = 0;
		a.jalankan(() => jalan++);

		expect(a.siapkan()).toBe(1);
		expect(jalan).toBe(1);

		// Kuras kedua atas antrean yang sudah kosong: 0 pesan, dan yang
		// pertama TIDAK dijalankan lagi. Antrean yang lupa mengosongkan
		// `tertunda` akan menggandakan tiap entity di layar.
		expect(a.siapkan()).toBe(0);
		expect(jalan).toBe(1);
	});

	it('siapkan pada antrean kosong mengembalikan 0', () => {
		expect(buatAntrean().siapkan()).toBe(0);
	});

	it('reset membuang yang tertahan dan kembali menahan', () => {
		// Ini yang menutup pergantian map di kemudian hari: EvtMapInfo
		// kedua memanggil reset() sebelum MapRenderer.setMap, jadi pesan
		// untuk map LAMA tidak boleh ikut terkuras ke map BARU.
		const a = buatAntrean();
		let jalan = 0;

		a.jalankan(() => jalan++);
		expect(a.jumlahTertunda()).toBe(1);

		a.reset();
		expect(a.jumlahTertunda()).toBe(0);
		expect(a.siapkan()).toBe(0);
		expect(jalan).toBe(0);
	});

	it('reset sesudah siapkan mengembalikan keadaan menahan', () => {
		// reset() menyetel siap = false lagi. Tanpa itu, map kedua akan
		// menerima EvtSpawn saat EntityManager.free()-nya belum berjalan --
		// bug yang sama persis, hanya pada pergantian map alih-alih pada
		// masuk pertama.
		const a = buatAntrean();
		a.siapkan();

		a.reset();

		let jalan = 0;
		a.jalankan(() => jalan++);
		expect(jalan).toBe(0);
		expect(a.jumlahTertunda()).toBe(1);
	});

	it('dua antrean tidak berbagi keadaan', () => {
		// Pabrik, bukan singleton: keadaan hidup di closure. Bila kelak
		// `siap`/`tertunda` naik ke lingkup modul, tes ini yang jatuh.
		const a = buatAntrean();
		const b = buatAntrean();

		a.jalankan(() => {});
		expect(a.jumlahTertunda()).toBe(1);
		expect(b.jumlahTertunda()).toBe(0);

		b.siapkan();
		expect(a.jumlahTertunda()).toBe(1);
	});

	it('pesan yang diantre membawa datanya sendiri lewat closure', () => {
		// Cara main.js memakainya: jalankan(() => spawnkanLain(sp)). Bila
		// nilai yang tertangkap dibagi antar-callback, seluruh entity yang
		// tertahan akan muncul di posisi entity terakhir.
		const a = buatAntrean();
		const hasil = [];
		for (const id of [7, 8, 9]) {
			a.jalankan(() => hasil.push(id));
		}

		a.siapkan();
		expect(hasil).toEqual([7, 8, 9]);
	});
});

// M6c: EvtSpawn kini membawa hp dan max_hp. Tanpa keduanya, client yang
// baru melihat mob tidak tahu bar darahnya, dan mob yang sudah terluka
// tampak penuh sampai pukulan berikutnya.
describe('decodeSpawn membawa hp', () => {
	it('membaca hp dan maxHp', () => {
		const msg = { spawn: { entityId: 7, x: 1, y: 2, type: 2, job: 1184, hp: 12, maxHp: 30 } };
		const sp = decodeSpawn(msg);
		expect(sp.hp).toBe(12);
		expect(sp.maxHp).toBe(30);
	});

	// Mob ber-HP nol dan mob dari server lama tiba dengan byte yang SAMA:
	// protobuf menghilangkan field bernilai nol dari kawat. Nol adalah
	// jawaban yang benar untuk keduanya, dan Number(undefined) adalah NaN.
	it('hp absen jadi nol, bukan NaN', () => {
		const sp = decodeSpawn({ spawn: { entityId: 7, x: 1, y: 2, type: 2, job: 1184 } });
		expect(sp.hp).toBe(0);
		expect(sp.maxHp).toBe(0);
		expect(Number.isNaN(sp.hp)).toBe(false);
	});
});
