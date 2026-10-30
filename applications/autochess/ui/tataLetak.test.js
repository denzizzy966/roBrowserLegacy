import { describe, it, expect } from 'vitest';
import { hitungTataLetak, beririsan, posisiKartu, OVERLAY, TEPI, UKURAN } from './tataLetak.js';
import { SEPARUH_SENDIRI } from '../kamera.fixture.js';

const UKURAN_LAYAR = [[1920, 1080], [1600, 900], [1536, 695], [1366, 641], [1280, 720]];

/**
 * Tumpang tindih yang diizinkan, hanya antara overlay (DPS, Log; tersembunyi
 * bawaan, bisa digeser) dan hal yang tidak selalu terbuka: InfoPemain
 * TERBUKA (terlipat bawaan) dan kotak separuh papan sendiri (kotak pembatas
 * trapesium: sudut kirinya kosong). Kunci "lebarxtinggi"; nama pasangan
 * diurutkan menurut abjad, "InfoTerbuka" = InfoPemain.kotakTerbuka,
 * "Separuh" = SEPARUH_SENDIRI. Jendela tetap dan Toko (tampil bawaan) tidak
 * pernah boleh bertumpang.
 */
const PENGECUALIAN = {
	'1366x641': ['DPSxLog', 'DPSxInfoTerbuka', 'InfoTerbukaxLog', 'LogxSeparuh'],
	'1280x720': ['DPSxInfoTerbuka', 'LogxSeparuh']
};
const pengecualian = (w, h) => [...(PENGECUALIAN[`${w}x${h}`] ?? [])].map(urut).sort();

/** "BxA" -> "AxB". */
function urut(pasangan) {
	return pasangan.split('x').sort().join('x');
}

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

/** Pasangan overlay vs (overlay, InfoTerbuka, Separuh) yang beririsan, urut abjad. */
function tumpangOverlay(w, h) {
	const l = hitungTataLetak(w, h);
	const sasaran = {
		DPS: l.DPS.kotak, Log: l.Log.kotak,
		InfoTerbuka: l.InfoPemain.kotakTerbuka, Separuh: SEPARUH_SENDIRI[`${w}x${h}`]
	};
	const hasil = new Set();
	for (const o of ['DPS', 'Log']) {
		for (const n of Object.keys(sasaran)) {
			if (o !== n && beririsan(sasaran[o], sasaran[n])) {
				hasil.add(urut([o, n].join('x')));
			}
		}
	}
	return [...hasil].sort();
}

describe('hitungTataLetak', () => {
	it('posisi sudut pada 1600x900', () => {
		const l = hitungTataLetak(1600, 900);
		expect(l.Timer).toMatchObject({ top: 8, left: 8 });
		// AC6 K4: Exp, Zeny, Kapasitas dihapus; Sinergi naik ke puncak, InfoPemain turun ke pojok.
		expect(l.Sinergi).toMatchObject({ top: 8, right: 8 });
		expect(l.Exp).toBeUndefined();
		expect(l.Zeny).toBeUndefined();
		expect(l.Kapasitas).toBeUndefined();
		expect(l.InfoPemain).toMatchObject({ bottom: 8, left: 8 });
		expect(l.Bangku).toMatchObject({ top: 900 - 8 - 110, left: 480 });
		expect(l.BilahDeck).toMatchObject({ top: 900 - 8 - 110 - 6 - 34, left: 480 });
		expect(l.TombolToko).toMatchObject({ top: 900 - 56, left: 1600 - 56 });
		expect(l.TombolDPS).toMatchObject({ top: 900 - 56, left: 1600 - 56 - 6 - 48 });
		expect(l.Toko).toMatchObject({ top: 8 + 106 + 6, left: 1600 - 8 - 170 });
		expect(l.DaftarPemain).toMatchObject({ top: 80, left: 8 });
	});

	it('DaftarPemain 190 px, delapan baris tanpa gulir (maxHeight >= tinggi)', () => {
		expect(UKURAN.DaftarPemain).toEqual({ lebar: 190, tinggi: 8 * 32 + 22 });
		for (const [w, h] of UKURAN_LAYAR) {
			const l = hitungTataLetak(w, h);
			expect(l.DaftarPemain.maxHeight, `${w}x${h}`).toBeGreaterThanOrEqual(UKURAN.DaftarPemain.tinggi);
			expect(l.DaftarPemain.kotak.tinggi, `${w}x${h}`).toBe(UKURAN.DaftarPemain.tinggi);
		}
	});

	it.each(UKURAN_LAYAR)('%ix%i: Toko kolom kanan di bawah Sinergi dan di atas tombol K; BilahDeck tepat di atas Bangku', (w, h) => {
		const l = hitungTataLetak(w, h);
		expect(l.Toko.kotak.x + l.Toko.kotak.lebar).toBe(w - TEPI);
		expect(l.Toko.kotak.y).toBeGreaterThanOrEqual(l.Sinergi.kotak.y + l.Sinergi.kotak.tinggi + 6);
		expect(l.Toko.kotak.y + l.Toko.kotak.tinggi).toBeLessThanOrEqual(l.TombolToko.kotak.y - 6);
		expect(l.BilahDeck.kotak.x).toBe(l.Bangku.kotak.x);
		expect(l.BilahDeck.kotak.lebar).toBe(l.Bangku.kotak.lebar);
		expect(l.BilahDeck.kotak.y + l.BilahDeck.kotak.tinggi + 6).toBe(l.Bangku.kotak.y);
	});

	it.each(UKURAN_LAYAR)('%ix%i: jendela tetap tidak saling tumpang', (w, h) => {
		expect(tumpang(hitungTataLetak(w, h), OVERLAY)).toEqual([]);
	});

	it.each(UKURAN_LAYAR)('%ix%i: tidak ada jendela tetap, dan tidak juga Toko, yang menutup separuh papan sendiri', (w, h) => {
		const l = hitungTataLetak(w, h);
		const separuh = SEPARUH_SENDIRI[`${w}x${h}`];
		expect(separuh, 'fixture ada').toBeTruthy();
		const wajib = Object.keys(l).filter((n) => !OVERLAY.includes(n) || n === 'Toko');
		for (const n of wajib) {
			expect(beririsan(l[n].kotak, separuh), `${n} x separuh sendiri`).toBe(false);
		}
		// Separuh itu sendiri tampak penuh di layar dan di atas BilahDeck.
		expect(separuh.y + separuh.tinggi).toBeLessThan(l.BilahDeck.kotak.y);
		expect(separuh.x).toBeGreaterThanOrEqual(0);
		expect(separuh.x + separuh.lebar).toBeLessThanOrEqual(w);
	});

	it.each(UKURAN_LAYAR)('%ix%i: Toko dan jendela tetap tidak bertumpang dengan DPS atau Log; DPS x Log hanya lewat PENGECUALIAN', (w, h) => {
		// Semua kecuali Lore (modal di tengah): Toko, DPS, dan Log terbuka bersamaan.
		expect(tumpang(hitungTataLetak(w, h), ['Lore'])).toEqual(pengecualian(w, h).filter((p) => p === 'DPSxLog'));
	});

	it.each(UKURAN_LAYAR)('%ix%i: DPS dan Log vs InfoPemain terbuka dan separuh papan sendiri hanya lewat PENGECUALIAN bernama', (w, h) => {
		expect(tumpangOverlay(w, h)).toEqual(pengecualian(w, h));
	});

	it.each([[1920, 1080], [1600, 900]])('%ix%i: Log 320x140 di kolom kiri di bawah DaftarPemain, DPS di bawah Log (AC6)', (w, h) => {
		const l = hitungTataLetak(w, h);
		expect(l.Log.kotak).toEqual({ x: 8, y: 80 + 278 + 6, lebar: 320, tinggi: 140 });
		expect(l.DPS.kotak).toEqual({ x: 8, y: 80 + 278 + 6 + 140 + 6, lebar: 220, tinggi: 180 });
		expect(OVERLAY).toContain('Log');
		expect(OVERLAY).toContain('DPS');
	});

	it('1536x695: Log di bawah DaftarPemain, DPS di samping InfoPemain (tanpa tumpang tindih)', () => {
		const l = hitungTataLetak(1536, 695);
		expect(l.Log.kotak).toEqual({ x: 8, y: 364, lebar: 320, tinggi: 140 });
		expect(l.DPS.kotak).toEqual({ x: 214, y: 695 - 8 - 180, lebar: 220, tinggi: 180 });
		expect(beririsan(l.DPS.kotak, l.Log.kotak)).toBe(false);
	});

	it.each(UKURAN_LAYAR)('%ix%i: semua kotak di dalam layar', (w, h) => {
		for (const [nama, { kotak }] of Object.entries(hitungTataLetak(w, h))) {
			expect(kotak.x, nama).toBeGreaterThanOrEqual(TEPI);
			expect(kotak.y, nama).toBeGreaterThanOrEqual(TEPI);
			expect(kotak.x + kotak.lebar, nama).toBeLessThanOrEqual(w - TEPI);
			expect(kotak.y + kotak.tinggi, nama).toBeLessThanOrEqual(h - TEPI);
		}
	});

	it('DaftarPemain berhenti di atas InfoPemain terbuka (bergulir bila layar lebih pendek dari 8 baris)', () => {
		const l = hitungTataLetak(1314, 588);
		const info = l.InfoPemain.kotakTerbuka;
		expect(80 + l.DaftarPemain.maxHeight).toBeLessThanOrEqual(info.y - TEPI);
	});

	it.each(UKURAN_LAYAR)('%ix%i: InfoPemain TERBUKA tidak menutupi DaftarPemain atau jendela tetap lain', (w, h) => {
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
