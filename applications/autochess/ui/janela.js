/**
 * Pembantu bersama jendela RO autochess: tekstur kerangka dan penulisan
 * innerHTML yang hanya terjadi saat isinya berubah (jendela digambar tiap
 * 250 ms; menulis ulang HTML yang sama akan membuang klik yang sedang
 * berlangsung pada tombol).
 */

import Client from 'Core/Client.js';
import DB from 'DB/DBManager.js';

const KERANGKA = 'basic_interface/basewin_bg.bmp';

/** Memasang basewin_bg.bmp sebagai latar elemen (diam bila berkas hilang). */
export function pasangKerangka(el) {
	Client.loadFile(DB.INTERFACE_PATH + KERANGKA, (url) => {
		el.style.backgroundImage = `url(${url})`;
	});
}

/** Menulis html ke el hanya bila berbeda dari tulisan terakhir. */
export function tulisBila(el, html) {
	if (el._htmlTerakhir === html) {
		return false;
	}
	el._htmlTerakhir = html;
	el.innerHTML = html;
	return true;
}
