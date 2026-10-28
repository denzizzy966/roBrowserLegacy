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
 */

/**
 * @returns {{
 *   terima: function(object, number): void,
 *   terimaFase: function(object, number): void,
 *   terimaHasil: function(object): void,
 *   terimaSelesai: function(object): void,
 *   ambil: function(): {state: object|null, fase: number, ronde: number, hasilTerakhir: object|null, selesai: object|null},
 *   sisaMs: function(number): number
 * }}
 */
export function buatState() {
	let state = null;
	// fase dan ronde disimpan terpisah dari snapshot: EvtCaturFase bisa
	// tiba lebih dulu daripada snapshot berikutnya, dan tombol harus
	// mengikuti fase TERBARU dari sumber mana pun.
	let fase = 0;
	let ronde = 0;
	let hasilTerakhir = null;
	let selesai = null;
	// Jam lokal: sisa dari server dan saat ia diterima. null = belum ada.
	let jam = null;

	function aturJam(sisaMs, sekarangMs) {
		jam = { sisaMs, sejak: sekarangMs };
	}

	return {
		/** Menyimpan snapshot hasil decodeCaturState dan mereset jam. */
		terima(stateDecoded, sekarangMs) {
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
		},

		/** Menyimpan hasil ronde terakhir (decodeCaturHasil). */
		terimaHasil(hasil) {
			hasilTerakhir = hasil;
		},

		/** Menyimpan penutup pertandingan (decodeCaturSelesai). */
		terimaSelesai(s) {
			selesai = s;
		},

		/** Snapshot untuk renderUI dan e2e (__ac.state()). */
		ambil() {
			return { state, fase, ronde, hasilTerakhir, selesai };
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
