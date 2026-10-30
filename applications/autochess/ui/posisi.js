/**
 * Posisi jendela yang digeser pengguna diingat (R6, rencana AC5).
 *
 * - gabungPosisi (murni): posisi tersimpan {left, top} menang atas tata
 *   letak hitungan selama SELURUH kotak jendela masih di layar; bila tidak
 *   (mis. layar mengecil), jendela itu kembali ke tata letak hitungan.
 *   Jendela yang belum pernah digeser tidak tersentuh.
 * - buatPemantauPosisi: mendeteksi geseran pengguna TANPA menyentuh src.
 *   GUIComponent.draggable() menulis host.style.left/top dan tidak
 *   memancarkan peristiwa, jadi pemantau membandingkan "tanda tangan"
 *   (style.left|style.top) dengan yang dicatat saat aturTataLetak
 *   menerapkan tata letak; bila berbeda dan tidak ada tombol pointer yang
 *   sedang ditekan (geseran selesai), posisinya disimpan di pref.
 *
 * KartuBidak (menempel ke pointer) dan jendela statis lain tidak masuk
 * JENDELA_DAPAT_DIGESER, jadi posisinya tidak pernah disimpan.
 */

/** Jendela yang memanggil draggable('.titlebar') dan karenanya posisinya diingat. */
export const JENDELA_DAPAT_DIGESER = ['InfoPemain', 'DPS', 'Lore', 'Log'];

/** Kunci Preferences.get untuk posisi tersimpan (versi 1.0). */
export const KUNCI_POSISI = 'AutochessJendela';

/** true bila v bilangan hingga. */
const angka = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Menggabungkan posisi tersimpan ke tata letak hitungan.
 *
 * @param {Object<string, {kotak: {x:number,y:number,lebar:number,tinggi:number}, kotakTerbuka?: object}>} letak hitungTataLetak
 * @param {Object<string, {left:number, top:number}>} tersimpan posisi geseran per nama jendela
 * @param {number} lebar lebar layar
 * @param {number} tinggi tinggi layar
 * @returns {object} tata letak baru; entri yang tersimpan menjadi {top, left, kotak}
 *   (tanpa right/bottom/maxHeight), selebihnya identik dengan `letak`
 */
export function gabungPosisi(letak, tersimpan, lebar, tinggi) {
	const hasil = { ...letak };
	for (const [nama, pos] of Object.entries(tersimpan ?? {})) {
		const asli = letak[nama];
		if (!asli || !pos || !angka(pos.left) || !angka(pos.top)) {
			continue;
		}
		// Kotak terbesar jendela (InfoPemain terbuka tumbuh) harus muat.
		const tinggiMaks = Math.max(asli.kotak.tinggi, asli.kotakTerbuka?.tinggi ?? 0);
		const muat = pos.left >= 0 && pos.top >= 0
			&& pos.left + asli.kotak.lebar <= lebar && pos.top + tinggiMaks <= tinggi;
		if (!muat) {
			continue;
		}
		hasil[nama] = {
			top: pos.top, left: pos.left,
			kotak: { ...asli.kotak, x: pos.left, y: pos.top }
		};
	}
	return hasil;
}

/** Tanda tangan posisi inline host: berubah hanya bila ada yang menulis left/top. */
function tandaTangan(host) {
	return `${host.style.left}|${host.style.top}`;
}

/**
 * @param {object} d
 * @param {Object<string, {_host: HTMLElement}>} d.jendela nama -> GUIComponent
 * @param {object} d.pref Preferences.get(KUNCI_POSISI, {}, 1.0) (isi: nama -> {left, top}; save())
 * @param {EventTarget} [d.dokumen] sumber peristiwa pointer (window)
 * @param {string[]} [d.nama] jendela yang dipantau
 * @returns {{catat: function(): void, pantau: function(): boolean, ditekan: function(): boolean}}
 */
export function buatPemantauPosisi({ jendela, pref, dokumen = globalThis.window, nama = JENDELA_DAPAT_DIGESER }) {
	/** nama -> tanda tangan posisi yang diterapkan aturTataLetak / terakhir disimpan. */
	const dasar = new Map();
	let ditekan = false;

	if (dokumen?.addEventListener) {
		const turun = () => {
			ditekan = true;
		};
		const naik = () => {
			ditekan = false;
		};
		for (const e of ['mousedown', 'touchstart', 'pointerdown']) {
			dokumen.addEventListener(e, turun, true);
		}
		for (const e of ['mouseup', 'touchend', 'touchcancel', 'pointerup', 'pointercancel', 'blur']) {
			dokumen.addEventListener(e, naik, true);
		}
	}

	return {
		/** Dipanggil SESUDAH aturTataLetak: posisi saat ini adalah garis dasar. */
		catat() {
			for (const n of nama) {
				const host = jendela[n]?._host;
				if (host) {
					dasar.set(n, tandaTangan(host));
				}
			}
		},

		/**
		 * Dipanggil tiap denyut 250 ms. Menyimpan posisi jendela yang baru
		 * digeser (dan geserannya sudah dilepas).
		 * @returns {boolean} true bila ada posisi yang disimpan
		 */
		pantau() {
			if (ditekan) {
				return false;
			}
			let simpan = false;
			for (const n of nama) {
				const host = jendela[n]?._host;
				if (!host) {
					continue;
				}
				const kini = tandaTangan(host);
				if (!dasar.has(n)) {
					dasar.set(n, kini); // pertama terlihat: belum ada garis dasar, bukan geseran
					continue;
				}
				if (kini === dasar.get(n)) {
					continue;
				}
				dasar.set(n, kini);
				pref[n] = { left: host.offsetLeft, top: host.offsetTop };
				simpan = true;
			}
			if (simpan) {
				pref.save?.();
			}
			return simpan;
		},

		/** @returns {boolean} true selama tombol pointer sedang ditekan */
		ditekan: () => ditekan
	};
}
