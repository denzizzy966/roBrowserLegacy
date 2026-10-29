/**
 * Format waktu bersama: dipakai jendela Timer (A) dan panel debug ui.js.
 * Murni, tanpa DOM.
 */

/**
 * Milidetik ke mm:ss, dibulatkan ke atas (00:01 sampai benar-benar habis)
 * dan tidak pernah negatif.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatWaktu(ms) {
	const detik = Math.max(0, Math.ceil(ms / 1000));
	const mm = String(Math.floor(detik / 60)).padStart(2, '0');
	const ss = String(detik % 60).padStart(2, '0');
	return `${mm}:${ss}`;
}
