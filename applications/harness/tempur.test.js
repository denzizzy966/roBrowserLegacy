import { describe, it, expect, beforeAll } from 'vitest';
import { decodeDamage, decodeDeath, decodeItemTanah, decodeItemHilang, persenDarah, encodeSatuField, pilihTerdekat, ringkasProbeSkin, BERKAS_SKIN_DAMAGE, barisHUD, JENIS_NORMAL, JENIS_MISS, JENIS_KRITIKAL, namaMob, hidupkanBar } from './tempur.js';

describe('decodeDamage', () => {
	it('membaca keempat field', () => {
		expect(decodeDamage({ src: 4, dst: 1, amount: 7, hpSisa: 23 }))
			.toEqual({ src: 4, dst: 1, amount: 7, hpSisa: 23, jenis: 0 });
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
		expect(d).toEqual({ src: 1, dst: 2, amount: 0, hpSisa: 0, jenis: 0 });
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

describe('ringkasProbeSkin', () => {
	it('lengkap saat semua berkas ada', () => {
		const r = ringkasProbeSkin([{ nama: 'a', ada: true }, { nama: 'b', ada: true }]);
		expect(r.lengkap).toBe(true);
		expect(r.pesan).toContain('2/2');
	});

	// Pesannya harus MENYEBUT sebab keheningannya, bukan sekadar
	// "gagal": Client.getFiles tidak meneruskan onerror, jadi satu
	// berkas hilang membuat callback tidak pernah dipanggil dan
	// Damage.add diam selamanya tanpa satu pun galat.
	it('menyebut berkas mana yang hilang dan mengapa ia diam', () => {
		const r = ringkasProbeSkin([{ nama: 'a', ada: true }, { nama: 'b.spr', ada: false }]);
		expect(r.lengkap).toBe(false);
		expect(r.pesan).toContain('b.spr');
		expect(r.pesan).toContain('onerror');
		expect(r.pesan).toContain('HUD');
	});
});

describe('BERKAS_SKIN_DAMAGE', () => {
	// Disalin dari Damage.js. Bila salah satu jalur salah ketik, probe
	// akan melaporkan "hilang" untuk berkas yang sebenarnya ada, dan
	// mengirim orang memburu masalah yang tidak ada.
	it('empat berkas, dua di antaranya .spr bernama Korea', () => {
		expect(BERKAS_SKIN_DAMAGE).toHaveLength(4);
		expect(BERKAS_SKIN_DAMAGE.filter((p) => p.endsWith('.act'))).toHaveLength(1);
		for (const p of BERKAS_SKIN_DAMAGE) {
			expect(p.startsWith('data/sprite/')).toBe(true);
		}
	});
});

describe('barisHUD', () => {
	it('memuat kedua id, jumlah, sisa, dan persen', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 7, hpSisa: 23 }, 30);
		expect(s).toContain('6');
		expect(s).toContain('4');
		expect(s).toContain('-7');
		expect(s).toContain('23/30');
		expect(s).toContain('77%');
	});

	it('menandai kematian saat hpSisa nol', () => {
		expect(barisHUD({ src: 6, dst: 4, amount: 7, hpSisa: 0 }, 30)).toContain('MATI');
	});

	// maxHp tidak diketahui (entity yang belum sempat menyimpannya)
	// tidak boleh menghasilkan "23/undefined".
	it('maxHp tidak diketahui tidak menghasilkan undefined', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 7, hpSisa: 23 }, 0);
		expect(s).not.toContain('undefined');
		expect(s).not.toContain('NaN');
	});
});

describe('decodeDamage jenis', () => {
	// Enum protobuf tiba sebagai ANGKA. Nol adalah TIDAK_DIKENAL dan
	// sah, jadi falsy-check akan menelannya -- jebakan yang sama dengan
	// objecttype 0 di M6a.
	it('jenis absen jadi 0 (TIDAK_DIKENAL), bukan undefined', () => {
		expect(decodeDamage({ src: 1, dst: 2, amount: 5, hpSisa: 3 }).jenis).toBe(0);
	});

	it('membaca jenis NORMAL, MISS, dan KRITIKAL', () => {
		expect(decodeDamage({ src: 1, dst: 2, amount: 5, hpSisa: 3, jenis: 1 }).jenis).toBe(JENIS_NORMAL);
		expect(decodeDamage({ src: 1, dst: 2, amount: 0, hpSisa: 3, jenis: 2 }).jenis).toBe(JENIS_MISS);
		expect(decodeDamage({ src: 1, dst: 2, amount: 9, hpSisa: 3, jenis: 3 }).jenis).toBe(JENIS_KRITIKAL);
	});
});

describe('barisHUD jenis', () => {
	it('MISS ditulis MISS, bukan -0', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 0, hpSisa: 30, jenis: JENIS_MISS }, 30);
		expect(s).toContain('MISS');
		expect(s).not.toContain('-0');
	});

	it('KRITIKAL ditandai', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 4, hpSisa: 26, jenis: JENIS_KRITIKAL }, 30);
		expect(s).toContain('KRITIKAL');
		expect(s).toContain('-4');
	});

	it('NORMAL tidak menambah label', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 7, hpSisa: 23, jenis: JENIS_NORMAL }, 30);
		expect(s).not.toContain('MISS');
		expect(s).not.toContain('KRITIKAL');
		expect(s).toContain('-7');
	});

	// Server selalu eksplisit, jadi TIDAK_DIKENAL yang tiba berarti ada
	// yang salah. Ia ditandai alih-alih ditelan sebagai serangan biasa.
	it('TIDAK_DIKENAL ditandai, bukan diperlakukan sebagai normal', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 7, hpSisa: 23, jenis: 0 }, 30);
		expect(s).toContain('?JENIS');
	});

	// MISS pada pukulan yang membunuh tetap mustahil, tapi bila hpSisa
	// nol tiba bersama MISS, penanda MATI tidak boleh hilang.
	it('MISS tetap menampilkan MATI bila hpSisa nol', () => {
		const s = barisHUD({ src: 6, dst: 4, amount: 0, hpSisa: 0, jenis: JENIS_MISS }, 30);
		expect(s).toContain('MISS');
		expect(s).toContain('MATI');
	});
});

describe('namaMob', () => {
	const tabel = { 1002: 'Poring', 1184: 'Fabre' };
	const cari = (job) => tabel[job] ?? 'Unknown';

	it('membaca nama tampilan, bukan nama sprite', () => {
		expect(namaMob(1184, cari)).toBe('Fabre');
		expect(namaMob(1002, cari)).toBe('Poring');
	});

	// 'Unknown' yang berderet identik tidak memberi tahu mob MANA yang
	// tidak dikenal.
	it('job tak dikenal menyebut idnya', () => {
		expect(namaMob(9999, cari)).toBe('?9999');
	});

	it('nama kosong tidak menghasilkan undefined', () => {
		expect(namaMob(7, () => undefined)).toBe('?7');
		expect(namaMob(7, () => '')).toBe('?7');
	});
});

describe('hidupkanBar', () => {
	const bar = () => ({ hp: -1, hp_max: -1, dipanggil: 0, update() { this.dipanggil++; } });

	it('mengisi hp dan hp_max lalu update', () => {
		const l = bar();
		expect(hidupkanBar(l, 23, 30)).toBe(true);
		expect(l.hp).toBe(23);
		expect(l.hp_max).toBe(30);
		expect(l.dipanggil).toBe(1);
	});

	// INI asersi yang menjaga jebakannya. EntityLife.update() menghapus
	// barnya bila hp atau hp_max negatif, dan nilai awalnya -1 -- jadi
	// update() yang dipanggil sebelum keduanya diisi membunuh bar itu
	// TANPA GALAT.
	it('hp dan hp_max terisi SEBELUM update dipanggil', () => {
		const urutan = [];
		const l = {
			_hp: -1, _max: -1,
			set hp(v) { this._hp = v; urutan.push('hp'); },
			get hp() { return this._hp; },
			set hp_max(v) { this._max = v; urutan.push('hp_max'); },
			get hp_max() { return this._max; },
			update() { urutan.push('update'); },
		};
		hidupkanBar(l, 5, 10);
		expect(urutan).toEqual(['hp', 'hp_max', 'update']);
	});

	// maxHp nol berarti datanya belum lengkap. update() akan menghapus
	// barnya diam-diam, jadi lebih baik tidak dipanggil sama sekali dan
	// pemanggil melaporkannya.
	it('maxHp nol atau negatif tidak memanggil update', () => {
		for (const m of [0, -1, undefined, null]) {
			const l = bar();
			expect(hidupkanBar(l, 5, m)).toBe(false);
			expect(l.dipanggil).toBe(0);
		}
	});

	it('hp nol SAH -- mob sekarat tetap menampilkan bar kosong', () => {
		const l = bar();
		expect(hidupkanBar(l, 0, 30)).toBe(true);
		expect(l.hp).toBe(0);
		expect(l.dipanggil).toBe(1);
	});

	it('life yang tidak ada tidak menjatuhkan apa pun', () => {
		expect(hidupkanBar(null, 5, 10)).toBe(false);
		expect(hidupkanBar(undefined, 5, 10)).toBe(false);
	});
});
