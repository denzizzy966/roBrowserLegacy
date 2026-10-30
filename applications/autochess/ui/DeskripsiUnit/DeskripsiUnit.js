/**
 * Jendela Deskripsi Unit (AC7 K16), pola Lore: 360 px, titlebar yang bisa
 * diseret (posisi hasil seret diingat, ui/posisi.js), tombol tutup di
 * titlebar, mode STOP, tersembunyi sampai buka(info). Dibuka oleh klik
 * bidak (seret.padaKlik): bidak sendiri di papan/bangku, bidak lawan, dan
 * creep, di fase apa pun. Klik bidak lain mengganti isinya, klik bidak
 * yang sama menutupnya (toggle); Esc menutup (main.js). Overlay di kiri
 * atas, di kanan Daftar Pemain (ui/tataLetak.js).
 *
 * Isi dari render/deskripsiUnit.js; gambar() dipanggil tiap denyut, jadi
 * ganti bahasa langsung terlihat. Klik asal/kelas membuka Lore sinergi itu.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './DeskripsiUnit.html?raw';
import cssText from './DeskripsiUnit.css?raw';
import { renderDeskripsiUnit } from '../render/deskripsiUnit.js';
import { pasangKerangka, tulisBila } from '../janela.js';
import Lore from '../Lore/Lore.js';

const DeskripsiUnit = new GUIComponent('DeskripsiUnit', cssText);
DeskripsiUnit.render = () => htmlText;
DeskripsiUnit.mouseMode = GUIComponent.MouseMode.STOP;

// info klik yang sedang ditampilkan (null = tertutup) dan deps terakhir.
let infoAktif = null;
let depsTerakhir = null;

DeskripsiUnit.init = function init() {
	const root = this.getRoot();
	this.judul = root.querySelector('.judul');
	this.tombolTutup = root.querySelector('.tutup');
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	this.draggable('.titlebar');
	root.addEventListener('click', (ev) => {
		if (ev.target.closest?.('[data-aksi="tutup"]')) {
			this.tutup();
			return;
		}
		const lore = ev.target.closest?.('[data-aksi="lore"][data-id]');
		if (lore) {
			Lore.buka(lore.dataset.id);
			Lore.focus?.();
		}
	});
};

/** Identitas bidak yang diklik: bidakId (bidak sendiri) atau entityId, beserta unit. */
function kunci(info) {
	return `${info?.unitId ?? ''}|${info?.bidakId != null ? `b${info.bidakId}` : `e${info?.entityId ?? ''}`}`;
}

/** Menggambar isi dari info aktif; diam bila tertutup atau deps belum ada. */
function isiUlang() {
	if (!infoAktif || !depsTerakhir || !DeskripsiUnit.isi) {
		return;
	}
	const { judul, isi } = renderDeskripsiUnit(infoAktif, depsTerakhir);
	if (DeskripsiUnit.judul.textContent !== judul) {
		DeskripsiUnit.judul.textContent = judul;
	}
	const tutup = depsTerakhir.t('tombol.tutup');
	if (DeskripsiUnit.tombolTutup.title !== tutup) {
		DeskripsiUnit.tombolTutup.title = tutup;
	}
	tulisBila(DeskripsiUnit.isi, isi);
}

/**
 * @param {object} info keluaran seret.padaKlik {sumber, bidakId?, unitId, bintang, sendiri, entityId?, nama}
 */
DeskripsiUnit.buka = function buka(info) {
	if (!this._host || !info) {
		return;
	}
	const ganti = kunci(info) !== kunci(infoAktif);
	infoAktif = info;
	isiUlang();
	if (ganti && this.isi) {
		this.isi.scrollTop = 0;
	}
	this._host.classList.add('terbuka');
	this.focus();
};

DeskripsiUnit.tutup = function tutup() {
	infoAktif = null;
	this._host?.classList.remove('terbuka');
};

/** @returns {boolean} true bila jendela sedang tampil */
DeskripsiUnit.terbuka = function terbuka() {
	return infoAktif !== null && !!this._host?.classList.contains('terbuka');
};

/** Klik bidak: bidak yang sama (unit dan bidakId/entityId) saat terbuka -> tutup; selain itu buka/ganti. */
DeskripsiUnit.toggle = function toggle(info) {
	if (this.terbuka() && kunci(info) === kunci(infoAktif)) {
		this.tutup();
	} else {
		this.buka(info);
	}
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog, ...}
 */
DeskripsiUnit.gambar = function gambar(snap, deps) {
	depsTerakhir = deps;
	isiUlang();
};

export default UIManager.addComponent(DeskripsiUnit);
