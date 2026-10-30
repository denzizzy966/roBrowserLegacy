import { describe, it, expect, vi } from 'vitest';
import { renderToko, tandaKartu, WARNA_KELAS } from './toko.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks, formatZeny } from '../../teks.js';
import { ikatAksi, argKunci } from '../../ui.js';

// Katalog kecil berbentuk /catur/katalog.json.
const katalog = buatKatalog({
	units: {
		poring:  { nama: { id: 'Poring', en: 'Poring' }, tier: 1, harga: 1, origin: 'poring', kelas: 'wonder', sprite: { tipe: 'mob', id: 1002 } },
		archer:  { nama: { id: 'Pemanah', en: 'Archer' }, tier: 2, harga: 2, origin: 'payon', kelas: 'sharpshooter', sprite: { tipe: 'pc', job: 3, sex: 1, senjata: 11 } },
		wizard:  { nama: { id: 'Penyihir', en: 'Wizard' }, tier: 3, harga: 3, origin: 'geffen', kelas: 'elementalist', sprite: { tipe: 'pc', job: 9, sex: 1, senjata: 10 } },
		hunter:  { nama: { id: 'Pemburu', en: 'Hunter' }, tier: 3, harga: 3, origin: 'payon', kelas: 'sharpshooter', sprite: { tipe: 'pc', job: 11, sex: 1, senjata: 11 } }
	},
	sinergi: {
		poring: { nama: { id: 'Keluarga Poring', en: 'Poring Kin' }, ambang: [2, 4] },
		payon: { nama: { id: 'Hutan Suci Payon', en: 'Payon Forest' }, ambang: [2, 4] },
		geffen: { nama: { id: 'Penyihir Geffen', en: 'Geffen Arcane' }, ambang: [3, 6] },
		wonder: { nama: { id: 'Petualang Ajaib', en: 'Wonder' }, ambang: [1] },
		sharpshooter: { nama: { id: 'Penembak Jitu', en: 'Sharpshooter' }, ambang: [2, 4] },
		elementalist: { nama: { id: 'Ahli Sihir Elemen', en: 'Elementalist' }, ambang: [2, 4] }
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
	{ slot: 0, unitId: 'poring', harga: 1, terkunci: false },
	{ slot: 1, unitId: 'archer', harga: 2, terkunci: false },
	{ slot: 2, unitId: 'wizard', harga: 3, terkunci: false },
	{ slot: 3, unitId: '', harga: 0, terkunci: false },
	{ slot: 4, unitId: 'archer', harga: 2, terkunci: false }
];

function snap(saya = {}, ekstra = {}) {
	return {
		state: {
			saya: { kursi: 0, zeny: 2, level: 2, kunci: false, toko: TOKO, bidak: [], sinergi: [], ...saya },
			kursi: [{ kursi: 0, nama: 'Anda', hp: 100, level: 2, bot: false, hidup: true, streak: 0 }]
		},
		fase: 1, ronde: 2, hasilTerakhir: null, selesai: null, ...ekstra
	};
}

/** Satu bidak 1★ (papan atau bangku). */
function bidak(unitId, { bintang = 1, diPapan = false } = {}) {
	return { bidakId: Math.floor(Math.random() * 1e6), unitId, bintang, diPapan, kolom: 0, baris: 0, entityId: 0 };
}

/** Potongan HTML satu kartu menurut data-slot (sampai kartu berikutnya). */
function kartuSlot(h, slot) {
	const awal = h.search(new RegExp(`<div class="kartu[^"]*" data-slot="${slot}"`));
	if (awal < 0) {
		return null;
	}
	const sisa = h.slice(awal + 1);
	const akhir = sisa.search(/<div class="kartu[ "]/);
	return h.slice(awal, akhir < 0 ? undefined : awal + 1 + akhir);
}

/** Tag pembuka kartu menurut data-slot. */
function tagKartu(h, slot) {
	const m = h.match(new RegExp(`<div class="kartu[^"]*" data-slot="${slot}"[^>]*>`));
	return m ? m[0] : null;
}

describe('tandaKartu', () => {
	const archer = { slot: 1, unitId: 'archer', harga: 2 };

	// Ruling T5: GABUNG = punya % 3 === 2 (bukan n === 2 literal K6), supaya
	// tanda tetap benar saat salinan tertunda menumpuk selama TEMPUR.
	it.each([[0, false], [1, false], [2, true], [3, false], [4, false], [5, true]])('%i salinan 1★ -> gabung %s (punya %% 3 === 2)', (n, gabung) => {
		const milik = Array.from({ length: n }, (_, i) => bidak('archer', { diPapan: i === 0 }));
		const t = tandaKartu(snap({ bidak: milik }), archer, katalog);
		expect(t.punya).toBe(n);
		expect(t.gabung).toBe(gabung);
	});

	it('salinan 2★ dan unit lain tidak dihitung', () => {
		const t = tandaKartu(snap({ bidak: [bidak('archer', { bintang: 2 }), bidak('wizard'), bidak('archer')] }), archer, katalog);
		expect(t.punya).toBe(1);
		expect(t.gabung).toBe(false);
	});

	it('slot kosong atau tanpa state: tanpa tanda', () => {
		expect(tandaKartu(snap(), { slot: 3, unitId: '' }, katalog)).toEqual({ punya: 0, gabung: false, sinergiSorot: [] });
		expect(tandaKartu({ state: null }, archer, katalog)).toEqual({ punya: 0, gabung: false, sinergiSorot: [] });
	});

	it('sorot = sinergi aktif ∪ sinergi yang tinggal satu unit dari ambang berikut', () => {
		// payon aktif (2/2), sharpshooter 1/2 (tinggal satu), geffen 1/3 (kurang dua).
		const sinergi = [
			{ id: 'payon', jumlah: 2, tingkatAktif: 1, origin: true },
			{ id: 'sharpshooter', jumlah: 1, tingkatAktif: 0, origin: false },
			{ id: 'geffen', jumlah: 1, tingkatAktif: 0, origin: true }
		];
		const s = snap({ sinergi, bidak: [bidak('hunter', { diPapan: true })] });
		expect(tandaKartu(s, archer, katalog).sinergiSorot).toEqual(['payon', 'sharpshooter']);
		expect(tandaKartu(s, { slot: 2, unitId: 'wizard' }, katalog).sinergiSorot).toEqual([]);
		// wonder ambang [1], jumlah 0: satu unit lagi mengaktifkannya.
		expect(tandaKartu(s, { slot: 0, unitId: 'poring' }, katalog).sinergiSorot).toEqual(['wonder']);
	});

	it('tinggal satu tidak berlaku bila unit itu sudah di papan (server menghitung id unik)', () => {
		const sinergi = [{ id: 'sharpshooter', jumlah: 1, tingkatAktif: 0, origin: false }, { id: 'payon', jumlah: 1, tingkatAktif: 0, origin: true }];
		const s = snap({ sinergi, bidak: [bidak('archer', { diPapan: true })] });
		expect(tandaKartu(s, archer, katalog).sinergiSorot).toEqual([]);
		// Hanya di bangku: masih menambah sinergi bila ditaruh.
		const bangku = snap({ sinergi, bidak: [bidak('archer')] });
		expect(tandaKartu(bangku, archer, katalog).sinergiSorot).toEqual(['payon', 'sharpshooter']);
	});
});

describe('renderToko', () => {
	it('selalu lima kartu, masing-masing dengan data-slot', () => {
		const h = renderToko(snap(), depsID);
		expect(h.match(/class="kartu[ "]/g)).toHaveLength(5);
		for (let i = 0; i < 5; i++) {
			expect(tagKartu(h, i)).not.toBeNull();
		}
	});

	it('kartu berpotret: kanvas 72x84 dengan data-unit (tampil 60x70 lewat CSS)', () => {
		const h = renderToko(snap(), depsID);
		expect(h.match(/<canvas class="potret"/g)).toHaveLength(4);
		expect(h).toContain('<canvas class="potret" data-unit="wizard" width="72" height="84">');
	});

	it('data-aksi="beli" hanya pada kartu yang terjangkau', () => {
		const h = renderToko(snap({ zeny: 2 }), depsID);
		expect(tagKartu(h, 0)).toContain('data-aksi="beli" data-arg="0"');
		expect(tagKartu(h, 1)).toContain('data-aksi="beli" data-arg="1"');
		// Wizard 3z > 2 Zeny.
		expect(tagKartu(h, 2)).not.toContain('data-aksi');
		expect(tagKartu(h, 2)).toContain('nonaktif');
		expect(tagKartu(h, 0)).not.toContain('nonaktif');
	});

	it('AC6 O1/K1: kartu, Refresh, dan gembok tetap aktif saat TEMPUR dan HASIL', () => {
		for (const fase of [2, 3]) {
			const h = renderToko(snap({ zeny: 99 }, { fase }), depsID);
			expect(tagKartu(h, 2)).toContain('data-aksi="beli" data-arg="2"');
			expect(h).not.toMatch(/data-aksi="refresh"[^>]*disabled/);
			expect(h).not.toMatch(/data-aksi="kunci"[^>]*disabled/);
		}
	});

	it('semua mati sesudah selesai atau bila kursi sendiri tersingkir', () => {
		const tersingkir = snap({ zeny: 99 });
		tersingkir.state.kursi[0].hidup = false;
		for (const s of [snap({ zeny: 99 }, { selesai: { peringkatSaya: 1 } }), tersingkir]) {
			const h = renderToko(s, depsID);
			expect(h).not.toContain('data-aksi="beli"');
			expect(h).toMatch(/data-aksi="kunci"[^>]*disabled/);
			expect(h).toMatch(/data-aksi="refresh"[^>]*disabled/);
		}
	});

	it('slot kosong: .kartu.kosong dengan label Kosong, tanpa aksi dan tanpa gembok', () => {
		const h = renderToko(snap(), depsID);
		const k = kartuSlot(h, 3);
		expect(k).toContain('kartu kosong');
		expect(k).not.toContain('data-aksi');
		expect(h).toContain('Kosong');
		expect(h.match(/class="gembok/g)).toHaveLength(4);
	});

	it('slot yang tidak dikirim server tetap digambar kosong', () => {
		const h = renderToko(snap({ toko: [] }), depsID);
		expect(h.match(/kartu kosong/g)).toHaveLength(5);
	});

	it('nama, harga berformat, dan lencana origin/kelas berwarna', () => {
		const h = renderToko(snap(), depsID);
		expect(h).toContain('>Pemanah<');
		expect(h).toContain('<span class="harga"><span class="ikon-zeny"></span>2</span>');
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

	it('gembok per kartu: terbuka -> data-arg 1; terkunci -> gembok tertutup, data-arg 0, kartu .terkunci', () => {
		const toko = TOKO.map((s) => (s.slot === 1 ? { ...s, terkunci: true } : s));
		const h = renderToko(snap({ toko }), depsID);
		expect(kartuSlot(h, 0)).toContain('<button class="gembok" data-aksi="kunci" data-arg="1" data-slot="0"');
		expect(kartuSlot(h, 0)).toContain('\u{1F513}');
		expect(kartuSlot(h, 1)).toContain('<button class="gembok tertutup" data-aksi="kunci" data-arg="0" data-slot="1"');
		expect(kartuSlot(h, 1)).toContain('\u{1F512}');
		expect(tagKartu(h, 1)).toContain('terkunci');
		expect(tagKartu(h, 0)).not.toContain('terkunci');
		expect(kartuSlot(h, 1)).toContain('title="Buka kunci kartu ini"');
		expect(renderToko(snap({ toko }), depsEN)).toContain('title="Lock this card (kept on Refresh)"');
	});

	it('tanda deck: punya ×n, sorotan GABUNG, dan chip sinergi .sorot', () => {
		const sinergi = [{ id: 'payon', jumlah: 2, tingkatAktif: 1, origin: true }];
		const h = renderToko(snap({ bidak: [bidak('archer'), bidak('archer'), bidak('wizard')], sinergi }), depsID);
		const archer = kartuSlot(h, 1);
		expect(tagKartu(h, 1)).toContain('gabung');
		expect(archer).toContain('<span class="punya">punya ×2</span>');
		expect(archer).toContain('<span class="label-gabung">GABUNG</span>');
		expect(archer).toContain('<span class="lencana origin sorot"');
		const wizard = kartuSlot(h, 2);
		expect(wizard).toContain('punya ×1');
		expect(tagKartu(h, 2)).not.toContain('gabung');
		expect(kartuSlot(h, 0)).not.toContain('class="punya"');
		const hEN = renderToko(snap({ bidak: [bidak('archer'), bidak('archer')] }), depsEN);
		expect(hEN).toContain('own ×2');
		expect(hEN).toContain('>MERGE<');
	});

	it('tombol refresh membawa harga dari ekonomi dan mati bila Zeny kurang', () => {
		const h = renderToko(snap({ zeny: 2 }), depsID);
		expect(h).toContain('data-aksi="refresh"');
		expect(h).toContain('title="Segarkan"><span class="glif">⟳</span><span class="teks">2z</span>');
		expect(h).not.toMatch(/data-aksi="refresh"[^>]*disabled/);
		expect(renderToko(snap({ zeny: 1 }), depsID)).toMatch(/data-aksi="refresh"[^>]*disabled/);
	});

	it('baris peluang ringkas: lima persen berwarna tier, teks lengkap dan Lv di title', () => {
		const h = renderToko(snap({ level: 2 }), depsID);
		expect(h).toContain('title="Peluang T1 70% · T2 30% · T3 0% · T4 0% · T5 0% — Lv. 2"');
		expect(h).toContain('<span class="tier tier-1">70%</span><span class="tier tier-2">30%</span>');
		const h3 = renderToko(snap({ level: 3 }), depsEN);
		expect(h3).toContain('title="Odds T1 60% · T2 35% · T3 5% · T4 0% · T5 0% — Lv. 3"');
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

describe('klik gembok (handler murni) mengirim kunci {slot, kunci}', () => {
	it('argKunci membaca data-arg dan data-slot; tanpa data-slot = -1 (semua slot)', () => {
		expect(argKunci({ arg: '1', slot: '3' })).toEqual({ slot: 3, kunci: true });
		expect(argKunci({ arg: '0', slot: '0' })).toEqual({ slot: 0, kunci: false });
		expect(argKunci({ arg: '1' })).toEqual({ slot: -1, kunci: true });
	});

	it('ikatAksi: klik gembok di dalam kartu yang bisa dibeli mengirim kunci, bukan beli', () => {
		let fn = null;
		const root = { addEventListener: (type, f) => { fn = f; } };
		const kirim = vi.fn();
		ikatAksi(root, kirim);
		// Gembok adalah [data-aksi] terdekat dari target, jadi kartu (data-aksi="beli") tidak tersentuh.
		const gembok = { dataset: { aksi: 'kunci', arg: '1', slot: '4' }, disabled: false };
		const kartu = { dataset: { aksi: 'beli', arg: '4', slot: '4' } };
		const target = { closest: (sel) => (sel === '[data-aksi]' ? gembok : (sel === '.kartu' ? kartu : null)) };
		fn({ target });
		gembok.dataset.arg = '0';
		fn({ target });
		expect(kirim.mock.calls).toEqual([['kunci', { slot: 4, kunci: true }], ['kunci', { slot: 4, kunci: false }]]);
	});
});
