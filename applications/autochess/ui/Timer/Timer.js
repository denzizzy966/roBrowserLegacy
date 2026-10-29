/**
 * Jendela Timer (A): hitung mundur mm:ss dengan font angka timefont RO,
 * ronde, dan nama fase. Digit sprite digambar di kanvas 300x110 (pola
 * PvPTimer) lalu diperkecil lewat CSS (~0.4); sampai sprite termuat dipakai
 * teks biasa dari renderTimer.
 */

import UIManager from 'UI/UIManager.js';
import GUIComponent from 'UI/GUIComponent.js';
import Client from 'Core/Client.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Entity from 'Renderer/Entity/Entity.js';
import htmlText from './Timer.html?raw';
import cssText from './Timer.css?raw';
import { renderTimer } from '../render/timer.js';
import { formatWaktu } from '../render/waktu.js';
import { pasangKerangka, tulisBila } from '../janela.js';

const DIGIT_ACT = 'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/timefont.act';
const DIGIT_SPR = 'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/timefont.spr';
const LEBAR_KANVAS = 300;
const TINGGI_KANVAS = 110;
const PIVOT_Y = 60;
const LEBAR_DIGIT = 50;
const BATAS_SPRITE_MS = 5000;

const Timer = new GUIComponent('Timer', cssText);
Timer.render = () => htmlText;
Timer.mouseMode = GUIComponent.MouseMode.STOP;

/** Pencatat yang disuntikkan main.js sebelum append (bawaan: diam). */
Timer.log = () => {};

const lapisEntity = new Entity();
let act = null;
let spr = null;
let waktuTerakhir = '';

Timer.init = function init() {
	const root = this.getRoot();
	this.bingkai = root.querySelector('.bingkai');
	this.isi = root.querySelector('.isi');
	this.kanvas = root.querySelector('.digit');
	this.ctx = this.kanvas.getContext('2d');
	pasangKerangka(this.bingkai);

	Client.loadFiles([DIGIT_ACT, DIGIT_SPR], (a, s) => {
		act = a;
		spr = s;
		waktuTerakhir = '';
		this.bingkai.classList.add('sprite');
	});
	setTimeout(() => {
		if (!act) {
			this.log('! Timer: sprite timefont belum termuat, memakai teks biasa');
		}
	}, BATAS_SPRITE_MS);
};

/** Menggambar "mm:ss" dengan sprite timefont (aksi 0..9, 10 = ':'). */
function gambarDigit(ctx, teks) {
	ctx.clearRect(0, 0, LEBAR_KANVAS, TINGGI_KANVAS);
	let x = (LEBAR_KANVAS - teks.length * LEBAR_DIGIT) >> 1;
	for (const ch of teks) {
		const aksi = ch === ':' ? 10 : parseInt(ch, 10);
		const animasi = act.actions[aksi]?.animations;
		if (animasi?.length) {
			SpriteRenderer.bind2DContext(ctx, x, PIVOT_Y);
			for (const lapis of animasi[(animasi.length / 2) | 0].layers) {
				lapisEntity.renderLayer(lapis, spr, spr, 1.0, [0, 0], false);
			}
		}
		x += LEBAR_DIGIT;
	}
}

/** @param {object} snap state.ambil() + sisaMs; @param {object} deps {t} */
Timer.gambar = function gambar(snap, deps) {
	tulisBila(this.isi, renderTimer(snap, deps.t));
	if (act) {
		const waktu = formatWaktu(snap.sisaMs ?? 0);
		if (waktu !== waktuTerakhir) {
			waktuTerakhir = waktu;
			gambarDigit(this.ctx, waktu);
		}
	}
};

export default UIManager.addComponent(Timer);
