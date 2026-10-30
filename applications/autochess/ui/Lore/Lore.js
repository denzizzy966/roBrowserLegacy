/**
 * Jendela Lore (Q12), bergaya NpcBox: di tengah layar, bisa diseret lewat
 * titlebar, tersembunyi sampai buka(id) dipanggil (klik ikon Sinergi).
 * Isinya nama dwibahasa, lore, daftar ambang, dan (AC6 K7) unit anggota
 * dengan tanda kepemilikan dari snapshot; tombol Tutup memanggil
 * tutup(). gambar() dipanggil tiap denyut bersama jendela lain, jadi
 * ganti bahasa (teks.padaUbah -> gambarJendela) langsung terlihat.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Lore.html?raw';
import cssText from './Lore.css?raw';
import { renderLore } from '../render/sinergi.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Lore = new GUIComponent('Lore', cssText);
Lore.render = () => htmlText;
Lore.mouseMode = GUIComponent.MouseMode.STOP;

// Sinergi yang sedang ditampilkan (null = tertutup) dan deps terakhir.
let idAktif = null;
let depsTerakhir = null;

Lore.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	this.draggable('.titlebar');
	root.addEventListener('click', (ev) => {
		if (ev.target.closest?.('[data-aksi="tutup"]')) {
			this.tutup();
		}
	});
};

/** Menggambar isi dari id aktif; diam bila tertutup atau deps belum ada. */
function isiUlang() {
	if (idAktif === null || !depsTerakhir || !Lore.isi) {
		return;
	}
	const { judul, isi } = renderLore(idAktif, depsTerakhir);
	if (Lore.judul.textContent !== judul) {
		Lore.judul.textContent = judul;
	}
	tulisBila(Lore.isi, isi);
}

/** Membuka Lore untuk satu sinergi. */
Lore.buka = function buka(id) {
	idAktif = id;
	isiUlang();
	this._host.classList.add('terbuka');
};

Lore.tutup = function tutup() {
	idAktif = null;
	this._host.classList.remove('terbuka');
};

/**
 * @param {object} snap state.ambil() (tanda kepemilikan anggota sinergi)
 * @param {object} deps {t, bahasa, katalog, ...}
 */
Lore.gambar = function gambar(snap, deps) {
	depsTerakhir = { ...deps, snap };
	isiUlang();
};

export default UIManager.addComponent(Lore);
