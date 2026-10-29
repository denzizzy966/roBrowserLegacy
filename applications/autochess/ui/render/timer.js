/**
 * Renderer murni jendela Timer (A): mm:ss, ronde, nama fase, dan hasil
 * ronde terakhir saat fase HASIL. Tidak menyentuh DOM.
 */

import { FASE } from '../../pesan.js';
import { formatWaktu } from './waktu.js';

const KUNCI_FASE = {
	[FASE.PERSIAPAN]: 'fase.persiapan',
	[FASE.TEMPUR]:    'fase.tempur',
	[FASE.HASIL]:     'fase.hasil'
};

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
	return `<div class="waktu-teks">${waktu}</div>`
		+ `<div class="info"><span class="ronde">${t('label.ronde', snap.ronde)}</span> `
		+ `<span class="fase">${t(kunciFase)}</span>${hasil}</div>`;
}
