/**
 * Tata letak akhir jendela RO autochess (Q8), mengikuti gambar referensi
 * autochess-game-interface.jpg:
 *
 *   A Timer kiri-atas          C Kapasitas tengah-atas    D Zeny kanan-atas
 *   B DaftarPemain kolom kiri  E Sinergi di bawah D       F tombol DPS kanan-tengah
 *   G InfoPemain (terlipat) di atas H                     DPS di kiri tombol F
 *   H Exp kiri-bawah           I Bangku tengah-bawah      K tombol Toko kanan-bawah
 *   Toko = overlay di atas Bangku, Lore di tengah, Log kanan-bawah di atas K
 *   (semuanya tersembunyi bawaan).
 *
 * hitungTataLetak murni (teruji di vitest); aturTataLetak menerapkannya ke
 * host GUIComponent. Posisi di sini MENIMPA :host di berkas .css (inline
 * menang), termasuk transform: jendela yang bisa diseret (InfoPemain, DPS,
 * Lore) membaca offsetLeft/Top, jadi translate(-50%) membuatnya melompat.
 */

import { gabungPosisi } from './posisi.js';

/** Jarak tepi layar dan jarak antarjendela (px). */
export const TEPI = 8;
export const SELA = 6;

/**
 * Ukuran tetap jendela (px), sama dengan :host di berkas .css-nya. Tinggi
 * Sinergi, DPS, dan Toko bergantung isi: angka di sini perkiraan untuk uji
 * tumpang tindih (Sinergi dua baris ikon, DPS delapan bidak, Toko lima kartu).
 */
export const UKURAN = {
	Timer:        { lebar: 220, tinggi: 64 },
	Kapasitas:    { lebar: 90,  tinggi: 36 },
	Zeny:         { lebar: 140, tinggi: 36 },
	Sinergi:      { lebar: 260, tinggi: 106 },
	DaftarPemain: { lebar: 170, tinggi: 396 },
	TombolDPS:    { lebar: 48,  tinggi: 48 },
	DPS:          { lebar: 220, tinggi: 180 },
	InfoPemain:   { lebar: 200, tinggi: 18, tinggiTerbuka: 166 },  // terlipat; terbuka tumbuh ke atas
	Exp:          { lebar: 200, tinggi: 70 },
	Bangku:       { lebar: 640, tinggi: 110 },
	TombolToko:   { lebar: 48,  tinggi: 48 },
	Toko:         { lebar: 620, tinggi: 216 },
	Lore:         { lebar: 360, tinggi: 220 },
	Log:          { lebar: 320, tinggi: 140 }
};

/** Jendela yang tersembunyi bawaan (dikecualikan dari uji tumpang tindih). */
export const OVERLAY = ['Toko', 'DPS', 'Lore', 'Log'];

/** Puncak kolom DaftarPemain: di bawah Timer. */
const ATAS_DAFTAR = 80;

/**
 * Menghitung posisi semua jendela untuk layar lebar x tinggi.
 *
 * Tiap entri berisi properti CSS dalam px -- {top, left} untuk sebagian
 * besar, {top, right} untuk Sinergi (lebarnya mengikuti isi, rata kanan),
 * {bottom, left|right} untuk InfoPemain dan Toko (tumbuh ke atas saat
 * dibuka/berisi lebih) -- ditambah `kotak: {x, y, lebar, tinggi}` perkiraan
 * untuk uji tumpang tindih (InfoPemain juga `kotakTerbuka`). DaftarPemain
 * membawa `maxHeight`: kolomnya berhenti di atas InfoPemain yang TERBUKA
 * dan bergulir di layar pendek.
 *
 * @param {number} lebar Renderer.width
 * @param {number} tinggi Renderer.height
 * @returns {Object<string, {top?, left?, right?, bottom?, maxHeight?, kotak}>}
 */
export function hitungTataLetak(lebar, tinggi) {
	const U = UKURAN;
	const kotak = (x, y, nama, t = U[nama].tinggi) => ({ x, y, lebar: U[nama].lebar, tinggi: t });

	const atasExp = tinggi - TEPI - U.Exp.tinggi;
	const bawahInfo = TEPI + U.Exp.tinggi + SELA;           // jarak dari bawah layar
	const atasInfo = tinggi - bawahInfo - U.InfoPemain.tinggi;
	// InfoPemain terbuka tumbuh ke atas: DaftarPemain berhenti di atas
	// tinggi TERBUKA-nya, supaya membuka InfoPemain tidak menutupi daftar.
	const atasInfoTerbuka = tinggi - bawahInfo - U.InfoPemain.tinggiTerbuka;
	const maxDaftar = Math.max(120, atasInfoTerbuka - TEPI - ATAS_DAFTAR);
	const atasBangku = tinggi - TEPI - U.Bangku.tinggi;
	const kiriBangku = Math.round((lebar - U.Bangku.lebar) / 2);
	const bawahToko = TEPI + U.Bangku.tinggi + SELA;
	const kiriToko = Math.round((lebar - U.Toko.lebar) / 2);
	const kiriZeny = lebar - TEPI - U.Zeny.lebar;
	const atasSinergi = TEPI + U.Zeny.tinggi + TEPI;
	const kiriTombolKanan = lebar - TEPI - U.TombolDPS.lebar;
	const atasTombolDPS = Math.round(tinggi * 0.45);
	const kiriDPS = kiriTombolKanan - SELA - U.DPS.lebar;
	const kiriKap = Math.round((lebar - U.Kapasitas.lebar) / 2);
	// Log: rata kanan, tepat di atas tombol K. Bila slot itu menabrak Bangku
	// atau DPS (layar sempit), ia pindah ke slot kolom kanan di antara Sinergi
	// dan DPS, selama muat. Bila slot itu pun tidak muat (layar terpendek,
	// mis. 1314x588) tetap di atas K dan boleh menimpa DPS: dua overlay yang
	// tersembunyi bawaan dan bisa digeser (PENGECUALIAN_TUMPANG di uji).
	const kiriLog = lebar - TEPI - U.Log.lebar;
	let atasLog = tinggi - TEPI - U.TombolToko.tinggi - SELA - U.Log.tinggi;
	const kenaTetangga = (y) => {
		const k = { x: kiriLog, y, lebar: U.Log.lebar, tinggi: U.Log.tinggi };
		return beririsan(k, { x: kiriBangku, y: atasBangku, lebar: U.Bangku.lebar, tinggi: U.Bangku.tinggi })
			|| beririsan(k, { x: kiriDPS, y: atasTombolDPS, lebar: U.DPS.lebar, tinggi: U.DPS.tinggi });
	};
	if (kenaTetangga(atasLog)) {
		const alternatif = atasTombolDPS - SELA - U.Log.tinggi;
		if (alternatif >= atasSinergi + U.Sinergi.tinggi + SELA && !kenaTetangga(alternatif)) {
			atasLog = alternatif;
		}
	}

	return {
		Timer:        { top: TEPI, left: TEPI, kotak: kotak(TEPI, TEPI, 'Timer') },
		Kapasitas:    { top: TEPI, left: kiriKap, kotak: kotak(kiriKap, TEPI, 'Kapasitas') },
		Zeny:         { top: TEPI, left: kiriZeny, kotak: kotak(kiriZeny, TEPI, 'Zeny') },
		Sinergi:      { top: atasSinergi, right: TEPI, kotak: kotak(lebar - TEPI - U.Sinergi.lebar, atasSinergi, 'Sinergi') },
		DaftarPemain: {
			top: ATAS_DAFTAR, left: TEPI, maxHeight: maxDaftar,
			kotak: kotak(TEPI, ATAS_DAFTAR, 'DaftarPemain', Math.min(U.DaftarPemain.tinggi, maxDaftar))
		},
		TombolDPS:    { top: atasTombolDPS, left: kiriTombolKanan, kotak: kotak(kiriTombolKanan, atasTombolDPS, 'TombolDPS') },
		DPS:          { top: atasTombolDPS, left: kiriDPS, kotak: kotak(kiriDPS, atasTombolDPS, 'DPS') },
		InfoPemain:   {
			bottom: bawahInfo, left: TEPI, kotak: kotak(TEPI, atasInfo, 'InfoPemain'),
			kotakTerbuka: kotak(TEPI, atasInfoTerbuka, 'InfoPemain', U.InfoPemain.tinggiTerbuka)
		},
		Exp:          { top: atasExp, left: TEPI, kotak: kotak(TEPI, atasExp, 'Exp') },
		Bangku:       { top: atasBangku, left: kiriBangku, kotak: kotak(kiriBangku, atasBangku, 'Bangku') },
		TombolToko:   {
			top: tinggi - TEPI - U.TombolToko.tinggi, left: kiriTombolKanan,
			kotak: kotak(kiriTombolKanan, tinggi - TEPI - U.TombolToko.tinggi, 'TombolToko')
		},
		Toko:         {
			bottom: bawahToko, left: kiriToko,
			kotak: kotak(kiriToko, tinggi - bawahToko - U.Toko.tinggi, 'Toko')
		},
		Lore:         {
			top: Math.round(tinggi * 0.2), left: Math.round((lebar - U.Lore.lebar) / 2),
			kotak: kotak(Math.round((lebar - U.Lore.lebar) / 2), Math.round(tinggi * 0.2), 'Lore')
		},
		Log:          { top: atasLog, left: kiriLog, kotak: kotak(kiriLog, atasLog, 'Log') }
	};
}

/** Jarak pojok kiri-atas KartuBidak dari pointer (px). */
export const JARAK_KARTU = 16;

/**
 * Posisi KartuBidak (R4). Kartu ini SENGAJA tidak ada di hitungTataLetak:
 * ia menempel ke pointer, bukan ke tepi layar, jadi tidak punya kotak
 * tetap untuk uji tumpang tindih dan aturTataLetak tidak menyentuhnya
 * (jendelanya sendiri yang memanggil fungsi ini setiap ditampilkan).
 *
 * Pojok kiri-atas = pointer + JARAK_KARTU. Bila melewati tepi kanan/bawah
 * layar, kartu dibalik ke sisi kiri/atas pointer (supaya tidak menutupi
 * bidak yang sedang ditunjuk), lalu dijepit ke dalam layar.
 *
 * @param {{x:number, y:number}} titik pointer (clientX/Y)
 * @param {{lebar:number, tinggi:number}} ukuran ukuran kartu
 * @param {{lebar:number, tinggi:number}} layar ukuran viewport
 * @returns {{left:number, top:number}}
 */
export function posisiKartu(titik, ukuran, layar) {
	const jepit = (v, maks) => Math.max(TEPI, Math.min(v, maks));
	let left = titik.x + JARAK_KARTU;
	let top = titik.y + JARAK_KARTU;
	if (left + ukuran.lebar > layar.lebar - TEPI) {
		left = titik.x - JARAK_KARTU - ukuran.lebar;
	}
	if (top + ukuran.tinggi > layar.tinggi - TEPI) {
		top = titik.y - JARAK_KARTU - ukuran.tinggi;
	}
	return {
		left: Math.round(jepit(left, layar.lebar - TEPI - ukuran.lebar)),
		top: Math.round(jepit(top, layar.tinggi - TEPI - ukuran.tinggi))
	};
}

/** true bila dua kotak {x, y, lebar, tinggi} beririsan (bersentuhan tidak). */
export function beririsan(a, b) {
	return a.x < b.x + b.lebar && b.x < a.x + a.lebar && a.y < b.y + b.tinggi && b.y < a.y + a.tinggi;
}

const PROPERTI = ['top', 'left', 'right', 'bottom'];

/**
 * Menerapkan hitungTataLetak ke host jendela yang sudah di-append.
 * Posisi yang pernah digeser pengguna (R6, ui/posisi.js) menang atas
 * perhitungan selama seluruh kotaknya masih di layar.
 *
 * @param {Object<string, {_host: HTMLElement}>} jendela nama -> GUIComponent
 * @param {{width: number, height: number}} Renderer
 * @param {Object<string, {left:number, top:number}>} [tersimpan] posisi geseran tersimpan
 * @returns {object} tata letak yang diterapkan
 */
export function aturTataLetak(jendela, Renderer, tersimpan = {}) {
	const lebar = Renderer.width || window.innerWidth;
	const tinggi = Renderer.height || window.innerHeight;
	const letak = gabungPosisi(hitungTataLetak(lebar, tinggi), tersimpan, lebar, tinggi);
	for (const [nama, posisi] of Object.entries(letak)) {
		const host = jendela[nama]?._host;
		if (!host) {
			continue;
		}
		for (const p of PROPERTI) {
			host.style[p] = p in posisi ? `${posisi[p]}px` : 'auto';
		}
		host.style.transform = 'none';
		if ('maxHeight' in posisi) {
			host.style.maxHeight = `${posisi.maxHeight}px`;
			host.style.overflowY = 'auto';
		}
	}
	return letak;
}
