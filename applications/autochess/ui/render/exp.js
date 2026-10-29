/** Renderer murni jendela Exp (H): level, bar EXP 100x4, tombol Beli EXP. */

import { FASE } from '../../pesan.js';

/**
 * @param {object} snap state.ambil()
 * @param {function} t penerjemah teks.js
 * @param {object} ekonomi katalog.ekonomi ({beli_exp: {harga, exp}, level_maks}).
 *   MAX = level >= level_maks; tanpa level_maks (katalog gagal dimuat)
 *   jatuh ke expBerikut <= 0 dari server.
 * @returns {string}
 */
export function renderExp(snap, t, ekonomi) {
	const s = snap.state?.saya;
	const level = s?.level ?? 1;
	const levelMaks = ekonomi?.level_maks ?? 0;
	const maks = (levelMaks > 0 && level >= levelMaks) || (!!s && s.expBerikut <= 0);
	const exp = s?.exp ?? 0;
	const butuh = s?.expBerikut ?? 0;
	const persen = maks ? 100 : Math.max(0, Math.min(100, butuh > 0 ? Math.round(exp / butuh * 100) : 0));
	const teksExp = maks ? 'MAX' : `${exp}/${butuh}`;
	const harga = ekonomi?.beli_exp?.harga ?? 0;
	const aktif = !!s && snap.fase === FASE.PERSIAPAN && !snap.selesai && !maks && s.zeny >= harga;
	return `<div class="lv">${t('label.level', level)}</div>`
		+ `<div class="bexp" title="${persen}%"><div style="width:${persen}%"></div></div>`
		+ `<div class="angka-exp">${teksExp}</div>`
		+ `<button class="beli" data-aksi="beli-exp"${aktif ? '' : ' disabled'}>${t('tombol.beliExp')} (${harga}z)</button>`;
}
