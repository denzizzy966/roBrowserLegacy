/**
 * Renderer murni jendela InfoPemain (G): ringkasan kursi sendiri (nama, HP,
 * level, Zeny, streak, ronde, fase) dan tiga tombol: bahasa (menampilkan
 * kode bahasa LAIN, ID/EN), log (buka/tutup #log), dan Lewati (hanya di
 * PERSIAPAN). Tombol bahasa dan log ditangani lokal oleh InfoPemain.js;
 * Lewati diteruskan ke deps.kirim.
 */

import { FASE } from '../../pesan.js';

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

/** Streak bertanda: "+2" (menang beruntun), "-3" (kalah beruntun), "0". */
function teksStreak(n) {
	if (n > 0) {
		return `<span class="streak menang">+${n}</span>`;
	}
	if (n < 0) {
		return `<span class="streak kalah">${n}</span>`;
	}
	return '<span class="streak">0</span>';
}

/** Satu baris label: nilai. */
function baris(label, nilai) {
	return `<div class="baris"><span class="label">${esc(label)}</span><span class="nilai">${nilai}</span></div>`;
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps
 * @param {function} deps.t penerjemah teks.js
 * @param {string} deps.bahasa 'id' | 'en' (bahasa aktif)
 * @param {function} deps.formatZeny teks.js formatZeny
 * @param {{aktif: function(): boolean, toggle: function}|null} [deps.bgm] kendali BGM; null/undefined = tidak ada mp3 (tombol nonaktif)
 * @returns {string} HTML isi jendela InfoPemain
 */
export function renderInfoPemain(snap, deps) {
	const { t, formatZeny } = deps;
	const saya = snap.state?.saya;
	const kursi = snap.state?.kursi?.find((k) => k.kursi === saya?.kursi);
	const nama = kursi?.nama || t('label.anda');
	const hp = kursi ? Math.max(0, kursi.hp) : 0;
	const bisaLewati = !!saya && snap.fase === FASE.PERSIAPAN && !snap.selesai;
	const kodeLain = deps.bahasa === 'en' ? 'id' : 'en';

	return `<div class="nama${kursi && !kursi.hidup ? ' tersingkir' : ''}">${esc(nama)}</div>`
		+ baris(t('label.hp'), `<span class="hp">${hp}</span>`)
		+ baris(t('label.namaLevel'), `<span class="lv">${saya?.level ?? 1}</span>`)
		+ baris(t('label.zeny'), `<span class="zeny">${formatZeny(saya?.zeny ?? 0)}</span>`)
		+ baris(t('label.streak'), teksStreak(kursi?.streak ?? 0))
		+ baris(t('label.namaRonde'), `<span class="ronde">${snap.ronde ?? 0}</span>`)
		+ baris(t('label.fase'), `<span class="fase">${esc(t(KUNCI_FASE[snap.fase] ?? 'fase.menunggu'))}</span>`)
		+ '<div class="tombol-baris">'
		+ `<button class="tombol bahasa" data-aksi="bahasa" data-arg="${kodeLain}" title="${esc(t('label.bahasa'))}">${esc(t('tombol.bahasa'))}</button>`
		+ `<button class="tombol log" data-aksi="log">${esc(t('tombol.log'))}</button>`
		+ `<button class="tombol bgm" data-aksi="bgm"${deps.bgm ? '' : ` disabled title="${esc(t('label.bgmNonaktif'))}"`}>${esc(t('tombol.bgm'))}${deps.bgm && !deps.bgm.aktif() ? ' ✕' : ''}</button>`
		+ `<button class="tombol lewati" data-aksi="lewati"${bisaLewati ? '' : ' disabled'}>${esc(t('tombol.lewati'))}</button>`
		+ '</div>';
}
