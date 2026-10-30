/**
 * Renderer murni jendela DaftarPemain (B): kolom kiri delapan baris kursi
 * urut HP turun (yang tersingkir di bawah), tiap baris berisi kanvas avatar
 * (diisi DaftarPemain.js lewat potret.statis), nama, bar HP hijau, dan
 * level. Baris sendiri berkelas `sendiri` (nama hijau); kursi tersingkir
 * berkelas `tersingkir` (abu-abu) dengan label dwibahasa.
 */

/** HP awal kursi bila katalog tidak membawa ekonomi.hp_kursi (gagal dimuat). */
export const HP_KURSI_BAWAAN = 100;

/** Ukuran intrinsik kanvas avatar (AC6 K8: 24 px). */
export const LEBAR_AVATAR = 24;
export const TINGGI_AVATAR = 24;

/**
 * Geometri kolom (px), sama dengan DaftarPemain.css: baris 30 px + sela
 * 2 px, kepala (judul 14 + padding 2+2 + bingkai 2 + sisa) 22 px. Delapan
 * baris = 8*32 + 22 = UKURAN.DaftarPemain.tinggi, tanpa gulir.
 */
export const TINGGI_BARIS = 30;
export const SELA_BARIS = 2;
export const TINGGI_KEPALA = 22;
export const tinggiDaftar = (jumlahBaris) => jumlahBaris * (TINGGI_BARIS + SELA_BARIS) + TINGGI_KEPALA;

/**
 * Avatar bot per nomor kursi 1..7 (keputusan Q11): Poring, Lunatic, Fabre,
 * Drops, Poporing, Peco Peco, Spore.
 */
export const MOB_BOT = [1002, 1063, 1007, 1113, 1031, 1019, 1014];

/** Avatar kursi manusia: novice (job 0, sex 1) berpisau (Q11). */
export const AVATAR_MANUSIA = Object.freeze({ tipe: 'pc', job: 0, sex: 1, senjata: 1 });

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks dari server sebelum masuk HTML. */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/**
 * Sprite avatar untuk satu kursi: manusia = PC novice, bot = mob tetap
 * menurut nomor kursi (kursi 1 → MOB_BOT[0], berputar bila lebih dari 7).
 * @param {{kursi:number, bot:boolean}} k
 * @returns {{tipe:'pc', job, sex, senjata}|{tipe:'mob', id}}
 */
export function avatarKursi(k) {
	if (!k.bot) {
		return AVATAR_MANUSIA;
	}
	const n = MOB_BOT.length;
	return { tipe: 'mob', id: MOB_BOT[(((k.kursi - 1) % n) + n) % n] };
}

/** Kode avatar ringkas untuk atribut data-avatar ("pc:0:1" / "mob:1002"). */
export function kodeAvatar(sprite) {
	return sprite.tipe === 'pc' ? `pc:${sprite.job}:${sprite.sex}` : `mob:${sprite.id}`;
}

/**
 * Kursi urut HP turun; yang tersingkir paling bawah; seri → nomor kursi naik.
 * @param {Array<object>} kursi state.kursi
 * @returns {Array<object>} salinan terurut (array asal tidak diubah)
 */
export function urutKursi(kursi) {
	return [...kursi].sort((a, b) => (Number(b.hidup) - Number(a.hidup)) || (b.hp - a.hp) || (a.kursi - b.kursi));
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps
 * @param {function} deps.t penerjemah teks.js
 * @param {object} [deps.ekonomi] katalog.ekonomi; hp_kursi = penuh bar HP
 * @returns {string} HTML isi jendela DaftarPemain ('' tanpa state)
 */
export function renderDaftarPemain(snap, deps) {
	const { t } = deps;
	const kursi = snap.state?.kursi ?? [];
	const sayaKursi = snap.state?.saya?.kursi;
	const hpKursi = deps.ekonomi?.hp_kursi;
	const hpMaks = hpKursi > 0 ? hpKursi : Math.max(HP_KURSI_BAWAAN, ...kursi.map((k) => k.hp), 1);
	return urutKursi(kursi).map((k) => {
		const kelas = ['baris'];
		if (k.kursi === sayaKursi) {
			kelas.push('sendiri');
		}
		if (!k.hidup) {
			kelas.push('tersingkir');
		}
		const nama = k.nama || (k.bot ? t('label.bot', k.kursi) : t('label.anda'));
		const hp = Math.max(0, k.hp);
		const persen = Math.min(100, Math.round(hp / hpMaks * 100));
		const status = k.hidup
			? `<div class="bar-hp" title="${esc(t('label.hp'))} ${hp}"><div style="width:${persen}%"></div></div><span class="angka-hp">${hp}</span>`
			: `<span class="label-tersingkir">${esc(t('label.tersingkir'))}</span>`;
		return `<div class="${kelas.join(' ')}" data-kursi="${k.kursi}">`
			+ `<canvas class="avatar" width="${LEBAR_AVATAR}" height="${TINGGI_AVATAR}" data-avatar="${kodeAvatar(avatarKursi(k))}"></canvas>`
			+ '<div class="teks">'
			+ `<div class="atas"><span class="nama">${esc(nama)}</span><span class="lv">${esc(t('label.level', k.level))}</span></div>`
			+ `<div class="bawah">${status}</div>`
			+ '</div></div>';
	}).join('');
}
