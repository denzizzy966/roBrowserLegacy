/**
 * State catur sisi client: snapshot EvtCaturState terakhir, fase dan
 * ronde terkini, hasil ronde terakhir, dan penutup pertandingan.
 *
 * Murni: tidak menyentuh DOM, jaringan, atau jam sistem -- waktu selalu
 * disuntikkan sebagai sekarangMs, supaya countdown teruji tanpa timer
 * palsu.
 *
 * Server mengirim DURASI tersisa (sisaMs), bukan tenggat absolut (lihat
 * ro.proto). Jam lokal dimulai saat pesan tiba dan direset setiap kali
 * fase atau snapshot baru masuk: pesan terakhir yang menang, sehingga
 * selisih jam client-server tidak pernah menumpuk.
 *
 * AC6 (K3/K13/K14): kursi yang ditonton. EvtCaturTonton menyetelnya;
 * EvtCaturFase PERSIAPAN mengembalikannya ke kursi sendiri selama kursi
 * itu hidup (server tidak mengirim EvtCaturTonton dalam kasus ini).
 * snapshot.saya SELALU milik pemain sendiri; papan dan sinergi yang TAMPIL
 * dibaca lewat papanTampil()/sinergiTampil().
 */

import { FASE } from './pesan.js';

/**
 * Kursi sendiri dari snapshot; 0 sebelum snapshot pertama.
 * @param {object} snap state.ambil()
 * @returns {number}
 */
function kursiSaya(snap) {
	return snap?.state?.saya?.kursi ?? 0;
}

/**
 * true bila kursi sendiri masih hidup. Tanpa snapshot (atau kursi tak ada
 * di daftar) dianggap hidup: belum ada yang tersingkir.
 *
 * @param {object} snap state.ambil()
 * @returns {boolean}
 */
export function kursiSendiriHidup(snap) {
	const k = (snap?.state?.kursi ?? []).find((x) => x.kursi === kursiSaya(snap));
	return k ? k.hidup : true;
}

/**
 * true bila yang tampil adalah kursi LAIN (ditonton !== kursi sendiri).
 * @param {object} snap state.ambil()
 * @returns {boolean}
 */
export function menontonLain(snap) {
	// Snapshot tanpa ditonton (bentuk pra-AC6, mis. di test) = kursi sendiri.
	return !!snap?.state && (snap.ditonton ?? kursiSaya(snap)) !== kursiSaya(snap);
}

/**
 * tontonan snapshot bila ia milik kursi yang ditonton sekarang. Snapshot
 * bisa basi sesaat (EvtCaturTonton atau EvtCaturFase tiba sebelum state
 * berikutnya); tontonan kursi lain tidak dipakai.
 */
function tontonanBerlaku(snap) {
	const t = snap?.state?.tontonan;
	return t && menontonLain(snap) && t.kursi === snap.ditonton ? t : null;
}

/**
 * Bidak papan yang TAMPIL: milik kursi yang ditonton (tontonan.bidak)
 * atau, saat menonton papan sendiri, bidak papan sendiri. Untuk DPS,
 * kartu bidak, dan pencarian bidak per petak.
 *
 * @param {object} snap state.ambil()
 * @returns {object[]}
 */
export function papanTampil(snap) {
	return tontonanBerlaku(snap)?.bidak ?? (snap?.state?.saya?.bidak ?? []).filter((b) => b.diPapan);
}

/**
 * Sinergi yang TAMPIL (bentuk sama dengan saya.sinergi): milik kursi yang
 * ditonton, atau sinergi sendiri. Kait untuk baris bonus sinergi (K17).
 *
 * @param {object} snap state.ambil()
 * @returns {object[]}
 */
export function sinergiTampil(snap) {
	return tontonanBerlaku(snap)?.sinergi ?? snap?.state?.saya?.sinergi ?? [];
}

/**
 * @returns {{
 *   terima: function(object, number): void,
 *   terimaFase: function(object, number): void,
 *   terimaHasil: function(object): void,
 *   terimaSelesai: function(object): void,
 *   sebelumnya: function(): object|null,
 *   terimaTonton: function(object): void,
 *   ambil: function(): {state: object|null, fase: number, ronde: number, hasilTerakhir: object|null,
 *     selesai: object|null, ditonton: number, kursiBawah: number, lawanKursi: number},
 *   papanTampil: function(): object[],
 *   sinergiTampil: function(): object[],
 *   sisaMs: function(number): number
 * }}
 */
export function buatState() {
	let state = null;
	// Snapshot sebelum yang terakhir diterima (untuk deteksi naik bintang).
	let sebelumnya = null;
	// fase dan ronde disimpan terpisah dari snapshot: EvtCaturFase bisa
	// tiba lebih dulu daripada snapshot berikutnya, dan tombol harus
	// mengikuti fase TERBARU dari sumber mana pun.
	let fase = 0;
	let ronde = 0;
	let hasilTerakhir = null;
	let selesai = null;
	// Jam lokal: sisa dari server dan saat ia diterima. null = belum ada.
	let jam = null;
	// Tontonan (EvtCaturTonton). null = kursi sendiri (belum ada
	// EvtCaturTonton, atau dikembalikan oleh PERSIAPAN).
	let tonton = null;

	function aturJam(sisaMs, sekarangMs) {
		jam = { sisaMs, sejak: sekarangMs };
	}

	return {
		/** Menyimpan snapshot hasil decodeCaturState dan mereset jam. */
		terima(stateDecoded, sekarangMs) {
			sebelumnya = state;
			state = stateDecoded;
			fase = stateDecoded.fase;
			ronde = stateDecoded.ronde;
			aturJam(stateDecoded.sisaMs, sekarangMs);
		},

		/** Menyimpan fase baru (decodeCaturFase) dan mereset jam. */
		terimaFase(faseDecoded, sekarangMs) {
			fase = faseDecoded.fase;
			ronde = faseDecoded.ronde;
			aturJam(faseDecoded.sisaMs, sekarangMs);
			// K14: awal PERSIAPAN kembali ke papan sendiri selama hidup.
			// Kursi mati tetap menonton; server menyusulkan EvtCaturTonton.
			if (fase === FASE.PERSIAPAN && kursiSendiriHidup({ state })) {
				tonton = null;
			}
		},

		/** Menyimpan tontonan baru (decodeCaturTonton). */
		terimaTonton(t) {
			tonton = { kursi: t.kursi, kursiBawah: t.kursiBawah, lawanKursi: t.lawanKursi };
		},

		/** Menyimpan hasil ronde terakhir (decodeCaturHasil). */
		terimaHasil(hasil) {
			hasilTerakhir = hasil;
		},

		/** Menyimpan penutup pertandingan (decodeCaturSelesai). */
		terimaSelesai(s) {
			selesai = s;
		},

		/** State terdekode SEBELUM snapshot terakhir; null pada snapshot pertama. */
		sebelumnya() {
			return sebelumnya;
		},

		/** Snapshot untuk renderUI dan e2e (__ac.state()). */
		ambil() {
			const sendiri = state?.saya?.kursi ?? 0;
			return {
				state, fase, ronde, hasilTerakhir, selesai,
				// Kursi yang tampil; bawaan kursi sendiri.
				ditonton:   tonton?.kursi ?? sendiri,
				// Kursi Tim A pasangan yang tampil (separuh bawah, K13).
				kursiBawah: tonton?.kursiBawah ?? sendiri,
				// -1 = creep, PERSIAPAN, atau belum diketahui.
				lawanKursi: tonton?.lawanKursi ?? -1
			};
		},

		/** papanTampil(ambil()); lihat fungsi modul. */
		papanTampil() {
			return papanTampil(this.ambil());
		},

		/** sinergiTampil(ambil()); lihat fungsi modul. */
		sinergiTampil() {
			return sinergiTampil(this.ambil());
		},

		/**
		 * Sisa waktu fase menurut jam lokal, tidak pernah negatif.
		 *
		 * @param {number} sekarangMs - jam yang sama dengan saat terima
		 * @returns {number}
		 */
		sisaMs(sekarangMs) {
			if (!jam) {
				return 0;
			}
			return Math.max(0, jam.sisaMs - (sekarangMs - jam.sejak));
		}
	};
}
