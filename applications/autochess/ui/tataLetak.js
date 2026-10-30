/**
 * Tata letak jendela RO autochess (Q8), awalnya mengikuti gambar referensi
 * autochess-game-interface.jpg, dituntaskan untuk layar pendek di AC6 (K8;
 * pemilik bermain di viewport 1536x695):
 *
 *   A Timer kiri-atas          E Sinergi kanan-atas (puncak layar)
 *   B DaftarPemain kolom kiri  Toko kolom kanan di bawah E, di atas K
 *   DPS lalu Log di kolom kiri di bawah B (overlay, tersembunyi bawaan)
 *   G InfoPemain (terlipat) kiri-bawah      F tombol DPS di kiri K
 *   BilahDeck tepat di atas I  I Bangku tengah-bawah   K tombol Toko kanan-bawah
 *   Lore di tengah (tersembunyi bawaan).
 *
 * Papan (separuh sendiri) ditaruh kamera.js di tengah layar, di atas
 * BilahDeck; tidak ada jendela tetap yang boleh menutupnya (uji memakai
 * SEPARUH_SENDIRI hasil __ac.kotakSeparuh()).
 *
 * AC6 K4: jendela Exp (H), Kapasitas (C), dan Zeny (D) dihapus; isinya
 * pindah ke BilahDeck, jadi Sinergi naik ke puncak layar.
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
 * Sinergi, DPS, Toko, dan Lore bergantung isi: angka di sini perkiraan untuk
 * uji tumpang tindih (Sinergi dua baris ikon, DPS delapan bidak, Toko kepala
 * dan lima kartu mendatar).
 */
export const UKURAN = {
	Timer:        { lebar: 220, tinggi: 64 },
	Sinergi:      { lebar: 260, tinggi: 106 },
	DaftarPemain: { lebar: 190, tinggi: 8 * 32 + 22 },  // 8 baris 30 px + sela 2 px + kepala 22 px, tanpa gulir
	TombolDPS:    { lebar: 48,  tinggi: 48 },
	DPS:          { lebar: 220, tinggi: 180 },
	InfoPemain:   { lebar: 200, tinggi: 18, tinggiTerbuka: 166 },  // terlipat; terbuka tumbuh ke atas
	BilahDeck:    { lebar: 640, tinggi: 34 },
	Bangku:       { lebar: 640, tinggi: 110 },
	TombolToko:   { lebar: 48,  tinggi: 48 },
	Toko:         { lebar: 170, tinggi: 453 },  // terukur: 4+5+2 bingkai, 16 judul, 28 kepala, 5 kartu 78 px + 4 sela 2 px
	Lore:         { lebar: 360, tinggi: 220 },
	Log:          { lebar: 320, tinggi: 140 }
};

/**
 * Jendela yang bisa disembunyikan (dikecualikan dari uji tumpang tindih
 * jendela tetap). Toko tampil bawaan sejak AC6 tetapi tetap bisa ditutup
 * lewat K; uji kedua memeriksanya terhadap semua jendela lain.
 */
export const OVERLAY = ['Toko', 'DPS', 'Lore', 'Log'];

/** Puncak kolom DaftarPemain: di bawah Timer. */
const ATAS_DAFTAR = 80;

/** Puncak Sinergi: pojok kanan-atas layar (slot Zeny di atasnya sudah dihapus, AC6 K4). */
const ATAS_SINERGI = TEPI;

/**
 * Menghitung posisi semua jendela untuk layar lebar x tinggi.
 *
 * Tiap entri berisi properti CSS dalam px -- {top, left} untuk sebagian
 * besar, {top, right} untuk Sinergi (lebarnya mengikuti isi, rata kanan),
 * {bottom, left} untuk InfoPemain (tumbuh ke atas saat dibuka) -- ditambah
 * `kotak: {x, y, lebar, tinggi}` perkiraan untuk uji tumpang tindih
 * (InfoPemain juga `kotakTerbuka`). DaftarPemain membawa `maxHeight`:
 * kolomnya berhenti di atas InfoPemain yang TERBUKA dan bergulir di layar
 * pendek.
 *
 * @param {number} lebar Renderer.width
 * @param {number} tinggi Renderer.height
 * @returns {Object<string, {top?, left?, right?, bottom?, maxHeight?, kotak}>}
 */
export function hitungTataLetak(lebar, tinggi) {
	const U = UKURAN;
	const kotak = (x, y, nama, t = U[nama].tinggi) => ({ x, y, lebar: U[nama].lebar, tinggi: t });

	const bawahInfo = TEPI;                                   // jarak dari bawah layar
	const atasInfo = tinggi - bawahInfo - U.InfoPemain.tinggi;
	// InfoPemain terbuka tumbuh ke atas: DaftarPemain berhenti di atas
	// tinggi TERBUKA-nya, supaya membuka InfoPemain tidak menutupi daftar.
	const atasInfoTerbuka = tinggi - bawahInfo - U.InfoPemain.tinggiTerbuka;
	const maxDaftar = Math.max(120, atasInfoTerbuka - TEPI - ATAS_DAFTAR);
	const atasBangku = tinggi - TEPI - U.Bangku.tinggi;
	const kiriBangku = Math.round((lebar - U.Bangku.lebar) / 2);
	const atasBilah = atasBangku - SELA - U.BilahDeck.tinggi;
	const kiriTombolKanan = lebar - TEPI - U.TombolToko.lebar;
	const atasTombolBawah = tinggi - TEPI - U.TombolToko.tinggi;
	const kiriTombolDPS = kiriTombolKanan - SELA - U.TombolDPS.lebar;
	const bawahSinergi = ATAS_SINERGI + U.Sinergi.tinggi + SELA;
	// Toko: kolom kanan di bawah Sinergi dan di atas tombol K.
	const kiriToko = lebar - TEPI - U.Toko.lebar;
	const atasToko = Math.max(TEPI, Math.min(bawahSinergi, atasTombolBawah - SELA - U.Toko.tinggi));
	// DPS dan Log: overlay tersembunyi bawaan yang bisa digeser, ditaruh di
	// kiri papan (kamera.js menaruh papan di tengah layar). Calon tempat
	// diperiksa berurutan terhadap jendela tetap dan Toko; pilihan pertama
	// yang tidak menabrak apa pun menang. Bila tidak ada, jatuh ke calon
	// terakhir yang boleh menabrak (PENGECUALIAN_TUMPANG di uji).
	const tetap = [
		kotak(TEPI, TEPI, 'Timer'),
		kotak(lebar - TEPI - U.Sinergi.lebar, ATAS_SINERGI, 'Sinergi'),
		kotak(TEPI, ATAS_DAFTAR, 'DaftarPemain'),
		kotak(TEPI, atasInfo, 'InfoPemain'),
		kotak(kiriBangku, atasBilah, 'BilahDeck'),
		kotak(kiriBangku, atasBangku, 'Bangku'),
		kotak(kiriTombolKanan, atasTombolBawah, 'TombolToko'),
		kotak(kiriTombolDPS, atasTombolBawah, 'TombolDPS'),
		kotak(kiriToko, atasToko, 'Toko')
	];
	const infoTerbuka = kotak(TEPI, atasInfoTerbuka, 'InfoPemain', U.InfoPemain.tinggiTerbuka);
	const bawahDaftar = ATAS_DAFTAR + U.DaftarPemain.tinggi + SELA;
	const sampingInfo = TEPI + U.InfoPemain.lebar + SELA;
	const pilih = (nama, calon, lain) => {
		const kotakDi = ([x, y]) => ({ x, y, lebar: U[nama].lebar, tinggi: U[nama].tinggi });
		const bebas = (c, rintangan) => !rintangan.some((r) => beririsan(kotakDi(c), r));
		return calon.find((c) => bebas(c, [...tetap, infoTerbuka, ...lain]))
			?? calon.find((c) => bebas(c, [...tetap, ...lain]))
			?? calon[calon.length - 1];
	};
	// Log: di bawah DaftarPemain, atau di samping InfoPemain (bawah-kiri).
	const [kiriLog, atasLog] = pilih('Log', [
		[TEPI, bawahDaftar],
		[sampingInfo, tinggi - TEPI - U.Log.tinggi],
		[TEPI, bawahDaftar]
	], []);
	const kotakLog = { x: kiriLog, y: atasLog, lebar: U.Log.lebar, tinggi: U.Log.tinggi };
	// DPS: di bawah Log, di samping InfoPemain, atau (terakhir) di bawah DaftarPemain.
	const [kiriDPS, atasDPS] = pilih('DPS', [
		[TEPI, atasLog + U.Log.tinggi + SELA],
		[sampingInfo, tinggi - TEPI - U.DPS.tinggi],
		[TEPI, bawahDaftar]
	], [kotakLog]);

	return {
		Timer:        { top: TEPI, left: TEPI, kotak: kotak(TEPI, TEPI, 'Timer') },
		Sinergi:      { top: ATAS_SINERGI, right: TEPI, kotak: kotak(lebar - TEPI - U.Sinergi.lebar, ATAS_SINERGI, 'Sinergi') },
		DaftarPemain: {
			top: ATAS_DAFTAR, left: TEPI, maxHeight: maxDaftar,
			kotak: kotak(TEPI, ATAS_DAFTAR, 'DaftarPemain', Math.min(U.DaftarPemain.tinggi, maxDaftar))
		},
		TombolDPS:    { top: atasTombolBawah, left: kiriTombolDPS, kotak: kotak(kiriTombolDPS, atasTombolBawah, 'TombolDPS') },
		DPS:          { top: atasDPS, left: kiriDPS, kotak: kotak(kiriDPS, atasDPS, 'DPS') },
		InfoPemain:   {
			bottom: bawahInfo, left: TEPI, kotak: kotak(TEPI, atasInfo, 'InfoPemain'),
			kotakTerbuka: kotak(TEPI, atasInfoTerbuka, 'InfoPemain', U.InfoPemain.tinggiTerbuka)
		},
		BilahDeck:    { top: atasBilah, left: kiriBangku, kotak: kotak(kiriBangku, atasBilah, 'BilahDeck') },
		Bangku:       { top: atasBangku, left: kiriBangku, kotak: kotak(kiriBangku, atasBangku, 'Bangku') },
		TombolToko:   { top: atasTombolBawah, left: kiriTombolKanan, kotak: kotak(kiriTombolKanan, atasTombolBawah, 'TombolToko') },
		Toko:         { top: atasToko, left: kiriToko, kotak: kotak(kiriToko, atasToko, 'Toko') },
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
