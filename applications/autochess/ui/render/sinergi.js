/**
 * Renderer murni jendela Sinergi (E) dan Lore (Q12). Sinergi: satu ikon
 * bulat per entri state.saya.sinergi (urutan server: origin dulu, lalu
 * kelas) berwarna lore.color origin (kelas: palet tetap menurut hash id),
 * berkode dua huruf tetap dari id (kodeLencana, sama di ID/EN), dengan
 * tooltip nama lengkap dan "jumlah/ambangBerikut" di bawahnya. Lore:
 * judul, paragraf, dan daftar ambang beserta teks efek yang dibangkitkan
 * dari katalog.sinergi(id).efek (tanpa efek: hanya jumlah), lalu (AC6 K7)
 * daftar unit anggota dari katalog.unitSinergi(id) dengan tier dan tanda
 * kepemilikan dari snapshot (`★n papan` / `★n bangku`).
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

/** Teks efek tanpa sasaran: "+150 HP maks", persen: "+15% ATK" (dipakai Lore dan kartu bidak). */
export function teksNilaiEfek(e, t) {
	const nilai = e.tambah ? e.tambah : (e.persen ? `${e.persen}%` : 0);
	// aspd_persen sudah memuat '%' di kamus; angkanya polos.
	const angka = e.stat === 'aspd_persen' ? (e.tambah || e.persen) : nilai;
	return t('efek.' + e.stat, angka);
}

/** Satu efek jadi teks: "+150 HP maks (semua)", persen: "+15% ATK (anggota)". */
function teksEfek(e, t) {
	return `${teksNilaiEfek(e, t)} ${t('sasaran.' + e.sasaran)}`;
}

/**
 * Tanda kepemilikan satu unit dari bidak saya: papan dulu, lalu bintang
 * menurun; salinan dengan bintang dan lokasi sama digabung "×n".
 * @param {object[]} bidak state.saya.bidak
 * @param {string} unitId
 * @param {function} t
 * @returns {string[]} teks tanda, mis. ['★2 papan', '★1 bangku ×2']; [] bila tidak dimiliki
 */
export function tandaMilik(bidak, unitId, t) {
	const kelompok = new Map();
	for (const b of bidak ?? []) {
		if (b.unitId !== unitId) {
			continue;
		}
		const kunci = `${b.diPapan ? 0 : 1}:${b.bintang}`;
		kelompok.set(kunci, { diPapan: b.diPapan, bintang: b.bintang, n: (kelompok.get(kunci)?.n ?? 0) + 1 });
	}
	return [...kelompok.values()]
		.sort((a, b) => Number(b.diPapan) - Number(a.diPapan) || b.bintang - a.bintang)
		.map((k) => t(k.diPapan ? 'label.milikPapan' : 'label.milikBangku', k.bintang) + (k.n > 1 ? ` ×${k.n}` : ''));
}

/** Daftar unit anggota sinergi (tier menaik lalu id, urutan katalog). */
function daftarAnggota(id, deps) {
	const { t, bahasa, katalog, snap } = deps;
	const anggota = katalog.unitSinergi?.(id) ?? [];
	if (anggota.length === 0) {
		return '';
	}
	const bidak = snap?.state?.saya?.bidak ?? [];
	const baris = anggota.map((unitId) => {
		const u = katalog.unit(unitId);
		const milik = tandaMilik(bidak, unitId, t);
		const kelas = ['unit'];
		if (u.tier) {
			kelas.push(`tier-${u.tier}`);
		}
		if (milik.length > 0) {
			kelas.push('dimiliki');
		}
		return `<li class="${kelas.join(' ')}" data-unit="${esc(unitId)}">`
			+ `<span class="tier">T${esc(u.tier ?? '?')}</span>`
			+ `<span class="nama-unit">${esc(katalog.namaUnit(unitId, bahasa))}</span>`
			+ `<span class="milik">${esc(milik.join(', '))}</span></li>`;
	}).join('');
	return `<div class="judul-anggota">${esc(t('label.anggota'))}</div><ul class="anggota">${baris}</ul>`;
}

/**
 * @param {string} id id sinergi
 * @param {object} deps {t, bahasa, katalog, snap?} -- snap = state.ambil()
 *   untuk tanda kepemilikan anggota (tanpa snap: daftar tanpa tanda)
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
			+ daftarAnggota(id, deps)
			+ `<button class="tombol" data-aksi="tutup">${esc(t('tombol.tutup'))}</button>`
	};
}
