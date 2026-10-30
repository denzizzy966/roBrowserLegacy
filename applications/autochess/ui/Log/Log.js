/**
 * Jendela Log (R5): 320x140, bergaya WinStats (titlebar RO, bisa diseret),
 * tersembunyi bawaan, kanan-bawah di atas tombol K (ui/tataLetak.js).
 * Dibuka/ditutup tombol Log di InfoPemain (toggle). Menggantikan panel
 * #log lama yang menutupi papan.
 *
 * KOMPATIBILITAS: elemen #log di index.html TETAP ada sebagai sink DOM
 * tersembunyi (display:none selamanya). main.js log() menulis ke sana,
 * dan resep Playwright / soak membaca #log.textContent (mis. mencari
 * "map termuat"). Jendela ini hanya MENAMPILKAN 200 baris terakhir dari
 * teks yang sama (renderLog) di denyut 250 ms, dan menggulir ke bawah
 * setiap ada baris baru.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Log.html?raw';
import cssText from './Log.css?raw';
import { renderLog, BARIS_LOG_MAKS } from '../render/log.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Log = new GUIComponent('Log', cssText);
Log.render = () => htmlText;
Log.mouseMode = GUIComponent.MouseMode.STOP;

// deps terakhir (untuk judul); sumber teks diambil saat dipakai.
let depsTerakhir = null;

/** Sink teks tersembunyi (lihat KOMPATIBILITAS di atas); null bila tak ada. */
function sumber() {
	return document.getElementById('log');
}

Log.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	this.draggable('.titlebar');
};

/** Menggambar ekor log; menggulir ke bawah bila ada baris baru. */
function isiUlang() {
	if (!Log.isi) {
		return;
	}
	if (depsTerakhir) {
		const judul = depsTerakhir.t('jendela.log');
		if (Log.judul.textContent !== judul) {
			Log.judul.textContent = judul;
		}
	}
	const berubah = tulisBila(Log.isi, renderLog(sumber()?.textContent ?? '', BARIS_LOG_MAKS));
	if (berubah) {
		Log.isi.scrollTop = Log.isi.scrollHeight;
	}
}

/** @returns {boolean} true bila jendela sedang tampil */
Log.terbuka = function terbuka() {
	return !!this._host && this._host.classList.contains('terbuka');
};

Log.buka = function buka() {
	this._host?.classList.add('terbuka');
	isiUlang();
};

Log.tutup = function tutup() {
	this._host?.classList.remove('terbuka');
};

Log.toggle = function toggle() {
	if (this.terbuka()) {
		this.tutup();
	} else {
		this.buka();
	}
};

/**
 * Dipanggil tiap 250 ms bersama jendela lain; tersembunyi = tidak
 * memindai teks log sama sekali.
 * @param {object} snap state.ambil() (tak dipakai)
 * @param {object} deps {t}
 */
Log.gambar = function gambar(snap, deps) {
	depsTerakhir = deps;
	if (this.terbuka()) {
		isiUlang();
	}
};

export default UIManager.addComponent(Log);
