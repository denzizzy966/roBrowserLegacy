import { describe, it, expect } from 'vitest';
import { hitungTataLetak, beririsan, posisiKartu, OVERLAY, TEPI } from './tataLetak.js';

const UKURAN_LAYAR = [[1600, 900], [1536, 695], [1280, 720], [1314, 588]];

/**
 * Tumpang tindih yang diizinkan, hanya pada layar terpendek: dua overlay
 * yang tersembunyi bawaan dan bisa digeser (Log dan DPS) karena Log tidak
 * muat di bawah DPS tanpa menabrak BilahDeck; dan (AC6, tata letak kasar
 * Task 5 -- Task 6 menuntaskannya) kolom Toko 470 px yang harus naik ke
 * atas tombol K sehingga menimpa Sinergi. Kunci "lebarxtinggi"; pasangan
 * diurutkan menurut abjad, urutan daftar = urutan keluaran tumpang().
 */
const PENGECUALIAN_TUMPANG = { '1314x588': ['SinergixToko', 'DPSxLog'] };

/** Pasangan jendela (urut abjad, "AxB") yang kotaknya beririsan. */
function tumpang(letak, abaikan = []) {
	const nama = Object.keys(letak).filter((n) => !abaikan.includes(n));
	const hasil = [];
	for (let i = 0; i < nama.length; i++) {
		for (let j = i + 1; j < nama.length; j++) {
			if (beririsan(letak[nama[i]].kotak, letak[nama[j]].kotak)) {
				hasil.push([nama[i], nama[j]].sort().join('x'));
			}
		}
	}
	return hasil;
}

describe('hitungTataLetak', () => {
	it('posisi sudut sesuai gambar referensi pada 1600x900', () => {
		const l = hitungTataLetak(1600, 900);
		expect(l.Timer).toMatchObject({ top: 8, left: 8 });
		expect(l.Sinergi).toMatchObject({ top: 52, right: 8 });
		// AC6 K4: Exp, Zeny, Kapasitas dihapus; InfoPemain turun ke pojok.
		expect(l.Exp).toBeUndefined();
		expect(l.Zeny).toBeUndefined();
		expect(l.Kapasitas).toBeUndefined();
		expect(l.InfoPemain).toMatchObject({ bottom: 8, left: 8 });
		expect(l.Bangku).toMatchObject({ top: 900 - 8 - 110, left: 480 });
		expect(l.BilahDeck).toMatchObject({ top: 900 - 8 - 110 - 6 - 34, left: 480 });
		expect(l.TombolToko).toMatchObject({ top: 900 - 56, left: 1600 - 56 });
		expect(l.TombolDPS).toMatchObject({ top: 900 - 56, left: 1600 - 56 - 6 - 48 });
		expect(l.Toko).toMatchObject({ top: 52 + 106 + 6, left: 1600 - 8 - 170 });
		expect(l.DaftarPemain).toMatchObject({ top: 80, left: 8 });
	});

	it.each(UKURAN_LAYAR)('%ix%i: Toko kolom kanan di atas tombol K; BilahDeck tepat di atas Bangku', (w, h) => {
		const l = hitungTataLetak(w, h);
		expect(l.Toko.kotak.x + l.Toko.kotak.lebar).toBe(w - TEPI);
		expect(l.Toko.kotak.y + l.Toko.kotak.tinggi).toBeLessThanOrEqual(l.TombolToko.kotak.y);
		expect(l.BilahDeck.kotak.x).toBe(l.Bangku.kotak.x);
		expect(l.BilahDeck.kotak.lebar).toBe(l.Bangku.kotak.lebar);
		expect(l.BilahDeck.kotak.y + l.BilahDeck.kotak.tinggi + 6).toBe(l.Bangku.kotak.y);
	});

	it.each(UKURAN_LAYAR)('%ix%i: jendela tetap tidak saling tumpang', (w, h) => {
		expect(tumpang(hitungTataLetak(w, h), OVERLAY)).toEqual([]);
	});

	it.each(UKURAN_LAYAR)('%ix%i: Toko, DPS, dan Log terbuka tidak saling menutup (kecuali Lore dan PENGECUALIAN_TUMPANG)', (w, h) => {
		expect(tumpang(hitungTataLetak(w, h), ['Lore'])).toEqual(PENGECUALIAN_TUMPANG[`${w}x${h}`] ?? []);
	});

	it.each([[1600, 900, 1096], [1280, 720, 776]])('%ix%i: Log 320x140 di kiri kolom Toko, tepat di bawah DPS (AC6)', (w, h, x) => {
		const l = hitungTataLetak(w, h);
		expect(l.Log.kotak).toEqual({ x, y: 52 + 106 + 6 + 180 + 6, lebar: 320, tinggi: 140 });
		expect(l.Log.kotak.x + l.Log.kotak.lebar).toBeLessThanOrEqual(l.Toko.kotak.x);
		expect(l.Log.kotak.y).toBeGreaterThanOrEqual(l.DPS.kotak.y + l.DPS.kotak.tinggi);
		expect(OVERLAY).toContain('Log');
	});

	it.each(UKURAN_LAYAR)('%ix%i: Log terbuka tidak menutup jendela tetap (juga InfoPemain terbuka), Toko, DPS, maupun pusat papan', (w, h) => {
		const l = hitungTataLetak(w, h);
		const tetap = Object.keys(l).filter((n) => !OVERLAY.includes(n) || n === 'Toko');
		for (const n of tetap) {
			expect(beririsan(l.Log.kotak, l[n].kotak), `Log x ${n}`).toBe(false);
		}
		expect(beririsan(l.Log.kotak, l.InfoPemain.kotakTerbuka), 'Log x InfoPemain terbuka').toBe(false);
		// DPS dicek di setiap ukuran kecuali yang tercatat sebagai pengecualian.
		const kenaDPS = beririsan(l.Log.kotak, l.DPS.kotak);
		expect(kenaDPS, 'Log x DPS').toBe((PENGECUALIAN_TUMPANG[`${w}x${h}`] ?? []).includes('DPSxLog'));
		// Pusat papan = pusat layar (kamera menengahkan papan): kotak 200x200 di tengah.
		const pusat = { x: w / 2 - 100, y: h / 2 - 100, lebar: 200, tinggi: 200 };
		expect(beririsan(l.Log.kotak, pusat)).toBe(false);
	});

	it.each(UKURAN_LAYAR)('%ix%i: semua kotak di dalam layar', (w, h) => {
		for (const [nama, { kotak }] of Object.entries(hitungTataLetak(w, h))) {
			expect(kotak.x, nama).toBeGreaterThanOrEqual(TEPI);
			expect(kotak.y, nama).toBeGreaterThanOrEqual(TEPI);
			expect(kotak.x + kotak.lebar, nama).toBeLessThanOrEqual(w - TEPI);
			expect(kotak.y + kotak.tinggi, nama).toBeLessThanOrEqual(h - TEPI);
		}
	});

	it('DaftarPemain berhenti di atas InfoPemain (bergulir di layar pendek)', () => {
		const l = hitungTataLetak(1314, 588);
		const info = l.InfoPemain.kotak;
		expect(80 + l.DaftarPemain.maxHeight).toBeLessThanOrEqual(info.y - TEPI);
	});

	it.each(UKURAN_LAYAR)('%ix%i: InfoPemain TERBUKA tidak menutupi DaftarPemain atau jendela lain', (w, h) => {
		const l = hitungTataLetak(w, h);
		const terbuka = { ...l, InfoPemain: { ...l.InfoPemain, kotak: l.InfoPemain.kotakTerbuka } };
		expect(l.InfoPemain.kotakTerbuka.tinggi).toBe(166);
		expect(tumpang(terbuka, OVERLAY)).toEqual([]);
		// maxHeight penuh (bukan hanya tinggi perkiraan) tetap di atasnya.
		expect(80 + l.DaftarPemain.maxHeight).toBeLessThanOrEqual(l.InfoPemain.kotakTerbuka.y - TEPI);
		const k = l.InfoPemain.kotakTerbuka;
		expect(k.y).toBeGreaterThanOrEqual(TEPI);
		expect(k.y + k.tinggi).toBeLessThanOrEqual(h - TEPI);
	});

	it('beririsan: bersentuhan tepi tidak dihitung', () => {
		const a = { x: 0, y: 0, lebar: 10, tinggi: 10 };
		expect(beririsan(a, { x: 10, y: 0, lebar: 5, tinggi: 5 })).toBe(false);
		expect(beririsan(a, { x: 9, y: 9, lebar: 5, tinggi: 5 })).toBe(true);
	});
});

describe('posisiKartu (KartuBidak menempel ke pointer, di luar hitungTataLetak)', () => {
	const ukuran = { lebar: 200, tinggi: 150 };
	const layar = { lebar: 1600, tinggi: 900 };

	it('pojok kiri-atas = pointer + 16 px', () => {
		expect(posisiKartu({ x: 500, y: 300 }, ukuran, layar)).toEqual({ left: 516, top: 316 });
	});
	it('dibalik ke kiri/atas pointer di dekat tepi kanan/bawah', () => {
		expect(posisiKartu({ x: 1500, y: 850 }, ukuran, layar)).toEqual({ left: 1284, top: 684 });
	});
	it.each(UKURAN_LAYAR)('%ix%i: kartu selalu di dalam layar untuk pointer di tepi dan sudut', (w, h) => {
		const pojok = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w / 2, h / 2], [w - 5, h / 2], [w / 2, h - 5]];
		for (const [x, y] of pojok) {
			const p = posisiKartu({ x, y }, ukuran, { lebar: w, tinggi: h });
			expect(p.left).toBeGreaterThanOrEqual(TEPI);
			expect(p.top).toBeGreaterThanOrEqual(TEPI);
			expect(p.left + ukuran.lebar).toBeLessThanOrEqual(w - TEPI);
			expect(p.top + ukuran.tinggi).toBeLessThanOrEqual(h - TEPI);
		}
	});
	it('selalu di dalam layar, juga di layar sempit', () => {
		for (const titik of [{ x: 0, y: 0 }, { x: 1599, y: 899 }, { x: 100, y: 880 }, { x: 1590, y: 5 }]) {
			const p = posisiKartu(titik, ukuran, layar);
			expect(p.left).toBeGreaterThanOrEqual(TEPI);
			expect(p.top).toBeGreaterThanOrEqual(TEPI);
			expect(p.left + ukuran.lebar).toBeLessThanOrEqual(layar.lebar - TEPI);
			expect(p.top + ukuran.tinggi).toBeLessThanOrEqual(layar.tinggi - TEPI);
		}
		expect(posisiKartu({ x: 150, y: 100 }, ukuran, { lebar: 300, tinggi: 200 })).toEqual({ left: TEPI, top: TEPI });
	});
	it('tidak ikut tata letak statis', () => {
		expect(hitungTataLetak(1600, 900).KartuBidak).toBeUndefined();
	});
});
