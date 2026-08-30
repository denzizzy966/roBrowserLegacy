import { describe, it, expect, beforeAll } from 'vitest';
import { decodeDamage, decodeDeath, decodeItemTanah, decodeItemHilang, persenDarah, encodeSatuField, pilihTerdekat } from './tempur.js';

describe('decodeDamage', () => {
	it('membaca keempat field', () => {
		expect(decodeDamage({ src: 4, dst: 1, amount: 7, hpSisa: 23 }))
			.toEqual({ src: 4, dst: 1, amount: 7, hpSisa: 23 });
	});

	// hpSisa NOL adalah nilai sah -- ia berarti target mati. Falsy-check
	// akan menelannya, dan itu jebakan yang sama persis dengan
	// objecttype 0 di M6a.
	it('tidak menelan hpSisa nol', () => {
		expect(decodeDamage({ src: 1, dst: 2, amount: 5, hpSisa: 0 }).hpSisa).toBe(0);
	});

	// Field protobuf yang absen berarti nol, bukan undefined: server yang
	// mengirim damage 0 dan server yang tidak mengirim field damage sama
	// sekali menghasilkan byte yang identik di kawat.
	it('field absen jadi nol, bukan undefined', () => {
		const d = decodeDamage({ src: 1, dst: 2 });
		expect(d).toEqual({ src: 1, dst: 2, amount: 0, hpSisa: 0 });
	});
});

describe('decodeDeath', () => {
	it('membaca entityId', () => {
		expect(decodeDeath({ entityId: 12 })).toEqual({ entityId: 12 });
	});
});

describe('decodeItemTanah', () => {
	it('membaca keempat field', () => {
		expect(decodeItemTanah({ groundId: 9, namaItem: 'Fluff', x: 150, y: 185 }))
			.toEqual({ groundId: 9, namaItem: 'Fluff', x: 150, y: 185 });
	});

	// Koordinat nol sah: petak (0,0) ada di setiap map.
	it('tidak menelan koordinat nol', () => {
		const it = decodeItemTanah({ groundId: 9, namaItem: 'Fluff', x: 0, y: 0 });
		expect(it.x).toBe(0);
		expect(it.y).toBe(0);
	});

	it('nama absen jadi string kosong, bukan undefined', () => {
		expect(decodeItemTanah({ groundId: 9, x: 1, y: 2 }).namaItem).toBe('');
	});
});

describe('decodeItemHilang', () => {
	it('membaca groundId', () => {
		expect(decodeItemHilang({ groundId: 9 })).toEqual({ groundId: 9 });
	});
});

describe('persenDarah', () => {
	it('menghitung persen bulat', () => {
		expect(persenDarah(30, 30)).toBe(100);
		expect(persenDarah(15, 30)).toBe(50);
		expect(persenDarah(1, 30)).toBe(3);
	});

	// maxHp nol akan menghasilkan NaN atau Infinity tanpa penjaga.
	it('maxHp nol tidak menghasilkan NaN', () => {
		expect(persenDarah(0, 0)).toBe(0);
		expect(persenDarah(5, 0)).toBe(0);
	});

	it('dijepit ke 0..100', () => {
		expect(persenDarah(-5, 30)).toBe(0);
		expect(persenDarah(60, 30)).toBe(100);
	});
});

// Round-trip terhadap skema SUNGGUHAN dari proto/ro.proto.
//
// Cacat "cannot parse invalid wire-format data" yang menghentikan seluruh
// combat M6c akan tertangkap di sini dalam satu detik. Ia lolos karena
// encoder-nya hidup di main.js, yang tidak punya satu tes pun.
describe('encodeSatuField terhadap skema sungguhan', () => {
	let ClientMsg;

	beforeAll(async () => {
		const protobuf = (await import('protobufjs')).default;
		// fileURLToPath, bukan .pathname: di Windows .pathname
		// menghasilkan "/D:/..." yang menjadi "D:\D:\..." saat
		// digabung dengan cwd.
		const { fileURLToPath } = await import('node:url');
		const root = await protobuf.load(
			fileURLToPath(new URL('../../../proto/ro.proto', import.meta.url))
		);
		ClientMsg = root.lookupType('ro.v1.ClientMsg');
	});

	it('CmdAttack bolak-balik utuh', () => {
		const buf = encodeSatuField(ClientMsg, 'attack', { targetId: 1184 });
		const msg = ClientMsg.decode(new Uint8Array(buf));
		expect(msg.attack).toBeTruthy();
		expect(msg.attack.targetId).toBe(1184);
	});

	it('CmdPickup bolak-balik utuh', () => {
		const buf = encodeSatuField(ClientMsg, 'pickup', { groundId: 42 });
		const msg = ClientMsg.decode(new Uint8Array(buf));
		expect(msg.pickup).toBeTruthy();
		expect(msg.pickup.groundId).toBe(42);
	});

	// INI asersi yang menangkap cacat aslinya. Buffer bersama protobufjs
	// jauh lebih besar dari pesannya; mengirimkannya apa adanya membuat
	// server melihat byte tambahan.
	it('ArrayBuffer tepat sebesar pesannya, bukan kolam bersama', () => {
		const buf = encodeSatuField(ClientMsg, 'attack', { targetId: 1 });
		// CmdAttack{target_id:1} di dalam oneof field 2: 4 byte.
		expect(buf.byteLength).toBeLessThanOrEqual(8);
		expect(buf).toBeInstanceOf(ArrayBuffer);
	});

	// Dua encode berturut-turut tidak boleh saling merusak. Buffer bersama
	// protobufjs dipakai ulang, jadi tanpa slice, pesan pertama berubah
	// saat pesan kedua ditulis.
	it('dua encode berturut-turut tidak saling merusak', () => {
		const a = encodeSatuField(ClientMsg, 'attack', { targetId: 111 });
		const b = encodeSatuField(ClientMsg, 'attack', { targetId: 222 });
		expect(ClientMsg.decode(new Uint8Array(a)).attack.targetId).toBe(111);
		expect(ClientMsg.decode(new Uint8Array(b)).attack.targetId).toBe(222);
	});
});

describe('pilihTerdekat', () => {
	const daftar = [{ id: 4, x: 10, y: 10 }, { id: 5, x: 20, y: 20 }];

	it('memilih yang tepat di petaknya', () => {
		expect(pilihTerdekat(daftar, 10, 10)).toBe(4);
	});

	// INI alasan fungsi ini ada. Mob yang MENGEJAR selalu di tengah
	// interpolasi, jadi posisinya pecahan sementara klik dipotong ke
	// bilangan bulat. Kecocokan persis membuatnya nyaris mustahil diklik.
	it('memilih yang bergeser satu petak', () => {
		expect(pilihTerdekat(daftar, 11, 10)).toBe(4);
		expect(pilihTerdekat(daftar, 9, 11)).toBe(4);
	});

	it('menolak yang di luar toleransi', () => {
		expect(pilihTerdekat(daftar, 12, 10)).toBe(null);
		expect(pilihTerdekat(daftar, 15, 15)).toBe(null);
	});

	it('daftar kosong mengembalikan null', () => {
		expect(pilihTerdekat([], 10, 10)).toBe(null);
	});

	// Seri dimenangkan id terkecil: dua mob menumpuk harus menghasilkan
	// pilihan yang sama tiap kali, bukan bergantung urutan daftar.
	it('seri dimenangkan id terkecil', () => {
		const tumpuk = [{ id: 9, x: 5, y: 5 }, { id: 3, x: 5, y: 5 }];
		expect(pilihTerdekat(tumpuk, 5, 5)).toBe(3);
		expect(pilihTerdekat([...tumpuk].reverse(), 5, 5)).toBe(3);
	});

	// Yang lebih dekat menang atas yang sekadar dalam toleransi.
	it('yang lebih dekat menang', () => {
		const dua = [{ id: 9, x: 5, y: 5 }, { id: 3, x: 6, y: 6 }];
		expect(pilihTerdekat(dua, 5, 5)).toBe(9);
	});
});
