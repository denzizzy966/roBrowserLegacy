/**
 * Renderer murni Bilah Deck (AC6 K4): satu baris selebar Bangku, tepat di
 * atasnya, menggantikan jendela Exp, Zeny, dan Kapasitas. Isinya dari kiri:
 * HP kursi (angka + bar dari kursi[saya].hp / katalog.ekonomi.hp_kursi),
 * Lv + bar EXP + tombol Beli EXP berharga, Zeny, lalu Kapasitas papan n/kap.
 *
 * Tombol Beli EXP tidak digerbang fase (K1: BeliExp diterima di semua
 * fase); yang mematikannya hanya: tanpa state, pertandingan selesai, kursi
 * sendiri tersingkir, level maksimum, atau Zeny kurang.
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Persen bulat 0..100 dari nilai/maks (maks <= 0 -> 0). */
export function persen(nilai, maks) {
	if (!(maks > 0)) {
		return 0;
	}
	return Math.max(0, Math.min(100, Math.round(nilai / maks * 100)));
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps
 * @param {function} deps.t penerjemah teks.js
 * @param {object} deps.katalog buatKatalog(...) (ekonomi.hp_kursi, beli_exp.harga, level_maks)
 * @param {function} deps.formatZeny teks.js formatZeny
 * @returns {string} HTML isi Bilah Deck
 */
export function renderBilahDeck(snap, deps) {
	const { t, katalog, formatZeny } = deps;
	const ekonomi = katalog?.ekonomi ?? {};
	const s = snap.state?.saya;
	const kursi = snap.state?.kursi?.find((k) => k.kursi === s?.kursi);

	// HP kursi: maks dari ekonomi.hp_kursi; tanpa itu (katalog gagal
	// dimuat) HP sekarang dianggap penuh supaya bar tidak menyesatkan.
	const hp = kursi?.hp ?? 0;
	const hpMaks = ekonomi.hp_kursi > 0 ? ekonomi.hp_kursi : Math.max(hp, 1);
	const pHp = persen(hp, hpMaks);
	const hpRendah = pHp <= 30 ? ' rendah' : '';

	// EXP: MAX = level >= level_maks; tanpa level_maks jatuh ke
	// expBerikut <= 0 dari server (sama dengan renderExp AC4).
	const level = s?.level ?? 1;
	const levelMaks = ekonomi.level_maks ?? 0;
	const maks = (levelMaks > 0 && level >= levelMaks) || (!!s && s.expBerikut <= 0);
	const exp = s?.exp ?? 0;
	const butuh = s?.expBerikut ?? 0;
	const pExp = maks ? 100 : persen(exp, butuh);
	const teksExp = maks ? 'MAX' : `${exp}/${butuh}`;
	const harga = ekonomi.beli_exp?.harga ?? 0;
	const zeny = s?.zeny ?? 0;
	const bisa = !!s && !snap.selesai && kursi?.hidup !== false;
	const bisaExp = bisa && !maks && zeny >= harga;

	const diPapan = s ? (s.bidak ?? []).filter((b) => b.diPapan).length : 0;
	const kap = s?.kapasitas ?? 0;
	const penuh = kap > 0 && diPapan >= kap ? ' penuh' : '';

	return `<div class="sel hp${hpRendah}" title="${esc(t('label.hp'))} ${hp}/${hpMaks}">`
		+ `<span class="label">${esc(t('label.hp'))}</span>`
		+ `<div class="bar bar-hp"><div style="width:${pHp}%"></div></div>`
		+ `<span class="angka">${hp}</span></div>`
		+ `<div class="sel exp" title="${esc(t('label.exp', exp, butuh))}">`
		+ `<span class="label lv">${esc(t('label.level', level))}</span>`
		+ `<div class="bar bar-exp"><div style="width:${pExp}%"></div></div>`
		+ `<span class="angka">${teksExp}</span>`
		+ `<button class="beli" data-aksi="beli-exp"${bisaExp ? '' : ' disabled'}>${esc(t('tombol.beliExp'))} ${harga}z</button></div>`
		+ `<div class="sel zeny" title="${esc(t('label.zeny'))}"><span class="ikon-zeny"></span><span class="angka">${formatZeny(zeny)}</span></div>`
		+ `<div class="sel kapasitas${penuh}" title="${esc(t('label.kapasitas', diPapan, kap))}">`
		+ `<span class="label">${esc(t('label.papan'))}</span><span class="angka">${diPapan}/${kap}</span></div>`;
}
