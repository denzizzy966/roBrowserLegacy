/**
 * Tata letak akhir jendela RO autochess (Q8), mengikuti gambar referensi
 * autochess-game-interface.jpg:
 *
 *   A Timer kiri-atas          C Kapasitas tengah-atas    D Zeny kanan-atas
 *   B DaftarPemain kolom kiri  E Sinergi di bawah D       F tombol DPS kanan-tengah
 *   G InfoPemain (terlipat) di atas H                     DPS di kiri tombol F
 *   H Exp kiri-bawah           I Bangku tengah-bawah      K tombol Toko kanan-bawah
 *   Toko = overlay di atas Bangku, Lore di tengah (keduanya tersembunyi bawaan).
 *
 * hitungTataLetak murni (teruji di vitest); aturTataLetak menerapkannya ke
 * host GUIComponent. Posisi di sini MENIMPA :host di berkas .css (inline
 * menang), termasuk transform: jendela yang bisa diseret (InfoPemain, DPS,
 * Lore) membaca offsetLeft/Top, jadi translate(-50%) membuatnya melompat.
 */

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
	InfoPemain:   { lebar: 200, tinggi: 18 },  // terlipat; terbuka 166, tumbuh ke atas
	Exp:          { lebar: 200, tinggi: 70 },
	Bangku:       { lebar: 640, tinggi: 110 },
	TombolToko:   { lebar: 48,  tinggi: 48 },
	Toko:         { lebar: 620, tinggi: 216 },
	Lore:         { lebar: 360, tinggi: 220 }
};

/** Jendela yang tersembunyi bawaan (dikecualikan dari uji tumpang tindih). */
export const OVERLAY = ['Toko', 'DPS', 'Lore'];

/** Puncak kolom DaftarPemain: di bawah Timer. */
const ATAS_DAFTAR = 80;

/**
 * Menghitung posisi semua jendela untuk layar lebar x tinggi.
 *
 * Tiap entri berisi properti CSS dalam px -- {top, left} untuk sebagian
 * besar, {top, right} untuk Sinergi (lebarnya mengikuti isi, rata kanan),
 * {bottom, left|right} untuk InfoPemain dan Toko (tumbuh ke atas saat
 * dibuka/berisi lebih) -- ditambah `kotak: {x, y, lebar, tinggi}` perkiraan
 * untuk uji tumpang tindih. DaftarPemain membawa `maxHeight`: kolomnya
 * berhenti di atas InfoPemain dan bergulir di layar pendek.
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
	const maxDaftar = Math.max(120, atasInfo - TEPI - ATAS_DAFTAR);
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
		InfoPemain:   { bottom: bawahInfo, left: TEPI, kotak: kotak(TEPI, atasInfo, 'InfoPemain') },
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
		}
	};
}

/** true bila dua kotak {x, y, lebar, tinggi} beririsan (bersentuhan tidak). */
export function beririsan(a, b) {
	return a.x < b.x + b.lebar && b.x < a.x + a.lebar && a.y < b.y + b.tinggi && b.y < a.y + a.tinggi;
}

const PROPERTI = ['top', 'left', 'right', 'bottom'];

/**
 * Menerapkan hitungTataLetak ke host jendela yang sudah di-append.
 *
 * @param {Object<string, {_host: HTMLElement}>} jendela nama -> GUIComponent
 * @param {{width: number, height: number}} Renderer
 * @returns {object} hasil hitungTataLetak yang diterapkan
 */
export function aturTataLetak(jendela, Renderer) {
	const letak = hitungTataLetak(Renderer.width || window.innerWidth, Renderer.height || window.innerHeight);
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
