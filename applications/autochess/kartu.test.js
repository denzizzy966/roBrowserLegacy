import { describe, it, expect, vi } from 'vitest';
import { buatKartu, cariBidak, infoBidak, tandaiSpawn, hidup, bidakAutochess, JEDA_KARTU_MS } from './kartu.js';
import { buatKatalog } from './katalog.js';
import { FASE, EFEK_STATUS } from './pesan.js';

const ASAL = { x: 42, y: 41 };
const SKALA = 2;

const katalog = buatKatalog({
	units: {
		wizard: { nama: { id: 'Penyihir', en: 'Wizard' }, tier: 3, origin: 'geffen', kelas: 'elementalist' },
		knight: { nama: { id: 'Ksatria', en: 'Knight' }, tier: 2, origin: 'prontera', kelas: 'vanguard' }
	}
});

function entity(gid, x, y, extra = {}) {
	return {
		GID: gid, ACTION: { DIE: 8 }, action: 0, remove_tick: 0, position: [x, y, 0],
		life: { hp: 100, hp_max: 200 }, ...extra
	};
}

function buatEM(daftar) {
	const peta = new Map(daftar.map((e) => [e.GID, e]));
	return {
		peta,
		get: (id) => peta.get(id) ?? null,
		forEach(cb) {
			for (const e of peta.values()) {
				if (cb(e) === false) {
					break;
				}
			}
		}
	};
}

describe('tandaiSpawn / hidup / bidakAutochess', () => {
	it('menyimpan tim, bintang, dan nama EvtSpawn pada entity', () => {
		const e = {};
		expect(tandaiSpawn(e, { tim: 2, bintang: 3, nama: 'Knight' })).toBe(e);
		expect(e).toMatchObject({ __acTim: 2, __acBintang: 3, __acNama: 'Knight' });
		expect(tandaiSpawn(null, { tim: 2 })).toBeNull();
	});

	it('hidup: false untuk null, aksi DIE, atau remove_tick', () => {
		expect(hidup(null)).toBe(false);
		expect(hidup(entity(1, 0, 0))).toBe(true);
		expect(hidup(entity(1, 0, 0, { action: 8 }))).toBe(false);
		expect(hidup(entity(1, 0, 0, { remove_tick: 55 }))).toBe(false);
	});

	it('bidakAutochess: bertim, atau entity bidak sendiri di snapshot', () => {
		const snap = { state: { saya: { bidak: [{ entityId: 5 }] } } };
		expect(bidakAutochess(entity(9, 0, 0, { __acTim: 2 }), snap)).toBe(true);
		expect(bidakAutochess(entity(5, 0, 0), snap)).toBe(true);
		expect(bidakAutochess(entity(6, 0, 0), snap)).toBe(false);
	});
});

describe('infoBidak', () => {
	it('bidak sendiri: unit dan bintang dari snapshot, HP/SP/status dari entity', () => {
		const e = entity(7, 44, 42, {
			__acNama: 'Wizard', __acBintang: 1, __acSP: 40, __acMaxSP: 100,
			__acStatus: new Set([EFEK_STATUS.RACUN, EFEK_STATUS.BEKU])
		});
		const snap = { state: { saya: { bidak: [{ entityId: 7, unitId: 'wizard', bintang: 2 }] } } };
		expect(infoBidak(e, { snap, katalog })).toEqual({
			entityId: 7, unitId: 'wizard', nama: 'Wizard', sendiri: true, bintang: 2,
			hp: 100, maxHp: 200, sp: 40, maxSp: 100, status: [EFEK_STATUS.BEKU, EFEK_STATUS.RACUN]
		});
	});

	it('bidak lawan: unit dari nama EvtSpawn, bintang dari spawn; creep tanpa unit', () => {
		const lawan = entity(20, 50, 52, { __acTim: 2, __acNama: 'Knight', __acBintang: 3 });
		const info = infoBidak(lawan, { snap: { state: null }, katalog });
		expect(info).toMatchObject({ unitId: 'knight', sendiri: false, bintang: 3, sp: 0, maxSp: 0, status: [] });

		const creep = entity(21, 50, 52, { __acTim: 2, __acNama: 'dracula', life: { hp: -1, hp_max: -1 }, __m2MaxHP: 5200 });
		expect(infoBidak(creep, { snap: {}, katalog })).toMatchObject({ unitId: null, nama: 'dracula', hp: 0, maxHp: 5200 });
	});
});

describe('infoBidak: nama creep menurut bahasa (namaMob)', () => {
	const creep = () => entity(21, 50, 52, { __acTim: 2, __acNama: 'dracula', _job: 1389, life: { hp: 1, hp_max: 2 } });

	it('creep memakai nama mob dari namaMob(entity._job)', () => {
		const namaMob = vi.fn((job) => (job === 1389 ? 'Drakula' : null));
		expect(infoBidak(creep(), { snap: {}, katalog, namaMob })).toMatchObject({ unitId: null, nama: 'Drakula' });
		expect(namaMob).toHaveBeenCalledWith(1389);
	});

	it('namaMob tak tahu (null) atau tidak disuntik -> nama mentah EvtSpawn', () => {
		expect(infoBidak(creep(), { snap: {}, katalog, namaMob: () => null }).nama).toBe('dracula');
		expect(infoBidak(creep(), { snap: {}, katalog }).nama).toBe('dracula');
	});

	it('bidak berunit katalog tidak memakai namaMob', () => {
		const namaMob = vi.fn(() => 'X');
		const lawan = entity(20, 50, 52, { __acTim: 2, __acNama: 'Knight', _job: 5 });
		expect(infoBidak(lawan, { snap: { state: null }, katalog, namaMob }).nama).toBe('Knight');
		expect(namaMob).not.toHaveBeenCalled();
	});
});

describe('cariBidak', () => {
	const sendiri = entity(7, 44.5, 42.5);
	const lawan = entity(20, 50.2, 52.7, { __acTim: 2 });
	const lain = entity(30, 50, 52); // bukan bidak (tanpa tim, bukan milik)
	const snapPersiapan = {
		fase: FASE.PERSIAPAN,
		state: { saya: { bidak: [{ entityId: 7, diPapan: true, kolom: 1, baris: 0 }] } }
	};

	it('entity di bawah kursor (kotak sprite) didahulukan bila ia bidak', () => {
		const EntityManager = buatEM([sendiri, lawan]);
		expect(cariBidak({ EntityManager, snap: {}, over: lawan, petak: null, asal: ASAL, skala: SKALA })).toBe(lawan);
		expect(cariBidak({ EntityManager, snap: {}, over: lain, petak: null, asal: ASAL, skala: SKALA })).toBeNull();
	});

	it('PERSIAPAN: bidak sendiri dari snapshot di petak bawah pointer', () => {
		const EntityManager = buatEM([sendiri]);
		expect(cariBidak({ EntityManager, snap: snapPersiapan, over: null, petak: { kolom: 1, baris: 0 }, asal: ASAL, skala: SKALA })).toBe(sendiri);
	});

	it('TEMPUR: entity bertim yang posisinya jatuh di petak', () => {
		const EntityManager = buatEM([lain, lawan]);
		const snap = { fase: FASE.TEMPUR, state: { saya: { bidak: [] } } };
		// (50.2, 52.7) -> kolom 4, baris 5
		expect(cariBidak({ EntityManager, snap, over: null, petak: { kolom: 4, baris: 5 }, asal: ASAL, skala: SKALA })).toBe(lawan);
		expect(cariBidak({ EntityManager, snap, over: null, petak: { kolom: 0, baris: 0 }, asal: ASAL, skala: SKALA })).toBeNull();
	});

	it('bidak mati diabaikan', () => {
		const mati = entity(22, 50, 52, { __acTim: 2, action: 8 });
		const EntityManager = buatEM([mati]);
		expect(cariBidak({ EntityManager, snap: {}, over: mati, petak: { kolom: 4, baris: 5 }, asal: ASAL, skala: SKALA })).toBeNull();
	});
});

describe('buatKartu (pengendali hover)', () => {
	function siapkan() {
		const a = entity(7, 44, 42, { __acTim: 1, __acNama: 'Wizard' });
		const b = entity(20, 50, 52, { __acTim: 2, __acNama: 'Knight' });
		const EntityManager = buatEM([a, b]);
		let target = null;
		let seret = false;
		const pewaktu = [];
		const jendela = { tampilkan: vi.fn(), sembunyikan: vi.fn() };
		const tunda = vi.fn((fn, ms) => {
			pewaktu.push({ fn, ms, batal: false });
			return pewaktu.length - 1;
		});
		const batalTunda = vi.fn((id) => {
			pewaktu[id].batal = true;
		});
		const kartu = buatKartu({
			EntityManager, ambilSnap: () => ({ state: null }), katalog: () => katalog, jendela,
			cariTarget: () => target, seretAktif: () => seret, tunda, batalTunda
		});
		const jalankanPewaktu = () => pewaktu.filter((p) => !p.batal && !p.jalan).forEach((p) => {
			p.jalan = true;
			p.fn();
		});
		return {
			a, b, EntityManager, kartu, jendela, tunda, pewaktu, jalankanPewaktu,
			arahkan: (e) => { target = e; },
			seret: (v) => { seret = v; }
		};
	}

	it('tampil sesudah pointer diam 250 ms di atas bidak yang sama, di posisi pointer', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 300, clientY: 200 });
		s.kartu.gerak({ clientX: 302, clientY: 201 });
		expect(s.tunda).toHaveBeenCalledTimes(1);
		expect(s.tunda.mock.calls[0][1]).toBe(JEDA_KARTU_MS);
		expect(s.jendela.tampilkan).not.toHaveBeenCalled();
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBe(7);
		expect(s.jendela.tampilkan).toHaveBeenCalledWith(expect.objectContaining({ entityId: 7, unitId: 'wizard' }), { x: 302, y: 201 });
	});

	it('pindah ke bidak lain sebelum 250 ms: jeda diulang untuk bidak baru', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.arahkan(s.b);
		s.kartu.gerak({ clientX: 2, clientY: 2 });
		expect(s.pewaktu[0].batal).toBe(true);
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBe(20);
	});

	it('pointer pergi dari bidak menutup kartu; pergi dari kanvas juga', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.jalankanPewaktu();
		s.arahkan(null);
		s.kartu.gerak({ clientX: 50, clientY: 50 });
		expect(s.kartu.tampil()).toBeNull();
		expect(s.jendela.sembunyikan).toHaveBeenCalledTimes(1);

		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.jalankanPewaktu();
		s.kartu.keluar();
		expect(s.kartu.tampil()).toBeNull();
		expect(s.jendela.sembunyikan).toHaveBeenCalledTimes(2);
	});

	it('keluar sebelum jeda habis: kartu tidak pernah tampil', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.kartu.keluar();
		s.jalankanPewaktu();
		expect(s.jendela.tampilkan).not.toHaveBeenCalled();
	});

	it('tidak tampil selama seret; seret yang dimulai menutup kartu', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.seret(true);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.jalankanPewaktu();
		expect(s.jendela.tampilkan).not.toHaveBeenCalled();

		s.seret(false);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBe(7);
		s.seret(true);
		s.kartu.gerak({ clientX: 5, clientY: 5 });
		expect(s.kartu.tampil()).toBeNull();
	});

	it('pointerdown (sembunyikan) menutup kartu dan membatalkan jeda', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.kartu.sembunyikan();
		s.jalankanPewaktu();
		expect(s.jendela.tampilkan).not.toHaveBeenCalled();
	});

	it('denyut menggambar ulang isi; bidak yang berjalan pergi dari pointer diam menutup kartu', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.jalankanPewaktu();
		s.a.life.hp = 40;
		s.kartu.denyut();
		expect(s.jendela.tampilkan).toHaveBeenLastCalledWith(expect.objectContaining({ hp: 40 }), { x: 1, y: 1 });

		s.arahkan(s.b);
		s.kartu.denyut();
		expect(s.kartu.tampil()).toBeNull();
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBe(20);
	});

	it('pewaktu habis tetapi bidak di bawah pointer berganti: menunggu ulang', () => {
		const s = siapkan();
		s.arahkan(s.a);
		s.kartu.gerak({ clientX: 1, clientY: 1 });
		s.arahkan(s.b);
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBeNull();
		s.jalankanPewaktu();
		expect(s.kartu.tampil()).toBe(20);
	});

	it('denyut tanpa kartu tampil tidak melakukan apa pun', () => {
		const s = siapkan();
		expect(() => s.kartu.denyut()).not.toThrow();
		expect(s.jendela.sembunyikan).not.toHaveBeenCalled();
	});
});
