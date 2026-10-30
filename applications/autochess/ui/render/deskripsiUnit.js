/**
 * Renderer murni jendela Deskripsi Unit (AC7 K16-K18). Isi, dari atas:
 * nama sesuai bahasa UI, Tier n · ★n, asal · kelas (klik -> Lore sinergi,
 * [data-aksi="lore"][data-id]), tabel statistik tiga kolom ★1/★2/★3
 * (katalog.statBintang) dengan kolom bintang bidak yang diklik berkelas
 * `aktif`, baris elemen · ukuran · ras, daftar SEMUA skill unit (AC8 K12),
 * tiap skill satu blok dari field terstruktur katalog (K17: jenis · target,
 * rasio, status, jangkauan, splash, waktu rapal, SP penuh, lalu ringkasan
 * bahasa aktif) dengan label "Terbuka di ★n" dan kelas `terkunci` untuk
 * skill yang belum terbuka pada bintang bidak yang diklik, dan lore unit
 * (K18: lore ID kosong -> EN). Tanpa HP/SP berjalan (itu kartu hover).
 *
 * info = keluaran seret.padaKlik: {sumber, bidakId?, unitId, bintang,
 * sendiri, entityId?, nama}. Creep (unitId null atau tanpa stat katalog)
 * hanya bernama.
 */

import { KOLOM_STAT } from './kartuBidak.js';

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Bilangan bulat >= 0; selain itu 0. */
function angka(n) {
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** "30 %" (ID) / "30%" (EN), seperti ringkasan server. */
function persen(n, bahasa) {
	return bahasa === 'en' ? `${n}%` : `${n} %`;
}

/** Milidetik -> satu desimal detik: "2,0 d" (ID) / "2.0s" (EN), seperti ringkasan server. */
function detik(ms, bahasa) {
	const s = (ms / 1000).toFixed(1);
	return bahasa === 'en' ? `${s}s` : `${s.replace('.', ',')} d`;
}

/**
 * Jarak skill dalam petak papan (katalog: cell arena ÷ skala, boleh
 * pecahan) dengan paling banyak satu desimal dan satuan KAMUS:
 * "2,5 petak" (ID) / "2.5 cells" (EN); bulat tanpa desimal; EN tunggal
 * untuk tepat 1 ("1 cell"), seperti ringkasan server.
 */
function jarak(n, bahasa, t) {
	const r = Math.round(n * 10) / 10;
	const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
	const angkaTeks = bahasa === 'en' ? s : s.replace('.', ',');
	return `${angkaTeks} ${t(r === 1 ? 'satuan.petak_satu' : 'satuan.petak')}`;
}

/** Teks KAMUS, atau cadangan bila kunci tak dikenal (t mengembalikan kuncinya). */
function kataAtau(t, kunci, cadangan) {
	const k = t(kunci);
	return k === kunci ? cadangan : k;
}

/** Nilai sel stat (aspd dua desimal, seperti kartu hover). */
function nilaiStat(stat, k) {
	if (k === 'aspd' && Number.isFinite(stat.aspd)) {
		return Number(stat.aspd).toFixed(2);
	}
	return stat[k] ?? 0;
}

/** Tabel ★1/★2/★3 + baris elemen · ukuran · ras; '' tanpa stat katalog. */
function blokStat(info, deps) {
	const { t, katalog } = deps;
	const stat = [1, 2, 3].map((b) => (info.unitId ? katalog.statBintang?.(info.unitId, b) : null) ?? null);
	if (!stat.some(Boolean)) {
		return '';
	}
	const bintang = angka(info.bintang);
	const kelas = (b) => (b === bintang ? `b${b} aktif` : `b${b}`);
	let html = '<table class="stat"><tr><th></th>'
		+ [1, 2, 3].map((b) => `<th class="${kelas(b)}">★${b}</th>`).join('') + '</tr>';
	for (const k of KOLOM_STAT) {
		html += `<tr data-stat="${k}"><th>${esc(t('stat.' + k))}</th>`
			+ stat.map((s, i) => `<td class="${kelas(i + 1)}">${s ? esc(nilaiStat(s, k)) : '-'}</td>`).join('')
			+ '</tr>';
	}
	html += '</table>';
	const dasar = stat.find(Boolean);
	const kecil = [dasar.elemen, dasar.ukuran, dasar.ras].filter((x) => x !== undefined && x !== null && x !== '');
	if (kecil.length) {
		html += `<div class="stat-kecil">${kecil.map(esc).join(' · ')}</div>`;
	}
	return html;
}

/** Satu pasangan <dt>/<dd>. */
function baris(label, nilai) {
	return `<dt>${esc(label)}</dt><dd>${esc(nilai)}</dd>`;
}

/**
 * Blok detail satu skill (AC7 K17): nama (Lv), jenis · target, status,
 * rasio/jangkauan/splash/waktu rapal/SP penuh, lalu ringkasan bahasa aktif.
 * AC8 K12: skill yang terbuka di bintang lebih tinggi dari bintang bidak
 * yang diklik diberi label "Terbuka di ★n" dan kelas `terkunci` (redup).
 */
function blokSatuSkill(sk, bintang, deps) {
	const { t, bahasa } = deps;
	const nama = sk.nama?.[bahasa] || sk.nama?.id || sk.id;
	const terkunci = angka(sk.terbuka_di_bintang) > bintang;
	let html = `<div class="skill${terkunci ? ' terkunci' : ''}" data-skill="${esc(sk.id)}">`
		+ `<div class="skill-nama"><b>${esc(t('label.skillLv', nama, sk.lv))}</b>`
		+ (terkunci ? ` <span class="terbuka-di">${esc(t('label.terbuka_di', angka(sk.terbuka_di_bintang)))}</span>` : '')
		+ '</div>';
	const jenis = [
		sk.jenis ? kataAtau(t, `skill.jenis.${sk.jenis}`, sk.jenis) : '',
		sk.target ? kataAtau(t, `skill.target.${sk.target}`, sk.target) : ''
	].filter(Boolean);
	if (jenis.length) {
		html += `<div class="skill-jenis">${esc(jenis.join(' · '))}</div>`;
	}
	if (sk.status?.nama) {
		const s = sk.status;
		const teks = [kataAtau(t, `status.${s.nama}`, s.nama)];
		if (angka(s.peluang) > 0) {
			teks.push(persen(angka(s.peluang), bahasa));
		}
		if (angka(s.durasi_ms) > 0) {
			teks.push(detik(angka(s.durasi_ms), bahasa));
		}
		html += `<div class="skill-status">${esc(teks.join(' '))}</div>`;
	}
	let dl = '';
	if (sk.rasio > 0) {
		dl += baris(t('label.rasio'), persen(Math.round(sk.rasio * 100), bahasa));
	}
	if (Number.isFinite(sk.jangkauan)) {
		dl += baris(t('stat.jangkauan'), jarak(sk.jangkauan, bahasa, t));
	}
	if (Number.isFinite(sk.splash) && sk.splash > 0) {
		dl += baris(t('label.splash'), jarak(sk.splash, bahasa, t));
	}
	if (angka(sk.cast_ms) > 0) {
		dl += baris(t('label.cast'), detik(angka(sk.cast_ms), bahasa));
	}
	if (angka(sk.sp_maks) > 0) {
		dl += baris(t('label.sp_penuh'), angka(sk.sp_maks));
	}
	if (dl) {
		html += `<dl class="skill-detail">${dl}</dl>`;
	}
	const ringkas = sk.ringkasan?.[bahasa] || sk.ringkasan?.id || '';
	if (ringkas) {
		html += `<div class="skill-ringkas">${esc(ringkas)}</div>`;
	}
	return `${html}</div>`;
}

/**
 * Daftar semua skill unit, urut katalog (AC8 K12), di bawah judul "Skill";
 * '' bila unit tanpa skill. Bintang tak dikenal (0) dibaca sebagai ★1.
 */
function blokDaftarSkill(info, deps) {
	const { t, katalog } = deps;
	const skills = info.unitId ? (katalog.skillsUnit?.(info.unitId) ?? []) : [];
	if (!skills.length) {
		return '';
	}
	const bintang = angka(info.bintang) || 1;
	return `<div class="daftar-skill"><div class="judul-skill">${esc(t('label.skills'))}</div>`
		+ skills.map((sk) => blokSatuSkill(sk, bintang, deps)).join('')
		+ '</div>';
}

/** Lore unit (K18): bahasa aktif, lalu EN, lalu ID; '' bila kosong. */
function blokLore(info, deps) {
	const { t, bahasa, katalog } = deps;
	const lore = info.unitId ? katalog.loreUnit?.(info.unitId) : null;
	const teks = lore ? (lore[bahasa] || lore.en || lore.id || '') : '';
	if (!teks) {
		return '';
	}
	return `<div class="judul-lore">${esc(t('label.lore'))}</div><p class="lore">${esc(teks)}</p>`;
}

/**
 * @param {object} info keluaran seret.padaKlik
 * @param {object} deps
 * @param {function} deps.t teks.t
 * @param {string} deps.bahasa 'id' | 'en'
 * @param {object} deps.katalog buatKatalog(...)
 * @returns {{judul: string, isi: string}} judul (teks polos) dan HTML isi
 */
export function renderDeskripsiUnit(info, deps) {
	const { t, bahasa, katalog } = deps;
	const dikenal = Boolean(info.unitId);
	const unit = dikenal ? katalog.unit(info.unitId) : null;
	const nama = dikenal ? katalog.namaUnit(info.unitId, bahasa) : (info.nama || `#${info.entityId}`);

	let isi = `<div class="nama">${esc(nama)}</div>`;
	const meta = [];
	if (unit?.tier > 0) {
		meta.push(`<span class="tier">${esc(t('label.tier', unit.tier))}</span>`);
	}
	if (angka(info.bintang) > 0) {
		meta.push(`<span class="bintang">★${angka(info.bintang)}</span>`);
	}
	if (meta.length) {
		isi += `<div class="meta">${meta.join(' · ')}</div>`;
	}
	const sinergi = [unit?.origin, unit?.kelas].filter(Boolean)
		.map((id) => `<span class="sinergi" data-aksi="lore" data-id="${esc(id)}">${esc(katalog.namaSinergi(id, bahasa))}</span>`);
	if (sinergi.length) {
		isi += `<div class="baris-sinergi">${sinergi.join(' · ')}</div>`;
	}
	isi += blokStat(info, deps) + blokDaftarSkill(info, deps) + blokLore(info, deps);
	return { judul: t('jendela.deskripsi_unit'), isi };
}
