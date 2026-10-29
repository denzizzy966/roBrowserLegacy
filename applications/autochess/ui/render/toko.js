/**
 * Renderer murni jendela Toko (K): lima kartu unit berpotret, tombol Kunci
 * di kiri, tombol Refresh di kanan, dan baris peluang tier di bawah kartu
 * (tata letak gambar referensi autochess-piece-hero-shop).
 *
 * Kanvas potret dikeluarkan kosong (<canvas class="potret" data-unit>);
 * Toko.js yang mengisinya lewat potret.statis sesudah HTML ditulis.
 */

import { FASE } from '../../pesan.js';

/** Jumlah slot toko yang selalu digambar (server mengirim 5). */
export const JUMLAH_SLOT = 5;

/** Ukuran intrinsik kanvas potret kartu. */
export const LEBAR_POTRET = 96;
export const TINGGI_POTRET = 110;

/**
 * Warna tetap lencana kelas (katalog hanya memberi warna origin lewat
 * lore.origin[id].color). Kelas tak dikenal jatuh ke WARNA_CADANGAN.
 */
export const WARNA_KELAS = {
	vanguard:       '#74c0fc',
	assassin:       '#f783ac',
	sharpshooter:   '#8ce99a',
	elementalist:   '#b197fc',
	saint:          '#fff3bf',
	martial_artist: '#ffa94d',
	performer:      '#ffc078',
	trickster:      '#63e6be',
	tycoon:         '#ffd43b',
	wonder:         '#e599f7'
};

const WARNA_CADANGAN = '#adb5bd';

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks dari server/katalog sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Warna CSS yang aman disisipkan ke atribut style; selain #hex jatuh ke cadangan. */
function warnaAman(w) {
	return /^#[0-9a-fA-F]{3,8}$/.test(w ?? '') ? w : WARNA_CADANGAN;
}

/** Satu lencana sinergi berwarna. */
function lencana(jenis, nama, warna) {
	const w = warnaAman(warna);
	return `<span class="lencana ${jenis}" style="color:${w};border-color:${w}">${esc(nama)}</span>`;
}

/**
 * Satu kartu slot toko.
 * @param {{slot:number, unitId:string, harga:number}} s
 * @param {boolean} bisaBeli fase PERSIAPAN dan pertandingan belum selesai
 * @param {number} zeny
 * @param {object} deps {t, bahasa, katalog, formatZeny}
 */
function kartu(s, bisaBeli, zeny, deps) {
	const { t, bahasa, katalog, formatZeny } = deps;
	if (!s.unitId) {
		return `<div class="kartu kosong" data-slot="${s.slot}"><span class="label-kosong">${esc(t('label.kosong'))}</span></div>`;
	}
	const u = katalog.unit(s.unitId);
	const aktif = bisaBeli && zeny >= s.harga;
	const kelas = ['kartu'];
	if (u.tier) {
		kelas.push(`tier-${u.tier}`);
	}
	if (!aktif) {
		kelas.push('nonaktif');
	}
	const aksi = aktif ? ` data-aksi="beli" data-arg="${s.slot}"` : '';
	const origin = u.origin ? lencana('origin', katalog.namaSinergi(u.origin, bahasa), katalog.loreOrigin(u.origin)?.color) : '';
	const kls = u.kelas ? lencana('kelas', katalog.namaSinergi(u.kelas, bahasa), WARNA_KELAS[u.kelas]) : '';
	const nama = katalog.namaUnit(s.unitId, bahasa);
	return `<div class="${kelas.join(' ')}" data-slot="${s.slot}"${aksi} title="${esc(nama)}">`
		+ `<canvas class="potret" data-unit="${esc(s.unitId)}" width="${LEBAR_POTRET}" height="${TINGGI_POTRET}"></canvas>`
		+ `<div class="nama">${esc(nama)}</div>`
		+ `<div class="lencana-baris">${origin}${kls}</div>`
		+ `<div class="harga"><span class="ikon-zeny"></span>${formatZeny(s.harga)}</div>`
		+ '</div>';
}

/**
 * Baris peluang tier untuk level pemain: "T1 70% · T2 30% · ..." lalu "Lv n".
 * @param {Array<number>|null} peluang persen per tier (katalog.peluang(level))
 * @param {number} level
 * @param {function} t
 */
function barisPeluang(peluang, level, t) {
	const daftar = (peluang ?? []).map((p, i) => `<span class="tier tier-${i + 1}">T${i + 1} ${p}%</span>`).join(' · ');
	return `<div class="peluang"><span class="judul-peluang">${esc(t('label.peluang'))}</span> ${daftar || '-'}`
		+ ` <span class="lv">${esc(t('label.level', level))}</span></div>`;
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps
 * @param {function} deps.t penerjemah teks.js
 * @param {string} deps.bahasa 'id' | 'en'
 * @param {object} deps.katalog buatKatalog(...)
 * @param {function} deps.formatZeny teks.js formatZeny
 * @returns {string} HTML isi jendela Toko
 */
export function renderToko(snap, deps) {
	const { t, katalog } = deps;
	const s = snap.state?.saya;
	const zeny = s?.zeny ?? 0;
	const level = s?.level ?? 1;
	const terkunci = !!s?.kunci;
	const bisaBeli = !!s && snap.fase === FASE.PERSIAPAN && !snap.selesai;

	// Selalu lima slot: slot yang tidak dikirim server digambar kosong.
	const slot = [];
	for (let i = 0; i < JUMLAH_SLOT; i++) {
		slot.push(s?.toko?.find((x) => x.slot === i) ?? { slot: i, unitId: '', harga: 0 });
	}

	const hargaRefresh = katalog.ekonomi?.refresh ?? 0;
	const bisaRefresh = bisaBeli && zeny >= hargaRefresh;
	const kunci = `<button class="tombol kunci${terkunci ? ' aktif' : ''}" data-aksi="kunci" data-arg="${terkunci ? 0 : 1}"${bisaBeli ? '' : ' disabled'}>`
		+ `<span class="glif">${terkunci ? '\u{1F512}' : '\u{1F513}'}</span><span class="teks">${esc(t(terkunci ? 'tombol.buka' : 'tombol.kunci'))}</span></button>`;
	const refresh = `<button class="tombol refresh" data-aksi="refresh"${bisaRefresh ? '' : ' disabled'} title="${esc(t('tombol.refresh'))}">`
		+ `<span class="glif">⟳</span><span class="teks">${hargaRefresh}z</span></button>`;

	return `<div class="baris-kartu">${kunci}<div class="kartu-kartu">${slot.map((x) => kartu(x, bisaBeli, zeny, deps)).join('')}</div>${refresh}</div>`
		+ barisPeluang(katalog.peluang(level), level, t);
}
