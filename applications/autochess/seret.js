/**
 * Seret-lepas bidak bangku <-> papan <-> zona jual (Q3 rencana AC4,
 * mesin keadaan AC7 K1-K5/K15).
 *
 * Berbasis pointer events, BUKAN HTML5 DnD: selama native drag listener
 * mousemove window milik Mouse berhenti, sehingga Mouse.world basi (rekon
 * §4).
 *
 * Mesin keadaan (satu interaksi sekaligus, modus()):
 *
 * - null  -> 'diam': pointerdown tombol 0 pada slot Bangku
 *   (mulaiDariBangku) atau kanvas 3D (mulaiDariPapan) memasang pegangan
 *   {sumber, bidak, info, titikAwal, timer}. Bidak sendiri yang boleh
 *   dipindah (bangku: selalu; papan: hanya PERSIAPAN dan tidak menonton)
 *   juga memasang pewaktu tahan JEDA_TAHAN_MS. Bidak lain di bawah pointer
 *   (lawan, creep, bidak sendiri di luar PERSIAPAN; lewat dep cariBidak)
 *   hanya bisa diklik.
 * - 'diam' -> 'seret': pointer bergerak > AMBANG_SERET_PX dari titik
 *   pointerdown (K2). Pegangan klik-saja yang lewat ambang dilepas tanpa
 *   apa-apa.
 * - 'diam' -> klik: pointerup sebelum pewaktu -> padaKlik(info).
 * - 'diam' -> tahan: pewaktu habis -> pegangan dilepas, padaTahan({bidak,
 *   titik}); menu tahan (Task 4) mengambil alih dan bisa memanggil
 *   lanjutkanSeret (keluar radius) atau mulaiBawa (Pindah).
 * - 'seret': kanvas hantu 72x84 (potret.statis unit) mengikuti pointer
 *   (position fixed, pointer-events none), kursor RO PICK, zona jual
 *   tampil (K1: jendela Toko mode jual). pointerup -> putuskanDrop.
 * - 'bawa' (K4): hantu dan zona jual yang sama tanpa tombol ditahan;
 *   pointerdown kiri berikutnya -> putuskanDrop, kanan -> batal,
 *   batalBawa() (Esc) -> batal. pointerdown itu ditelan (capture di
 *   dokumen) supaya tidak memulai pegangan baru di bawahnya, dan `click`
 *   yang menyusul klik kiri itu juga ditelan sekali (tombol UI di bawah
 *   pointer tidak ikut tertekan).
 *
 * Semua jalan keluar memakai satu bereskan(): listener dan status dilepas
 * paling dulu, lalu pewaktu, hantu, kursor, sorotan, zona jual, dan
 * Mouse.intersect. pointercancel dan blur jendela membatalkan diam/seret/
 * bawa. padaFase(fase) di luar PERSIAPAN membatalkan seret/bawa bidak papan
 * dan pegangan bidak papan; seret/bawa bidak bangku tetap hidup (K3/K15)
 * dan putuskanDrop membaca ulang bidaknya dari snapshot terbaru.
 *
 * Gerak seret/bawa: Mouse.screen diisi dari event pointer; Mouse.intersect
 * hanya true bila elemen teratas di bawah pointer adalah kanvas 3D,
 * sehingga jendela RO (mode STOP) tetap menghalangi papan (Review Focus 5).
 * Petak separuh sendiri di bawah pointer disorot terang. Batal dicatat
 * paling banyak satu baris per seret, dan pulang ke tempat asal tidak
 * dicatat sama sekali (Review Focus 2).
 *
 * Bidak papan sendiri dipilih lewat petak di bawah pointer (state.saya.bidak
 * berflag diPapan), bukan ray-cast entity.
 *
 * AC6 K14: saat menonton kursi lain di PERSIAPAN, seret/bawa bidak Bangku
 * lebih dulu mengirim `tonton` ke kursi sendiri (server menolak
 * Taruh/KeBangku selama menonton) -- saat seret DIMULAI, bukan saat
 * pointerdown, jadi klik saja tidak memulangkan tontonan. Seret dari papan
 * tidak dimulai: bidak sendiri tidak tampil di papan yang ditonton.
 *
 * Semua dependensi DOM/WebGL/pewaktu disuntikkan supaya teruji di vitest node.
 */

import { FASE } from './pesan.js';
import { petakDariCell } from './papan.js';
import { BARIS_SENDIRI } from './sorot.js';
import { menontonLain, kursiSendiriHidup } from './state.js';

/** AC7 K2: gerak (px) dari titik pointerdown sebelum menjadi seret. */
export const AMBANG_SERET_PX = 4;

/** AC7 K5: lama pointer ditahan diam sebelum padaTahan (menu tahan). */
export const JEDA_TAHAN_MS = 400;

/** Ukuran kanvas hantu, sama dengan potret bangku. */
export const LEBAR_HANTU = 72;
export const TINGGI_HANTU = 84;

/**
 * Alasan batal drop, dicatat sebagai satu baris log (K13: string log
 * Indonesia; padanan KAMUS log.seret_* untuk K15).
 */
const ALASAN = {
	HANYA_PERSIAPAN: 'hanya bisa saat fase persiapan',
	HILANG: 'bidak sudah tidak ada',
	NAIK_OTOMATIS: 'bidak sudah naik otomatis ke papan',
	LUAR_PAPAN: 'dilepas di luar papan',
	SEPARUH_LAWAN: 'petak di luar separuh papanmu'
};

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

/**
 * Petak papan (orientasi TIM_A, kedua separuh) di bawah Mouse.world, atau
 * null bila pointer tidak menyentuh tanah (-1) atau di luar papan. Dipakai
 * bersama oleh seret (separuh sendiri) dan kartu bidak (hover, kartu.js).
 *
 * @param {{x:number, y:number}} asal
 * @param {number} skala
 * @param {{x:number, y:number}} world Mouse.world
 * @returns {{kolom:number, baris:number}|null}
 */
export function petakDiBawahPointer(asal, skala, world) {
	if (!world || !(world.x >= 0 && world.y >= 0)) {
		return null;
	}
	return petakDariCell(asal, skala, Math.floor(world.x), Math.floor(world.y));
}

/** Petak separuh sendiri (baris 0..3) di bawah Mouse.world, atau null. */
function petakSendiri(asal, skala, world) {
	const p = petakDiBawahPointer(asal, skala, world);
	return p && p.baris < BARIS_SENDIRI ? p : null;
}

/**
 * Keputusan saat pointer dilepas (seret) atau diklik (bawa). Murni.
 *
 * Urutan (AC7 K3/K8/K15): pertandingan selesai -> bidak di snapshot
 * terbaru (hilang = digabung; bidak bangku yang kini di papan di luar
 * PERSIAPAN = naik otomatis) -> zona jual (bidak bangku di fase mana pun,
 * bidak papan hanya di PERSIAPAN; server menolak menjual bidak papan saat
 * mode tempur) -> fase (perintah papan hanya sah di PERSIAPAN) -> jendela
 * Bangku -> papan. Petak yang terisi bidak sendiri bukan penolakan lagi:
 * `taruh` ke petak itu ditukar oleh server (K8).
 *
 * @param {object} a
 * @param {object} a.bidak bidak saat diangkat ({bidakId, diPapan, kolom, baris})
 * @param {object|null} a.bidakKini bidak yang sama di snapshot terbaru (null = sudah tidak ada)
 * @param {{x:number, y:number}} a.titik pointer (clientX/Y)
 * @param {object|null} a.rectBangku getBoundingClientRect jendela Bangku
 * @param {object|null} a.rectJual rect zona jual (jendela Toko mode jual); null/lebar 0 = tidak aktif
 * @param {boolean} a.diKanvas elemen teratas di bawah pointer adalah kanvas 3D
 * @param {{x:number, y:number}} a.world Mouse.world (-1 = tidak menyentuh tanah)
 * @param {object} a.snap state.ambil()
 * @param {{x:number, y:number}} a.asal
 * @param {number} a.skala
 * @returns {{aksi: string, arg: object} | {alasan: string|null}} alasan null = batal diam
 */
export function putuskanDrop({ bidak, bidakKini, titik, rectBangku, rectJual, diKanvas, world, snap, asal, skala }) {
	const persiapan = snap.fase === FASE.PERSIAPAN;
	if (snap.selesai) {
		return { alasan: ALASAN.HANYA_PERSIAPAN };
	}
	if (!bidakKini) {
		return { alasan: ALASAN.HILANG };
	}
	if (!bidak.diPapan && bidakKini.diPapan && !persiapan) {
		return { alasan: ALASAN.NAIK_OTOMATIS };
	}
	const id = bidakKini.bidakId;
	if (diDalam(rectJual, titik.x, titik.y)) {
		return !bidakKini.diPapan || persiapan
			? { aksi: 'jual', arg: { bidakId: id } }
			: { alasan: ALASAN.HANYA_PERSIAPAN };
	}
	if (!persiapan) {
		return { alasan: ALASAN.HANYA_PERSIAPAN };
	}
	if (diDalam(rectBangku, titik.x, titik.y)) {
		return bidakKini.diPapan ? { aksi: 'ke-bangku', arg: { bidakId: id } } : { alasan: null };
	}
	if (!diKanvas || !(world.x >= 0 && world.y >= 0)) {
		return { alasan: ALASAN.LUAR_PAPAN };
	}
	const p = petakDariCell(asal, skala, Math.floor(world.x), Math.floor(world.y));
	if (!p) {
		return { alasan: ALASAN.LUAR_PAPAN };
	}
	if (p.baris >= BARIS_SENDIRI) {
		return { alasan: ALASAN.SEPARUH_LAWAN };
	}
	if (bidakKini.diPapan && bidakKini.kolom === p.kolom && bidakKini.baris === p.baris) {
		return { alasan: null };
	}
	return { aksi: 'taruh', arg: { bidakId: id, kolom: p.kolom, baris: p.baris } };
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
 * @param {{tampil: function(object), sembunyi: function(), rect: function(): (object|null)}} dep.zonaJual
 *   AC7 K1: jendela Toko mode jual; rect() null/lebar 0 bila tidak aktif
 * @param {(ev: PointerEvent) => (object|null)} [dep.cariBidak] bidak tampil di bawah
 *   pointer kanvas ({entityId, unitId, nama, sendiri, bintang}, kartu.js infoBidak) atau null
 * @param {() => string} [dep.bahasa] bahasa nama unit di info klik
 * @param {() => boolean} [dep.beku] true selama UI dibekukan (Session.FreezeUI, mis. WinPopup)
 * @param {{petak: function}} dep.sorot sorot.js
 * @param {(pesan: string) => void} [dep.log]
 * @param {Window} [dep.jendela] sasaran 'blur' (bawaan dokumen.defaultView)
 * @param {function(function, number): any} [dep.tunda] setTimeout
 * @param {function(any): void} [dep.batalTunda] clearTimeout
 * @returns {{mulaiDariBangku: function, mulaiDariPapan: function, aktif: function, modus: function,
 *   pantauKanvas: function, padaKlik: function, padaTahan: function, mulaiBawa: function,
 *   batalBawa: function, lanjutkanSeret: function, padaFase: function}}
 */
export function buatSeret({
	dokumen, Mouse, Renderer, Cursor, asal, skala, ambilSnap, kirim, potret, katalog,
	elemenBangku, zonaJual, cariBidak = () => null, bahasa = () => 'id', beku = () => false,
	sorot, log = () => {}, jendela = dokumen.defaultView,
	tunda = (fn, ms) => setTimeout(fn, ms), batalTunda = (id) => clearTimeout(id)
}) {
	/**
	 * Interaksi yang berjalan, atau null:
	 * - {modus: 'diam', sumber, bidak|null, info, bolehSeret, titikAwal, titikKini, timer}
	 * - {modus: 'seret' | 'bawa', bidak, hantu}
	 */
	let kini = null;
	/** Pendaftar padaKlik / padaTahan (satu masing-masing). */
	let fnKlik = null;
	let fnTahan = null;
	/**
	 * Penelan `click` sesudah klik kiri penentu bawa: {timer} atau null.
	 * pointerdown yang ditelan tidak mencegah `click` yang menyusul, dan
	 * semua tombol UI autochess bertindak pada `click` (ikatAksi,
	 * TombolToko, Beli EXP di atas Bangku): tanpa ini satu klik bawa juga
	 * menekan tombol di bawah pointer.
	 */
	let telan = null;

	function diKanvas(x, y) {
		return dokumen.elementFromPoint(x, y) === Renderer.canvas;
	}

	function rectDari(el) {
		const e = ambil(el);
		return e?.getBoundingClientRect ? e.getBoundingClientRect() : null;
	}

	function letakkanHantu(hantu, x, y) {
		hantu.style.left = `${Math.round(x - LEBAR_HANTU / 2)}px`;
		hantu.style.top = `${Math.round(y - TINGGI_HANTU * OPSI_HANTU.kaki)}px`;
	}

	function namaUnit(unitId) {
		return ambil(katalog)?.namaUnit?.(unitId, bahasa()) ?? unitId;
	}

	/** Info klik untuk bidak sendiri dari snapshot (bangku atau papan). */
	function infoSendiri(sumber, b) {
		const info = { sumber, bidakId: b.bidakId, unitId: b.unitId, bintang: b.bintang, sendiri: true };
		if (sumber === 'papan' && b.entityId > 0) {
			info.entityId = b.entityId;
		}
		info.nama = namaUnit(b.unitId);
		return info;
	}

	/** Info klik dari cariBidak (entity tampil di papan: lawan, creep, sendiri). */
	function infoEntity(e, snap) {
		const info = { sumber: 'papan' };
		const milik = e.sendiri && e.entityId > 0
			? (snap.state?.saya?.bidak ?? []).find((b) => b.entityId === e.entityId)
			: null;
		if (milik) {
			info.bidakId = milik.bidakId;
		}
		Object.assign(info, {
			unitId: e.unitId, bintang: e.bintang, sendiri: Boolean(e.sendiri), entityId: e.entityId, nama: e.nama
		});
		return info;
	}

	/** Pointer bergerak selama seret/bawa: Mouse.screen/intersect, hantu, dan sorotan. */
	function gerak(ev) {
		const x = ev.clientX;
		const y = ev.clientY;
		Mouse.screen.x = ev.pageX ?? x;
		Mouse.screen.y = ev.pageY ?? y;
		const kanvas = diKanvas(x, y);
		Mouse.intersect = kanvas;
		letakkanHantu(kini.hantu, x, y);
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
	 * Satu-satunya jalan keluar diam/seret/bawa. Listener dan status
	 * dilepas PALING DULU, supaya lemparan dari langkah berikutnya tidak
	 * meninggalkan interaksi yang menggantung.
	 */
	function bereskan(ev) {
		const lama = kini;
		kini = null;
		dokumen.removeEventListener('pointermove', gerakDiam);
		dokumen.removeEventListener('pointerup', lepasDiam);
		dokumen.removeEventListener('pointermove', gerak);
		dokumen.removeEventListener('pointerup', lepas);
		dokumen.removeEventListener('pointerdown', tekanBawa, true);
		dokumen.removeEventListener('pointercancel', batal);
		jendela?.removeEventListener('blur', batal);
		lepasTelanKlik();
		if (!lama) {
			return;
		}
		if (lama.timer !== null && lama.timer !== undefined) {
			batalTunda(lama.timer);
		}
		if (!lama.hantu) {
			return;
		}
		lama.hantu.remove();
		potret.hentikan(lama.hantu);
		Cursor.setType(Cursor.ACTION.DEFAULT);
		sorot.petak(null);
		zonaJual.sembunyi();
		// Kembalikan intersect sesuai yang ada di bawah pointer; jendela
		// mode STOP memulihkannya sendiri saat pointer keluar darinya.
		// blur tidak membawa koordinat: intersect dibiarkan. Dihitung
		// SESUDAH zona jual disembunyikan: Toko yang tadinya tertutup
		// menghilang lagi dari bawah pointer (tanpa mouseleave), Toko yang
		// tadinya terbuka tetap di tempatnya.
		if (Number.isFinite(ev?.clientX) && Number.isFinite(ev?.clientY)) {
			Mouse.intersect = diKanvas(ev.clientX, ev.clientY);
		}
	}

	/** pointercancel atau blur jendela: batal diam. */
	function batal(ev) {
		if (kini) {
			bereskan(ev);
		}
	}

	/** Memutuskan drop di titik event, membereskan, lalu mengirim / mencatat. */
	function putuskanDiTitik(ev) {
		const { bidak } = kini;
		const x = ev.clientX;
		const y = ev.clientY;
		let keputusan;
		// finally: lemparan dari keputusan (state, jendela, katalog) tidak
		// boleh meninggalkan hantu atau listener dokumen; galatnya tetap
		// diteruskan ke pemanggil sesudah dibereskan. rect zona jual dibaca
		// SEBELUM bereskan menyembunyikannya.
		try {
			const snap = ambilSnap();
			const bidakKini = (snap.state?.saya?.bidak ?? []).find((b) => b.bidakId === bidak.bidakId) ?? null;
			keputusan = putuskanDrop({
				bidak,
				bidakKini,
				titik: { x, y },
				rectBangku: rectDari(elemenBangku),
				rectJual: zonaJual.rect(),
				diKanvas: diKanvas(x, y),
				world: { x: Mouse.world.x, y: Mouse.world.y },
				snap,
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

	/** pointerup selama seret. */
	function lepas(ev) {
		putuskanDiTitik(ev);
	}

	/**
	 * pointerdown (capture di dokumen) selama bawa: kiri = taruh/jual/
	 * ke-bangku, kanan = batal. Event ditelan supaya Bangku/kanvas di
	 * bawahnya tidak memulai pegangan baru.
	 */
	function tekanBawa(ev) {
		ev.preventDefault?.();
		ev.stopPropagation?.();
		if (ev.button === 2) {
			// Tombol kanan tidak menghasilkan `click`: tidak ada yang ditelan.
			bereskan(ev);
			return;
		}
		if (ev.button === undefined || ev.button === 0) {
			// Dipasang SESUDAH keputusan (bereskan di dalamnya melepas
			// penelan lama), juga bila keputusan melempar.
			try {
				putuskanDiTitik(ev);
			} finally {
				pasangTelanKlik();
			}
		}
	}

	/** `click` yang menyusul klik penentu bawa: ditelan sekali. */
	function telanKlik(ev) {
		ev.preventDefault?.();
		ev.stopImmediatePropagation?.();
		ev.stopPropagation?.();
		lepasTelanKlik();
	}

	/**
	 * pointerup sesudah klik penentu: `click` dikirim dalam task yang sama
	 * sesudah pointerup; bila tidak ada (pointerup di elemen yang tidak
	 * punya leluhur bersama yang sah, dsb.), penelan dilepas pada tick
	 * berikutnya supaya klik keyboard sesudahnya tidak ikut tertelan.
	 */
	function lepasTelanSesudahUp() {
		if (telan && telan.timer === null) {
			telan.timer = tunda(lepasTelanKlik, 0);
		}
	}

	function pasangTelanKlik() {
		lepasTelanKlik();
		telan = { timer: null };
		dokumen.addEventListener('click', telanKlik, true);
		dokumen.addEventListener('pointerup', lepasTelanSesudahUp, true);
		// pointerdown berikutnya berarti klik baru: penelan tidak berlaku lagi.
		dokumen.addEventListener('pointerdown', lepasTelanKlik, true);
	}

	function lepasTelanKlik() {
		if (!telan) {
			return;
		}
		dokumen.removeEventListener('click', telanKlik, true);
		dokumen.removeEventListener('pointerup', lepasTelanSesudahUp, true);
		dokumen.removeEventListener('pointerdown', lepasTelanKlik, true);
		if (telan.timer !== null) {
			batalTunda(telan.timer);
		}
		telan = null;
	}

	/** pointermove selama diam: lewat ambang -> seret (atau lepas klik-saja). */
	function gerakDiam(ev) {
		const peg = kini;
		peg.titikKini = { x: ev.clientX, y: ev.clientY };
		const jarak = Math.hypot(ev.clientX - peg.titikAwal.x, ev.clientY - peg.titikAwal.y);
		if (jarak <= AMBANG_SERET_PX) {
			return;
		}
		bereskan();
		if (peg.bolehSeret) {
			mulaiSeret(peg.bidak, ev);
		}
	}

	/** pointerup selama diam: klik. */
	function lepasDiam() {
		const peg = kini;
		bereskan();
		fnKlik?.(peg.info);
	}

	/** Pewaktu tahan habis selama diam: lepas pegangan, serahkan ke padaTahan. */
	function tahan() {
		const peg = kini;
		if (!peg || peg.modus !== 'diam') {
			return;
		}
		peg.timer = null;
		bereskan();
		fnTahan?.({ bidak: peg.bidak, titik: { ...peg.titikKini } });
	}

	/**
	 * Memasang pegangan 'diam'. Pegangan bidak yang bisa dipindah mencegah
	 * aksi bawaan pointerdown (seleksi teks/drag native), seperti seret dulu.
	 */
	function pasangDiam(peg, ev) {
		if (peg.bolehSeret) {
			ev.preventDefault?.();
		}
		const titik = { x: ev.clientX, y: ev.clientY };
		kini = { modus: 'diam', ...peg, titikAwal: titik, titikKini: { ...titik }, timer: null };
		dokumen.addEventListener('pointermove', gerakDiam);
		dokumen.addEventListener('pointerup', lepasDiam);
		dokumen.addEventListener('pointercancel', batal);
		// Pindah tab/jendela di tengah pegangan: pointerup tidak akan tiba.
		jendela?.addEventListener('blur', batal);
		if (peg.bolehTahan) {
			kini.timer = tunda(tahan, JEDA_TAHAN_MS);
		}
		return true;
	}

	/** Kanvas hantu 72x84 di (x, y), potret unit, kursor PICK. */
	function pasangHantu(modus, bidak, x, y) {
		const hantu = dokumen.createElement('canvas');
		hantu.width = LEBAR_HANTU;
		hantu.height = TINGGI_HANTU;
		Object.assign(hantu.style, {
			position: 'fixed',
			pointerEvents: 'none',
			zIndex: '2000',
			opacity: '0.85'
		});
		kini = { modus, bidak, hantu };
		letakkanHantu(hantu, x, y);
		dokumen.body.appendChild(hantu);
		const sprite = ambil(katalog)?.spriteUnit?.(bidak.unitId);
		if (sprite) {
			potret.statis(sprite, hantu, OPSI_HANTU);
		}
		Cursor.setType(Cursor.ACTION.PICK);
	}

	/** 'seret': hantu, zona jual, listener pointerup. */
	function mulaiSeret(bidak, ev) {
		ev.preventDefault?.();
		pulangBilaMenonton(ambilSnap(), bidak);
		pasangHantu('seret', bidak, ev.clientX, ev.clientY);
		dokumen.addEventListener('pointermove', gerak);
		dokumen.addEventListener('pointerup', lepas);
		dokumen.addEventListener('pointercancel', batal);
		jendela?.addEventListener('blur', batal);
		zonaJual.tampil(bidak);
		gerak(ev);
		return true;
	}

	/**
	 * K14: seret/bawa bidak Bangku saat menonton kursi lain di PERSIAPAN
	 * memulangkan tontonan dulu. Di luar PERSIAPAN (perintah papan batal;
	 * Jual sah walau menonton) dan bila kursi sendiri sudah mati (server
	 * menolak) tidak ada yang dikirim.
	 */
	function pulangBilaMenonton(snap, bidak) {
		if (!bidak.diPapan && snap.fase === FASE.PERSIAPAN && !snap.selesai
			&& menontonLain(snap) && kursiSendiriHidup(snap)) {
			kirim('tonton', { kursi: snap.state.saya.kursi });
		}
	}

	function bolehMulai(ev) {
		return !kini && (ev.button === undefined || ev.button === 0);
	}

	return {
		/**
		 * pointerdown pada slot Bangku: pegangan 'diam' untuk bidak bangku
		 * (klik, tahan, atau seret sesudah lewat ambang). Sesudah
		 * pertandingan selesai hanya klik.
		 * @param {number} bidakId
		 * @param {PointerEvent} ev
		 * @returns {boolean} true bila pegangan dipasang
		 */
		mulaiDariBangku(bidakId, ev) {
			if (!bolehMulai(ev)) {
				return false;
			}
			const snap = ambilSnap();
			const bidak = (snap.state?.saya?.bidak ?? []).find((b) => b.bidakId === bidakId && !b.diPapan);
			if (!bidak) {
				return false;
			}
			const bisa = !snap.selesai;
			return pasangDiam({
				sumber: 'bangku', bidak, info: infoSendiri('bangku', bidak), bolehSeret: bisa, bolehTahan: bisa
			}, ev);
		},

		/**
		 * pointerdown pada kanvas 3D. Bidak sendiri di petak bawah pointer
		 * saat PERSIAPAN (tidak menonton): pegangan penuh. Selain itu bidak
		 * apa pun yang tampil di bawah pointer (cariBidak): klik saja.
		 * @param {PointerEvent} ev
		 * @returns {boolean} true bila pegangan dipasang
		 */
		mulaiDariPapan(ev) {
			if (!bolehMulai(ev)) {
				return false;
			}
			const snap = ambilSnap();
			if (snap.fase === FASE.PERSIAPAN && !snap.selesai && !menontonLain(snap)) {
				const p = petakSendiri(asal, skala, Mouse.world);
				const bidak = p && (snap.state?.saya?.bidak ?? [])
					.find((b) => b.diPapan && b.kolom === p.kolom && b.baris === p.baris);
				if (bidak) {
					return pasangDiam({
						sumber: 'papan', bidak, info: infoSendiri('papan', bidak), bolehSeret: true, bolehTahan: true
					}, ev);
				}
			}
			const e = cariBidak(ev);
			if (!e) {
				return false;
			}
			return pasangDiam({
				sumber: 'papan', bidak: null, info: infoEntity(e, snap), bolehSeret: false, bolehTahan: false
			}, ev);
		},

		/** @returns {boolean} true selama seret atau bawa berjalan (kartu hover memakainya) */
		aktif: () => kini !== null && kini.modus !== 'diam',

		/** @returns {'diam'|'seret'|'bawa'|null} */
		modus: () => kini?.modus ?? null,

		/**
		 * @param {function(object): void} fn dipanggil dengan info klik
		 *   {sumber, bidakId?, unitId, bintang, sendiri, entityId?, nama}
		 * @returns {() => void} pelepas
		 */
		padaKlik(fn) {
			fnKlik = fn;
			return () => {
				if (fnKlik === fn) {
					fnKlik = null;
				}
			};
		},

		/**
		 * @param {function({bidak: object, titik: {x:number, y:number}}): void} fn
		 *   bidak = record snapshot, titik = pointer terakhir (viewport)
		 * @returns {() => void} pelepas
		 */
		padaTahan(fn) {
			fnTahan = fn;
			return () => {
				if (fnTahan === fn) {
					fnTahan = null;
				}
			};
		},

		/**
		 * K4 Pindah: bidak menempel ke kursor tanpa tombol ditahan.
		 * @param {object} bidak record snapshot
		 * @param {{x:number, y:number}} titik posisi awal hantu (viewport)
		 * @returns {boolean} true bila bawa dimulai
		 */
		mulaiBawa(bidak, titik) {
			if (kini || !bidak) {
				return false;
			}
			pulangBilaMenonton(ambilSnap(), bidak);
			pasangHantu('bawa', bidak, titik.x, titik.y);
			dokumen.addEventListener('pointermove', gerak);
			dokumen.addEventListener('pointerdown', tekanBawa, true);
			jendela?.addEventListener('blur', batal);
			zonaJual.tampil(bidak);
			return true;
		},

		/** Esc: membatalkan bawa tanpa mengirim apa pun. */
		batalBawa() {
			if (kini?.modus === 'bawa') {
				bereskan();
			}
		},

		/**
		 * Menu tahan (K5): pointer keluar radius menu dengan tombol masih
		 * ditahan -> seret biasa dari titik ini.
		 * @param {object} bidak record snapshot
		 * @param {PointerEvent} ev
		 * @returns {boolean} true bila seret dimulai
		 */
		lanjutkanSeret(bidak, ev) {
			if (kini || !bidak) {
				return false;
			}
			return mulaiSeret(bidak, ev);
		},

		/**
		 * EvtCaturFase. Di luar PERSIAPAN papan tidak bisa diubah: seret/
		 * bawa bidak papan dan pegangan bidak papan dibatalkan seketika
		 * (K15). Bidak bangku tetap dipegang (jual sah di semua fase).
		 * @param {number} fase FASE.*
		 */
		padaFase(fase) {
			if (!kini || fase === FASE.PERSIAPAN) {
				return;
			}
			const papan = kini.modus === 'diam'
				? kini.sumber === 'papan' && kini.bolehSeret
				: Boolean(kini.bidak?.diPapan);
			if (papan) {
				bereskan();
			}
		},

		/**
		 * pointermove pada kanvas 3D di luar seret/bawa: Mouse.intersect =
		 * true. Jaring pengaman bila jendela mode STOP merekam intersect
		 * false di tengah seret (urutan mouseenter vs pointermove) lalu tidak
		 * pernah mengembalikannya: tanpa ini Mouse.world membeku dan bidak
		 * papan berikutnya diambil dari petak basi. Tidak berlaku selama
		 * UI dibekukan (WinPopup mode FREEZE).
		 *
		 * @param {PointerEvent} ev
		 */
		pantauKanvas(ev) {
			if ((!kini || kini.modus === 'diam') && ev.target === Renderer.canvas && !beku()) {
				Mouse.intersect = true;
			}
		}
	};
}
