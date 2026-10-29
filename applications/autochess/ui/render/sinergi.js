/**
 * Renderer murni jendela Sinergi (E) dan Lore (Q12). Sinergi: satu ikon
 * bulat per entri state.saya.sinergi (urutan server: origin dulu, lalu
 * kelas) berwarna lore.color origin (kelas: palet tetap menurut hash id),
 * berinisial dua huruf, dengan "jumlah/ambangBerikut" di bawahnya. Lore:
 * judul, paragraf, dan daftar ambang beserta teks efek yang dibangkitkan
 * dari katalog.sinergi(id).efek (tanpa efek: hanya jumlah).
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

const PALET_KELAS = ['#e8590c', '#7048e8', '#0ca678', '#d6336c', '#1c7ed6', '#f08c00', '#5c940d', '#c2255c'];

/** Warna kelas dari hash id (stabil antar render). */
export function warnaKelas(id) {
	let h = 0;
	for (const c of String(id)) {
		h = (h * 31 + c.charCodeAt(0)) >>> 0;
	}
	return PALET_KELAS[h % PALET_KELAS.length];
}

/** Dua huruf awal nama (dua kata: huruf pertama tiap kata), kapital. */
export function inisial(nama) {
	const kata = String(nama).trim().split(/\s+/).filter(Boolean);
	const huruf = kata.length >= 2 ? kata[0][0] + kata[1][0] : (kata[0] ?? '?').slice(0, 2);
	return huruf.toUpperCase();
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
	return daftar.map((s) => {
		const nama = katalog.namaSinergi(s.id, bahasa);
		const warna = (s.origin ? katalog.loreOrigin(s.id)?.color : null) ?? warnaKelas(s.id);
		const ambang = katalog.sinergi(s.id).ambang ?? [];
		const aktif = s.tingkatAktif > 0 ? ' aktif' : '';
		return `<div class="sinergi"><div class="ikon${aktif}" data-sinergi="${esc(s.id)}" title="${esc(nama)}" style="background:${esc(warna)}">${esc(inisial(nama))}</div>`
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
