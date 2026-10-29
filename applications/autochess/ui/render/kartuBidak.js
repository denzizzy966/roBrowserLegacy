/**
 * Renderer murni KartuBidak (C24, keputusan R4): nama unit sesuai bahasa
 * UI, Tier n, ★n, origin dan kelas, bar HP dan SP, lalu satu baris ikon
 * status RO untuk status yang SEDANG aktif. Tanpa status, baris ikonnya
 * tidak ada sama sekali. Tidak ada aksi di kartu.
 *
 * info dibangun oleh infoBidak (kartu.js) dari entity dan snapshot; unit
 * yang tidak ada di katalog (creep) hanya menampilkan nama dari EvtSpawn.
 */

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
 * @param {object} deps
 * @param {function} deps.t teks.t
 * @param {string} deps.bahasa
 * @param {object} deps.katalog buatKatalog(...)
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

	html += bar('hp', t('label.hp'), info.hp, info.maxHp);
	if (angka(info.maxSp) > 0) {
		html += bar('sp', t('label.sp'), info.sp, info.maxSp);
	}

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
