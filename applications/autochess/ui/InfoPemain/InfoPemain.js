/**
 * Jendela InfoPemain (G): jendela bergaya WinStats (titlebar RO, bisa
 * diseret lewat titlebar, tombol mini melipatnya menjadi titlebar saja)
 * di kiri-bawah di atas Exp. Isinya ringkasan kursi sendiri dan tombol
 * bahasa ID/EN, log, dan Lewati.
 *
 * Tombol bahasa dan log ditangani di sini, bukan lewat kirim: bahasa
 * memanggil deps.teks.setBahasa (main.js menggambar ulang semua jendela
 * lewat teks.padaUbah), log membuka/menutup #log halaman. Hanya Lewati
 * yang menjadi perintah server. Tombol BGM (data-aksi="bgm") memanggil
 * deps.bgm.toggle(); nonaktif bila tidak ada mp3 yang dipilih.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './InfoPemain.html?raw';
import cssText from './InfoPemain.css?raw';
import { renderInfoPemain } from '../render/infoPemain.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const InfoPemain = new GUIComponent('InfoPemain', cssText);
InfoPemain.render = () => htmlText;
InfoPemain.mouseMode = GUIComponent.MouseMode.STOP;

// deps terakhir dari gambar(); klik bisa tiba kapan saja sesudah itu.
let depsTerakhir = null;

/**
 * Membuka/menutup panel #log halaman (di luar Shadow DOM). Saat dibuka,
 * digulir ke baris terbaru: selama tersembunyi log() tidak bisa
 * menggulirnya (scrollHeight elemen display:none = 0).
 */
function toggleLog() {
	const el = document.getElementById('log');
	if (!el) {
		return;
	}
	const buka = el.style.display === 'none';
	el.style.display = buka ? '' : 'none';
	if (buka) {
		el.scrollTop = el.scrollHeight;
	}
}

InfoPemain.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	this.draggable('.titlebar');

	// Tombol mini: mousedown tidak boleh memulai seret jendela (pola WinStats).
	const mini = root.querySelector('.mini');
	mini.addEventListener('mousedown', (ev) => ev.stopImmediatePropagation());
	mini.addEventListener('click', () => this._host.classList.toggle('terlipat'));

	root.addEventListener('click', (ev) => {
		const tombol = ev.target.closest?.('.isi [data-aksi]');
		if (!tombol || tombol.disabled || !depsTerakhir) {
			return;
		}
		const aksi = tombol.dataset.aksi;
		if (aksi === 'bahasa') {
			depsTerakhir.teks.setBahasa(tombol.dataset.arg);
		} else if (aksi === 'log') {
			toggleLog();
		} else if (aksi === 'bgm') {
			depsTerakhir.bgm?.toggle();
			// Gambar ulang segera supaya penanda ✕ berganti tanpa menunggu 250 ms.
			depsTerakhir.gambarUlang?.();
		} else if (aksi === 'lewati') {
			depsTerakhir.kirim('lewati', {});
		}
	});
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, formatZeny, teks, kirim, bgm, gambarUlang}
 */
InfoPemain.gambar = function gambar(snap, deps) {
	depsTerakhir = deps;
	tulisBila(this.judul, deps.t('jendela.infoPemain'));
	tulisBila(this.isi, renderInfoPemain(snap, deps));
};

export default UIManager.addComponent(InfoPemain);
