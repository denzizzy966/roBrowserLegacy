/**
 * Pemetaan petak papan autochess ke cell map. Logika murni, tanpa WebGL.
 *
 * Rumusnya WAJIB sama persis dengan arena.CellDari di server
 * (server/internal/arena/pertempuran.go): client menggambar bidak di cell
 * yang dihitung di sini, server menempatkannya di cell yang dihitung di
 * sana, dan selisih satu cell pun membuat bidak "melompat" saat tempur
 * dimulai. papan.test.js memakai tabel yang sama dengan TestCellDari.
 */

/** Ukuran satu petak papan, dalam cell map per sisi. */
export const SKALA_PETAK = 2;
/** Jumlah kolom papan penuh. */
export const KOLOM = 8;
/** Jumlah baris papan PENUH (dua separuh, masing-masing 4 baris). */
export const BARIS = 8;
/** Nomor tim, sama dengan arena.TimA / arena.TimB. */
export const TIM_A = 1;
export const TIM_B = 2;

/**
 * Cell map tempat bidak berdiri untuk sebuah petak.
 *
 * Setiap petak adalah kotak skala×skala cell; bidak berdiri di tengahnya.
 * TIM_B dicerminkan pada kedua sumbu (kolom' = 7-kolom, baris' = 7-baris),
 * sehingga kedua tim menyusun bidak dari sudut pandang yang sama: baris 0
 * adalah tepi belakang sendiri, baris 3 berbatasan dengan garis tengah.
 *
 * @param {{x:number, y:number}} asal - cell pojok papan
 * @param {number} skala - cell per sisi petak
 * @param {number} kolom - 0..7 dari sudut pandang tim
 * @param {number} baris - 0..3 dari sudut pandang tim
 * @param {number} tim - TIM_A atau TIM_B
 * @returns {{x:number, y:number}}
 */
export function cellDariPetak(asal, skala, kolom, baris, tim) {
	if (tim === TIM_B) {
		kolom = KOLOM - 1 - kolom;
		baris = BARIS - 1 - baris;
	}
	// Math.floor menyamai pembagian bilangan bulat Go (skala/2) untuk
	// skala positif.
	const tengah = Math.floor(skala / 2);
	return {
		x: asal.x + kolom * skala + tengah,
		y: asal.y + baris * skala + tengah
	};
}

/**
 * Titik tengah papan penuh, untuk mengarahkan kamera.
 *
 * @param {{x:number, y:number}} asal - cell pojok papan
 * @param {number} skala - cell per sisi petak
 * @returns {{x:number, y:number}}
 */
export function pusatPapan(asal, skala) {
	return {
		x: asal.x + KOLOM * skala / 2,
		y: asal.y + BARIS * skala / 2
	};
}

/**
 * Kebalikan cellDariPetak untuk orientasi TIM_A: petak papan penuh yang
 * menutup cell (x, y). Koordinat pecahan (Mouse.world) dibulatkan ke
 * bawah, sehingga setiap cell petak skala×skala -- bukan hanya cell
 * tengahnya -- kembali ke petak yang sama.
 *
 * @param {{x:number, y:number}} asal - cell pojok papan
 * @param {number} skala - cell per sisi petak
 * @param {number} x - cell map (boleh pecahan)
 * @param {number} y - cell map (boleh pecahan)
 * @returns {{kolom:number, baris:number}|null} kolom 0..7, baris 0..7; null di luar papan
 */
export function petakDariCell(asal, skala, x, y) {
	const kolom = Math.floor((x - asal.x) / skala);
	const baris = Math.floor((y - asal.y) / skala);
	if (kolom < 0 || kolom >= KOLOM || baris < 0 || baris >= BARIS) {
		return null;
	}
	return { kolom, baris };
}
