/** Jendela Kapasitas (C): bidak di papan / kapasitas, dengan glif kuda catur. */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Kapasitas.html?raw';
import cssText from './Kapasitas.css?raw';
import { renderKapasitas } from '../render/kapasitas.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Kapasitas = new GUIComponent('Kapasitas', cssText);
Kapasitas.render = () => htmlText;
Kapasitas.mouseMode = GUIComponent.MouseMode.STOP;

Kapasitas.init = function init() {
	const root = this.getRoot();
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
};

Kapasitas.gambar = function gambar(snap, deps) {
	tulisBila(this.isi, renderKapasitas(snap, deps.t));
};

export default UIManager.addComponent(Kapasitas);
