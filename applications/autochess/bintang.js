/**
 * Deteksi naik bintang (Q7): murni, tanpa DOM.
 *
 * Penggabungan server mengganti tiga salinan menjadi SATU bidak baru
 * (bidakId baru, bintang >= 2). Jadi "naik bintang" = bidak ber-bintang
 * >= 2 di snapshot sekarang yang bidakId-nya belum ada di snapshot
 * sebelumnya. Bidak lama yang hanya pindah petak punya bidakId yang sama
 * sehingga tidak terdeteksi; snapshot pertama (sebelum = null) tidak
 * menghasilkan apa pun.
 */

/**
 * @param {object|null} sebelum state terdekode sebelumnya (decodeCaturState)
 * @param {object|null} sesudah state terdekode sekarang
 * @returns {Array<{bidakId:number, unitId:string, bintang:number, entityId:number, diPapan:boolean, kolom:number, baris:number}>}
 */
export function deteksiNaikBintang(sebelum, sesudah) {
	if (!sebelum?.saya || !sesudah?.saya) {
		return [];
	}
	const lama = new Set((sebelum.saya.bidak ?? []).map((b) => b.bidakId));
	return (sesudah.saya.bidak ?? [])
		.filter((b) => b.bintang >= 2 && !lama.has(b.bidakId))
		.map((b) => ({
			bidakId: b.bidakId, unitId: b.unitId, bintang: b.bintang, entityId: b.entityId,
			diPapan: b.diPapan, kolom: b.kolom, baris: b.baris
		}));
}
