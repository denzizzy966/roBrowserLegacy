/** Renderer murni jendela Zeny (D): ikon (diisi Zeny.js) dan jumlah. */

/**
 * @param {object} snap state.ambil()
 * @param {function} t penerjemah teks.js
 * @param {function} formatZeny teks.js formatZeny
 * @returns {string}
 */
export function renderZeny(snap, t, formatZeny) {
	const zeny = snap.state?.saya?.zeny ?? 0;
	return `<span class="angka" title="${t('label.zeny')}">${formatZeny(zeny)}</span>`;
}
