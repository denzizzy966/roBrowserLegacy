/**
 * Renderer murni jendela Sinergi (E) dan Lore (Q12). Sinergi: satu ikon
 * bulat per entri state.saya.sinergi (urutan server: origin dulu, lalu
 * kelas) berwarna lore.color origin (kelas: palet tetap menurut hash id),
 * berinisial dua huruf yang UNIK di seluruh katalog (petaInisial), dengan
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

/** Dua huruf awal nama (dua kata: huruf pertama tiap kata), kapital. */
export function inisial(nama) {
	const kata = String(nama).trim().split(/\s+/).filter(Boolean);
	const huruf = kata.length >= 2 ? kata[0][0] + kata[1][0] : (kata[0] ?? '?').slice(0, 2);
	return huruf.toUpperCase();
}

/** Huruf dan angka nama, kapital, tanpa spasi dan tanda baca. */
function hurufNama(nama) {
	return String(nama).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Kandidat inisial berurut preferensi: inisial(nama), lalu huruf pertama
 * ditambah tiap huruf sesudahnya ("Saint": SA, SI, SN, ST), lalu tiga
 * huruf pertama.
 */
function kandidatInisial(nama) {
	const h = hurufNama(nama) || '?';
	const hasil = [inisial(nama)];
	for (let i = 1; i < h.length; i++) {
		hasil.push(h[0] + h[i]);
	}
	hasil.push(h.slice(0, 3));
	return [...new Set(hasil)];
}

/**
 * Inisial unik per id sinergi (dua huruf; tiga bila dua huruf habis).
 * Inisial pilihan yang hanya dimiliki satu nama tetap dipakai; nama yang
 * bertabrakan (EN: Sanctuary Abbey, Saint, dan Shadow Assassin = "SA")
 * dibagi menurut urutan id: yang pertama mendapat pilihannya, sisanya
 * kandidat berikut yang belum terpakai. Dihitung dari SEMUA sinergi
 * katalog, jadi inisial satu sinergi tidak berubah menurut isi papan.
 *
 * @param {Iterable<[string, string]>} namaPerId pasangan [id, nama]
 * @returns {Map<string, string>} id -> inisial
 */
export function petaInisial(namaPerId) {
	const entri = [...namaPerId].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const pilihan = new Map(entri.map(([id, nama]) => [id, inisial(nama)]));
	const jumlah = new Map();
	for (const p of pilihan.values()) {
		jumlah.set(p, (jumlah.get(p) ?? 0) + 1);
	}
	const hasil = new Map();
	const terpakai = new Set();
	for (const [id] of entri) {
		const p = pilihan.get(id);
		if (jumlah.get(p) === 1) {
			hasil.set(id, p);
			terpakai.add(p);
		}
	}
	for (const [id, nama] of entri) {
		if (hasil.has(id)) {
			continue;
		}
		let pilih = kandidatInisial(nama).find((k) => !terpakai.has(k));
		for (let n = 2; !pilih; n++) {
			pilih = terpakai.has(`${pilihan.get(id)}${n}`) ? null : `${pilihan.get(id)}${n}`;
		}
		hasil.set(id, pilih);
		terpakai.add(pilih);
	}
	return hasil;
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
	const ids = new Set([...(katalog.semuaSinergi?.() ?? []), ...daftar.map((s) => s.id)]);
	const peta = petaInisial([...ids].map((id) => [id, katalog.namaSinergi(id, bahasa)]));
	return daftar.map((s) => {
		const nama = katalog.namaSinergi(s.id, bahasa);
		const warna = warnaAman((s.origin ? katalog.loreOrigin(s.id)?.color : null) ?? warnaKelas(s.id));
		const ambang = katalog.sinergi(s.id).ambang ?? [];
		const aktif = s.tingkatAktif > 0 ? ' aktif' : '';
		return `<div class="sinergi"><div class="ikon${aktif}" data-sinergi="${esc(s.id)}" title="${esc(nama)}" style="background:${warna}">${esc(peta.get(s.id))}</div>`
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
