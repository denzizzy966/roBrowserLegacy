/**
 * Seret-lepas bidak bangku <-> papan <-> toko (keputusan Q3 rencana AC4).
 *
 * Berbasis pointer events, BUKAN HTML5 DnD: selama native drag listener
 * mousemove window milik Mouse berhenti, sehingga Mouse.world basi (rekon
 * §4). Alurnya:
 *
 * - mulai: kanvas hantu 72x84 (potret.statis unit) mengikuti pointer
 *   (position fixed, pointer-events none), kursor RO PICK.
 * - gerak: Mouse.screen diisi dari event pointer; Mouse.intersect hanya
 *   true bila elemen teratas di bawah pointer adalah kanvas 3D, sehingga
 *   jendela RO (mode STOP) tetap menghalangi papan (Review Focus 5).
 *   Petak separuh sendiri di bawah pointer disorot terang.
 * - lepas: putuskanDrop (murni) memilih ke-bangku / jual / taruh atau
 *   batal; batal dicatat paling banyak satu baris per seret, dan pulang
 *   ke tempat asal tidak dicatat sama sekali (Review Focus 2).
 *
 * Bidak papan dipilih lewat petak di bawah pointer (state.saya.bidak
 * berflag diPapan), bukan ray-cast entity.
 *
 * Semua dependensi DOM/WebGL disuntikkan supaya teruji di vitest node.
 */

import { FASE } from './pesan.js';
import { petakDariCell } from './papan.js';
import { BARIS_SENDIRI } from './sorot.js';

/** Ukuran kanvas hantu, sama dengan potret bangku. */
export const LEBAR_HANTU = 72;
export const TINGGI_HANTU = 84;

/** Titik kaki hantu (pecahan tinggi), dan pointer di sekitar kakinya. */
const OPSI_HANTU = { skala: 0.8, kaki: 0.88 };

/** Nilai yang boleh berupa fungsi pengambil (mis. jendela yang belum ditempel). */
function ambil(x) {
	return typeof x === 'function' ? x() : x;
}

/** true bila (x, y) di dalam rect yang tampil (lebar/tinggi > 0). */
function diDalam(rect, x, y) {
	return !!rect && rect.width > 0 && rect.height > 0
		&& x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Petak separuh sendiri (baris 0..3) di bawah Mouse.world, atau null. */
function petakSendiri(asal, skala, world) {
	if (!(world.x >= 0 && world.y >= 0)) {
		return null;
	}
	const p = petakDariCell(asal, skala, Math.floor(world.x), Math.floor(world.y));
	return p && p.baris < BARIS_SENDIRI ? p : null;
}

/**
 * Keputusan saat pointer dilepas. Murni.
 *
 * Urutan: fase (semua perintah catur hanya sah di PERSIAPAN, server
 * menolak sisanya) -> jendela Bangku -> Toko yang tampil -> papan.
 *
 * @param {object} a
 * @param {object} a.bidak bidak yang diseret ({bidakId, diPapan, kolom, baris})
 * @param {{x:number, y:number}} a.titik pointer (clientX/Y)
 * @param {object|null} a.rectBangku getBoundingClientRect jendela Bangku
 * @param {object|null} a.rectToko getBoundingClientRect Toko (lebar 0 = tersembunyi)
 * @param {boolean} a.diKanvas elemen teratas di bawah pointer adalah kanvas 3D
 * @param {{x:number, y:number}} a.world Mouse.world (-1 = tidak menyentuh tanah)
 * @param {object} a.snap state.ambil()
 * @param {{x:number, y:number}} a.asal
 * @param {number} a.skala
 * @returns {{aksi: string, arg: object} | {alasan: string|null}} alasan null = batal diam
 */
export function putuskanDrop({ bidak, titik, rectBangku, rectToko, diKanvas, world, snap, asal, skala }) {
	if (snap.fase !== FASE.PERSIAPAN || snap.selesai) {
		return { alasan: 'hanya bisa saat fase persiapan' };
	}
	if (diDalam(rectBangku, titik.x, titik.y)) {
		return bidak.diPapan ? { aksi: 'ke-bangku', arg: { bidakId: bidak.bidakId } } : { alasan: null };
	}
	if (diDalam(rectToko, titik.x, titik.y)) {
		return { aksi: 'jual', arg: { bidakId: bidak.bidakId } };
	}
	if (!diKanvas || !(world.x >= 0 && world.y >= 0)) {
		return { alasan: 'dilepas di luar papan' };
	}
	const p = petakDariCell(asal, skala, Math.floor(world.x), Math.floor(world.y));
	if (!p) {
		return { alasan: 'dilepas di luar papan' };
	}
	if (p.baris >= BARIS_SENDIRI) {
		return { alasan: 'petak di luar separuh papanmu' };
	}
	if (bidak.diPapan && bidak.kolom === p.kolom && bidak.baris === p.baris) {
		return { alasan: null };
	}
	const semua = snap.state?.saya?.bidak ?? [];
	if (semua.some((b) => b.diPapan && b.bidakId !== bidak.bidakId && b.kolom === p.kolom && b.baris === p.baris)) {
		return { alasan: 'petak sudah terisi' };
	}
	return { aksi: 'taruh', arg: { bidakId: bidak.bidakId, kolom: p.kolom, baris: p.baris } };
}

/**
 * @param {object} dep
 * @param {Document} dep.dokumen
 * @param {object} dep.Mouse Controls/MouseEventHandler.js (screen, world, intersect)
 * @param {{canvas: HTMLCanvasElement}} dep.Renderer
 * @param {{ACTION: object, setType: function}} dep.Cursor UI/CursorManager.js
 * @param {{x:number, y:number}} dep.asal
 * @param {number} dep.skala
 * @param {() => object} dep.ambilSnap state.ambil()
 * @param {(aksi: string, arg: object) => boolean} dep.kirim
 * @param {{statis: function, hentikan: function}} dep.potret
 * @param {object|function} dep.katalog buatKatalog(...) atau pengambilnya
 * @param {Element|function} dep.elemenBangku host jendela Bangku atau pengambilnya
 * @param {Element|function} dep.elemenToko host jendela Toko atau pengambilnya
 * @param {{petak: function}} dep.sorot sorot.js
 * @param {(pesan: string) => void} [dep.log]
 * @param {Window} [dep.jendela] sasaran 'blur' (bawaan dokumen.defaultView)
 * @returns {{mulaiDariBangku: function, mulaiDariPapan: function, aktif: function}}
 */
export function buatSeret({
	dokumen, Mouse, Renderer, Cursor, asal, skala, ambilSnap, kirim, potret, katalog,
	elemenBangku, elemenToko, sorot, log = () => {}, jendela = dokumen.defaultView
}) {
	/** Seret yang sedang berjalan: {bidak, hantu} atau null. */
	let seret = null;

	function diKanvas(x, y) {
		return dokumen.elementFromPoint(x, y) === Renderer.canvas;
	}

	function rectDari(el) {
		const e = ambil(el);
		return e?.getBoundingClientRect ? e.getBoundingClientRect() : null;
	}

	function letakkanHantu(x, y) {
		seret.hantu.style.left = `${Math.round(x - LEBAR_HANTU / 2)}px`;
		seret.hantu.style.top = `${Math.round(y - TINGGI_HANTU * OPSI_HANTU.kaki)}px`;
	}

	/** Pointer bergerak: Mouse.screen/intersect, hantu, dan sorotan. */
	function gerak(ev) {
		const x = ev.clientX;
		const y = ev.clientY;
		Mouse.screen.x = ev.pageX ?? x;
		Mouse.screen.y = ev.pageY ?? y;
		const kanvas = diKanvas(x, y);
		Mouse.intersect = kanvas;
		letakkanHantu(x, y);
		// Pemasang kursor RO dan jendela GUIComponent mengembalikan kursor
		// ke DEFAULT/CLICK saat pointer melewati batas elemen: tegaskan
		// PICK lagi (hanya bila berubah, supaya animasinya tidak diulang).
		if (Cursor.getActualType?.() !== Cursor.ACTION.PICK) {
			Cursor.setType(Cursor.ACTION.PICK);
		}
		// Mouse.world dihitung pada frame sebelumnya: sorotan tertinggal
		// paling lama satu frame, cukup untuk umpan balik.
		const p = kanvas ? petakSendiri(asal, skala, Mouse.world) : null;
		if (p) {
			sorot.petak(p.kolom, p.baris);
		} else {
			sorot.petak(null);
		}
	}

	/**
	 * Mencabut listener, hantu, kursor, dan sorotan. Listener dan status
	 * seret dilepas PALING DULU, supaya lemparan dari langkah berikutnya
	 * tidak meninggalkan seret yang menggantung.
	 */
	function bereskan(ev) {
		dokumen.removeEventListener('pointermove', gerak);
		dokumen.removeEventListener('pointerup', lepas);
		dokumen.removeEventListener('pointercancel', batal);
		jendela?.removeEventListener('blur', batal);
		const { hantu } = seret;
		seret = null;
		hantu.remove();
		potret.hentikan(hantu);
		Cursor.setType(Cursor.ACTION.DEFAULT);
		sorot.petak(null);
		// Kembalikan intersect sesuai yang ada di bawah pointer; jendela
		// mode STOP memulihkannya sendiri saat pointer keluar darinya.
		// blur tidak membawa koordinat: intersect dibiarkan.
		if (Number.isFinite(ev?.clientX) && Number.isFinite(ev?.clientY)) {
			Mouse.intersect = diKanvas(ev.clientX, ev.clientY);
		}
	}

	function lepas(ev) {
		const { bidak } = seret;
		const x = ev.clientX;
		const y = ev.clientY;
		let keputusan;
		// finally: lemparan dari keputusan (state, jendela, katalog) tidak
		// boleh meninggalkan hantu atau listener dokumen; galatnya tetap
		// diteruskan ke pemanggil sesudah dibereskan.
		try {
			keputusan = putuskanDrop({
				bidak,
				titik: { x, y },
				rectBangku: rectDari(elemenBangku),
				rectToko: rectDari(elemenToko),
				diKanvas: diKanvas(x, y),
				world: { x: Mouse.world.x, y: Mouse.world.y },
				snap: ambilSnap(),
				asal,
				skala
			});
		} finally {
			bereskan(ev);
		}
		if (keputusan.aksi) {
			kirim(keputusan.aksi, keputusan.arg);
		} else if (keputusan.alasan) {
			log(`seret bidak ${bidak.bidakId} batal: ${keputusan.alasan}`);
		}
	}

	/** pointercancel atau blur jendela: batal diam. */
	function batal(ev) {
		if (seret) {
			bereskan(ev);
		}
	}

	function mulai(bidak, ev) {
		ev.preventDefault?.();
		const hantu = dokumen.createElement('canvas');
		hantu.width = LEBAR_HANTU;
		hantu.height = TINGGI_HANTU;
		Object.assign(hantu.style, {
			position: 'fixed',
			pointerEvents: 'none',
			zIndex: '2000',
			opacity: '0.85'
		});
		seret = { bidak, hantu };
		letakkanHantu(ev.clientX, ev.clientY);
		dokumen.body.appendChild(hantu);
		const sprite = ambil(katalog)?.spriteUnit?.(bidak.unitId);
		if (sprite) {
			potret.statis(sprite, hantu, OPSI_HANTU);
		}
		Cursor.setType(Cursor.ACTION.PICK);
		dokumen.addEventListener('pointermove', gerak);
		dokumen.addEventListener('pointerup', lepas);
		dokumen.addEventListener('pointercancel', batal);
		// Pindah tab/jendela di tengah seret: pointerup tidak akan tiba.
		jendela?.addEventListener('blur', batal);
		return true;
	}

	function bolehMulai(ev) {
		return !seret && (ev.button === undefined || ev.button === 0);
	}

	return {
		/**
		 * Mulai menyeret bidak bangku (pointerdown pada slot Bangku).
		 * @param {number} bidakId
		 * @param {PointerEvent} ev
		 * @returns {boolean} true bila seret dimulai
		 */
		mulaiDariBangku(bidakId, ev) {
			if (!bolehMulai(ev)) {
				return false;
			}
			const bidak = (ambilSnap().state?.saya?.bidak ?? []).find((b) => b.bidakId === bidakId && !b.diPapan);
			return bidak ? mulai(bidak, ev) : false;
		},

		/**
		 * Mulai menyeret bidak papan sendiri di petak bawah pointer
		 * (pointerdown pada kanvas 3D); hanya di PERSIAPAN.
		 * @param {PointerEvent} ev
		 * @returns {boolean} true bila seret dimulai
		 */
		mulaiDariPapan(ev) {
			if (!bolehMulai(ev)) {
				return false;
			}
			const snap = ambilSnap();
			if (snap.fase !== FASE.PERSIAPAN || snap.selesai) {
				return false;
			}
			const p = petakSendiri(asal, skala, Mouse.world);
			if (!p) {
				return false;
			}
			const bidak = (snap.state?.saya?.bidak ?? [])
				.find((b) => b.diPapan && b.kolom === p.kolom && b.baris === p.baris);
			return bidak ? mulai(bidak, ev) : false;
		},

		/** @returns {boolean} true selama ada seret berjalan */
		aktif: () => seret !== null
	};
}
