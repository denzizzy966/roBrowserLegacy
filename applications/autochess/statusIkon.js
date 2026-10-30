/**
 * Ikon status RO untuk kartu detail bidak (C24, keputusan R4 rencana AC5).
 *
 * Status autochess (EFEK_STATUS di pesan.js) dipetakan ke indeks status
 * roBrowser (DB/Status/StatusConst.js) -- sama dengan pemetaan bodyState/
 * healthState di efek.js: beku/pingsan/tidur adalah BODYSTATE_*, racun/
 * bisu/buta HEALTHSTATE_*. Ikonnya dimuat seperti UI/Components/
 * StatusIcons: Client.loadFile('data/texture/effect/' + berkas) lalu
 * Texture.load.
 *
 * TEMUAN: StatusInfo.js roBrowser TIDAK memuat entri untuk keenam status
 * ini (client RO lama tidak memberinya ikon; client baru membacanya dari
 * stateiconimginfo.lub). Karena itu nama berkas dicari dari
 * StatusTable[indeks].icon LEBIH DULU (bila kelak ditambahkan), lalu dari
 * IKON_RESMI: nama berkas stateiconimginfo.lub kRO (renewal2022.grf),
 * huruf kecil karena indeks GRF tidak peka huruf. HL_Blind.tga tidak ada
 * di GRF 2021/2022 yang diuji, jadi buta mencoba
 * handicapstate_deepblind.tga ("Deep Blind", serupa) LEBIH DULU: berkas
 * yang hilang di GRF membuat roBrowser mencoba HTTP (satu perjalanan sia-sia
 * dan mungkin baris 404 di konsol).
 *
 * Modul ini murni: Client, Texture, dan StatusTable disuntikkan supaya
 * teruji di vitest node tanpa GRF.
 */

import SC from 'DB/Status/StatusConst.js';
import { EFEK_STATUS } from './pesan.js';

/** EFEK_STATUS -> indeks status roBrowser (StatusConst). */
export const STATUS_DARI_EFST = Object.freeze({
	[EFEK_STATUS.BEKU]:    SC.BODYSTATE_FREEZING,
	[EFEK_STATUS.PINGSAN]: SC.BODYSTATE_STUN,
	[EFEK_STATUS.TIDUR]:   SC.BODYSTATE_SLEEP,
	[EFEK_STATUS.RACUN]:   SC.HEALTHSTATE_POISON,
	[EFEK_STATUS.BUTA]:    SC.HEALTHSTATE_BLIND,
	[EFEK_STATUS.BISU]:    SC.HEALTHSTATE_SILENCE
});

/**
 * Nama berkas cadangan per indeks status (lihat TEMUAN di atas), dicoba
 * berurutan sampai satu termuat.
 */
export const IKON_RESMI = Object.freeze({
	[SC.BODYSTATE_FREEZING]:  ['bd_freezing.tga'],
	[SC.BODYSTATE_STUN]:      ['bd_stun.tga'],
	[SC.BODYSTATE_SLEEP]:     ['bd_sleep.tga'],
	[SC.HEALTHSTATE_POISON]:  ['hl_poison.tga'],
	[SC.HEALTHSTATE_BLIND]:   ['handicapstate_deepblind.tga', 'hl_blind.tga'],
	[SC.HEALTHSTATE_SILENCE]: ['hl_silence.tga']
});

/** Folder tekstur ikon status, sama dengan StatusIcons.js. */
export const FOLDER_IKON = 'data/texture/effect/';

/**
 * @param {number} efst nilai EFEK_STATUS
 * @returns {number|null} indeks status roBrowser, null bila tak dikenal
 */
export function efstKeStatus(efst) {
	return Object.hasOwn(STATUS_DARI_EFST, efst) ? STATUS_DARI_EFST[efst] : null;
}

/**
 * Daftar path ikon yang dicoba untuk satu efst, urut prioritas.
 *
 * @param {number} efst
 * @param {object} StatusTable DB/Status/StatusInfo.js
 * @returns {string[]} kosong bila efst tak dikenal
 */
export function pathIkon(efst, StatusTable = {}) {
	const indeks = efstKeStatus(efst);
	if (indeks === null) {
		return [];
	}
	const nama = [StatusTable[indeks]?.icon, ...(IKON_RESMI[indeks] ?? [])].filter(Boolean);
	return [...new Set(nama)].map((n) => FOLDER_IKON + n);
}

/**
 * Pemuat ikon dengan cache satu gambar per efst. Setiap efst dimuat
 * SEKALI: pemanggil yang datang selama pemuatan ikut menunggu, dan
 * kegagalan (semua path gagal) juga diingat sebagai null.
 *
 * @param {object} d
 * @param {{loadFile: function(string, function, function=)}} d.Client Core/Client.js
 * @param {{load: function(*, function)}} d.Texture Utils/Texture.js (this = kanvas)
 * @param {object} [d.StatusTable] DB/Status/StatusInfo.js
 * @param {function(string): void} [d.log]
 * @param {function(function, number): any} [d.tunda] setTimeout (disuntik untuk uji)
 * @param {number} [d.batasMs] batas tunggu satu path sesudah berkas dimuat
 *   (Texture.load jalur gambar biasa tidak punya onerror)
 * @returns {{ambil: function(number, function=): (object|null), url: function(number, function=): (string|null)}}
 */
export function buatPemuatIkon({
	Client, Texture, StatusTable = {}, log = () => {},
	tunda = (fn, ms) => setTimeout(fn, ms), batasMs = 5000
}) {
	/** efst -> {siap: boolean, gambar: object|null, url: string|null, menunggu: function[]} */
	const cache = new Map();

	function selesai(entri, gambar) {
		entri.siap = true;
		entri.gambar = gambar;
		const menunggu = entri.menunggu;
		entri.menunggu = [];
		for (const cb of menunggu) {
			cb(gambar);
		}
	}

	function coba(efst, entri, daftar, i) {
		if (i >= daftar.length) {
			log(`! ikon status ${efst} tidak ada di GRF (${daftar.join(', ') || 'tanpa path'})`);
			selesai(entri, null);
			return;
		}
		// Satu path hanya boleh menyelesaikan langkahnya SEKALI: galat
		// muat, hasil decode, dan batas waktu saling berlomba.
		let tuntas = false;
		const lanjut = () => {
			if (!tuntas) {
				tuntas = true;
				coba(efst, entri, daftar, i + 1);
			}
		};
		Client.loadFile(daftar[i], (data) => {
			// Decode yang tak pernah memanggil balik (gambar rusak tanpa
			// onerror) dianggap gagal sesudah batasMs.
			tunda(lanjut, batasMs);
			Texture.load(data, function termuat(ok) {
				if (tuntas) {
					return;
				}
				if (ok && this) {
					tuntas = true;
					selesai(entri, this);
				} else {
					lanjut();
				}
			});
		}, lanjut);
	}

	/**
	 * Gambar (kanvas TGA atau kanvas hasil Texture.load) untuk efst.
	 *
	 * @param {number} efst
	 * @param {function(object|null): void} [cb] dipanggil sekali saat siap
	 *   (seketika bila sudah di cache)
	 * @returns {object|null} gambar bila sudah siap, selain itu null
	 */
	function ambil(efst, cb) {
		if (efstKeStatus(efst) === null) {
			cb?.(null);
			return null;
		}
		let entri = cache.get(efst);
		if (!entri) {
			entri = { siap: false, gambar: null, url: null, menunggu: [] };
			cache.set(efst, entri);
			if (cb) {
				entri.menunggu.push(cb);
			}
			coba(efst, entri, pathIkon(efst, StatusTable), 0);
			return entri.siap ? entri.gambar : null;
		}
		if (entri.siap) {
			cb?.(entri.gambar);
			return entri.gambar;
		}
		if (cb && !entri.menunggu.includes(cb)) {
			entri.menunggu.push(cb);
		}
		return null;
	}

	/**
	 * Data URL ikon untuk <img> di dalam HTML jendela (dihitung sekali per efst).
	 *
	 * @param {number} efst
	 * @param {function(): void} [padaSiap] dipanggil bila ikon BARU termuat
	 *   sesudah panggilan ini (untuk menggambar ulang)
	 * @returns {string|null}
	 */
	function url(efst, padaSiap) {
		const entri = cache.get(efst);
		if (entri?.siap) {
			if (entri.gambar && entri.url === null) {
				entri.url = entri.gambar.toDataURL?.() ?? entri.gambar.src ?? null;
			}
			return entri.url;
		}
		// Ikon yang sudah ada di memori GRF bisa termuat SEKETIKA di dalam
		// ambil(): padaSiap tidak dipanggil saat itu (pemanggil sedang
		// menggambar dan langsung menerima url-nya), hanya bila menyusul.
		// Penggambaran ulang 4x/detik tidak boleh menumpuk penunggu: satu
		// padaSiap yang sama hanya didaftarkan sekali per pemuatan.
		let sinkron = true;
		const sudahMenunggu = Boolean(padaSiap && entri && !entri.siap && entri.padaSiap?.has(padaSiap));
		if (sudahMenunggu) {
			return null;
		}
		const gambar = ambil(efst, padaSiap ? () => {
			if (!sinkron) {
				padaSiap();
			}
		} : undefined);
		if (padaSiap) {
			const e = cache.get(efst);
			if (e && !e.siap) {
				(e.padaSiap ??= new Set()).add(padaSiap);
			}
		}
		sinkron = false;
		return gambar ? url(efst) : null;
	}

	return { ambil, url };
}
