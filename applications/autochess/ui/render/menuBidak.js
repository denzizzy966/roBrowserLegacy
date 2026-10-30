/**
 * Renderer dan geometri murni menu tahan bidak (AC7 K5/K6): lingkaran
 * 140 px berpusat di titik tahan dengan tiga item di sekelilingnya --
 * Jual (90°, atas), Pindah (210°, kiri-bawah), Batal (330°, kanan-bawah)
 * -- sejauh RADIUS_MENU_PX dari pusat. Sudut diukur berlawanan jarum jam
 * dari kanan dengan sumbu y ke ATAS (layar: y ke bawah).
 *
 * itemDiTitik memetakan posisi pointer ke item (toleransi ±60°, jarak
 * 30..radius+30 px; pusat dan luar lingkaran = null). keluarRadius
 * menandai saat pointer yang masih ditekan meninggalkan menu: gerakan
 * itu menjadi seret biasa (K5).
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Jarak pusat item dari pusat menu (px). */
export const RADIUS_MENU_PX = 60;

/** Sisi kotak host menu (px), sama dengan UKURAN.MenuBidak di tataLetak.js. */
export const UKURAN_MENU_PX = 140;

/** Zona mati di pusat dan pita di luar radius tempat item masih terpilih (px). */
const JARAK_DALAM_PX = 30;
const JARAK_LUAR_PX = 30;

/** Toleransi sudut tiap item (derajat ke kiri dan kanan). */
const TOLERANSI_DERAJAT = 60;

/** Item menurut urutan gambar dan sudutnya (derajat). */
export const ITEM_MENU = [
	{ aksi: 'jual', sudut: 90 },
	{ aksi: 'pindah', sudut: 210 },
	{ aksi: 'batal', sudut: 330 }
];

/** Jarak tepi layar minimum (px) untuk pusat menu: ketiga item tetap tampak. */
const TEPI_PUSAT = RADIUS_MENU_PX + JARAK_LUAR_PX;

/** Selisih sudut terkecil (0..180). */
function selisihSudut(a, b) {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

/**
 * @param {{x:number, y:number}} pusat pusat menu (viewport px)
 * @param {{x:number, y:number}} titik pointer (viewport px)
 * @param {number} [radius=RADIUS_MENU_PX]
 * @returns {'jual'|'pindah'|'batal'|null}
 */
export function itemDiTitik(pusat, titik, radius = RADIUS_MENU_PX) {
	const dx = titik.x - pusat.x;
	const dy = titik.y - pusat.y;
	const jarak = Math.hypot(dx, dy);
	if (!(jarak >= JARAK_DALAM_PX) || jarak > radius + JARAK_LUAR_PX) {
		return null;
	}
	const sudut = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
	return ITEM_MENU.find((i) => selisihSudut(sudut, i.sudut) <= TOLERANSI_DERAJAT)?.aksi ?? null;
}

/**
 * Item yang dipilih/disorot pointer sementara tombol masih ditahan sejak
 * tahan. Sama dengan itemDiTitik, kecuali pointer yang belum bergerak 30 px
 * dari titik tahan: bila pusat menu digeser oleh jepitan viewport (bidak
 * di tepi layar), titik tahan bisa jatuh di sektor item, dan melepas
 * tombol tanpa bergerak tidak boleh memilih apa pun (K5: lepas di luar
 * item = menu tetap terbuka).
 *
 * @param {{x:number, y:number}} pusat pusat menu
 * @param {{x:number, y:number}} titikTahan titik saat menu dibuka
 * @param {{x:number, y:number}} titik pointer sekarang
 * @param {number} [radius=RADIUS_MENU_PX]
 * @returns {'jual'|'pindah'|'batal'|null}
 */
export function itemSaatTahan(pusat, titikTahan, titik, radius = RADIUS_MENU_PX) {
	if (Math.hypot(titik.x - titikTahan.x, titik.y - titikTahan.y) < JARAK_DALAM_PX) {
		return null;
	}
	return itemDiTitik(pusat, titik, radius);
}

/**
 * true bila titik lebih jauh dari radius + 30 px dari pusat (K5: pointer
 * yang masih ditekan keluar menu -> seret biasa).
 */
export function keluarRadius(pusat, titik, radius = RADIUS_MENU_PX) {
	return Math.hypot(titik.x - pusat.x, titik.y - pusat.y) > radius + JARAK_LUAR_PX;
}

/**
 * Posisi host menu: berpusat di titik, dengan pusat dijepit sejauh
 * radius + 30 px dari tepi layar supaya ketiga item tampak utuh.
 *
 * @param {{x:number, y:number}} titik titik tahan (viewport px)
 * @param {{lebar:number, tinggi:number}} layar ukuran viewport
 * @returns {{left:number, top:number, pusat:{x:number, y:number}}}
 */
export function posisiMenu(titik, layar) {
	const jepit = (v, maks) => Math.round(Math.max(TEPI_PUSAT, Math.min(v, maks - TEPI_PUSAT)));
	const pusat = { x: jepit(titik.x, layar.lebar), y: jepit(titik.y, layar.tinggi) };
	const setengah = UKURAN_MENU_PX / 2;
	return { left: pusat.x - setengah, top: pusat.y - setengah, pusat };
}

/** Pusat item di dalam host (px, relatif pojok kiri-atas host). */
function letakItem(sudut) {
	const r = (sudut * Math.PI) / 180;
	const setengah = UKURAN_MENU_PX / 2;
	return {
		left: Math.round(setengah + RADIUS_MENU_PX * Math.cos(r)),
		top: Math.round(setengah - RADIUS_MENU_PX * Math.sin(r))
	};
}

/**
 * @param {object} opsi
 * @param {number} opsi.hargaJual zeny yang diterima (BidakCatur.harga_jual)
 * @param {boolean} opsi.bolehJual
 * @param {boolean} opsi.bolehPindah
 * @param {string} [opsi.alasanPindah] kunci KAMUS untuk title item nonaktif
 * @param {string} [opsi.alasanJual] kunci KAMUS; bawaan alasanPindah
 * @param {'jual'|'pindah'|'batal'|null} [opsi.sorot] item di bawah pointer
 * @param {object} deps {t, formatZeny}
 * @returns {string} HTML isi menu
 */
export function renderMenuBidak(opsi, deps) {
	const { t, formatZeny } = deps;
	const alasanPindah = opsi.alasanPindah ?? 'menu.hanya_persiapan';
	const status = {
		jual: { boleh: Boolean(opsi.bolehJual), alasan: opsi.alasanJual ?? alasanPindah },
		pindah: { boleh: Boolean(opsi.bolehPindah), alasan: alasanPindah },
		batal: { boleh: true, alasan: null }
	};
	const harga = formatZeny(Number.isFinite(opsi.hargaJual) ? opsi.hargaJual : 0);
	let html = '<div class="cincin"></div>';
	for (const { aksi, sudut } of ITEM_MENU) {
		const { boleh, alasan } = status[aksi];
		const kelas = ['item', aksi];
		if (!boleh) {
			kelas.push('nonaktif');
		}
		if (opsi.sorot === aksi) {
			kelas.push('sorot');
		}
		const title = boleh ? '' : ` title="${esc(t(alasan))}"`;
		const { left, top } = letakItem(sudut);
		html += `<div class="${kelas.join(' ')}" data-item="${aksi}"${title} style="left:${left}px;top:${top}px">`
			+ `<span class="label">${esc(t('menu.' + aksi))}</span>`
			+ (aksi === 'jual' ? `<span class="harga">+${esc(harga)} zeny</span>` : '')
			+ '</div>';
	}
	return html;
}
