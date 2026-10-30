/**
 * Kartu detail bidak (C24, keputusan R4 rencana AC5): pengendali hover.
 *
 * - Bidak di bawah pointer dicari dua jalan (cariBidak): entity yang
 *   roBrowser sendiri tandai "di bawah kursor" (EntityManager.
 *   getOverEntity, dihitung MapRenderer tiap frame dari kotak sprite),
 *   lalu petak papan di bawah Mouse.world (petakDiBawahPointer, sama
 *   dengan seret.js): bidak sendiri saat PERSIAPAN dari snapshot
 *   (entityId), selebihnya entity bertim (EvtSpawn.tim, lawan dan creep
 *   saat TEMPUR) yang posisinya jatuh di petak itu.
 * - Kartu tampil sesudah pointer berada >= JEDA_KARTU_MS di atas bidak yang
 *   SAMA (dwell sejak MASUK bidak itu, bukan diam: menggeser pointer di atas
 *   bidak yang sama tidak mengulang jeda); ditutup saat pointer pergi (dari bidak atau dari kanvas), saat
 *   seret dimulai, dan saat entity hilang/mati (diperiksa di denyut 250 ms
 *   jendela). Isinya digambar ulang tiap denyut, jadi status yang lepas
 *   langsung kehilangan ikonnya (Review Focus 4).
 *
 * Semua dependensi disuntikkan supaya teruji di vitest node.
 */

import { FASE } from './pesan.js';
import { petakDariCell } from './papan.js';

/** Lama pointer berada di atas bidak yang sama sebelum kartu tampil (ms; dwell sejak masuk, bukan diam). */
export const JEDA_KARTU_MS = 250;

/**
 * Menyimpan field EvtSpawn yang dibutuhkan kartu bidak lawan pada entity
 * (spawnkan di shared/entitas.js tidak menyimpannya). Prefiks __ac
 * menandai field milik autochess.
 *
 * @param {object|null} entity hasil penggerak.spawnkan
 * @param {{tim?:number, bintang?:number, nama?:string}} sp decodeSpawnLengkap
 * @returns {object|null} entity yang sama
 */
export function tandaiSpawn(entity, sp) {
	if (!entity || !sp) {
		return entity ?? null;
	}
	entity.__acTim = sp.tim || 0;
	entity.__acBintang = sp.bintang || 0;
	entity.__acNama = sp.nama || '';
	return entity;
}

/** true bila entity masih ada dan belum mati / dijadwalkan dihapus. */
export function hidup(entity) {
	if (!entity) {
		return false;
	}
	if (entity.remove_tick > 0) {
		return false;
	}
	return !(entity.ACTION && entity.action === entity.ACTION.DIE);
}

/** Bidak sendiri di snapshot yang entity-nya `gid`, atau undefined. */
function bidakSendiri(snap, gid) {
	return (snap?.state?.saya?.bidak ?? []).find((b) => b.entityId > 0 && b.entityId === gid);
}

/** true bila entity adalah bidak autochess (bertim, atau milik sendiri di snapshot). */
export function bidakAutochess(entity, snap) {
	return !!entity && (entity.__acTim > 0 || !!bidakSendiri(snap, entity.GID));
}

/**
 * Isi kartu dari entity dan snapshot. Bidak sendiri memakai unitId dan
 * bintang dari snapshot; bidak lawan/creep dari nama EvtSpawn (katalog
 * idUnitDariNama) dan __acBintang. HP dari entity.life (hidupkanBar), SP
 * dari __acSP/__acMaxSP (efek.js), status dari __acStatus (efek.js).
 *
 * @param {object} entity
 * @param {{snap: object, katalog: object, namaMob?: function(number): (string|null)}} d
 *   namaMob(job): nama mob menurut bahasa client untuk creep (opsional)
 * @returns {object} info untuk renderKartuBidak
 */
export function infoBidak(entity, { snap, katalog, namaMob }) {
	const milik = bidakSendiri(snap, entity.GID);
	const namaSpawn = entity.__acNama || entity.display?.name || '';
	const unitId = milik?.unitId ?? katalog?.idUnitDariNama?.(namaSpawn) ?? null;
	// Creep (tanpa unit katalog): nama mob roBrowser menurut bahasa client;
	// bila tak ada ('Unknown' / kosong), nama mentah EvtSpawn.
	const nama = (!unitId && namaMob?.(entity._job)) || namaSpawn;
	const life = entity.life ?? {};
	const maxHp = life.hp_max > 0 ? life.hp_max : (entity.__m2MaxHP || 0);
	return {
		entityId: entity.GID,
		unitId,
		nama,
		sendiri: !!milik,
		bintang: milik?.bintang ?? entity.__acBintang ?? 0,
		hp: life.hp >= 0 ? life.hp : 0,
		maxHp,
		sp: entity.__acSP || 0,
		maxSp: entity.__acMaxSP || 0,
		status: [...(entity.__acStatus ?? [])].sort((a, b) => a - b)
	};
}

/**
 * Bidak di bawah pointer. Urutan: entity di bawah kursor (kotak sprite) ->
 * bidak sendiri di petak (snapshot, hanya PERSIAPAN) -> entity bertim yang
 * posisinya jatuh di petak.
 *
 * @param {object} d
 * @param {{get: function, forEach: function}} d.EntityManager
 * @param {object} d.snap state.ambil()
 * @param {object|null} d.over EntityManager.getOverEntity() (null bila pointer bukan di kanvas)
 * @param {{kolom:number, baris:number}|null} d.petak petakDiBawahPointer(...)
 * @param {{x:number, y:number}} d.asal
 * @param {number} d.skala
 * @returns {object|null} entity
 */
export function cariBidak({ EntityManager, snap, over, petak, asal, skala }) {
	if (hidup(over) && bidakAutochess(over, snap)) {
		return over;
	}
	if (!petak) {
		return null;
	}
	if (snap?.fase === FASE.PERSIAPAN) {
		const b = (snap.state?.saya?.bidak ?? [])
			.find((x) => x.diPapan && x.entityId > 0 && x.kolom === petak.kolom && x.baris === petak.baris);
		const e = b ? EntityManager.get(b.entityId) : null;
		if (hidup(e)) {
			return e;
		}
	}
	let hasil = null;
	EntityManager.forEach((e) => {
		if (!hidup(e) || !bidakAutochess(e, snap) || !e.position) {
			return true;
		}
		const p = petakDariCell(asal, skala, Math.floor(e.position[0]), Math.floor(e.position[1]));
		if (p && p.kolom === petak.kolom && p.baris === petak.baris) {
			hasil = e;
			return false;
		}
		return true;
	});
	return hasil;
}

/**
 * @param {object} d
 * @param {{get: function(number): object}} d.EntityManager
 * @param {() => object} d.ambilSnap state.ambil()
 * @param {object|function} d.katalog buatKatalog(...) atau pengambilnya
 * @param {() => (object|null)} d.cariTarget bidak di bawah pointer sekarang (cariBidak)
 * @param {{tampilkan: function(object, {x:number,y:number}), sembunyikan: function}} d.jendela KartuBidak
 * @param {() => boolean} [d.seretAktif] true selama seret bidak berjalan
 * @param {function(number): (string|null)} [d.namaMob] nama mob untuk creep (DB.getMonsterName; null = tak ada)
 * @param {function(function, number): any} [d.tunda] setTimeout
 * @param {function(any): void} [d.batalTunda] clearTimeout
 * @returns {{gerak: function, keluar: function, denyut: function, sembunyikan: function, tampil: function}}
 */
export function buatKartu({
	EntityManager, ambilSnap, katalog, cariTarget, jendela,
	seretAktif = () => false,
	namaMob = null,
	tunda = (fn, ms) => setTimeout(fn, ms),
	batalTunda = (id) => clearTimeout(id)
}) {
	/** Pointer terakhir (clientX/Y) dan apakah ia di atas kanvas 3D. */
	const titik = { x: 0, y: 0 };
	let diKanvas = false;
	/** Entity yang sedang ditunggu jedanya, dan pewaktunya. */
	let calon = null;
	let pewaktu = null;
	/** Entity yang kartunya sedang tampil. */
	let tampil = null;

	const ambilKatalog = () => (typeof katalog === 'function' ? katalog() : katalog);

	function batalCalon() {
		if (pewaktu !== null) {
			batalTunda(pewaktu);
			pewaktu = null;
		}
		calon = null;
	}

	function sembunyikan() {
		if (tampil) {
			tampil = null;
			jendela.sembunyikan();
		}
	}

	function gambar() {
		jendela.tampilkan(infoBidak(tampil, { snap: ambilSnap(), katalog: ambilKatalog(), namaMob }), { ...titik });
	}

	function tampilkan(e) {
		tampil = e;
		gambar();
	}

	function mulaiJeda(e) {
		batalCalon();
		calon = e;
		pewaktu = tunda(() => {
			pewaktu = null;
			const tunggu = calon;
			calon = null;
			if (!diKanvas || seretAktif()) {
				return;
			}
			const kini = cariTarget();
			if (kini && kini === tunggu && hidup(kini)) {
				tampilkan(kini);
			} else if (kini) {
				// Pointer diam tetapi bidak di bawahnya berganti (bidak
				// berjalan saat TEMPUR): tunggu ulang untuk yang baru.
				mulaiJeda(kini);
			}
		}, JEDA_KARTU_MS);
	}

	/** Menilai ulang bidak di bawah pointer. */
	function evaluasi() {
		if (!diKanvas || seretAktif()) {
			batalCalon();
			sembunyikan();
			return;
		}
		const e = cariTarget();
		if (tampil && e === tampil) {
			return;
		}
		sembunyikan();
		if (!e) {
			batalCalon();
			return;
		}
		if (e !== calon) {
			mulaiJeda(e);
		}
	}

	return {
		/**
		 * pointermove pada kanvas 3D.
		 * @param {{clientX:number, clientY:number}} ev
		 */
		gerak(ev) {
			titik.x = ev.clientX;
			titik.y = ev.clientY;
			diKanvas = true;
			evaluasi();
		},

		/** Pointer meninggalkan kanvas (atau seret dimulai): tutup dan lupakan. */
		keluar() {
			diKanvas = false;
			batalCalon();
			sembunyikan();
		},

		/**
		 * Dipanggil tiap 250 ms (denyut jendela). Entity yang hilang, mati,
		 * atau digantikan entity lain ber-GID sama menutup kartu; selain itu
		 * bidak di bawah pointer dinilai ulang (bidak bisa berjalan pergi
		 * dari pointer yang diam) dan isi kartu digambar ulang.
		 */
		denyut() {
			if (!tampil) {
				return;
			}
			if (EntityManager.get(tampil.GID) !== tampil || !hidup(tampil)) {
				sembunyikan();
				return;
			}
			evaluasi();
			if (tampil) {
				gambar();
			}
		},

		sembunyikan() {
			batalCalon();
			sembunyikan();
		},

		/** @returns {number|null} entityId kartu yang tampil */
		tampil: () => (tampil ? tampil.GID : null)
	};
}
