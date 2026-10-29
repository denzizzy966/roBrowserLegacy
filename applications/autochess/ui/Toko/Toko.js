/**
 * Jendela Toko (K): overlay tengah-bawah dengan lima kartu unit berpotret,
 * tombol Kunci, tombol Refresh, dan baris peluang tier. Tersembunyi sampai
 * dibuka lewat TombolToko (buka/tutup/toggle).
 *
 * gambar() dipanggil tiap 250 ms; isi baru ditulis ulang bila keluaran
 * renderToko berubah (slot, Zeny, kunci, fase, bahasa, level). Sesudah
 * ditulis ulang, kanvas kartu yang slot+unit-nya sama dipindahkan dari
 * tulisan lama (pikselnya dan pendaftarannya di potret tetap), sisanya
 * didaftarkan ke potret.statis; kanvas lama yang tidak terpakai lagi
 * dilepas lewat potret.hentikan.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';
import htmlText from './Toko.html?raw';
import cssText from './Toko.css?raw';
import { renderToko } from '../render/toko.js';
import { pasangKerangka, tulisBila } from '../janela.js';
import { ikatAksi } from '../../ui.js';

const Toko = new GUIComponent('Toko', cssText);
Toko.render = () => htmlText;
Toko.mouseMode = GUIComponent.MouseMode.STOP;

// Disuntikkan lewat gambar(); klik bisa tiba kapan saja sesudah itu.
let kirimTerakhir = null;
// Dipanggil sesudah buka/tutup (TombolToko menyalakan sorotannya).
const pendengar = new Set();

/** Kunci kanvas potret untuk dipakai ulang: slot dan unit harus sama. */
function kunciKanvas(kanvas) {
	return `${kanvas.closest('.kartu')?.dataset.slot}:${kanvas.dataset.unit}`;
}

Toko.init = function init() {
	const root = this.getRoot();
	this.bingkai = root.querySelector('.bingkai');
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(this.bingkai);
	Client.loadFile(DB.INTERFACE_PATH + 'basic_interface/zeny.bmp', (url) => {
		this.bingkai.style.setProperty('--ikon-zeny', `url(${url})`);
		this.bingkai.classList.add('zeny-bmp');
	});
	// beli {slot}, kunci {kunci}, refresh {} -- pembaca argumen yang sama
	// dengan panel #ui lama.
	ikatAksi(root, (aksi, arg) => kirimTerakhir?.(aksi, arg));
	this._host.style.display = 'none';
};

/** @returns {boolean} true bila overlay sedang tampil */
Toko.terbuka = function terbuka() {
	return !!this._host && this._host.style.display !== 'none';
};

function aturTampil(tampil) {
	if (!Toko._host) {
		return;
	}
	Toko._host.style.display = tampil ? '' : 'none';
	for (const fn of [...pendengar]) {
		fn(tampil);
	}
}

Toko.buka = function buka() {
	aturTampil(true);
};

Toko.tutup = function tutup() {
	aturTampil(false);
};

Toko.toggle = function toggle() {
	aturTampil(!this.terbuka());
};

/**
 * Mendaftarkan fn(terbuka) yang dipanggil setiap overlay dibuka/ditutup.
 * @returns {() => void} pelepas
 */
Toko.padaUbah = function padaUbah(fn) {
	pendengar.add(fn);
	return () => pendengar.delete(fn);
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog, formatZeny, potret, kirim}
 */
Toko.gambar = function gambar(snap, deps) {
	kirimTerakhir = deps.kirim;
	tulisBila(this.judul, deps.t('jendela.toko'));

	const lama = new Map();
	for (const k of this.isi.querySelectorAll('canvas.potret')) {
		lama.set(kunciKanvas(k), k);
	}
	if (!tulisBila(this.isi, renderToko(snap, deps))) {
		return;
	}
	for (const baru of this.isi.querySelectorAll('canvas.potret')) {
		const kunci = kunciKanvas(baru);
		const dulu = lama.get(kunci);
		if (dulu) {
			lama.delete(kunci);
			baru.replaceWith(dulu);
			continue;
		}
		const sprite = deps.katalog.spriteUnit(baru.dataset.unit);
		if (sprite) {
			deps.potret.statis(sprite, baru);
		}
	}
	for (const k of lama.values()) {
		deps.potret.hentikan(k);
	}
};

export default UIManager.addComponent(Toko);
