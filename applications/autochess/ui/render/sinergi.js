/**
 * Renderer murni jendela Sinergi (E) dan Lore (Q12). Sinergi: satu ikon
 * bulat per entri state.saya.sinergi (urutan server: origin dulu, lalu
 * kelas) berwarna lore.color origin (kelas: palet tetap menurut hash id),
 * berkode dua huruf tetap dari id (kodeLencana, sama di ID/EN), dengan
 * tooltip nama lengkap dan "jumlah/ambangBerikut" di bawahnya. Lore:
 * judul, paragraf, dan daftar ambang beserta teks efek yang dibangkitkan
 * dari katalog.sinergi(id).efek (tanpa efek: hanya jumlah).
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

const PALET_KELAS = ['#e8590c', '#7048e8', '#0ca678', '#d6336c', '#1c7ed6', '#f08c00', '#5c940d', '#c2255c'];

/** Warna cadangan bila lore.color bukan #hex. */
const WARNA_CADANGAN = '#556';

/** Warna yang aman disisipkan ke atribut style; selain #hex jatuh ke cadangan. */
function warnaAman(w) {
	return /^#[0-9a-fA-F]{3,8}$/.test(w ?? '') ? w : WARNA_CADANGAN;
}

/** Warna kelas dari hash id (stabil antar render). */
export function warnaKelas(id) {
	let h = 0;
	for (const c of String(id)) {
		h = (h * 31 + c.charCodeAt(0)) >>> 0;
	}
	return PALET_KELAS[h % PALET_KELAS.length];
}

/**
 * Pengecualian kode lencana untuk id produksi yang bertabrakan dengan
 * aturan umum: `peco` dan `performer` sama-sama "PE". Dipilih huruf pertama
 * ditambah huruf khas berikutnya yang belum terpakai ("PF" = PerFormer;
 * "PR" sudah milik prontera); peco tetap PE.
 */
const KODE_KHUSUS = Object.freeze({ performer: 'PF' });

/**
 * Kode lencana tetap dua huruf dari ID sinergi (R7), BUKAN dari nama,
 * sehingga sama di bahasa ID dan EN dan tidak berubah menurut isi papan.
 * Aturan: id snake_case; dua kata atau lebih -> huruf pertama dua kata
 * pertama (`st_capitolina` -> SC, `martial_artist` -> MA); satu kata -> dua
 * huruf pertama (`prontera` -> PR, `vanguard` -> VA); selalu kapital. Satu
 * pengecualian untuk tabrakan id produksi: KODE_KHUSUS (performer -> PF).
 * Keunikan seluruh id sinergi.yml dijaga oleh sinergi.test.js.
 *
 * @param {string} id id sinergi
 * @returns {string} kode dua huruf kapital ('?' bila id kosong)
 */
export function kodeLencana(id) {
	const sandi = String(id ?? '').trim().toLowerCase();
	if (Object.hasOwn(KODE_KHUSUS, sandi)) {
		return KODE_KHUSUS[sandi];
	}
	const kata = sandi.split('_').filter(Boolean);
	if (kata.length === 0) {
		return '?';
	}
	const kode = kata.length >= 2 ? kata[0][0] + kata[1][0] : kata[0].slice(0, 2);
	return kode.toUpperCase();
}

/** Ambang berikut yang >= jumlah, atau ambang terakhir bila semuanya tercapai. */
export function ambangBerikut(ambang, jumlah) {
	return ambang.find((a) => a >= jumlah) ?? ambang[ambang.length - 1] ?? jumlah;
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {bahasa, katalog}
 * @returns {string} HTML isi jendela Sinergi
 */
export function renderSinergi(snap, deps) {
	const { katalog, bahasa } = deps;
	const daftar = snap.state?.saya?.sinergi ?? [];
	if (daftar.length === 0) {
		return '';
	}
	return daftar.map((s) => {
		const nama = katalog.namaSinergi(s.id, bahasa);
		const warna = warnaAman((s.origin ? katalog.loreOrigin(s.id)?.color : null) ?? warnaKelas(s.id));
		const ambang = katalog.sinergi(s.id).ambang ?? [];
		const aktif = s.tingkatAktif > 0 ? ' aktif' : '';
		return `<div class="sinergi"><div class="ikon${aktif}" data-sinergi="${esc(s.id)}" title="${esc(nama)}" style="background:${warna}">${esc(kodeLencana(s.id))}</div>`
			+ `<div class="hitung">${s.jumlah}/${ambangBerikut(ambang, s.jumlah)}</div></div>`;
	}).join('');
}

/** Satu efek jadi teks: "+150 HP maks (semua)", persen: "+15% ATK (anggota)". */
function teksEfek(e, t) {
	const nilai = e.tambah ? e.tambah : (e.persen ? `${e.persen}%` : 0);
	// aspd_persen sudah memuat '%' di kamus; angkanya polos.
	const angka = e.stat === 'aspd_persen' ? (e.tambah || e.persen) : nilai;
	return `${t('efek.' + e.stat, angka)} ${t('sasaran.' + e.sasaran)}`;
}

/**
 * @param {string} id id sinergi
 * @param {object} deps {t, bahasa, katalog}
 * @returns {{judul: string, isi: string}} judul (teks polos) dan HTML isi Lore
 */
export function renderLore(id, deps) {
	const { t, bahasa, katalog } = deps;
	const info = katalog.sinergi(id);
	const nama = katalog.namaSinergi(id, bahasa);
	const lore = info.origin ? katalog.loreOrigin(id)?.lore : katalog.loreKelas?.(id)?.deskripsi;
	const paragraf = lore ? (lore[bahasa] ?? lore.id ?? '') : '';
	const ambang = info.ambang ?? [];
	const baris = ambang.map((jumlah, i) => {
		const efek = (info.efek?.[i] ?? []).map((e) => teksEfek(e, t)).join(', ');
		return `<li><b>${jumlah}</b>${efek ? ': ' + esc(efek) : ''}</li>`;
	}).join('');
	return {
		judul: nama,
		isi: `<div class="nama">${esc(nama)}</div>`
			+ (paragraf ? `<p class="lore">${esc(paragraf)}</p>` : '')
			+ `<ul class="ambang">${baris}</ul>`
			+ `<button class="tombol" data-aksi="tutup">${esc(t('tombol.tutup'))}</button>`
	};
}
