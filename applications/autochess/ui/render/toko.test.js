import { describe, it, expect } from 'vitest';
import { renderToko, WARNA_KELAS } from './toko.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks, formatZeny } from '../../teks.js';

// Katalog kecil berbentuk /catur/katalog.json.
const katalog = buatKatalog({
	units: {
		poring:  { nama: { id: 'Poring', en: 'Poring' }, tier: 1, harga: 1, origin: 'poring', kelas: 'wonder', sprite: { tipe: 'mob', id: 1002 } },
		archer:  { nama: { id: 'Pemanah', en: 'Archer' }, tier: 2, harga: 2, origin: 'payon', kelas: 'sharpshooter', sprite: { tipe: 'pc', job: 3, sex: 1, senjata: 11 } },
		wizard:  { nama: { id: 'Penyihir', en: 'Wizard' }, tier: 3, harga: 3, origin: 'geffen', kelas: 'elementalist', sprite: { tipe: 'pc', job: 9, sex: 1, senjata: 10 } }
	},
	sinergi: {
		poring: { nama: { id: 'Keluarga Poring', en: 'Poring Kin' } },
		payon: { nama: { id: 'Hutan Suci Payon', en: 'Payon Forest' } },
		geffen: { nama: { id: 'Penyihir Geffen', en: 'Geffen Arcane' } },
		wonder: { nama: { id: 'Petualang Ajaib', en: 'Wonder' } },
		sharpshooter: { nama: { id: 'Penembak Jitu', en: 'Sharpshooter' } },
		elementalist: { nama: { id: 'Ahli Sihir Elemen', en: 'Elementalist' } }
	},
	lore: { origin: { poring: { color: '#ffa8a8' }, payon: { color: '#69db7c' }, geffen: { color: '#cc5de8' } } },
	peluang: { 2: [70, 30, 0, 0, 0], 3: [60, 35, 5, 0, 0] },
	ekonomi: { refresh: 2, beli_exp: { harga: 5, exp: 4 } }
});

const id = buatTeks();
const en = buatTeks({ pref: { bahasa: 'en' } });
const depsID = { t: id.t, bahasa: 'id', katalog, formatZeny };
const depsEN = { t: en.t, bahasa: 'en', katalog, formatZeny };

const TOKO = [
	{ slot: 0, unitId: 'poring', harga: 1 },
	{ slot: 1, unitId: 'archer', harga: 2 },
	{ slot: 2, unitId: 'wizard', harga: 3 },
	{ slot: 3, unitId: '', harga: 0 },
	{ slot: 4, unitId: 'archer', harga: 2 }
];

function snap(saya = {}, ekstra = {}) {
	return {
		state: { saya: { zeny: 2, level: 2, kunci: false, toko: TOKO, ...saya } },
		fase: 1, ronde: 2, hasilTerakhir: null, selesai: null, ...ekstra
	};
}

/** Potongan HTML satu kartu menurut data-slot. */
function kartuSlot(h, slot) {
	const m = h.match(new RegExp(`<div class="kartu[^"]*" data-slot="${slot}"[^>]*>`));
	return m ? m[0] : null;
}

describe('renderToko', () => {
	it('selalu lima kartu, masing-masing dengan data-slot', () => {
		const h = renderToko(snap(), depsID);
		expect(h.match(/class="kartu[ "]/g)).toHaveLength(5);
		for (let i = 0; i < 5; i++) {
			expect(kartuSlot(h, i)).not.toBeNull();
		}
	});

	it('kartu berpotret: kanvas 96x110 dengan data-unit', () => {
		const h = renderToko(snap(), depsID);
		expect(h.match(/<canvas class="potret"/g)).toHaveLength(4);
		expect(h).toContain('<canvas class="potret" data-unit="wizard" width="96" height="110">');
	});

	it('data-aksi="beli" hanya pada kartu yang terjangkau di PERSIAPAN', () => {
		const h = renderToko(snap({ zeny: 2 }), depsID);
		expect(kartuSlot(h, 0)).toContain('data-aksi="beli" data-arg="0"');
		expect(kartuSlot(h, 1)).toContain('data-aksi="beli" data-arg="1"');
		// Wizard 3z > 2 Zeny.
		expect(kartuSlot(h, 2)).not.toContain('data-aksi');
		expect(kartuSlot(h, 2)).toContain('nonaktif');
		expect(kartuSlot(h, 0)).not.toContain('nonaktif');
	});

	it('semua kartu nonaktif di luar PERSIAPAN atau sesudah selesai', () => {
		for (const s of [snap({ zeny: 99 }, { fase: 2 }), snap({ zeny: 99 }, { selesai: { peringkatSaya: 1 } })]) {
			const h = renderToko(s, depsID);
			expect(h).not.toContain('data-aksi="beli"');
			expect(h).toContain('data-aksi="kunci"');
			expect(h).toMatch(/data-aksi="kunci"[^>]*disabled/);
			expect(h).toMatch(/data-aksi="refresh"[^>]*disabled/);
		}
	});

	it('slot kosong: .kartu.kosong dengan label Kosong, tanpa aksi', () => {
		const h = renderToko(snap(), depsID);
		const k = kartuSlot(h, 3);
		expect(k).toContain('kartu kosong');
		expect(k).not.toContain('data-aksi');
		expect(h).toContain('Kosong');
	});

	it('slot yang tidak dikirim server tetap digambar kosong', () => {
		const h = renderToko(snap({ toko: [] }), depsID);
		expect(h.match(/kartu kosong/g)).toHaveLength(5);
	});

	it('nama, harga berformat, dan lencana origin/kelas berwarna', () => {
		const h = renderToko(snap(), depsID);
		expect(h).toContain('>Pemanah<');
		expect(h).toContain('<span class="ikon-zeny"></span>2</div>');
		expect(h).toContain('<span class="lencana origin" style="color:#69db7c;border-color:#69db7c">Hutan Suci Payon</span>');
		expect(h).toContain(`<span class="lencana kelas" style="color:${WARNA_KELAS.sharpshooter};border-color:${WARNA_KELAS.sharpshooter}">Penembak Jitu</span>`);
		expect(h).toContain('tier-3');
	});

	it('bahasa EN: nama unit dan sinergi dalam bahasa Inggris', () => {
		const h = renderToko(snap(), depsEN);
		expect(h).toContain('>Archer<');
		expect(h).toContain('Payon Forest');
		expect(h).toContain('Sharpshooter');
		expect(h).toContain('Empty');
		expect(h).not.toContain('Pemanah');
	});

	it('tombol kunci: teks Kunci/arg 1 saat terbuka, Buka/arg 0 saat terkunci', () => {
		const buka = renderToko(snap({ kunci: false }), depsID);
		expect(buka).toContain('data-aksi="kunci" data-arg="1"');
		expect(buka).toContain('>Kunci<');
		const kunci = renderToko(snap({ kunci: true }), depsID);
		expect(kunci).toContain('data-aksi="kunci" data-arg="0"');
		expect(kunci).toContain('>Buka<');
		expect(renderToko(snap({ kunci: true }), depsEN)).toContain('>Unlock<');
	});

	it('tombol refresh membawa harga dari ekonomi dan mati bila Zeny kurang', () => {
		const h = renderToko(snap({ zeny: 2 }), depsID);
		expect(h).toContain('data-aksi="refresh"');
		expect(h).toContain('2z');
		expect(h).not.toMatch(/data-aksi="refresh"[^>]*disabled/);
		expect(renderToko(snap({ zeny: 1 }), depsID)).toMatch(/data-aksi="refresh"[^>]*disabled/);
	});

	it('baris peluang lima tier dan Lv dari level pemain', () => {
		const h = renderToko(snap({ level: 2 }), depsID);
		expect(h.replace(/<[^>]+>/g, '')).toContain('T1 70% · T2 30% · T3 0% · T4 0% · T5 0%');
		expect(h).toContain('Lv. 2');
		const h3 = renderToko(snap({ level: 3 }), depsID).replace(/<[^>]+>/g, '');
		expect(h3).toContain('T1 60% · T2 35% · T3 5%');
		expect(h3).toContain('Lv. 3');
	});

	it('nama dari katalog diloloskan', () => {
		const jahat = buatKatalog({ units: { x: { nama: { id: '<b>x</b>' }, tier: 1 } } });
		const h = renderToko(snap({ toko: [{ slot: 0, unitId: 'x', harga: 1 }] }), { ...depsID, katalog: jahat });
		expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
		expect(h).not.toContain('<b>x</b>');
	});

	it('tanpa state: lima kartu kosong, tanpa aksi beli', () => {
		const h = renderToko({ state: null, fase: 0 }, depsID);
		expect(h.match(/kartu kosong/g)).toHaveLength(5);
		expect(h).not.toContain('data-aksi="beli"');
	});
});
