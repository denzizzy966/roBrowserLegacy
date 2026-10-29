/**
 * Sorotan petak papan (keputusan Q4 rencana AC4): separuh papan sendiri
 * disorot redup selama PERSIAPAN, dan petak di bawah pointer saat seret
 * disorot terang.
 *
 * Jalurnya FlatColorTile + EffectManager.add (rekon §4), dibuktikan oleh
 * spike Task 6 (__ac.cobaSorot di main.js). Dua jebakan yang ditemukan:
 *
 * 1. EffectManager mengelompokkan efek per `effect.constructor.name`, dan
 *    kelas buatan pabrik FlatColorTile SELALU bernama "FlatColorTile"
 *    apa pun warnanya. Dua warna akan berbagi satu daftar: hanya kelas
 *    pertama yang di-init, dan tile warna kedua diam-diam tidak tergambar
 *    (_program undefined). Karena itu setiap warna dibungkus subkelas
 *    bernama unik (kelasBernama).
 * 2. Satu FlatColorTile menutup tepat SATU cell (uSize 0,5 di sekitar
 *    posisi + 0,5), sedangkan satu petak = skala x skala cell. Satu petak
 *    digambar sebagai skala² tile.
 *
 * Tile terang tidak dibuat ulang tiap gerak pointer: posisinya dimutasi di
 * tempat (array `position` yang sama dipakai render dan culling
 * EffectManager). Bila EffectManager.free (ganti map) membuang tile kita,
 * tile itu tampak mati (ready dan needInit sama-sama false) dan dibuat
 * ulang pada panggilan berikutnya.
 *
 * Semua modul client/src/ disuntikkan; impor src/ hanya di main.js.
 */

import { KOLOM, BARIS } from './papan.js';

/** Baris separuh papan sendiri (TIM_A): 0..3. */
export const BARIS_SENDIRI = BARIS / 2;

/** Warna sorotan (0..1). Redup: separuh sendiri; terang: petak tujuan. */
export const WARNA_REDUP = { r: 0.35, g: 0.65, b: 1.0, a: 0.22 };
export const WARNA_TERANG = { r: 1.0, g: 0.9, b: 0.35, a: 0.55 };

/**
 * Cell map yang ditutup satu petak (orientasi TIM_A).
 *
 * @param {{x:number, y:number}} asal
 * @param {number} skala
 * @param {number} kolom 0..7
 * @param {number} baris 0..7
 * @returns {Array<[number, number]>} skala² pasangan [x, y]
 */
export function cellPetak(asal, skala, kolom, baris) {
	const hasil = [];
	for (let dy = 0; dy < skala; dy++) {
		for (let dx = 0; dx < skala; dx++) {
			hasil.push([asal.x + kolom * skala + dx, asal.y + baris * skala + dy]);
		}
	}
	return hasil;
}

/**
 * Subkelas bernama unik dari kelas FlatColorTile (lihat jebakan 1 di
 * atas). Static init/beforeRender/afterRender diwarisi; free diteruskan
 * ke kelas dasar supaya `ready` milik kelas dasar ikut padam dan
 * pemakaian berikutnya meng-init ulang program GL-nya.
 */
function kelasBernama(Dasar, nama) {
	const wadah = {
		[nama]: class extends Dasar {
			static free(gl) {
				Dasar.free(gl);
			}
		}
	};
	return wadah[nama];
}

/**
 * @param {object} dep
 * @param {{add: function}} dep.EffectManager
 * @param {function} dep.FlatColorTile pabrik Renderer/Effects/FlatColorTile.js
 * @param {{getCellHeight: function}} dep.Altitude
 * @param {{tick: number}} dep.Renderer
 * @param {{x:number, y:number}} dep.asal
 * @param {number} dep.skala
 * @param {(pesan: string) => void} [dep.log]
 * @returns {{separuhSendiri: function, petak: function, hentikan: function}}
 */
export function buatSorot({ EffectManager, FlatColorTile, Altitude, Renderer, asal, skala, log = () => {} }) {
	const Redup = kelasBernama(FlatColorTile('acSorotRedup', { ...WARNA_REDUP }), 'AcSorotRedup');
	const Terang = kelasBernama(FlatColorTile('acSorotTerang', { ...WARNA_TERANG }), 'AcSorotTerang');

	/** Tile redup separuh sendiri; kosong = tidak aktif. */
	let redup = [];
	/** skala² tile terang; dibuat sekali, dipindah lewat position. */
	let terang = [];
	/** Petak terang sekarang ('k,b') atau null. */
	let petakTerang = null;

	/** Tile yang masih hidup di EffectManager (belum dibuang free/clean). */
	function hidup(tile) {
		return !tile.needCleanUp && (tile.ready === true || tile.needInit === true);
	}

	function aturPosisi(pos, x, y) {
		pos[0] = x;
		pos[1] = y;
		pos[2] = Altitude.getCellHeight(x, y);
	}

	/** Menambah satu tile di cell (x, y); durasi 0 = abadi sampai needCleanUp. */
	function tambah(Kelas, x, y) {
		const pos = [0, 0, 0];
		aturPosisi(pos, x, y);
		const tile = new Kelas(pos, Renderer.tick);
		EffectManager.add(tile, {
			Inst: { position: pos, startTick: Renderer.tick, duration: 0, endTick: 0 },
			Init: { ownerAID: 0 },
			effect: {}
		});
		return tile;
	}

	/** Menandai tile untuk dibuang EffectManager.render pada frame berikutnya. */
	function buang(daftar) {
		for (const tile of daftar) {
			tile.needCleanUp = true;
		}
		return [];
	}

	function separuhSendiri(aktif) {
		if (!aktif) {
			redup = buang(redup);
			return;
		}
		if (redup.length && redup.every(hidup)) {
			return;
		}
		redup = buang(redup);
		for (let baris = 0; baris < BARIS_SENDIRI; baris++) {
			for (let kolom = 0; kolom < KOLOM; kolom++) {
				for (const [x, y] of cellPetak(asal, skala, kolom, baris)) {
					redup.push(tambah(Redup, x, y));
				}
			}
		}
	}

	function petak(kolom, baris) {
		if (kolom === null || kolom === undefined) {
			petakTerang = null;
			terang = buang(terang);
			return;
		}
		const kunci = `${kolom},${baris}`;
		const cells = cellPetak(asal, skala, kolom, baris);
		if (terang.length === cells.length && terang.every(hidup)) {
			if (kunci !== petakTerang) {
				cells.forEach(([x, y], i) => aturPosisi(terang[i].position, x, y));
			}
		} else {
			buang(terang);
			terang = cells.map(([x, y]) => tambah(Terang, x, y));
		}
		petakTerang = kunci;
	}

	function hentikan() {
		separuhSendiri(false);
		petak(null);
	}

	return { separuhSendiri, petak, hentikan };
}
