/**
 * Renderer murni KartuBidak (C24, keputusan R4): nama unit sesuai bahasa
 * UI, Tier n, ★n, origin dan kelas, bar HP dan SP, lalu satu baris ikon
 * status RO untuk status yang SEDANG aktif. Tanpa status, baris ikonnya
 * tidak ada sama sekali. Tidak ada aksi di kartu.
 *
 * info dibangun oleh infoBidak (kartu.js) dari entity dan snapshot; unit
 * yang tidak ada di katalog (creep) hanya menampilkan nama dari EvtSpawn.
 */

import { teksNilaiEfek } from './sinergi.js';

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Bilangan bulat >= 0; selain itu 0. */
function angka(n) {
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Satu bar (HP/SP) dengan lebar isi relatif terhadap maks. */
function bar(jenis, label, kini, maks) {
	const k = Math.min(angka(kini), angka(maks));
	const lebar = maks > 0 ? Math.round((k / maks) * 100) : 0;
	return `<div class="bar ${jenis}"><div class="isi-bar" style="width:${lebar}%"></div>`
		+ `<span class="label">${esc(label)}</span><span class="angka">${k}/${angka(maks)}</span></div>`;
}

const KOLOM_STAT = ['hp', 'atk', 'matk', 'def', 'mdef', 'aspd', 'jangkauan', 'sp_maks'];

/** Blok statistik dua kolom; '' bila unit tanpa stat katalog (creep). */
function blokStat(info, deps) {
	const { t, katalog } = deps;
	const stat = info.unitId ? katalog.statBintang?.(info.unitId, angka(info.bintang) || 1) : null;
	if (!stat) {
		return '';
	}
	let html = '<div class="stat">';
	for (const k of KOLOM_STAT) {
		html += `<span class="stat-baris" data-stat="${k}"><span class="stat-nama">${esc(t('stat.' + k))}</span>`
			+ `<span class="stat-nilai">${esc(stat[k] ?? 0)}</span></span>`;
	}
	html += '</div>';
	const kecil = [stat.elemen, stat.ukuran, stat.ras].filter((x) => x !== undefined && x !== null && x !== '');
	if (kecil.length) {
		html += `<div class="stat-kecil">${kecil.map(esc).join(' · ')}</div>`;
	}
	return html;
}

/** Baris skill unit "nama (Lv n)" + ringkasan bila ada; '' bila tak ada skill. */
function blokSkill(info, deps) {
	const { t, bahasa, katalog } = deps;
	const sk = info.unitId ? katalog.skillUnit?.(info.unitId) : null;
	if (!sk) {
		return '';
	}
	const nama = sk.nama?.[bahasa] ?? sk.nama?.id ?? sk.id;
	let html = `<div class="skill"><b>${esc(t('label.skill'))}:</b> ${esc(t('label.skillLv', nama, sk.lv))}</div>`;
	const ringkas = sk.ringkasan?.[bahasa] ?? sk.ringkasan?.id ?? '';
	if (ringkas) {
		html += `<div class="skill-ringkas">${esc(ringkas)}</div>`;
	}
	return html;
}

/**
 * Baris bonus sinergi aktif yang mencakup unit ini: "+10% ATK — Prontera 3".
 * deps.sinergiAktif = sinergiTampil(snap) ({id, jumlah, tingkatAktif}).
 */
function blokBonus(info, deps) {
	const { t, bahasa, katalog } = deps;
	const unit = info.unitId ? katalog.unit(info.unitId) : null;
	if (!unit) {
		return '';
	}
	const baris = [];
	for (const s of deps.sinergiAktif ?? []) {
		if (!(s.tingkatAktif > 0) || (s.id !== unit.origin && s.id !== unit.kelas)) {
			continue;
		}
		const nama = katalog.namaSinergi(s.id, bahasa);
		for (const e of katalog.sinergi(s.id).efek?.[s.tingkatAktif - 1] ?? []) {
			baris.push(`<div class="bonus">${esc(teksNilaiEfek(e, t))} — ${esc(nama)} ${s.jumlah}</div>`);
		}
	}
	return baris.length ? `<div class="bonus-sinergi">${baris.join('')}</div>` : '';
}

/**
 * @param {object} info keluaran infoBidak
 * @param {number} info.entityId
 * @param {string|null} info.unitId id katalog, null bila tak dikenal
 * @param {string} [info.nama] nama dari EvtSpawn (cadangan)
 * @param {boolean} [info.sendiri] bidak milik pemain
 * @param {number} info.bintang
 * @param {number} info.hp
 * @param {number} info.maxHp
 * @param {number} info.sp
 * @param {number} info.maxSp 0 = tanpa SP (baris SP tidak digambar)
 * @param {number[]} info.status EFEK_STATUS yang aktif
 * @param {'toko'|'bangku'} [info.sumber] kartu Toko (tanpa bar HP/SP) atau slot Bangku; kosong = bidak di arena
 * @param {object} deps
 * @param {function} deps.t teks.t
 * @param {string} deps.bahasa
 * @param {object} deps.katalog buatKatalog(...)
 * @param {object[]} [deps.sinergiAktif] sinergiTampil(snap), untuk baris bonus sinergi
 * @param {function(number): (string|null)} [deps.ikon] URL ikon status (null = belum/tidak ada)
 * @returns {string} HTML isi kartu
 */
export function renderKartuBidak(info, deps) {
	const { t, bahasa, katalog } = deps;
	const unit = info.unitId ? katalog.unit(info.unitId) : null;
	const nama = info.unitId ? katalog.namaUnit(info.unitId, bahasa) : (info.nama || `#${info.entityId}`);
	const sisi = info.sendiri ? 'sendiri' : 'lawan';

	let html = `<div class="kartu ${sisi}" data-entity="${info.entityId}">`;
	html += `<div class="nama">${esc(nama)}</div>`;

	const meta = [];
	if (unit && unit.tier > 0) {
		meta.push(`<span class="tier">${esc(t('label.tier', unit.tier))}</span>`);
	}
	if (angka(info.bintang) > 0) {
		meta.push(`<span class="bintang">★${angka(info.bintang)}</span>`);
	}
	if (meta.length) {
		html += `<div class="meta">${meta.join(' ')}</div>`;
	}

	const sinergi = [unit?.origin, unit?.kelas].filter(Boolean).map((id) => esc(katalog.namaSinergi(id, bahasa)));
	if (sinergi.length) {
		html += `<div class="sinergi">${sinergi.join(' · ')}</div>`;
	}

	if (info.sumber !== 'toko') {
		html += bar('hp', t('label.hp'), info.hp, info.maxHp);
		if (angka(info.maxSp) > 0) {
			html += bar('sp', t('label.sp'), info.sp, info.maxSp);
		}
	}
	html += blokStat(info, deps) + blokSkill(info, deps) + blokBonus(info, deps);

	const status = info.status ?? [];
	if (status.length) {
		html += '<div class="status-baris">';
		for (const efst of status) {
			const judul = esc(t(`status.${efst}`));
			const url = deps.ikon?.(efst) ?? null;
			html += url
				? `<span class="status" data-efst="${efst}" title="${judul}"><img src="${esc(url)}" alt="${judul}"></span>`
				: `<span class="status tanpa-ikon" data-efst="${efst}" title="${judul}">${judul}</span>`;
		}
		html += '</div>';
	}
	return `${html}</div>`;
}
