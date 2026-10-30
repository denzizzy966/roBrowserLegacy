/**
 * Menu tahan bidak (AC7 K5/K6): lingkaran 140 px berbingkai emas di
 * sekitar bidak yang ditahan 400 ms (seret.padaTahan), dengan tiga item
 * Jual (+N zeny), Pindah, dan Batal. Tersembunyi sampai buka(); di atas
 * semua jendela (focus saat buka), posisi berpusat di titik tahan dan
 * dijepit ke viewport (render/menuBidak.js posisiMenu), tidak ditata
 * ui/tataLetak.js.
 *
 * Gerak (listener dokumen, fase capture, hanya selama menu terbuka):
 * - tombol masih ditahan sejak tahan: pointermove menyorot item di bawah
 *   pointer (itemSaatTahan: belum ada item sebelum pointer bergerak 30 px
 *   dari titik tahan, karena pusat menu bisa digeser jepitan); pointerup di atas item aktif = pilih, di luar
 *   item = menu tetap terbuka; keluar radius + 30 px dengan tombol masih
 *   ditahan = tutup lalu seret biasa (lanjutkanSeret dari pasangSeret).
 * - tombol sudah dilepas: pointerdown pada item aktif = pilih; pointerdown
 *   di luar menu = tutup (event itu diteruskan, jadi bisa memulai pegangan
 *   baru); item nonaktif dan latar lingkaran tidak berbuat apa-apa.
 * - Esc (main.js), pergantian fase (main.js), dan pertandingan baru menutup.
 * Pilih = tutup() lalu padaPilih({aksi, bidak, titik}); titik = pointer saat
 * memilih (posisi awal hantu bawa).
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './MenuBidak.html?raw';
import cssText from './MenuBidak.css?raw';
import { renderMenuBidak, itemSaatTahan, keluarRadius, posisiMenu } from '../render/menuBidak.js';
import { tulisBila } from '../janela.js';

const MenuBidak = new GUIComponent('MenuBidak', cssText);
MenuBidak.render = () => htmlText;
MenuBidak.mouseMode = GUIComponent.MouseMode.STOP;

/**
 * Menu yang terbuka, atau null:
 * {bidak, pusat, titikTahan, opsi: {hargaJual, bolehJual, bolehPindah, alasanPindah, alasanJual},
 *  ditahan: tombol 0 masih ditekan sejak tahan, sorot: item di bawah pointer}
 */
let aktif = null;
let fnPilih = null;
let seret = null;
// deps gambar terakhir ({t, formatZeny}); cadangan sebelum denyut pertama.
let depsTerakhir = { t: (k) => k, formatZeny: String };

MenuBidak.init = function init() {
	this.isi = this.getRoot().querySelector('.menu');
};

/** Menulis isi menu dari keadaan aktif (diam bila tertutup). */
function isiUlang() {
	if (!aktif || !MenuBidak.isi) {
		return;
	}
	tulisBila(MenuBidak.isi, renderMenuBidak({ ...aktif.opsi, sorot: aktif.sorot }, depsTerakhir));
}

/** true bila item boleh dipilih. */
function boleh(item) {
	if (item === 'jual') {
		return aktif.opsi.bolehJual;
	}
	if (item === 'pindah') {
		return aktif.opsi.bolehPindah;
	}
	return item === 'batal';
}

/** Titik viewport dari event pointer. */
const titikDari = (ev) => ({ x: ev.clientX, y: ev.clientY });

/** Menutup menu lalu melapor pilihan. */
function pilih(item, ev) {
	const { bidak } = aktif;
	MenuBidak.tutup();
	fnPilih?.({ aksi: item, bidak, titik: titikDari(ev) });
}

function gerak(ev) {
	if (!aktif) {
		return;
	}
	// pointerup yang hilang (mis. dilepas di luar jendela): tombol tidak lagi ditekan.
	if (aktif.ditahan && ev.buttons !== undefined && (ev.buttons & 1) === 0) {
		aktif.ditahan = false;
	}
	const titik = titikDari(ev);
	if (aktif.ditahan && keluarRadius(aktif.pusat, titik)) {
		const { bidak } = aktif;
		MenuBidak.tutup();
		seret?.lanjutkanSeret?.(bidak, ev);
		return;
	}
	const item = aktif.ditahan ? itemSaatTahan(aktif.pusat, aktif.titikTahan, titik) : null;
	const sorot = item && boleh(item) ? item : null;
	if (sorot !== aktif.sorot) {
		aktif.sorot = sorot;
		isiUlang();
	}
}

function lepas(ev) {
	if (!aktif?.ditahan) {
		return;
	}
	aktif.ditahan = false;
	const item = itemSaatTahan(aktif.pusat, aktif.titikTahan, titikDari(ev));
	if (item && boleh(item)) {
		pilih(item, ev);
	}
}

function tekan(ev) {
	if (!aktif) {
		return;
	}
	const jalur = ev.composedPath?.() ?? [];
	if (!jalur.includes(MenuBidak._host)) {
		// Klik di luar (juga awal seret baru): tutup, event diteruskan.
		MenuBidak.tutup();
		return;
	}
	// Di dalam menu: jangan sampai ke kanvas/Bangku di bawahnya.
	ev.preventDefault();
	ev.stopPropagation();
	aktif.ditahan = false;
	const item = jalur.find((n) => n?.dataset?.item)?.dataset.item;
	if ((ev.button === undefined || ev.button === 0) && item && boleh(item)) {
		pilih(item, ev);
	}
}

/** pointercancel / blur: tombol dianggap dilepas, menu tetap terbuka. */
function batalTahan() {
	if (aktif) {
		aktif.ditahan = false;
	}
}

function pasangListener() {
	document.addEventListener('pointermove', gerak, true);
	document.addEventListener('pointerup', lepas, true);
	document.addEventListener('pointerdown', tekan, true);
	document.addEventListener('pointercancel', batalTahan, true);
	window.addEventListener('blur', batalTahan);
}

function lepasListener() {
	document.removeEventListener('pointermove', gerak, true);
	document.removeEventListener('pointerup', lepas, true);
	document.removeEventListener('pointerdown', tekan, true);
	document.removeEventListener('pointercancel', batalTahan, true);
	window.removeEventListener('blur', batalTahan);
}

/**
 * Membuka menu di sekitar bidak (dipanggil saat tombol masih ditahan).
 * @param {object} o
 * @param {object} o.bidak record snapshot (bidakId, unitId, diPapan, hargaJual, ...)
 * @param {{x:number, y:number}} o.titik titik tahan (viewport)
 * @param {number} o.hargaJual
 * @param {boolean} o.bolehJual
 * @param {boolean} o.bolehPindah
 * @param {string} o.alasanPindah kunci KAMUS untuk Pindah nonaktif
 * @param {string} [o.alasanJual] kunci KAMUS untuk Jual nonaktif (bawaan alasanPindah)
 * @returns {boolean} false bila jendela belum ditempel
 */
MenuBidak.buka = function buka({ bidak, titik, hargaJual, bolehJual, bolehPindah, alasanPindah, alasanJual }) {
	if (!this._host || !bidak || !titik) {
		return false;
	}
	this.tutup();
	const { left, top, pusat } = posisiMenu(titik, { lebar: window.innerWidth, tinggi: window.innerHeight });
	Object.assign(this._host.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto', transform: 'none' });
	aktif = { bidak, pusat, titikTahan: { x: titik.x, y: titik.y }, opsi: { hargaJual, bolehJual, bolehPindah, alasanPindah, alasanJual }, ditahan: true, sorot: null };
	isiUlang();
	this._host.classList.add('terbuka');
	this.focus();
	pasangListener();
	return true;
};

MenuBidak.tutup = function tutup() {
	aktif = null;
	lepasListener();
	this._host?.classList.remove('terbuka');
};

/** @returns {boolean} true selama menu tampil */
MenuBidak.terbuka = function terbuka() {
	return aktif !== null;
};

/**
 * @param {function({aksi: 'jual'|'pindah'|'batal', bidak: object, titik: {x:number, y:number}}): void} fn
 */
MenuBidak.padaPilih = function padaPilih(fn) {
	fnPilih = fn;
};

/** @param {{lanjutkanSeret: function(object, PointerEvent): boolean}} s seret.js */
MenuBidak.pasangSeret = function pasangSeret(s) {
	seret = s;
};

/** Denyut 250 ms: menyimpan deps (bahasa) dan menulis ulang bila berubah. */
MenuBidak.gambar = function gambar(snap, deps) {
	depsTerakhir = deps;
	isiUlang();
};

export default UIManager.addComponent(MenuBidak);
