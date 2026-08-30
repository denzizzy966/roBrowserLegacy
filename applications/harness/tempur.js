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
