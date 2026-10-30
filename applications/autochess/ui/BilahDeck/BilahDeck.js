/**
 * Jendela Bilah Deck (AC6 K4): strip tipis selebar Bangku, tepat di
 * atasnya: HP kursi, Lv + bar EXP + tombol Beli EXP, Zeny, dan Kapasitas
 * papan. Menggantikan jendela Exp, Zeny, dan Kapasitas yang terpisah.
 * Satu listener klik terdelegasi (ikatAksi) meneruskan beli-exp ke
 * deps.kirim.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';
import htmlText from './BilahDeck.html?raw';
import cssText from './BilahDeck.css?raw';
import { renderBilahDeck } from '../render/bilahDeck.js';
import { pasangKerangka, tulisBila } from '../janela.js';
import { ikatAksi } from '../../ui.js';

const BilahDeck = new GUIComponent('BilahDeck', cssText);
BilahDeck.render = () => htmlText;
BilahDeck.mouseMode = GUIComponent.MouseMode.STOP;

// Disuntikkan lewat gambar(); klik bisa tiba kapan saja sesudah itu.
let kirimTerakhir = null;

BilahDeck.init = function init() {
	const root = this.getRoot();
	this.bingkai = root.querySelector('.bingkai');
	this.isi = root.querySelector('.isi');
	pasangKerangka(this.bingkai);
	// Ikon Zeny RO; tanpa berkas tetap koin emas dari CSS.
	Client.loadFile(DB.INTERFACE_PATH + 'basic_interface/zeny.bmp', (url) => {
		this.bingkai.style.setProperty('--ikon-zeny', `url(${url})`);
		this.bingkai.classList.add('zeny-bmp');
	});
	ikatAksi(root, (aksi, arg) => kirimTerakhir?.(aksi, arg));
};

/** @param {object} snap; @param {object} deps {t, katalog, formatZeny, kirim} */
BilahDeck.gambar = function gambar(snap, deps) {
	kirimTerakhir = deps.kirim;
	tulisBila(this.isi, renderBilahDeck(snap, deps));
};

export default UIManager.addComponent(BilahDeck);
