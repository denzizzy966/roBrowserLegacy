/**
 * Kotak layar (bounding box, px) separuh papan sendiri untuk tiap ukuran
 * viewport uji, direkam di browser dengan __ac.kotakSeparuh() (Playwright,
 * guild_vs3, kamera dari kameraUntuk, 2026-10-30). Kunci = ukuran nominal
 * "lebarxtinggi"; Playwright memberi viewport CSS 1537x695 untuk 1536x695
 * dan 1367x642 untuk 1366x641 (selisih 1 px dari skala 0,8 layar uji);
 * kotaknya direkam pada ukuran nyata itu.
 *
 * Dipakai ui/tataLetak.test.js (tak ada jendela tetap yang menutupnya) dan
 * kamera.test.js (matriksKamera harus mereproduksinya).
 */
export const SEPARUH_SENDIRI = {
	'1920x1080': { x: 428, y: 212, lebar: 1064, tinggi: 485 },
	'1600x900': { x: 357, y: 171, lebar: 886, tinggi: 404 },
	'1536x695': { x: 346, y: 91, lebar: 845, tinggi: 383 },
	'1366x641': { x: 307, y: 88, lebar: 752, tinggi: 341 },
	'1280x720': { x: 286, y: 131, lebar: 708, tinggi: 323 }
};

/**
 * Kotak layar papan penuh (kedua separuh, 8x8 petak) selama TEMPUR/HASIL,
 * direkam di browser dengan __ac.kotakPapan() (Fix round 1, 2026-10-30).
 * Hanya dua ukuran diukur di browser; tiga lainnya dicek lewat model
 * (matriksKamera cocok dengan peramban sampai +-1 px di semua kasus lain).
 */
export const PAPAN_PENUH_TEMPUR = {
	'1536x695': { x: 521, y: 82, lebar: 494, tinggi: 447 },
	'1600x900': { x: 439, y: 81, lebar: 723, tinggi: 653 }
};
