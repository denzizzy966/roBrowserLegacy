/**
 * Jendela DaftarPemain (B): kolom kiri delapan kursi urut HP turun, tiap
 * baris berpotret (Q11: manusia = PC novice, bot = mob tetap per kursi),
 * nama, bar HP hijau, dan level. Tanpa tombol; mengklik baris kursi hidup
 * menontonnya (AC6 K3), baris sendiri kembali ke papan sendiri.
 *
 * gambar() dipanggil tiap 250 ms; isi baru ditulis ulang bila keluaran
 * renderDaftarPemain berubah (HP, level, hidup, nama, bahasa). Kanvas
 * avatar disimpan per kursi: sekali digambar lewat potret.statis, kanvas
 * yang sama dipindahkan ke baris baru setiap tulis ulang (urutan baris
 * berubah mengikuti HP), jadi tiap avatar hanya digambar sekali.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './DaftarPemain.html?raw';
import cssText from './DaftarPemain.css?raw';
import { renderDaftarPemain, avatarKursi, kursiTontonKlik } from '../render/daftarPemain.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const DaftarPemain = new GUIComponent('DaftarPemain', cssText);
DaftarPemain.render = () => htmlText;
DaftarPemain.mouseMode = GUIComponent.MouseMode.STOP;

// "kursi:data-avatar" -> kanvas yang sudah didaftarkan ke potret.statis.
const simpanan = new Map();

// snap dan deps terakhir dari gambar(); klik bisa tiba kapan saja sesudah itu.
let terakhir = null;

// Kanvas avatar hanya 24x24 (AC6 K8): sprite diperkecil ke 0.3. Kaki di
// 0.85 tinggi supaya mob kecil (Poring) tetap menutup blok tengah yang
// diperiksa potret.statis sebelum membekukan gambar.
const OPSI_AVATAR = { skala: 0.3, kaki: 0.85 };

/** Kunci kanvas: kursi dan avatarnya harus sama. */
function kunciKanvas(kanvas) {
	return `${kanvas.closest('.baris')?.dataset.kursi}:${kanvas.dataset.avatar}`;
}

DaftarPemain.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));

	this.isi.addEventListener('click', (ev) => {
		const baris = ev.target.closest?.('.baris[data-kursi]');
		if (!baris || !terakhir) {
			return;
		}
		const kursi = kursiTontonKlik(terakhir.snap, Number(baris.dataset.kursi));
		if (kursi !== null) {
			terakhir.deps.kirim('tonton', { kursi });
		}
	});
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, ekonomi, potret, kirim}
 */
DaftarPemain.gambar = function gambar(snap, deps) {
	terakhir = { snap, deps };
	tulisBila(this.judul, deps.t('jendela.daftarPemain'));
	if (!tulisBila(this.isi, renderDaftarPemain(snap, deps))) {
		return;
	}
	const kursi = new Map((snap.state?.kursi ?? []).map((k) => [String(k.kursi), k]));
	const dipakai = new Set();
	for (const baru of this.isi.querySelectorAll('canvas.avatar')) {
		const kunci = kunciKanvas(baru);
		dipakai.add(kunci);
		const dulu = simpanan.get(kunci);
		if (dulu) {
			baru.replaceWith(dulu);
			continue;
		}
		const k = kursi.get(baru.closest('.baris').dataset.kursi);
		if (k) {
			simpanan.set(kunci, baru);
			deps.potret.statis(avatarKursi(k), baru, OPSI_AVATAR);
		}
	}
	// Kursi yang hilang (pertandingan baru dengan susunan lain) dilepas.
	for (const [kunci, k] of simpanan) {
		if (!dipakai.has(kunci)) {
			simpanan.delete(kunci);
			deps.potret.hentikan(k);
		}
	}
};

export default UIManager.addComponent(DaftarPemain);
