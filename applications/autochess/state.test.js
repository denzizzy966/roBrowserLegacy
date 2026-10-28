import { describe, it, expect } from 'vitest';

import { buatState } from './state.js';
import { FASE } from './pesan.js';

// Snapshot minimal berbentuk keluaran decodeCaturState.
function snapshot(isi = {}) {
	return {
		ronde: 3, fase: FASE.PERSIAPAN, sisaMs: 30000, kursi: [],
		saya: {
			kursi: 0, zeny: 10, exp: 0, expBerikut: 2, level: 3, kapasitas: 3, kunci: false,
			toko: [], bidak: [], sinergi: [], peluang: []
		},
		...isi
	};
}

describe('buatState', () => {
	it('kosong sebelum pesan apa pun', () => {
		const s = buatState();
		expect(s.ambil()).toEqual({ state: null, fase: 0, ronde: 0, hasilTerakhir: null, selesai: null });
		expect(s.sisaMs(1000)).toBe(0);
	});

	it('terima lalu sisaMs(sekarang+1000) = sisaMs - 1000, tak negatif', () => {
		const s = buatState();
		s.terima(snapshot({ sisaMs: 30000 }), 5000);

		expect(s.sisaMs(5000)).toBe(30000);
		expect(s.sisaMs(6000)).toBe(29000);
		expect(s.sisaMs(5000 + 999999)).toBe(0);
		expect(s.ambil().state.saya.zeny).toBe(10);
		expect(s.ambil().fase).toBe(FASE.PERSIAPAN);
		expect(s.ambil().ronde).toBe(3);
	});

	it('fase baru mereset jam dan menimpa fase/ronde', () => {
		const s = buatState();
		s.terima(snapshot({ sisaMs: 30000 }), 0);
		s.terimaFase({ fase: FASE.TEMPUR, ronde: 4, sisaMs: 60000 }, 20000);

		expect(s.sisaMs(20000)).toBe(60000);
		expect(s.sisaMs(21000)).toBe(59000);
		expect(s.ambil().fase).toBe(FASE.TEMPUR);
		expect(s.ambil().ronde).toBe(4);
		// Snapshot lama tetap tersimpan sampai yang baru tiba.
		expect(s.ambil().state.ronde).toBe(3);
	});

	it('state baru juga mereset jam (yang terakhir menang)', () => {
		const s = buatState();
		s.terimaFase({ fase: FASE.PERSIAPAN, ronde: 2, sisaMs: 30000 }, 0);
		s.terima(snapshot({ ronde: 2, sisaMs: 12000 }), 10000);

		expect(s.sisaMs(11000)).toBe(11000);
	});

	it('menyimpan hasil terakhir dan selesai', () => {
		const s = buatState();
		const hasil = { ronde: 1, menang: false, damageDiterima: 7, zenyMasuk: 5, seri: false };
		const selesai = { peringkat: [1, 0], peringkatSaya: 1 };
		s.terimaHasil(hasil);
		s.terimaSelesai(selesai);

		expect(s.ambil().hasilTerakhir).toEqual(hasil);
		expect(s.ambil().selesai).toEqual(selesai);
	});
});
