/**
 * Jendela Exp (H): level, bar EXP 100x4 gaya BasicInfoV0 (.bexp), dan
 * tombol Beli EXP. Satu listener klik terdelegasi membaca data-aksi dan
 * meneruskannya ke deps.kirim.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Exp.html?raw';
import cssText from './Exp.css?raw';
import { renderExp } from '../render/exp.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Exp = new GUIComponent('Exp', cssText);
Exp.render = () => htmlText;
Exp.mouseMode = GUIComponent.MouseMode.STOP;

// Disuntikkan lewat gambar(); klik bisa tiba kapan saja sesudah itu.
let kirimTerakhir = null;

Exp.init = function init() {
	const root = this.getRoot();
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	root.addEventListener('click', (ev) => {
		const tombol = ev.target.closest?.('[data-aksi]');
		if (!tombol || tombol.disabled || !kirimTerakhir) {
			return;
		}
		kirimTerakhir(tombol.dataset.aksi, {});
	});
};

/** @param {object} snap; @param {object} deps {t, ekonomi, kirim} */
Exp.gambar = function gambar(snap, deps) {
	kirimTerakhir = deps.kirim;
	tulisBila(this.isi, renderExp(snap, deps.t, deps.ekonomi));
};

export default UIManager.addComponent(Exp);
