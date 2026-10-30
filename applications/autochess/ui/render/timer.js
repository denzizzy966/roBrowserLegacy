/**
 * Renderer murni jendela Timer (A): mm:ss, ronde, nama fase, dan hasil
 * ronde terakhir saat fase HASIL. Tidak menyentuh DOM.
 *
 * AC6 K13: saat menonton kursi lain ada baris ketiga "Menonton: X" (di
 * PERSIAPAN) atau "Menonton: bawah vs atas" (TEMPUR/HASIL; bawah =
 * kursiBawah, Tim A pasangan itu).
 */

import { FASE } from '../../pesan.js';
import { menontonLain } from '../../state.js';
import { formatWaktu } from './waktu.js';

const KUNCI_FASE = {
	[FASE.PERSIAPAN]: 'fase.persiapan',
	[FASE.TEMPUR]:    'fase.tempur',
	[FASE.HASIL]:     'fase.hasil'
};

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks dari server sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Nama kursi seperti di Daftar Pemain. */
function namaKursi(snap, kursi, t) {
	const k = (snap.state?.kursi ?? []).find((x) => x.kursi === kursi);
	if (k?.nama) {
		return k.nama;
	}
	if (k && !k.bot) {
		return t('label.anda');
	}
	return t('label.bot', kursi);
}

/**
 * Teks baris tontonan, '' bila menonton papan sendiri.
 *
 * @param {object} snap state.ambil()
 * @param {function} t penerjemah teks.js
 * @returns {string} teks polos (belum diloloskan)
 */
export function teksTontonan(snap, t) {
	if (!menontonLain(snap)) {
		return '';
	}
	const nama = (k) => namaKursi(snap, k, t);
	const bertempur = snap.fase === FASE.TEMPUR || snap.fase === FASE.HASIL;
	if (!bertempur) {
		return t('label.menonton', nama(snap.ditonton));
	}
	if (!(snap.lawanKursi >= 0)) {
		// Ronde creep: tanpa kursi lawan.
		return t('label.menontonVs', nama(snap.ditonton), t('label.creep'));
	}
	const bawah = snap.kursiBawah;
	const atas = bawah === snap.ditonton ? snap.lawanKursi : snap.ditonton;
	return t('label.menontonVs', nama(bawah), nama(atas));
}

/**
 * @param {object} snap state.ambil() ditambah sisaMs (milidetik)
 * @param {function} t penerjemah teks.js
 * @returns {string} HTML badan jendela
 */
export function renderTimer(snap, t) {
	const waktu = formatWaktu(snap.sisaMs ?? 0);
	const kunciFase = KUNCI_FASE[snap.fase] ?? 'fase.menunggu';
	let hasil = '';
	if (snap.fase === FASE.HASIL && snap.hasilTerakhir) {
		const h = snap.hasilTerakhir;
		const [kelas, kunci] = h.seri ? ['seri', 'label.seri'] : h.menang ? ['menang', 'label.menang'] : ['kalah', 'label.kalah'];
		hasil = `<span class="hasil ${kelas}">${t(kunci)}</span>`;
	}
	const tonton = teksTontonan(snap, t);
	return `<div class="waktu-teks">${waktu}</div>`
		+ `<div class="info"><span class="ronde">${t('label.ronde', snap.ronde)}</span> `
		+ `<span class="fase">${t(kunciFase)}</span>${hasil}</div>`
		+ (tonton ? `<div class="tonton">${esc(tonton)}</div>` : '');
}
