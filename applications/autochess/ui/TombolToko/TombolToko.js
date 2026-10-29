/**
 * Tombol K (kanan-bawah): glif kuda catur dan "+" seperti gambar referensi;
 * membuka/menutup jendela Toko. Bersinar selama Toko terbuka.
 *
 * Selama seret bidak (seret.js) Toko disembunyikan dan tombol ini menjadi
 * sasaran jual: tandaiJual(true) menyalakan bingkai merah dan label
 * "Jual"/"Sell" di atas glif.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './TombolToko.html?raw';
import cssText from './TombolToko.css?raw';
import Toko from '../Toko/Toko.js';

const TombolToko = new GUIComponent('TombolToko', cssText);
TombolToko.render = () => htmlText;
TombolToko.mouseMode = GUIComponent.MouseMode.STOP;

TombolToko.init = function init() {
	const root = this.getRoot();
	this.tombol = root.querySelector('.tombol');
	this.labelJual = root.querySelector('.label-jual');
	this.tombol.addEventListener('click', () => Toko.toggle());
	Toko.padaUbah((terbuka) => this.tombol.classList.toggle('terbuka', terbuka));
};

/**
 * Menandai tombol sebagai sasaran jual selama seret (seret.js).
 * @param {boolean} aktif
 */
TombolToko.tandaiJual = function tandaiJual(aktif) {
	this.tombol?.classList.toggle('jual', Boolean(aktif));
};

/** @param {object} snap; @param {object} deps {t} -- judul (tooltip) dan label jual yang dwibahasa. */
TombolToko.gambar = function gambar(snap, deps) {
	const judul = `${deps.t('tombol.toko')} (K)`;
	if (this.tombol.title !== judul) {
		this.tombol.title = judul;
	}
	const jual = deps.t('tombol.jual');
	if (this.labelJual.textContent !== jual) {
		this.labelJual.textContent = jual;
	}
};

export default UIManager.addComponent(TombolToko);
