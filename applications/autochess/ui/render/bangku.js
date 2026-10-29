/**
 * Renderer murni jendela Bangku (I): strip bawah delapan slot. Slot terisi
 * memuat kanvas potret (diisi Bangku.js lewat potret.hidup), bintang ★n,
 * nama unit, dan tombol jual kecil "✕" di pojok. Slot terisi berkelas
 * `draggable` (kursor tangan RO) dan beratribut data-bidak; seret ke papan
 * datang di Task 6, jadi tombol ✕ menjaga jual tetap bisa sebelum itu.
 */

import { FASE } from '../../pesan.js';

/** Jumlah slot bangku yang selalu digambar (ekonomi.bangku server = 8). */
export const JUMLAH_SLOT_BANGKU = 8;

/** Ukuran intrinsik kanvas potret slot. */
export const LEBAR_POTRET_BANGKU = 72;
export const TINGGI_POTRET_BANGKU = 84;

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks dari server/katalog sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/**
 * Bidak di bangku (bukan di papan), urut bidakId naik.
 * @param {object} snap state.ambil()
 * @returns {Array<object>}
 */
export function bidakBangku(snap) {
	const bidak = snap.state?.saya?.bidak ?? [];
	return bidak.filter((b) => !b.diPapan).sort((a, b) => a.bidakId - b.bidakId);
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps
 * @param {function} deps.t penerjemah teks.js
 * @param {string} deps.bahasa 'id' | 'en'
 * @param {object} deps.katalog buatKatalog(...)
 * @returns {string} HTML isi jendela Bangku
 */
export function renderBangku(snap, deps) {
	const { t, bahasa, katalog } = deps;
	const bisaJual = !!snap.state && snap.fase === FASE.PERSIAPAN && !snap.selesai;
	const bidak = bidakBangku(snap);
	const judulJual = esc(t('tombol.jual'));
	const slot = [];
	for (let i = 0; i < JUMLAH_SLOT_BANGKU; i++) {
		const b = bidak[i];
		if (!b) {
			slot.push(`<div class="slot" data-slot="${i}"></div>`);
			continue;
		}
		const nama = esc(katalog.namaUnit(b.unitId, bahasa));
		slot.push(`<div class="slot terisi draggable" data-slot="${i}" data-bidak="${b.bidakId}" title="${nama}">`
			+ `<canvas class="potret" data-unit="${esc(b.unitId)}" width="${LEBAR_POTRET_BANGKU}" height="${TINGGI_POTRET_BANGKU}"></canvas>`
			+ `<span class="bintang bintang-${b.bintang}">★${b.bintang}</span>`
			+ `<button class="jual" data-aksi="jual" data-arg="${b.bidakId}" title="${judulJual}"${bisaJual ? '' : ' disabled'}>✕</button>`
			+ `<div class="nama">${nama}</div>`
			+ '</div>');
	}
	return slot.join('');
}
