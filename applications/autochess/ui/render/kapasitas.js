/** Renderer murni jendela Kapasitas (C): bidak di papan / kapasitas. */

/**
 * @param {object} snap state.ambil() (state.saya.bidak, state.saya.kapasitas)
 * @param {function} t penerjemah teks.js
 * @returns {string}
 */
export function renderKapasitas(snap, t) {
	const saya = snap.state?.saya;
	const n = saya ? saya.bidak.filter((b) => b.diPapan).length : 0;
	const maks = saya ? saya.kapasitas : 0;
	const penuh = maks > 0 && n >= maks ? ' penuh' : '';
	return `<span class="ikon">♞</span><span class="angka${penuh}" title="${t('label.kapasitas', n, maks)}">${n}/${maks}</span>`;
}
