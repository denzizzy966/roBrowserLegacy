/**
 * Tombol F (di kiri tombol K): membuka/menutup jendela DPS. Bersinar
 * selama DPS terbuka.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './TombolDPS.html?raw';
import cssText from './TombolDPS.css?raw';
import DPS from '../DPS/DPS.js';

const TombolDPS = new GUIComponent('TombolDPS', cssText);
TombolDPS.render = () => htmlText;
TombolDPS.mouseMode = GUIComponent.MouseMode.STOP;

TombolDPS.init = function init() {
	const root = this.getRoot();
	this.tombol = root.querySelector('.tombol');
	this.tombol.addEventListener('click', () => DPS.toggle());
	DPS.padaUbah((terbuka) => this.tombol.classList.toggle('terbuka', terbuka));
};

/** @param {object} snap; @param {object} deps {t} -- hanya tooltip. */
TombolDPS.gambar = function gambar(snap, deps) {
	const judul = `${deps.t('jendela.dps')} (F)`;
	if (this.tombol.title !== judul) {
		this.tombol.title = judul;
	}
};

export default UIManager.addComponent(TombolDPS);
