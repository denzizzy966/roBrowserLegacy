/**
 * Renderer murni jendela Toko (K), AC6: kolom vertikal di sisi kanan.
 * Kepala kolom memuat tombol Refresh (dengan harga) dan baris peluang tier
 * yang ringkas; di bawahnya lima kartu mendatar -- potret di kiri, nama,
 * chip sinergi, harga, dan tanda deck di kanan, gembok per kartu di pojok.
 *
 * Tanda deck (K6, tandaKartu): `punya ×n` = salinan 1★ unit itu di papan
 * dan bangku, sorotan GABUNG bila pembelian ini melengkapi tiga salinan,
 * dan chip sinergi berkelas `sorot` bila sinerginya aktif atau tinggal satu
 * unit dari ambang berikutnya.
 *
 * Tidak ada gerbang fase (K1/O1): kartu, Refresh, dan gembok tetap aktif
 * saat TEMPUR/HASIL; server yang memutuskan dan menolak bila perlu. Yang
 * mematikan tombol hanya: tanpa state, pertandingan selesai, kursi sendiri
 * sudah tersingkir, atau Zeny kurang.
 *
 * Kanvas potret dikeluarkan kosong (<canvas class="potret" data-unit>);
 * Toko.js yang mengisinya lewat potret.statis sesudah HTML ditulis.
 */

/** Jumlah slot toko yang selalu digambar (server mengirim 5). */
export const JUMLAH_SLOT = 5;

/**
 * Ukuran intrinsik kanvas potret kartu (sama dengan Bangku: 72x84, sprite
 * diperkecil 0.8); CSS menampilkannya 60x70 di kiri kartu mendatar.
 */
export const LEBAR_POTRET = 72;
export const TINGGI_POTRET = 84;

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

/** Satu lencana sinergi berwarna; `sorot` menambah kelas sorotan. */
function lencana(jenis, nama, warna, sorot) {
	const w = warnaAman(warna);
	return `<span class="lencana ${jenis}${sorot ? ' sorot' : ''}" style="color:${w};border-color:${w}">${esc(nama)}</span>`;
}

/**
 * Tanda deck satu kartu toko (K6), murni.
 *
 * - punya: jumlah bidak 1★ unit yang sama di papan + bangku.
 * - gabung: pembelian ini melengkapi tiga salinan 1★ (punya ≡ 2 mod 3;
 *   lebih dari dua salinan hanya terjadi selama penggabungan tertunda K1).
 * - sinergiSorot: origin/kelas unit yang sinerginya sedang aktif
 *   (tingkatAktif > 0), atau yang tinggal satu unit dari ambang berikutnya.
 *   Yang kedua hanya berlaku bila unit ini BELUM ada di papan: server
 *   menghitung id unit yang berbeda (catur.HitungSinergi), jadi salinan
 *   kedua tidak menambah jumlah sinergi.
 *
 * @param {object} snap state.ambil()
 * @param {{unitId: string}} kartu satu slot state.saya.toko
 * @param {object} katalog buatKatalog(...)
 * @returns {{punya: number, gabung: boolean, sinergiSorot: string[]}}
 */
export function tandaKartu(snap, kartu, katalog) {
	const saya = snap?.state?.saya;
	if (!saya || !kartu?.unitId) {
		return { punya: 0, gabung: false, sinergiSorot: [] };
	}
	const sama = (saya.bidak ?? []).filter((b) => b.unitId === kartu.unitId);
	const punya = sama.filter((b) => b.bintang === 1).length;
	const diPapan = sama.some((b) => b.diPapan);
	const u = katalog.unit(kartu.unitId);
	const milik = new Map((saya.sinergi ?? []).map((s) => [s.id, s]));
	const sinergiSorot = [u.origin, u.kelas].filter(Boolean).filter((id) => {
		const s = milik.get(id);
		if (s && s.tingkatAktif > 0) {
			return true;
		}
		if (diPapan) {
			return false;
		}
		const jumlah = s?.jumlah ?? 0;
		const ambang = katalog.sinergi(id)?.ambang ?? [];
		const berikut = ambang.find((a) => a > jumlah);
		return berikut !== undefined && berikut - jumlah === 1;
	});
	return { punya, gabung: punya % 3 === 2, sinergiSorot };
}

/**
 * Tombol gembok satu slot: data-aksi="kunci", data-arg = keadaan yang
 * diminta (1 kunci, 0 buka), data-slot = slot. ui.js BACA_ARG mengubahnya
 * menjadi kirim('kunci', {slot, kunci}).
 */
function gembok(s, aktif, t) {
	const tutup = !!s.terkunci;
	return `<button class="gembok${tutup ? ' tertutup' : ''}" data-aksi="kunci" data-arg="${tutup ? 0 : 1}" data-slot="${s.slot}"`
		+ ` title="${esc(t(tutup ? 'petunjuk.buka_slot' : 'petunjuk.kunci_slot'))}"${aktif ? '' : ' disabled'}>`
		+ `${tutup ? '\u{1F512}' : '\u{1F513}'}</button>`;
}

/**
 * Satu kartu slot toko (mendatar).
 * @param {{slot:number, unitId:string, harga:number, terkunci?:boolean}} s
 * @param {boolean} bisa boleh mengirim perintah toko (state ada, belum selesai, masih hidup)
 * @param {number} zeny
 * @param {object} snap
 * @param {object} deps {t, bahasa, katalog, formatZeny}
 */
function kartu(s, bisa, zeny, snap, deps) {
	const { t, bahasa, katalog, formatZeny } = deps;
	if (!s.unitId) {
		return `<div class="kartu kosong" data-slot="${s.slot}"><span class="label-kosong">${esc(t('label.kosong'))}</span></div>`;
	}
	const u = katalog.unit(s.unitId);
	const tanda = tandaKartu(snap, s, katalog);
	const aktif = bisa && zeny >= s.harga;
	const kelas = ['kartu'];
	if (u.tier) {
		kelas.push(`tier-${u.tier}`);
	}
	if (!aktif) {
		kelas.push('nonaktif');
	}
	if (tanda.gabung) {
		kelas.push('gabung');
	}
	if (s.terkunci) {
		kelas.push('terkunci');
	}
	const aksi = aktif ? ` data-aksi="beli" data-arg="${s.slot}"` : '';
	const sorot = new Set(tanda.sinergiSorot);
	const origin = u.origin
		? lencana('origin', katalog.namaSinergi(u.origin, bahasa), katalog.loreOrigin(u.origin)?.color, sorot.has(u.origin)) : '';
	const kls = u.kelas ? lencana('kelas', katalog.namaSinergi(u.kelas, bahasa), WARNA_KELAS[u.kelas], sorot.has(u.kelas)) : '';
	const nama = katalog.namaUnit(s.unitId, bahasa);
	const punya = tanda.punya > 0 ? `<span class="punya">${esc(t('label.punya', tanda.punya))}</span>` : '';
	const gabung = tanda.gabung ? `<span class="label-gabung">${esc(t('label.gabung'))}</span>` : '';
	return `<div class="${kelas.join(' ')}" data-slot="${s.slot}"${aksi} title="${esc(nama)}">`
		+ `<canvas class="potret" data-unit="${esc(s.unitId)}" width="${LEBAR_POTRET}" height="${TINGGI_POTRET}"></canvas>`
		+ '<div class="teks">'
		+ `<div class="nama">${esc(nama)}</div>`
		+ `<div class="lencana-baris">${origin}${kls}</div>`
		+ `<div class="bawah"><span class="harga"><span class="ikon-zeny"></span>${formatZeny(s.harga)}</span>${punya}</div>`
		+ '</div>'
		+ gabung
		+ gembok(s, bisa, t)
		+ '</div>';
}

/**
 * Baris peluang tier yang ringkas: lima angka persen berwarna tier; teks
 * lengkap ("Peluang T1 70% · T2 30% · ... — Lv. n") ada di title.
 * @param {Array<number>|null} peluang persen per tier (katalog.peluang(level))
 * @param {number} level
 * @param {function} t
 */
function barisPeluang(peluang, level, t) {
	const daftar = peluang ?? [];
	const lengkap = `${t('label.peluang')} ${daftar.map((p, i) => `T${i + 1} ${p}%`).join(' · ') || '-'} — ${t('label.level', level)}`;
	const isi = daftar.map((p, i) => `<span class="tier tier-${i + 1}">${p}%</span>`).join('');
	return `<div class="peluang" title="${esc(lengkap)}">${isi || '-'}</div>`;
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
	const kursiSaya = snap.state?.kursi?.find((k) => k.kursi === s?.kursi);
	const bisa = !!s && !snap.selesai && kursiSaya?.hidup !== false;

	// Selalu lima slot: slot yang tidak dikirim server digambar kosong.
	const slot = [];
	for (let i = 0; i < JUMLAH_SLOT; i++) {
		slot.push(s?.toko?.find((x) => x.slot === i) ?? { slot: i, unitId: '', harga: 0, terkunci: false });
	}

	const hargaRefresh = katalog.ekonomi?.refresh ?? 0;
	const bisaRefresh = bisa && zeny >= hargaRefresh;
	const refresh = `<button class="tombol refresh" data-aksi="refresh"${bisaRefresh ? '' : ' disabled'} title="${esc(t('tombol.refresh'))}">`
		+ `<span class="glif">⟳</span><span class="teks">${hargaRefresh}z</span></button>`;

	return `<div class="kepala">${refresh}${barisPeluang(katalog.peluang(level), level, t)}</div>`
		+ `<div class="kolom-kartu">${slot.map((x) => kartu(x, bisa, zeny, snap, deps)).join('')}</div>`;
}
