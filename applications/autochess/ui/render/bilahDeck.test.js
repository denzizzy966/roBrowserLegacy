import { describe, it, expect } from 'vitest';
import { renderBilahDeck, persen } from './bilahDeck.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks, formatZeny } from '../../teks.js';

const katalog = buatKatalog({ ekonomi: { refresh: 2, beli_exp: { harga: 5, exp: 4 }, level_maks: 10, hp_kursi: 100 } });
const depsID = { t: buatTeks().t, katalog, formatZeny };
const depsEN = { t: buatTeks({ pref: { bahasa: 'en' } }).t, katalog, formatZeny };

function snap(saya = {}, kursi = {}, ekstra = {}) {
	return {
		state: {
			saya: {
				kursi: 1, zeny: 1234, level: 4, exp: 6, expBerikut: 24, kapasitas: 4,
				bidak: [{ diPapan: true }, { diPapan: true }, { diPapan: false }], ...saya
			},
			kursi: [
				{ kursi: 0, nama: 'Bot', hp: 100, level: 3, bot: true, hidup: true, streak: 0 },
				{ kursi: 1, nama: 'Anda', hp: 73, level: 4, bot: false, hidup: true, streak: 2, ...kursi }
			]
		},
		fase: 1, ronde: 5, hasilTerakhir: null, selesai: null, ...ekstra
	};
}

/** Teks tanpa tag (spasi dirapatkan). */
const polos = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('renderBilahDeck', () => {
	it('angka HP/Lv/EXP/Zeny/Kapasitas dari snapshot (ID)', () => {
		const h = renderBilahDeck(snap(), depsID);
		expect(polos(h)).toBe('HP 73 Lv. 4 6/24 Beli EXP 5z 1,234 Papan 2/4');
		expect(h).toContain('title="HP 73/100"');
		expect(h).toContain('title="EXP 6/24"');
		expect(h).toContain('title="2/4 bidak"');
	});

	it('bahasa EN', () => {
		const h = renderBilahDeck(snap(), depsEN);
		expect(polos(h)).toBe('HP 73 Lv. 4 6/24 Buy EXP 5z 1,234 Board 2/4');
		expect(h).toContain('title="2/4 units"');
	});

	it('HP kursi dari kursi[saya], bukan kursi lain; lebar bar = hp / ekonomi.hp_kursi', () => {
		expect(renderBilahDeck(snap(), depsID)).toContain('<div class="bar bar-hp"><div style="width:73%"></div></div>');
		expect(renderBilahDeck(snap({}, { hp: 100 }), depsID)).toContain('bar-hp"><div style="width:100%"');
		expect(renderBilahDeck(snap({}, { hp: 0 }), depsID)).toContain('bar-hp"><div style="width:0%"');
		// HP rendah (<= 30%) diberi kelas `rendah`.
		expect(renderBilahDeck(snap({}, { hp: 30 }), depsID)).toContain('class="sel hp rendah"');
		expect(renderBilahDeck(snap(), depsID)).toContain('class="sel hp"');
	});

	it('bar EXP dari exp/expBerikut; MAX di level_maks', () => {
		expect(renderBilahDeck(snap(), depsID)).toContain('bar-exp"><div style="width:25%"');
		const maks = renderBilahDeck(snap({ level: 10, expBerikut: 0 }), depsID);
		expect(maks).toContain('MAX');
		expect(maks).toContain('bar-exp"><div style="width:100%"');
		expect(maks).toMatch(/data-aksi="beli-exp"[^>]*disabled/);
	});

	it('tombol Beli EXP aktif di semua fase (K1), mati bila Zeny kurang, selesai, atau tersingkir', () => {
		for (const fase of [1, 2, 3]) {
			expect(renderBilahDeck(snap({}, {}, { fase }), depsID)).not.toMatch(/data-aksi="beli-exp"[^>]*disabled/);
		}
		expect(renderBilahDeck(snap({ zeny: 4 }), depsID)).toMatch(/data-aksi="beli-exp"[^>]*disabled/);
		expect(renderBilahDeck(snap({}, {}, { selesai: { peringkatSaya: 2 } }), depsID)).toMatch(/data-aksi="beli-exp"[^>]*disabled/);
		expect(renderBilahDeck(snap({}, { hidup: false }), depsID)).toMatch(/data-aksi="beli-exp"[^>]*disabled/);
	});

	it('kapasitas penuh diberi kelas penuh', () => {
		expect(renderBilahDeck(snap({ kapasitas: 2 }), depsID)).toContain('class="sel kapasitas penuh"');
		expect(renderBilahDeck(snap(), depsID)).toContain('class="sel kapasitas"');
	});

	it('tanpa state: nol semua, tombol mati', () => {
		const h = renderBilahDeck({ state: null, fase: 0 }, depsID);
		expect(polos(h)).toBe('HP 0 Lv. 1 0/0 Beli EXP 5z 0 Papan 0/0');
		expect(h).toMatch(/data-aksi="beli-exp"[^>]*disabled/);
	});

	it('persen dijepit 0..100 dan aman untuk maks 0', () => {
		expect(persen(5, 0)).toBe(0);
		expect(persen(150, 100)).toBe(100);
		expect(persen(-3, 100)).toBe(0);
		expect(persen(1, 3)).toBe(33);
	});
});
