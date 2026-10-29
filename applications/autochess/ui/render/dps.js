/**
 * Renderer murni jendela DPS (F): satu baris per bidak sendiri di papan
 * (entityId > 0) dengan nama unit, ★n, total damage, dan bar relatif
 * terhadap total terbesar. Urut turun menurut total.
 */

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/**
 * @param {object} snap state.ambil()
 * @param {object} deps {t, bahasa, katalog}
 * @param {{entityId:number,total:number}[]} daftar keluaran dps.ambil()
 * @returns {string} HTML isi jendela DPS
 */
export function renderDPS(snap, deps, daftar) {
	const peta = new Map((daftar ?? []).map((d) => [d.entityId, d.total]));
	const baris = (snap.state?.saya?.bidak ?? [])
		.filter((b) => b.entityId > 0)
		.map((b) => ({ b, total: peta.get(b.entityId) ?? 0 }))
		.sort((x, y) => y.total - x.total);
	if (baris.length === 0) {
		return '<div class="kosong">-</div>';
	}
	const maks = Math.max(1, ...baris.map((r) => r.total));
	return baris.map(({ b, total }) => {
		const lebar = Math.round((total / maks) * 100);
		const nama = esc(deps.katalog.namaUnit(b.unitId, deps.bahasa));
		return `<div class="baris" data-entity="${b.entityId}"><div class="bar" style="width:${lebar}%"></div>`
			+ `<span class="nama">${nama} <span class="bintang">★${b.bintang}</span></span>`
			+ `<span class="total">${total}</span></div>`;
	}).join('');
}
