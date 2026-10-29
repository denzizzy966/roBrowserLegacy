import { describe, it, expect } from 'vitest';
import { deteksiNaikBintang } from './bintang.js';

function s(bidak) {
	return { saya: { bidak } };
}
function b(bidakId, bintang, ekstra = {}) {
	return { bidakId, unitId: 'poring', bintang, diPapan: false, kolom: 0, baris: 0, entityId: 0, ...ekstra };
}

describe('deteksiNaikBintang', () => {
	it('snapshot pertama tidak menghasilkan apa pun', () => {
		expect(deteksiNaikBintang(null, s([b(1, 2)]))).toEqual([]);
	});

	it('bidak bintang 2 baru terdeteksi', () => {
		const hasil = deteksiNaikBintang(s([b(1, 1), b(2, 1), b(3, 1)]), s([b(4, 2, { diPapan: true, kolom: 2, baris: 1, entityId: 77 })]));
		expect(hasil).toEqual([{ bidakId: 4, unitId: 'poring', bintang: 2, entityId: 77, diPapan: true, kolom: 2, baris: 1 }]);
	});

	it('bidak lama bintang 2 tidak terdeteksi lagi', () => {
		expect(deteksiNaikBintang(s([b(4, 2)]), s([b(4, 2), b(5, 1)]))).toEqual([]);
	});

	it('bidak yang hanya pindah petak tidak terdeteksi', () => {
		expect(deteksiNaikBintang(s([b(4, 2)]), s([b(4, 2, { diPapan: true, kolom: 3, baris: 2 })]))).toEqual([]);
	});

	it('bidak bintang 1 baru bukan naik bintang', () => {
		expect(deteksiNaikBintang(s([]), s([b(9, 1)]))).toEqual([]);
	});

	it('state tanpa saya (penonton) aman', () => {
		expect(deteksiNaikBintang(s([b(1, 1)]), { saya: null })).toEqual([]);
	});
});
