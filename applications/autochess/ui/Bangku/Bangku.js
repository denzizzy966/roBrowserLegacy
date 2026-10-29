/**
 * Jendela Bangku (I): strip bawah-tengah delapan slot; tiap bidak bangku
 * tampil sebagai sprite idle beranimasi (potret.hidup) dengan bintang dan
 * nama. Slot terisi berkelas `draggable` (kursor tangan RO) dan membawa
 * data-bidak; pointerdown pada slot itu memulai seret.js
 * (seret ke papan = taruh, ke Toko = jual).
 *
 * gambar() dipanggil tiap 250 ms; isi baru ditulis ulang bila keluaran
 * renderBangku berubah, dan keluaran itu hanya bergantung pada kunci
 * bangku (bidakId, unit, bintang, fase, selesai, bahasa). Sesudah ditulis
 * ulang, kanvas bidak yang sama (bidakId+unit) dipindahkan dari tulisan
 * lama -- animasinya tetap terdaftar di potret tanpa kedip -- kanvas bidak
 * baru didaftarkan ke potret.hidup, dan kanvas bidak yang pergi dilepas
 * lewat potret.hentikan.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import htmlText from './Bangku.html?raw';
import cssText from './Bangku.css?raw';
import { renderBangku } from '../render/bangku.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const Bangku = new GUIComponent('Bangku', cssText);
Bangku.render = () => htmlText;
Bangku.mouseMode = GUIComponent.MouseMode.STOP;

// Disuntikkan lewat gambar(); pointerdown bisa tiba kapan saja sesudah itu.
let seretTerakhir = null;

// Sprite RO (mis. Peco Peco ~85 px) lebih tinggi dari kanvas 72x84:
// diperkecil dan kakinya diletakkan di atas label nama.
const OPSI_POTRET = { skala: 0.8, kaki: 0.88 };

/** Kunci kanvas untuk dipakai ulang: bidak dan unit harus sama. */
function kunciKanvas(kanvas) {
	return `${kanvas.closest('.slot')?.dataset.bidak}:${kanvas.dataset.unit}`;
}

Bangku.init = function init() {
	const root = this.getRoot();
	this.isi = root.querySelector('.isi');
	pasangKerangka(root.querySelector('.bingkai'));
	root.addEventListener('pointerdown', (ev) => {
		const slot = ev.target?.closest?.('.slot.terisi');
		if (slot && seretTerakhir) {
			seretTerakhir.mulaiDariBangku(Number(slot.dataset.bidak), ev);
		}
	});
};

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog, potret, seret}
 */
Bangku.gambar = function gambar(snap, deps) {
	seretTerakhir = deps.seret;

	const lama = new Map();
	for (const k of this.isi.querySelectorAll('canvas.potret')) {
		lama.set(kunciKanvas(k), k);
	}
	if (!tulisBila(this.isi, renderBangku(snap, deps))) {
		return;
	}
	for (const baru of this.isi.querySelectorAll('canvas.potret')) {
		const kunci = kunciKanvas(baru);
		const dulu = lama.get(kunci);
		if (dulu) {
			lama.delete(kunci);
			baru.replaceWith(dulu);
			continue;
		}
		const sprite = deps.katalog.spriteUnit(baru.dataset.unit);
		if (sprite) {
			deps.potret.hidup(sprite, baru, OPSI_POTRET);
		}
	}
	for (const k of lama.values()) {
		deps.potret.hentikan(k);
	}
};

export default UIManager.addComponent(Bangku);
