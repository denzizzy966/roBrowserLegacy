/**
 * Jendela Zeny (D): ikon Zeny RO dan jumlahnya. Ikon dimuat dari
 * basic_interface/zeny.bmp; bila berkas tak ada (callback tak pernah
 * terpanggil) tetap tampil glif emas "Z".
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';
import htmlText from './Zeny.html?raw';
import cssText from './Zeny.css?raw';
import { renderZeny } from '../render/zeny.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Zeny = new GUIComponent('Zeny', cssText);
Zeny.render = () => htmlText;
Zeny.mouseMode = GUIComponent.MouseMode.STOP;

Zeny.init = function init() {
	const root = this.getRoot();
	this.isi = root.querySelector('.isi');
	const ikon = root.querySelector('.ikon');
	ikon.textContent = 'Z';
	pasangKerangka(root.querySelector('.bingkai'));
	Client.loadFile(DB.INTERFACE_PATH + 'basic_interface/zeny.bmp', (url) => {
		ikon.textContent = '';
		ikon.classList.add('bmp');
		ikon.style.backgroundImage = `url(${url})`;
	});
};

/** @param {object} snap; @param {object} deps {t, formatZeny} */
Zeny.gambar = function gambar(snap, deps) {
	tulisBila(this.isi, renderZeny(snap, deps.t, deps.formatZeny));
};

export default UIManager.addComponent(Zeny);
