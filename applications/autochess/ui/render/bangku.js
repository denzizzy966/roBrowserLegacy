/**
 * Renderer murni jendela Bangku (I): strip bawah delapan slot. Slot terisi
 * memuat kanvas potret (diisi Bangku.js lewat potret.hidup), bintang ★n,
 * dan nama unit. Slot terisi berkelas `draggable` (kursor tangan RO) dan
 * beratribut data-bidak untuk seret.js: seret ke papan = taruh, ke kolom
 * Toko (zona jual, AC7 K1) = jual; klik = deskripsi, tahan = menu.
 * Tooltip-nya nama unit, harga jual dari server (K7), dan petunjuk seret.
 */

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
 * @param {function} [deps.formatZeny] teks.js formatZeny
 * @returns {string} HTML isi jendela Bangku
 */
export function renderBangku(snap, deps) {
	const { t, bahasa, katalog } = deps;
	const formatZeny = deps.formatZeny ?? String;
	const bidak = bidakBangku(snap);
	const petunjuk = esc(t('petunjuk.seret'));
	const slot = [];
	for (let i = 0; i < JUMLAH_SLOT_BANGKU; i++) {
		const b = bidak[i];
		if (!b) {
			slot.push(`<div class="slot" data-slot="${i}"></div>`);
			continue;
		}
		const nama = esc(katalog.namaUnit(b.unitId, bahasa));
		const harga = esc(t('petunjuk.harga_jual', formatZeny(b.hargaJual ?? 0)));
		slot.push(`<div class="slot terisi draggable" data-slot="${i}" data-bidak="${b.bidakId}" title="${nama}&#10;${harga}&#10;${petunjuk}">`
			+ `<canvas class="potret" data-unit="${esc(b.unitId)}" width="${LEBAR_POTRET_BANGKU}" height="${TINGGI_POTRET_BANGKU}"></canvas>`
			+ `<span class="bintang bintang-${b.bintang}">★${b.bintang}</span>`
			+ `<div class="nama">${nama}</div>`
			+ '</div>');
	}
	return slot.join('');
}
