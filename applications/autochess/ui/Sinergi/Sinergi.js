/**
 * Jendela Sinergi (E): ikon bulat sinergi yang terkumpul di kanan-atas,
 * di bawah Zeny. Klik ikon membuka jendela Lore untuk sinergi itu.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Sinergi.html?raw';
import cssText from './Sinergi.css?raw';
import { renderSinergi } from '../render/sinergi.js';
import { tulisBila } from '../janela.js';
import Lore from '../Lore/Lore.js';

const Sinergi = new GUIComponent('Sinergi', cssText);
Sinergi.render = () => htmlText;
Sinergi.mouseMode = GUIComponent.MouseMode.STOP;

Sinergi.init = function init() {
	this.isi = this.getRoot().querySelector('.bingkai');
	this.isi.addEventListener('click', (ev) => {
		const ikon = ev.target.closest?.('.ikon[data-sinergi]');
		if (ikon) {
			Lore.buka(ikon.dataset.sinergi);
		}
	});
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog, ...}
 */
Sinergi.gambar = function gambar(snap, deps) {
	tulisBila(this.isi, renderSinergi(snap, deps));
};

export default UIManager.addComponent(Sinergi);
