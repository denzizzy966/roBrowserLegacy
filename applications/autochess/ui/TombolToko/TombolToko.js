/**
 * Tombol K (kanan-bawah): glif kuda catur dan "+" seperti gambar referensi;
 * membuka/menutup jendela Toko. Bersinar selama Toko terbuka.
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
	this.tombol.addEventListener('click', () => Toko.toggle());
	Toko.padaUbah((terbuka) => this.tombol.classList.toggle('terbuka', terbuka));
};

/** @param {object} snap; @param {object} deps {t} -- hanya judul (tooltip) yang dwibahasa. */
TombolToko.gambar = function gambar(snap, deps) {
	const judul = `${deps.t('tombol.toko')} (K)`;
	if (this.tombol.title !== judul) {
		this.tombol.title = judul;
	}
};

export default UIManager.addComponent(TombolToko);
