/**
 * Jendela DPS (F): kanan-tengah, bisa diseret lewat titlebar, tersembunyi
 * sampai dibuka lewat TombolDPS atau tombol F. Isinya total damage per
 * bidak sendiri (renderDPS); gambar() dipanggil tiap 250 ms dan hanya
 * menulis ulang bila HTML berubah.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './DPS.html?raw';
import cssText from './DPS.css?raw';
import { renderDPS } from '../render/dps.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const DPS = new GUIComponent('DPS', cssText);
DPS.render = () => htmlText;
DPS.mouseMode = GUIComponent.MouseMode.STOP;

// Dipanggil sesudah buka/tutup (TombolDPS menyalakan sorotannya).
const pendengar = new Set();

DPS.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	this.draggable('.titlebar');
	this._host.style.display = 'none';
};

/** @returns {boolean} true bila jendela sedang tampil */
DPS.terbuka = function terbuka() {
	return !!this._host && this._host.style.display !== 'none';
};

function aturTampil(tampil) {
	if (!DPS._host) {
		return;
	}
	DPS._host.style.display = tampil ? '' : 'none';
	for (const fn of [...pendengar]) {
		fn(tampil);
	}
}

DPS.buka = function buka() {
	aturTampil(true);
};

DPS.tutup = function tutup() {
	aturTampil(false);
};

DPS.toggle = function toggle() {
	aturTampil(!this.terbuka());
};

/** Mendaftarkan fn(terbuka); @returns {() => void} pelepas */
DPS.padaUbah = function padaUbah(fn) {
	pendengar.add(fn);
	return () => pendengar.delete(fn);
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog, dps}
 */
DPS.gambar = function gambar(snap, deps) {
	tulisBila(this.judul, deps.t('jendela.dps'));
	tulisBila(this.isi, renderDPS(snap, deps, deps.dps.ambil()));
};

export default UIManager.addComponent(DPS);
