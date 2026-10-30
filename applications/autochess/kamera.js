/**
 * Kamera autochess yang mengikuti viewport (AC6 K8).
 *
 * Papan 16x16 cell dilihat dari atas miring (sudut 250). Pemain bermain di
 * separuh bawah (baris 0..3, TIM_A); separuh itu harus besar dan berada di
 * atas BilahDeck. Dua alat: zoom (ukuran) dan geser target kamera dari
 * pusat papan ke arah separuh sendiri (posisi vertikal).
 *
 * Berkas ini murni: tanpa impor src/, jadi teruji di vitest. Camera dan
 * Altitude diberikan pemanggil (main.js).
 */

import { hitungTataLetak } from './ui/tataLetak.js';
import { KOLOM, BARIS, SKALA_PETAK as SKALA } from './papan.js';

/** Sudut kamera (Camera.angleFinal[0]). */
export const SUDUT = 250;
/** Jepitan zoom (Camera.zoomFinal). */
export const ZOOM_MIN = 60;
export const ZOOM_MAKS = 220;
/** Lebar separuh sendiri sebagai pecahan lebar viewport. */
export const PORSI_LEBAR = 0.55;
/** Pusat separuh sendiri sebagai pecahan tinggi area bebas (Timer..BilahDeck). */
export const PORSI_PUSAT = 0.45;

/**
 * Model kamera, disetel di browser (Playwright, viewport CSS 1537x695,
 * papan guild_vs3, Camera.angleFinal[0] = 250; laporan task-6-report.md).
 *
 * Proyeksi perspektif dengan vFov tetap 15 derajat: ukuran layar sebanding
 * dengan tinggi viewport dan berbanding terbalik dengan jarak kamera, yang
 * sebanding dengan (zoom + C_ZOOM):
 *
 *   lebar kotak separuh sendiri (px) = K_LEBAR * tinggi / (zoom + C_ZOOM)
 *   pusat kotak - pusat layar   (px) = tinggi * (P0 - P1*g + P2*g^2) / (zoom + C_ZOOM)
 *
 * g = geserY + 0.5 (cell): kalibrasi dilakukan dengan target di cell
 * (50, 49 - g); geserY dihitung dari pusat papan SEBENARNYA (50, 49) yang,
 * dalam koordinat target kamera, adalah (49.5, 48.5) karena cell n memuat
 * [n, n+1) dan Camera menengahkan titik n + 0.5. Titik kalibrasi (tinggi
 * 695, lebar 1537):
 *   g = 0: zoom 220 -> lebar 394, pusat y 452 | zoom 80 -> lebar 1139, pusat y 647.5
 *   zoom 105.8: g = 0 -> pusat y 570, g = 2 -> 472, g = 4 -> 376, g = 6 -> lebar 811, pusat y 282
 * Lebar kotak mengecil sedikit saat g naik (4 % dari g = 0 ke g = 6, sebab
 * tepi jauh makin jauh), jadi K_LEBAR dipaku pada titik kerja g ~ 6
 * (lebar 811 pada zoom 105.8: 811 * (105.8 - 6) / 695). Zoom 150/60 dan
 * g = 4 pada zoom 150/80 cocok dalam 1 %. matriksKamera (di bawah)
 * mereproduksi semua angka ini persis dari matriks renderer.
 */
export const K_LEBAR = 116.46;
export const C_ZOOM = -6;
export const P0 = 31.95;
export const P1 = 7.122;
export const P2 = 0.036;

/** Nomor fase (sama dengan FASE di pesan.js; tidak diimpor agar berkas ini murni). */
export const FASE_PERSIAPAN = 1;
export const FASE_TEMPUR = 2;
export const FASE_HASIL = 3;
/** Jarak minimum papan penuh dari tepi area bebas (px). */
export const MARGIN_PAPAN = 8;
/** Tinggi cell lantai arena guild_vs3 (rata) untuk perhitungan murni. */
const TINGGI_LANTAI = 4;

/** Zoom/sudut cadangan bila viewport belum diketahui. */
export const ZOOM_CADANGAN = 220;

/**
 * @param {number} lebar Renderer.width
 * @param {number} tinggi Renderer.height
 * @param {number} [fase] FASE catur; TEMPUR/HASIL = papan penuh (kameraPenuh)
 * @returns {{zoom:number, sudut:number, geserY:number}}
 */
export function kameraUntuk(lebar, tinggi, fase = FASE_PERSIAPAN) {
	if (!(lebar > 0) || !(tinggi > 0)) {
		return { zoom: ZOOM_CADANGAN, sudut: SUDUT, geserY: 0 };
	}
	if (fase === FASE_TEMPUR || fase === FASE_HASIL) {
		return kameraPenuh(lebar, tinggi);
	}
	const mentah = (K_LEBAR * tinggi) / (PORSI_LEBAR * lebar) - C_ZOOM;
	const zoom = Math.round(Math.min(ZOOM_MAKS, Math.max(ZOOM_MIN, mentah)) * 10) / 10;

	// Area bebas: dari dasar Timer sampai puncak BilahDeck.
	const l = hitungTataLetak(lebar, tinggi);
	const atas = l.Timer.kotak.y + l.Timer.kotak.tinggi;
	const bawah = l.BilahDeck.kotak.y;
	const sasaran = atas + PORSI_PUSAT * (bawah - atas);
	// Selesaikan P0 - P1*g + P2*g^2 = R untuk g terkecil.
	const R = ((sasaran - tinggi / 2) * (zoom + C_ZOOM)) / tinggi;
	const diskriminan = P1 * P1 - 4 * P2 * (P0 - R);
	const g = (P1 - Math.sqrt(Math.max(0, diskriminan))) / (2 * P2);
	const geserY = Math.round((g - 0.5) * 100) / 100;
	return { zoom, sudut: SUDUT, geserY };
}

/**
 * Menerapkan hasil kameraUntuk: menggeser target (spot) dari pusat papan
 * sejauh geserY cell ke arah separuh sendiri (y mengecil), menjaga
 * ketinggian cell, lalu menyetel zoom dan sudut.
 *
 * @param {object} Camera
 * @param {{position: number[]}} spot entity target kamera
 * @param {{x:number, y:number}} pusat pusat papan (cell)
 * @param {{zoom:number, sudut:number, geserY:number}} hasil
 * @param {function(number, number): number} tinggiCell Altitude.getCellHeight
 */
export function terapkanKamera(Camera, spot, pusat, hasil, tinggiCell) {
	// Camera menengahkan titik (target + 0.5): kurangi 0.5 supaya pusat
	// papan (koordinat kontinu) tepat di tengah layar secara horizontal.
	spot.position[0] = pusat.x - 0.5;
	spot.position[1] = pusat.y - 0.5 - hasil.geserY;
	spot.position[2] = tinggiCell(spot.position[0], spot.position[1]);
	Camera.zoomFinal = hasil.zoom;
	Camera.angleFinal[0] = hasil.sudut;
	// Zoom langsung loncat (bukan meluncur): Camera.update memakai lerp
	// dt * 0.012 yang berayun (tidak menyatu) pada frame di bawah ~12 fps,
	// dan ukuran viewport berubah jarang.
	Camera.zoom = hasil.zoom;
}

/**
 * Memproyeksikan titik dunia (cell x, cell y, tinggi cell z) ke piksel
 * layar, meniru renderer: titik model = [x, -z, y]; clip = projection *
 * modelView * titik (kolom-utama, gl-matrix); layar y ke bawah.
 *
 * @param {{projection: ArrayLike<number>, modelView: ArrayLike<number>}} Camera
 * @param {number} x cell x (boleh pecahan; cell n mencakup [n, n+1))
 * @param {number} y cell y
 * @param {number} z tinggi cell (Altitude.getCellHeight)
 * @param {{lebar:number, tinggi:number}} layar ukuran viewport
 * @returns {{sx:number, sy:number}}
 */
export function proyeksiTitik(Camera, x, y, z, layar) {
	const m = Camera.modelView;
	const p = Camera.projection;
	const v = [x, -z, y, 1];
	const mv = [0, 0, 0, 0];
	for (let r = 0; r < 4; r++) {
		mv[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3];
	}
	const c = [0, 0, 0, 0];
	for (let r = 0; r < 4; r++) {
		c[r] = p[r] * mv[0] + p[4 + r] * mv[1] + p[8 + r] * mv[2] + p[12 + r] * mv[3];
	}
	const ndcX = c[0] / c[3];
	const ndcY = c[1] / c[3];
	return { sx: (ndcX * 0.5 + 0.5) * layar.lebar, sy: (1 - (ndcY * 0.5 + 0.5)) * layar.tinggi };
}

/**
 * Kotak layar (bounding box) dari `baris` baris papan mulai dari y asal:
 * 4 baris = separuh sendiri (baris 0..3 dari TIM_A), 8 = papan penuh.
 *
 * @returns {{x:number, y:number, lebar:number, tinggi:number}}
 */
export function kotakPapan(Camera, asal, skala, tinggiCell, layar, baris) {
	const x0 = asal.x;
	const x1 = asal.x + KOLOM * skala;
	const y0 = asal.y;
	const y1 = asal.y + baris * skala;
	const titik = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) =>
		proyeksiTitik(Camera, x, y, tinggiCell(Math.floor(Math.min(x, x1 - 1)), Math.floor(Math.min(y, y1 - 1))), layar));
	const xs = titik.map((t) => t.sx);
	const ys = titik.map((t) => t.sy);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return {
		x: Math.round(minX), y: Math.round(minY),
		lebar: Math.round(Math.max(...xs) - minX), tinggi: Math.round(Math.max(...ys) - minY)
	};
}

/** Kotak layar separuh papan sendiri (4 baris). */
export const kotakSeparuhSendiri = (Camera, asal, skala, tinggiCell, layar) =>
	kotakPapan(Camera, asal, skala, tinggiCell, layar, BARIS / 2);

/** Kotak layar papan penuh (8 baris, kedua separuh). */
export const kotakPapanPenuh = (Camera, asal, skala, tinggiCell, layar) =>
	kotakPapan(Camera, asal, skala, tinggiCell, layar, BARIS);

/** Sudut pandang vertikal renderer (Renderer.vFov, derajat). */
export const VFOV = 15;

/** a * b untuk matriks 4x4 kolom-utama. */
function kali(a, b) {
	const o = new Array(16).fill(0);
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			for (let k = 0; k < 4; k++) {
				o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
			}
		}
	}
	return o;
}

const geser = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/**
 * Matriks proyeksi dan modelView yang akan dipakai renderer untuk kamera
 * berzoom/bersudut tertentu yang menatap cell (tx, ty) setinggi tz. Meniru
 * Renderer.resize (perspective vFov 15, near 1, far 1000) dan Camera.update
 * (translateZ(-zoom/2) * rotateX(sudut) * translate(-tx-0.5, tz, -ty-0.5),
 * sudut putar horizontal 0). Dipakai uji untuk memprediksi kotak separuh
 * sendiri tanpa browser; di browser kotak itu dibaca dari Camera asli.
 *
 * @returns {{projection:number[], modelView:number[]}}
 */
export function matriksKamera(zoom, sudut, target, layar) {
	const f = 1 / Math.tan((VFOV * Math.PI) / 360);
	const aspek = layar.lebar / layar.tinggi;
	const dekat = 1;
	const jauh = 1000;
	const projection = [
		f / aspek, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (jauh + dekat) / (dekat - jauh), -1,
		0, 0, (2 * jauh * dekat) / (dekat - jauh), 0
	];
	const rad = (sudut / 180) * Math.PI;
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	const putarX = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
	const modelView = kali(kali(geser(0, 0, -zoom / 2), putarX), geser(-target.x - 0.5, target.z, -target.y - 0.5));
	return { projection, modelView };
}

/**
 * Kamera TEMPUR/HASIL: seluruh papan (kedua separuh) muat di area bebas
 * antara dasar Timer dan puncak BilahDeck dengan margin MARGIN_PAPAN, di
 * tengah area itu. Dihitung langsung dari matriksKamera (bisection):
 * zoom terkecil (papan terbesar) dalam [ZOOM_MIN, ZOOM_MAKS] yang tingginya muat, lalu
 * geserY yang menaruh pusat kotak di tengah area.
 *
 * @returns {{zoom:number, sudut:number, geserY:number}}
 */
export function kameraPenuh(lebar, tinggi) {
	const l = hitungTataLetak(lebar, tinggi);
	const atas = l.Timer.kotak.y + l.Timer.kotak.tinggi;
	const bawah = l.BilahDeck.kotak.y;
	const tengah = (atas + bawah) / 2;
	const tersedia = bawah - atas - 2 * MARGIN_PAPAN - 2;  // 2 px cadangan pembulatan kotak
	const asal = { x: 0, y: 0 };
	const pusat = { x: KOLOM * SKALA / 2, y: BARIS * SKALA / 2 };
	const layar = { lebar, tinggi };
	const kotakUntuk = (zoom, g) => {
		const cam = matriksKamera(zoom, SUDUT, { x: pusat.x - 0.5, y: pusat.y - 0.5 - g, z: TINGGI_LANTAI }, layar);
		return kotakPapanPenuh(cam, asal, SKALA, () => TINGGI_LANTAI, layar);
	};
	// Pusat kotak turun bila g mengecil; cari g agar pusatnya = tengah (kontinu, tanpa pembulatan).
	const geserUntuk = (zoom) => {
		let lo = -12;
		let hi = 12;
		for (let i = 0; i < 40; i++) {
			const mid = (lo + hi) / 2;
			const b = kotakUntuk(zoom, mid);
			if (b.y + b.tinggi / 2 > tengah) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		return (lo + hi) / 2;
	};
	// Tinggi kotak turun bila zoom naik: ambil zoom TERKECIL (papan terbesar) yang muat.
	const muat = (z) => kotakUntuk(z, geserUntuk(z)).tinggi <= tersedia;
	let zoom = ZOOM_MIN;
	if (!muat(ZOOM_MIN)) {
		let lo = ZOOM_MIN;
		let hi = ZOOM_MAKS;
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			if (muat(mid)) {
				hi = mid;
			} else {
				lo = mid;
			}
		}
		zoom = Math.min(ZOOM_MAKS, Math.ceil(hi * 10) / 10);
	}
	return { zoom, sudut: SUDUT, geserY: Math.round(geserUntuk(zoom) * 100) / 100 };
}
