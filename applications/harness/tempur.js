/**
 * applications/harness/tempur.js
 *
 * Dekoder pesan combat M6c.
 *
 * Pola nol-eksplisit di seluruh berkas ini disengaja: protobuf
 * menghilangkan field bernilai nol dari kawat, dan `x || 0` menelan nol
 * yang SAH. hpSisa nol berarti target mati; koordinat nol adalah petak
 * yang ada di setiap map. Jebakan yang sama menggigit objecttype 0 di
 * M6a, tempat TYPE_PC bernilai nol dan hampir jatuh ke cabang salah.
 */

// num mengubah apa pun menjadi angka, dengan absen berarti NOL dan bukan
// undefined. Ditulis sekali supaya tidak ada satu field pun yang lupa.
const num = (v) => (v === undefined || v === null ? 0 : Number(v));

export function decodeDamage(m) {
	return {
		src: num(m.src),
		dst: num(m.dst),
		amount: num(m.amount),
		hpSisa: num(m.hpSisa),
	};
}

export function decodeDeath(m) {
	return { entityId: num(m.entityId) };
}

export function decodeItemTanah(m) {
	return {
		groundId: num(m.groundId),
		namaItem: m.namaItem ?? '',
		x: num(m.x),
		y: num(m.y),
	};
}

export function decodeItemHilang(m) {
	return { groundId: num(m.groundId) };
}

/**
 * Bar darah sebagai persen bulat, dijepit ke 0..100.
 *
 * Dijepit karena server boleh mengirim hpSisa nol pada pukulan yang
 * melampaui nol, dan maxHp nol pada entity yang belum lengkap datanya --
 * keduanya menghasilkan NaN atau angka negatif tanpa penjepit ini.
 */
export function persenDarah(hp, maxHp) {
	if (!maxHp || maxHp <= 0) {
		return 0;
	}
	const p = Math.round((hp / maxHp) * 100);
	return Math.max(0, Math.min(100, p));
}

/**
 * Meng-encode ClientMsg satu-field.
 *
 * Ada DI SINI, bukan di main.js, karena main.js tidak punya satu tes pun.
 * Versi pertamanya mengembalikan hasil `.finish()` apa adanya dan server
 * menolak setiap pesan dengan "cannot parse invalid wire-format data" --
 * cacat yang satu tes round-trip akan tangkap dalam satu detik.
 *
 * `.finish()` mengembalikan Uint8Array yang menunjuk ke buffer BERSAMA
 * milik protobufjs, bukan buffer miliknya sendiri. Mengirimkannya apa
 * adanya mengirim seluruh kolam itu. encodeMove dan encodeEnterMap sudah
 * memotongnya sejak M1 dengan alasan yang sama.
 *
 * Client TIDAK pernah mengirim damage atau apa pun yang server dapat
 * tentukan sendiri: spec induk Bagian 8.3 mengunci "client tidak pernah
 * dipercaya". CmdAttack hanya membawa target; CmdPickup hanya id item.
 */
export function encodeSatuField(ClientMsg, namaField, isi) {
	const u8 = ClientMsg.encode(ClientMsg.create({ [namaField]: isi })).finish();
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/**
 * Memilih entity terdekat dari petak yang diklik.
 *
 * TIDAK memakai kecocokan petak persis, dan itu penting: mob agresif
 * MENGEJAR, jadi ia hampir selalu berada di tengah interpolasi. Posisinya
 * pecahan, sementara klik dipotong ke bilangan bulat -- mob yang tampak
 * jelas di bawah kursor bisa berada di 166,6 saat kliknya menghasilkan
 * 166 atau 167. Kecocokan persis membuat mob yang bergerak nyaris
 * mustahil diklik, dan gejalanya "kadang tidak bisa menyerang".
 *
 * daftar: [{ id, x, y }]. Mengembalikan id terdekat dalam toleransi, atau
 * null. Seri dimenangkan id TERKECIL supaya deterministik.
 */
export function pilihTerdekat(daftar, x, y, toleransi = 1) {
	let pilih = null;
	let jarakTerbaik = Infinity;
	for (const e of daftar) {
		const d = Math.max(Math.abs(e.x - x), Math.abs(e.y - y));
		if (d > toleransi) {
			continue;
		}
		if (d < jarakTerbaik || (d === jarakTerbaik && pilih !== null && e.id < pilih)) {
			pilih = e.id;
			jarakTerbaik = d;
		}
	}
	return pilih;
}

/**
 * Jalur berkas skin angka damage di dalam GRF.
 *
 * DISALIN dari Renderer/Effects/Damage.js (_damageSkins[0]), bukan
 * diimpor: ia const tingkat modul yang tidak diekspor, dan keputusan D3
 * melarang menyentuh client/src untuk mengekspornya. Pola yang sama
 * dipakai tabel ARAH di M4.
 *
 * Nama direktorinya "이펙트" dalam encoding EUC-KR.
 */
export const BERKAS_SKIN_DAMAGE = [
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/\xbc\xfd\xc0\xda.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/msg.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/bluemsg.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/\xbc\xfd\xc0\xda.act',
];

/**
 * Merangkum hasil probe berkas skin menjadi satu kalimat yang menyebut
 * apa yang harus dilakukan.
 *
 * hasil: [{ nama, ada }]
 */
export function ringkasProbeSkin(hasil) {
	const hilang = hasil.filter((h) => !h.ada).map((h) => h.nama);
	if (hilang.length === 0) {
		return {
			lengkap: true,
			pesan: `skin damage lengkap (${hasil.length}/${hasil.length} berkas) -- angka damage bawaan roBrowserLegacy akan tergambar`,
		};
	}
	return {
		lengkap: false,
		pesan:
			`skin damage TIDAK lengkap: ${hilang.length} dari ${hasil.length} berkas hilang di GRF-mu ` +
			`(${hilang.join(', ')}). Damage.add akan diam TANPA galat -- ` +
			`Client.getFiles tidak meneruskan onerror, jadi callback-nya tidak pernah dipanggil. ` +
			`Panel HUD harness tetap menampilkan damage.`,
	};
}

/**
 * Baris HUD untuk satu peristiwa damage.
 *
 * Dipisahkan dari DOM supaya dapat diuji: panel HUD ada justru karena
 * angka damage bawaan bisa diam, dan panel yang ikut diam tanpa
 * ketahuan akan mengulangi persoalan yang sama.
 */
export function barisHUD(d, maxHp) {
	const persen = persenDarah(d.hpSisa, maxHp);
	const mati = d.hpSisa <= 0 ? ' MATI' : '';
	return `${d.src} → ${d.dst}  -${d.amount}  (${d.hpSisa}${maxHp ? '/' + maxHp : ''} = ${persen}%)${mati}`;
}
