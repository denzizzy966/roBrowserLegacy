/**
 * Renderer murni jendela Log (R5): ekor teks log (baris terakhir) menjadi
 * HTML ber-escape, satu <div class="baris"> per baris. Baris yang diawali
 * "!" (galat/peringatan di main.js log()) diberi kelas "galat".
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Jumlah baris ekor yang ditampilkan jendela Log. */
export const BARIS_LOG_MAKS = 200;

/**
 * Mengambil `maks` baris terakhir dari teks log tanpa memecah seluruh teks
 * (log bisa panjang pada soak: hanya ekornya yang dipindai).
 *
 * @param {string} teks isi #log (baris dipisah newline, biasanya berakhir newline)
 * @param {number} [maks]
 * @returns {string[]}
 */
export function ekorLog(teks, maks = BARIS_LOG_MAKS) {
	const s = String(teks ?? '');
	const akhir = s.endsWith('\n') ? s.length - 1 : s.length;
	if (akhir <= 0) {
		return [];
	}
	// Mundur dari akhir: awal = posisi sesudah newline ke-`maks` dari belakang.
	let awal = akhir;
	for (let n = 0; n < maks; n++) {
		const sebelum = s.lastIndexOf('\n', awal - 1);
		if (sebelum < 0) {
			awal = 0;
			break;
		}
		awal = sebelum;
		if (n === maks - 1) {
			awal = sebelum + 1; // baris tertua yang dipertahankan dimulai sesudah newline ini
		}
	}
	return s.slice(awal, akhir).split('\n');
}

/** Toleransi (px) agar dianggap "di dasar" saat menggulir. */
export const TOLERANSI_DASAR = 4;

/** true bila elemen bergulir sedang di dasar (atau belum bisa digulir). */
export function diDasar(el, toleransi = TOLERANSI_DASAR) {
	return el.scrollTop + el.clientHeight >= el.scrollHeight - toleransi;
}

/**
 * Menulis html ke elemen bergulir `isi`, menggulir ke dasar HANYA bila
 * pengguna sudah di dasar sebelum penulisan (atau isi pertama kali /
 * `paksaDasar`); selain itu scrollTop dipertahankan, supaya pembaca yang
 * menggulir ke atas tidak ditarik balik tiap denyut.
 *
 * @param {{scrollTop:number, scrollHeight:number, clientHeight:number}} isi
 * @param {string} html
 * @param {function(object, string): boolean} tulis tulisBila (true bila berubah)
 * @param {boolean} [paksaDasar]
 * @returns {boolean} true bila isi berubah
 */
export function perbaruiLog(isi, html, tulis, paksaDasar = false) {
	// Penulisan ulang sesudah lupakanTulisan (ganti bahasa) bukan yang pertama.
	const pertama = isi._htmlTerakhir === undefined && !isi._pernahDitulis;
	const sebelum = isi.scrollTop;
	const diBawah = paksaDasar || pertama || diDasar(isi);
	const berubah = tulis(isi, html);
	if (berubah) {
		isi.scrollTop = diBawah ? isi.scrollHeight : sebelum;
	}
	return berubah;
}

/**
 * @param {string} teks isi #log
 * @param {number} [maks] jumlah baris terakhir
 * @returns {string} HTML isi jendela Log ('' bila log kosong)
 */
export function renderLog(teks, maks = BARIS_LOG_MAKS) {
	return ekorLog(teks, maks)
		.map((b) => `<div class="baris${b.startsWith('!') ? ' galat' : ''}">${esc(b)}</div>`)
		.join('');
}
