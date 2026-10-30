import { describe, it, expect } from 'vitest';
import {
	kameraUntuk, kameraPenuh, kotakPapanPenuh, MARGIN_PAPAN, FASE_TEMPUR, FASE_HASIL, terapkanKamera, proyeksiTitik, kotakSeparuhSendiri, matriksKamera,
	SUDUT, ZOOM_MIN, ZOOM_MAKS, PORSI_LEBAR, PORSI_PUSAT
} from './kamera.js';
import { SEPARUH_SENDIRI, PAPAN_PENUH_TEMPUR } from './kamera.fixture.js';
import { hitungTataLetak } from './ui/tataLetak.js';
import { pusatPapan, SKALA_PETAK } from './papan.js';

const ASAL = { x: 42, y: 41 };
const TINGGI_CELL = 4;          // guild_vs3: lantai arena rata di ketinggian 4
const rata = () => TINGGI_CELL;
const UKURAN = [[1920, 1080], [1600, 900], [1536, 695], [1366, 641], [1280, 720]];

/** Kotak separuh sendiri yang diprediksi dari kameraUntuk (tanpa browser). */
function kotakDari(lebar, tinggi) {
	const hasil = kameraUntuk(lebar, tinggi);
	const pusat = pusatPapan(ASAL, SKALA_PETAK);
	const layar = { lebar, tinggi };
	const cam = matriksKamera(hasil.zoom, hasil.sudut, { x: pusat.x - 0.5, y: pusat.y - 0.5 - hasil.geserY, z: TINGGI_CELL }, layar);
	return kotakSeparuhSendiri(cam, ASAL, SKALA_PETAK, rata, layar);
}

describe('kameraUntuk', () => {
	// Nilai dipaku sesudah penyetelan browser (task-6-report.md).
	it('1536x695: zoom 101.8, sudut 250, geserY 5.45', () => {
		expect(kameraUntuk(1536, 695)).toEqual({ zoom: 101.8, sudut: 250, geserY: 5.45 });
	});
	it('1600x900: zoom 125.1, sudut 250, geserY 5.6', () => {
		expect(kameraUntuk(1600, 900)).toEqual({ zoom: 125.1, sudut: 250, geserY: 5.6 });
	});
	it('sudut selalu 250', () => {
		for (const [w, h] of UKURAN) {
			expect(kameraUntuk(w, h).sudut).toBe(SUDUT);
		}
	});
	it('monoton: tinggi lebih kecil -> zoom lebih kecil (lebih dekat) dalam jepitan', () => {
		const zoom = (h) => kameraUntuk(1600, h).zoom;
		const tinggi = [500, 600, 695, 800, 900, 1080];
		for (let i = 1; i < tinggi.length; i++) {
			expect(zoom(tinggi[i - 1])).toBeLessThan(zoom(tinggi[i]));
		}
		// Lebih lebar pada tinggi sama -> lebih dekat juga (porsi 55 % dari lebih banyak piksel).
		expect(kameraUntuk(1920, 695).zoom).toBeLessThan(kameraUntuk(1280, 695).zoom);
	});
	it('zoom dijepit [60, 220]', () => {
		expect(kameraUntuk(4000, 300).zoom).toBe(ZOOM_MIN);
		expect(kameraUntuk(300, 4000).zoom).toBe(ZOOM_MAKS);
		for (const [w, h] of UKURAN) {
			const { zoom } = kameraUntuk(w, h);
			expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
			expect(zoom).toBeLessThanOrEqual(ZOOM_MAKS);
		}
	});
	it('geserY positif: target bergeser dari pusat papan ke arah separuh sendiri', () => {
		for (const [w, h] of UKURAN) {
			expect(kameraUntuk(w, h).geserY).toBeGreaterThan(5);
		}
		// Sasaran lebih tinggi di layar (area bebas lebih kecil) -> geser lebih besar pada zoom sama.
		const spot = { position: [0, 0, 0] };
		const cam = { zoomFinal: 0, zoom: 0, angleFinal: [0, 0] };
		terapkanKamera(cam, spot, { x: 50, y: 49 }, { zoom: 100, sudut: 250, geserY: 6 }, rata);
		expect(spot.position[1]).toBeLessThan(49);
	});
	it('ukuran tidak valid jatuh ke zoom cadangan tanpa NaN', () => {
		for (const [w, h] of [[0, 0], [NaN, 100], [100, undefined]]) {
			expect(kameraUntuk(w, h)).toEqual({ zoom: 220, sudut: 250, geserY: 0 });
		}
	});
	it.each(UKURAN)('%ix%i: separuh sendiri ~55 %% lebar, pusat ~45 %% area bebas, di bawah Timer dan di atas BilahDeck', (w, h) => {
		const b = kotakDari(w, h);
		const l = hitungTataLetak(w, h);
		const atas = l.Timer.kotak.y + l.Timer.kotak.tinggi;
		const bawah = l.BilahDeck.kotak.y;
		expect(b.lebar / w).toBeGreaterThan(PORSI_LEBAR - 0.02);
		expect(b.lebar / w).toBeLessThan(PORSI_LEBAR + 0.02);
		expect((b.y + b.tinggi / 2 - atas) / (bawah - atas)).toBeGreaterThan(PORSI_PUSAT - 0.02);
		expect((b.y + b.tinggi / 2 - atas) / (bawah - atas)).toBeLessThan(PORSI_PUSAT + 0.02);
		expect(b.y).toBeGreaterThanOrEqual(atas);
		expect(b.y + b.tinggi).toBeLessThan(bawah);
		// Di tengah layar secara horizontal.
		expect(Math.abs(b.x + b.lebar / 2 - w / 2)).toBeLessThan(3);
	});
	it.each(UKURAN)('%ix%i: prediksi matriksKamera cocok dengan kotak yang direkam di browser (+-3 px)', (w, h) => {
		const b = kotakDari(w, h);
		const f = SEPARUH_SENDIRI[`${w}x${h}`];
		for (const k of ['x', 'y', 'lebar', 'tinggi']) {
			expect(Math.abs(b[k] - f[k]), `${w}x${h} ${k}: ${b[k]} vs ${f[k]}`).toBeLessThanOrEqual(3);
		}
	});
});

describe('terapkanKamera', () => {
	it('menggeser target ke arah separuh sendiri, menjaga ketinggian cell, menyetel zoom dan sudut', () => {
		const spot = { position: [0, 0, 0] };
		const cam = { zoomFinal: 125, zoom: 125, angleFinal: [230, 0] };
		const dipanggil = [];
		terapkanKamera(cam, spot, { x: 50, y: 49 }, { zoom: 101.8, sudut: 250, geserY: 5.45 }, (x, y) => {
			dipanggil.push([x, y]);
			return 4;
		});
		expect(spot.position[0]).toBeCloseTo(49.5, 10);
		expect(spot.position[1]).toBeCloseTo(49 - 0.5 - 5.45, 10);
		expect(spot.position[2]).toBe(4);
		expect(dipanggil).toHaveLength(1);
		expect(cam.zoomFinal).toBe(101.8);
		expect(cam.zoom).toBe(101.8);
		expect(cam.angleFinal).toEqual([250, 0]);
	});
});

describe('proyeksiTitik dan kotakSeparuhSendiri', () => {
	const layar = { lebar: 1537, tinggi: 695 };
	const cam = matriksKamera(220, 250, { x: 50, y: 49, z: 4 }, layar);

	it('target kamera jatuh di pusat layar', () => {
		const t = proyeksiTitik(cam, 50.5, 49.5, 4, layar);
		expect(t.sx).toBeCloseTo(layar.lebar / 2, 3);
		expect(t.sy).toBeCloseTo(layar.tinggi / 2, 3);
	});
	it('titik lebih ke arah y kecil (separuh sendiri) tampil lebih rendah di layar', () => {
		const dekat = proyeksiTitik(cam, 50.5, 45.5, 4, layar);
		const jauh = proyeksiTitik(cam, 50.5, 53.5, 4, layar);
		expect(dekat.sy).toBeGreaterThan(layar.tinggi / 2);
		expect(jauh.sy).toBeLessThan(layar.tinggi / 2);
	});
	it('titik yang lebih tinggi (z) tampil lebih tinggi di layar', () => {
		expect(proyeksiTitik(cam, 50, 49, 8, layar).sy).toBeLessThan(proyeksiTitik(cam, 50, 49, 4, layar).sy);
	});
	it('kotak pada zoom 220 tanpa geser sama dengan ukuran terukur di browser (394x186 di 559,359)', () => {
		expect(kotakSeparuhSendiri(cam, ASAL, SKALA_PETAK, rata, layar)).toEqual({ x: 559, y: 359, lebar: 394, tinggi: 186 });
	});
});

describe('kamera per fase: TEMPUR/HASIL = papan penuh (Fix round 1)', () => {
	function kotakPenuh(w, h, fase = FASE_TEMPUR) {
		const hasil = kameraUntuk(w, h, fase);
		const pusat = pusatPapan(ASAL, SKALA_PETAK);
		const layar = { lebar: w, tinggi: h };
		const cam = matriksKamera(hasil.zoom, hasil.sudut, { x: pusat.x - 0.5, y: pusat.y - 0.5 - hasil.geserY, z: TINGGI_CELL }, layar);
		return kotakPapanPenuh(cam, ASAL, SKALA_PETAK, rata, layar);
	}

	it('TEMPUR dipaku: 1536x695 = {175.2, 250, 1.75}, 1600x900 = {155.9, 250, 1.32}', () => {
		expect(kameraUntuk(1536, 695, FASE_TEMPUR)).toEqual({ zoom: 175.2, sudut: 250, geserY: 1.75 });
		expect(kameraUntuk(1600, 900, FASE_TEMPUR)).toEqual({ zoom: 155.9, sudut: 250, geserY: 1.32 });
	});
	it('HASIL sama dengan TEMPUR; PERSIAPAN (atau tanpa fase) tidak berubah', () => {
		expect(kameraUntuk(1536, 695, FASE_HASIL)).toEqual(kameraUntuk(1536, 695, FASE_TEMPUR));
		expect(kameraUntuk(1536, 695, 1)).toEqual({ zoom: 101.8, sudut: 250, geserY: 5.45 });
		expect(kameraUntuk(1536, 695)).toEqual(kameraUntuk(1536, 695, 1));
		expect(kameraUntuk(1600, 900, 1)).toEqual({ zoom: 125.1, sudut: 250, geserY: 5.6 });
	});
	it.each(UKURAN)('%ix%i: papan penuh di dalam area bebas dengan margin >= 8 px, di tengahnya', (w, h) => {
		const b = kotakPenuh(w, h);
		const l = hitungTataLetak(w, h);
		const atas = l.Timer.kotak.y + l.Timer.kotak.tinggi;
		const bawah = l.BilahDeck.kotak.y;
		expect(b.y).toBeGreaterThanOrEqual(atas + MARGIN_PAPAN - 1);
		expect(b.y + b.tinggi).toBeLessThanOrEqual(bawah - MARGIN_PAPAN + 1);
		expect(Math.abs(b.y + b.tinggi / 2 - (atas + bawah) / 2)).toBeLessThan(2);
		expect(Math.abs(b.x + b.lebar / 2 - w / 2)).toBeLessThan(2);
		// Tidak ada jendela tetap atau Toko yang menutup papan penuh.
		for (const [n, v] of Object.entries(l)) {
			if (n === 'Lore' || n === 'DPS' || n === 'Log') {
				continue;
			}
			const sama = b.x < v.kotak.x + v.kotak.lebar && v.kotak.x < b.x + b.lebar && b.y < v.kotak.y + v.kotak.tinggi && v.kotak.y < b.y + b.tinggi;
			expect(sama, `${n} menutup papan penuh`).toBe(false);
		}
	});
	it('zoom TEMPUR dalam [60, 220] dan lebih dekat dari ukuran tinggi yang lebih kecil', () => {
		for (const [w, h] of UKURAN) {
			const { zoom } = kameraPenuh(w, h);
			expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
			expect(zoom).toBeLessThanOrEqual(ZOOM_MAKS);
		}
	});
	it.each(Object.entries(PAPAN_PENUH_TEMPUR))('%s: prediksi cocok dengan kotak papan penuh yang direkam di browser (+-3 px)', (kunci, f) => {
		const [w, h] = kunci.split('x').map(Number);
		const b = kotakPenuh(w, h);
		for (const k of ['x', 'y', 'lebar', 'tinggi']) {
			expect(Math.abs(b[k] - f[k]), `${kunci} ${k}`).toBeLessThanOrEqual(3);
		}
	});
});
