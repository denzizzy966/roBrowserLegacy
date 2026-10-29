/**
 * KartuBidak (C24, keputusan R4): kartu detail bidak yang menempel ke
 * pointer. Pengendali hover-nya ada di kartu.js (kapan tampil/tutup);
 * jendela ini hanya menggambar renderKartuBidak dan menempatkan diri di
 * pointer + 16 px (posisiKartu, di luar hitungTataLetak). Tidak ada aksi
 * di kartu: ia tidak menangkap pointer sama sekali (mode CROSS dan
 * pointer-events none di .css).
 *
 * Ikon status dimuat lewat deps.ikonStatus(efst, padaSiap) (pemuat
 * statusIkon.js di main.js); ikon yang termuat belakangan menggambar
 * ulang kartu.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './KartuBidak.html?raw';
import cssText from './KartuBidak.css?raw';
import { renderKartuBidak } from '../render/kartuBidak.js';
import { posisiKartu } from '../tataLetak.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const KartuBidak = new GUIComponent('KartuBidak', cssText);
KartuBidak.render = () => htmlText;
KartuBidak.mouseMode = GUIComponent.MouseMode.CROSS;

// Isi yang sedang tampil (null = tersembunyi), pointer, dan deps terakhir.
let infoAktif = null;
let titikAktif = { x: 0, y: 0 };
let depsTerakhir = null;

KartuBidak.init = function init() {
	const root = this.getRoot();
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
};

/** Menggambar info aktif dan menempatkan kartu; diam bila belum siap. */
function isiUlang() {
	if (!infoAktif || !depsTerakhir || !KartuBidak.isi) {
		return;
	}
	const deps = {
		...depsTerakhir,
		ikon: (efst) => depsTerakhir.ikonStatus?.(efst, isiUlang) ?? null
	};
	tulisBila(KartuBidak.isi, renderKartuBidak(infoAktif, deps));
	const host = KartuBidak._host;
	const { left, top } = posisiKartu(
		titikAktif,
		{ lebar: host.offsetWidth || 200, tinggi: host.offsetHeight || 120 },
		{ lebar: window.innerWidth, tinggi: window.innerHeight }
	);
	host.style.left = `${left}px`;
	host.style.top = `${top}px`;
	host.style.right = 'auto';
	host.style.bottom = 'auto';
}

/**
 * Menampilkan (atau memperbarui) kartu.
 * @param {object} info infoBidak (kartu.js)
 * @param {{x:number, y:number}} titik pointer (clientX/Y)
 */
KartuBidak.tampilkan = function tampilkan(info, titik) {
	if (!this._host) {
		return;
	}
	const baru = !infoAktif;
	infoAktif = info;
	titikAktif = titik;
	this._host.classList.add('terbuka');
	isiUlang();
	if (baru) {
		this.focus();
	}
};

KartuBidak.sembunyikan = function sembunyikan() {
	infoAktif = null;
	this._host?.classList.remove('terbuka');
};

/** @returns {boolean} true bila kartu sedang tampil */
KartuBidak.terbuka = function terbuka() {
	return infoAktif !== null;
};

/**
 * Dipanggil tiap denyut bersama jendela lain: hanya menyimpan deps
 * (bahasa, katalog, ikonStatus) dan menggambar ulang bila tampil.
 * @param {object} snap state.ambil() (tak dipakai)
 * @param {object} deps {t, bahasa, katalog, ikonStatus}
 */
KartuBidak.gambar = function gambar(snap, deps) {
	depsTerakhir = deps;
	isiUlang();
};

export default UIManager.addComponent(KartuBidak);
