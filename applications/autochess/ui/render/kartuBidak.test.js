import { describe, it, expect, vi } from 'vitest';
import { renderKartuBidak } from './kartuBidak.js';
import { buatKartu } from '../../kartu.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks } from '../../teks.js';
import { EFEK_STATUS } from '../../pesan.js';

const STAT = (hp, atk) => ({ hp, atk, matk: 5, def: 6, mdef: 7, aspd: 150, jangkauan: 9, sp_awal: 10, sp_maks: 120, elemen: 'Fire', ukuran: 'Medium', ras: 'Human' });

const katalog = buatKatalog({
	units: {
		wizard: {
			nama: { id: 'Penyihir', en: 'Wizard' }, tier: 3, origin: 'geffen', kelas: 'elementalist',
			stat_bintang: [STAT(1000, 80), STAT(1800, 144), STAT(3200, 260)],
			skill: { id: 'storm', lv: 5, nama: { id: 'Badai Petir', en: 'Lightning Storm' }, ringkasan: { id: 'Sambaran petir area.', en: 'Area lightning.' } }
		},
		tanpa_skill: { nama: { id: 'A', en: 'A' }, tier: 1, origin: 'geffen', kelas: 'vanguard', stat_bintang: [STAT(1, 1), STAT(2, 2), STAT(3, 3)] }
	},
	sinergi: {
		geffen: {
			nama: { id: 'Geffen', en: 'Geffen' }, origin: true, ambang: [2, 4],
			efek: [[{ stat: 'atk', persen: 10, sasaran: 'semua' }], [{ stat: 'hp_max', tambah: 150, sasaran: 'anggota' }]]
		},
		elementalist: { nama: { id: 'Elementalis', en: 'Elementalist' }, ambang: [2], efek: [[{ stat: 'matk', persen: 20, sasaran: 'semua' }]] },
		prontera: { nama: { id: 'Prontera', en: 'Prontera' }, origin: true, ambang: [2], efek: [[{ stat: 'def', tambah: 5, sasaran: 'semua' }]] }
	}
});

function deps(bahasa = 'id', ikon = undefined) {
	const teks = buatTeks({ pref: { bahasa } });
	return { t: teks.t, bahasa, katalog, ikon };
}

const INFO = {
	entityId: 7, unitId: 'wizard', nama: 'Wizard', sendiri: true, bintang: 2,
	hp: 1500, maxHp: 2000, sp: 30, maxSp: 120, status: []
};

describe('renderKartuBidak', () => {
	it('nama sesuai bahasa, Tier, ★, origin dan kelas', () => {
		const id = renderKartuBidak(INFO, deps('id'));
		expect(id).toContain('<div class="nama">Penyihir</div>');
		expect(id).toContain('Tier 3');
		expect(id).toContain('★2');
		expect(id).toContain('Geffen · Elementalis');

		const en = renderKartuBidak(INFO, deps('en'));
		expect(en).toContain('<div class="nama">Wizard</div>');
		expect(en).toContain('Geffen · Elementalist');
	});

	it('angka dan bar HP/SP', () => {
		const h = renderKartuBidak(INFO, deps());
		expect(h).toContain('<span class="angka">1500/2000</span>');
		expect(h).toContain('<span class="angka">30/120</span>');
		expect(h).toMatch(/class="bar hp"><div class="isi-bar" style="width:75%">/);
		expect(h).toMatch(/class="bar sp"><div class="isi-bar" style="width:25%">/);
	});

	it('tanpa SP maks (mob) tidak ada baris SP; HP negatif/NaN jadi 0', () => {
		const h = renderKartuBidak({ ...INFO, maxSp: 0, hp: -5 }, deps());
		expect(h).not.toContain('bar sp');
		expect(h).toContain('<span class="angka">0/2000</span>');
	});

	it('tanpa status: tidak ada baris ikon sama sekali', () => {
		const h = renderKartuBidak(INFO, deps());
		expect(h).not.toContain('status-baris');
		expect(h).not.toContain('data-efst');
	});

	it('satu span per status AKTIF, dengan ikon bila sudah termuat', () => {
		const ikon = vi.fn((efst) => (efst === EFEK_STATUS.BEKU ? 'data:image/png;base64,AAA' : null));
		const h = renderKartuBidak({ ...INFO, status: [EFEK_STATUS.BEKU, EFEK_STATUS.RACUN] }, deps('id', ikon));
		expect(h.match(/class="status[^"]*" data-efst=/g)).toHaveLength(2);
		expect(h).toContain('<span class="status" data-efst="1" title="Beku"><img src="data:image/png;base64,AAA" alt="Beku"></span>');
		// Ikon belum termuat/tidak ada: label teks sebagai cadangan.
		expect(h).toContain('<span class="status tanpa-ikon" data-efst="4" title="Racun">Racun</span>');
		expect(h).not.toContain('data-efst="2"');
	});

	it('bidak lawan tanpa unit katalog (creep): nama EvtSpawn, tanpa tier/sinergi', () => {
		const h = renderKartuBidak({ ...INFO, unitId: null, nama: 'dracula', sendiri: false, bintang: 0 }, deps());
		expect(h).toContain('class="kartu lawan"');
		expect(h).toContain('<div class="nama">dracula</div>');
		expect(h).not.toContain('Tier');
		expect(h).not.toContain('★');
		expect(h).not.toContain('class="sinergi"');
	});

	it('nama di-escape', () => {
		expect(renderKartuBidak({ ...INFO, unitId: null, nama: '<b>x</b>' }, deps())).toContain('&lt;b&gt;x&lt;/b&gt;');
	});
});

describe('K5/K17: statistik, skill, bonus sinergi', () => {
	it('statistik 1★ berbeda dari 2★ menurut katalog; elemen/ukuran/ras satu baris', () => {
		const satu = renderKartuBidak({ ...INFO, bintang: 1 }, deps());
		const dua = renderKartuBidak({ ...INFO, bintang: 2 }, deps());
		expect(satu).toContain('data-stat="hp"><span class="stat-nama">HP</span><span class="stat-nilai">1000</span>');
		expect(satu).toContain('data-stat="atk"><span class="stat-nama">ATK</span><span class="stat-nilai">80</span>');
		expect(dua).toContain('<span class="stat-nilai">1800</span>');
		expect(dua).toContain('<span class="stat-nilai">144</span>');
		expect(satu).not.toContain('1800');
		expect(satu.match(/data-stat=/g)).toHaveLength(8);
		expect(satu).toContain('<div class="stat-kecil">Fire · Medium · Human</div>');
	});

	it('creep (stat null): tanpa blok statistik, skill, bonus, dan tanpa galat', () => {
		const h = renderKartuBidak({ ...INFO, unitId: null, nama: 'dracula', sendiri: false, bintang: 0 }, { ...deps(), sinergiAktif: [{ id: 'geffen', jumlah: 3, tingkatAktif: 1 }] });
		expect(h).not.toContain('class="stat"');
		expect(h).not.toContain('class="skill');
		expect(h).not.toContain('bonus');
	});

	it('baris skill ID/EN dengan ringkasan; tanpa skill tidak ada baris', () => {
		expect(renderKartuBidak(INFO, deps('id'))).toContain('Badai Petir (Lv 5)');
		expect(renderKartuBidak(INFO, deps('id'))).toContain('<div class="skill-ringkas">Sambaran petir area.</div>');
		const en = renderKartuBidak(INFO, deps('en'));
		expect(en).toContain('Lightning Storm (Lv 5)');
		expect(en).toContain('Area lightning.');
		expect(renderKartuBidak({ ...INFO, unitId: 'tanpa_skill' }, deps())).not.toContain('class="skill');
	});

	it('bonus sinergi hanya bila aktif DAN mencakup unit ini', () => {
		const aktif = [
			{ id: 'geffen', jumlah: 3, tingkatAktif: 1, origin: true },
			{ id: 'prontera', jumlah: 2, tingkatAktif: 1, origin: true },
			{ id: 'elementalist', jumlah: 1, tingkatAktif: 0, origin: false }
		];
		const h = renderKartuBidak(INFO, { ...deps(), sinergiAktif: aktif });
		expect(h).toContain('<div class="bonus">+10% ATK — Geffen 3</div>');
		expect(h).not.toContain('Prontera');
		expect(h).not.toContain('+20% MATK');
		const dua = renderKartuBidak(INFO, { ...deps('en'), sinergiAktif: [{ id: 'geffen', jumlah: 4, tingkatAktif: 2 }] });
		expect(dua).toContain('+150 Max HP — Geffen 4');
		expect(renderKartuBidak(INFO, deps())).not.toContain('bonus');
	});

	it("sumber 'toko': tanpa bar HP/SP, statistik tetap ada; 'bangku' berbar", () => {
		const toko = renderKartuBidak({ ...INFO, bintang: 1, sumber: 'toko', hp: 0, maxHp: 0, maxSp: 0 }, deps());
		expect(toko).not.toContain('class="bar');
		expect(toko).toContain('class="stat"');
		expect(renderKartuBidak({ ...INFO, sumber: 'bangku' }, deps())).toContain('class="bar hp"');
	});
});

/**
 * Review Focus 4: bidak mati atau despawn di tengah hover menutup kartu
 * tanpa galat; status yang kedaluwarsa menghapus ikonnya.
 */
describe('Review Focus 4: kartu saat entity hilang atau status lepas', () => {
	function siapkan() {
		const peta = new Map();
		const entity = {
			GID: 7, ACTION: { DIE: 8 }, action: 0, remove_tick: 0, position: [44, 42, 0],
			life: { hp: 1500, hp_max: 2000 }, __acSP: 30, __acMaxSP: 120,
			__acTim: 1, __acNama: 'Wizard', __acBintang: 2, __acStatus: new Set([EFEK_STATUS.BEKU])
		};
		peta.set(7, entity);
		const EntityManager = { get: (id) => peta.get(id) ?? null, forEach: () => {} };
		const snap = { fase: 3, state: { saya: { bidak: [{ bidakId: 1, entityId: 7, unitId: 'wizard', bintang: 2, diPapan: true }] } } };
		let html = null;
		const jendela = {
			tampilkan: vi.fn((info) => {
				html = renderKartuBidak(info, deps('id', () => 'data:ikon'));
			}),
			sembunyikan: vi.fn(() => {
				html = null;
			})
		};
		const pewaktu = [];
		const kartu = buatKartu({
			EntityManager, ambilSnap: () => snap, katalog, jendela,
			cariTarget: () => peta.get(7) ?? null,
			tunda: (fn) => pewaktu.push(fn), batalTunda: () => {}
		});
		kartu.gerak({ clientX: 100, clientY: 100 });
		pewaktu.splice(0).forEach((fn) => fn());
		return { peta, entity, kartu, jendela, html: () => html };
	}

	it('status yang lepas menghapus span ikonnya pada denyut berikutnya', () => {
		const { entity, kartu, html } = siapkan();
		expect(kartu.tampil()).toBe(7);
		expect(html()).toContain('data-efst="1"');
		entity.__acStatus.delete(EFEK_STATUS.BEKU);
		kartu.denyut();
		expect(html()).not.toContain('data-efst');
		expect(html()).not.toContain('status-baris');
	});

	it('despawn (entity hilang dari EntityManager) menutup kartu tanpa galat', () => {
		const { peta, kartu, jendela, html } = siapkan();
		peta.delete(7);
		expect(() => kartu.denyut()).not.toThrow();
		expect(jendela.sembunyikan).toHaveBeenCalledTimes(1);
		expect(kartu.tampil()).toBeNull();
		expect(html()).toBeNull();
		// Denyut berikutnya diam.
		kartu.denyut();
		expect(jendela.sembunyikan).toHaveBeenCalledTimes(1);
	});

	it('bidak mati (aksi DIE) menutup kartu', () => {
		const { entity, kartu, jendela } = siapkan();
		entity.action = entity.ACTION.DIE;
		kartu.denyut();
		expect(jendela.sembunyikan).toHaveBeenCalled();
		expect(kartu.tampil()).toBeNull();
	});

	it('identitas GID: cariTarget masih menemukan entity LAMA (basi), tetapi GID sudah milik entity lain -> tutup', () => {
		const peta = new Map();
		const lama = {
			GID: 7, ACTION: { DIE: 8 }, action: 0, remove_tick: 0, position: [44, 42, 0],
			life: { hp: 10, hp_max: 20 }, __acTim: 1, __acNama: 'Wizard', __acBintang: 1, __acStatus: new Set()
		};
		peta.set(7, lama);
		const EntityManager = { get: (id) => peta.get(id) ?? null, forEach: () => {} };
		const jendela = { tampilkan: vi.fn(), sembunyikan: vi.fn() };
		const pewaktu = [];
		const kartu = buatKartu({
			EntityManager, ambilSnap: () => ({ state: null }), katalog: buatKatalog({}), jendela,
			cariTarget: () => lama, // pencarian per petak/getOverEntity masih mengembalikan objek lama
			tunda: (fn) => pewaktu.push(fn), batalTunda: () => {}
		});
		kartu.gerak({ clientX: 1, clientY: 1 });
		pewaktu.splice(0).forEach((fn) => fn());
		expect(kartu.tampil()).toBe(7);
		peta.set(7, { ...lama }); // GID dipakai ulang oleh entity baru
		kartu.denyut();
		expect(kartu.tampil()).toBeNull();
		expect(jendela.sembunyikan).toHaveBeenCalledTimes(1);
	});

	it('GID dipakai ulang oleh entity baru (map dimuat ulang) menutup kartu lama', () => {
		const { peta, entity, kartu } = siapkan();
		peta.set(7, { ...entity, __acStatus: new Set() });
		kartu.denyut();
		expect(kartu.tampil()).toBeNull();
	});
});
