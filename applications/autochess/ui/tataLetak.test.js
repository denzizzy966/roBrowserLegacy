import { describe, it, expect } from 'vitest';
import { hitungTataLetak, beririsan, OVERLAY, TEPI } from './tataLetak.js';

const UKURAN_LAYAR = [[1600, 900], [1536, 695], [1280, 720], [1314, 588]];

/** Pasangan jendela yang kotaknya beririsan. */
function tumpang(letak, abaikan = []) {
	const nama = Object.keys(letak).filter((n) => !abaikan.includes(n));
	const hasil = [];
	for (let i = 0; i < nama.length; i++) {
		for (let j = i + 1; j < nama.length; j++) {
			if (beririsan(letak[nama[i]].kotak, letak[nama[j]].kotak)) {
				hasil.push(`${nama[i]}x${nama[j]}`);
			}
		}
	}
	return hasil;
}

describe('hitungTataLetak', () => {
	it('posisi sudut sesuai gambar referensi pada 1600x900', () => {
		const l = hitungTataLetak(1600, 900);
		expect(l.Timer).toMatchObject({ top: 8, left: 8 });
		expect(l.Kapasitas).toMatchObject({ top: 8, left: 755 });
		expect(l.Zeny).toMatchObject({ top: 8, left: 1600 - 8 - 140 });
		expect(l.Sinergi).toMatchObject({ top: 52, right: 8 });
		expect(l.Exp).toMatchObject({ top: 900 - 8 - 70, left: 8 });
		expect(l.InfoPemain).toMatchObject({ bottom: 84, left: 8 });
		expect(l.Bangku).toMatchObject({ top: 900 - 8 - 110, left: 480 });
		expect(l.TombolToko).toMatchObject({ top: 900 - 56, left: 1600 - 56 });
		expect(l.DaftarPemain).toMatchObject({ top: 80, left: 8 });
	});

	it.each(UKURAN_LAYAR)('%ix%i: jendela tetap tidak saling tumpang', (w, h) => {
		expect(tumpang(hitungTataLetak(w, h), OVERLAY)).toEqual([]);
	});

	it.each(UKURAN_LAYAR)('%ix%i: Toko dan DPS terbuka tidak menutup jendela lain kecuali Lore', (w, h) => {
		expect(tumpang(hitungTataLetak(w, h), ['Lore'])).toEqual([]);
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
