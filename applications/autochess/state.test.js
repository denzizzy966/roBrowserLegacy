import { describe, it, expect } from 'vitest';

import { buatState, papanTampil, sinergiTampil, menontonLain, kursiSendiriHidup } from './state.js';
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
	it('sebelumnya(): null pada snapshot pertama, lalu state terdekode sebelumnya', () => {
		const s = buatState();
		expect(s.sebelumnya()).toBeNull();
		const a = snapshot({ ronde: 1 });
		const b = snapshot({ ronde: 2 });
		s.terima(a, 0);
		expect(s.sebelumnya()).toBeNull();
		s.terima(b, 10);
		expect(s.sebelumnya()).toBe(a);
		expect(s.ambil().state).toBe(b);
	});

	it('kosong sebelum pesan apa pun', () => {
		const s = buatState();
		expect(s.ambil()).toEqual({
			state: null, fase: 0, ronde: 0, hasilTerakhir: null, selesai: null,
			ditonton: 0, kursiBawah: 0, lawanKursi: -1
		});
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

	describe('AC6 tontonan', () => {
		const KURSI = (hidupSaya = true) => [
			{ kursi: 0, nama: 'Saya', hp: 50, level: 3, bot: false, hidup: hidupSaya, streak: 0 },
			{ kursi: 1, nama: 'Bot 1', hp: 90, level: 3, bot: true, hidup: true, streak: 0 },
			{ kursi: 2, nama: 'Bot 2', hp: 70, level: 3, bot: true, hidup: true, streak: 0 }
		];
		const BIDAK_SAYA = [
			{ bidakId: 1, unitId: 'poring', bintang: 1, diPapan: true, kolom: 0, baris: 0, entityId: 11 },
			{ bidakId: 2, unitId: 'lunatic', bintang: 1, diPapan: false, kolom: 0, baris: 0, entityId: 0 }
		];
		const SIN_SAYA = [{ id: 'hewan', jumlah: 1, tingkatAktif: 0, origin: true }];
		const TONTONAN_1 = {
			kursi: 1,
			bidak: [{ bidakId: 9, unitId: 'archer', bintang: 2, diPapan: true, kolom: 3, baris: 1, entityId: 77 }],
			sinergi: [{ id: 'pemburu', jumlah: 2, tingkatAktif: 1, origin: false }]
		};
		function snapAC6(isi = {}, hidupSaya = true) {
			return snapshot({
				kursi: KURSI(hidupSaya), tontonan: null,
				saya: { ...snapshot().saya, kursi: 0, bidak: BIDAK_SAYA, sinergi: SIN_SAYA },
				...isi
			});
		}

		it('bawaan: ditonton = kursi sendiri dari snapshot, papanTampil = bidak papan sendiri', () => {
			const s = buatState();
			s.terima(snapAC6({ saya: { ...snapshot().saya, kursi: 2, bidak: BIDAK_SAYA, sinergi: SIN_SAYA } }), 0);
			expect(s.ambil().ditonton).toBe(2);
			expect(s.ambil().kursiBawah).toBe(2);
			expect(s.ambil().lawanKursi).toBe(-1);
			expect(menontonLain(s.ambil())).toBe(false);
			expect(s.papanTampil().map((b) => b.bidakId)).toEqual([1]);
			expect(s.sinergiTampil()).toBe(SIN_SAYA);
		});

		it('EvtCaturTonton menyetel ditonton, kursiBawah, lawanKursi', () => {
			const s = buatState();
			s.terima(snapAC6(), 0);
			s.terimaTonton({ kursi: 1, lawanKursi: 2, kursiBawah: 2 });
			const a = s.ambil();
			expect(a.ditonton).toBe(1);
			expect(a.kursiBawah).toBe(2);
			expect(a.lawanKursi).toBe(2);
			expect(menontonLain(a)).toBe(true);
		});

		it('papanTampil/sinergiTampil memakai tontonan selama menonton kursi itu', () => {
			const s = buatState();
			s.terima(snapAC6(), 0);
			s.terimaTonton({ kursi: 1, lawanKursi: -1, kursiBawah: 1 });
			// Snapshot basi (belum ada tontonan): jatuh ke milik sendiri.
			expect(s.papanTampil().map((b) => b.bidakId)).toEqual([1]);
			s.terima(snapAC6({ tontonan: TONTONAN_1 }), 10);
			expect(s.papanTampil()).toBe(TONTONAN_1.bidak);
			expect(s.sinergiTampil()).toBe(TONTONAN_1.sinergi);
			// saya tetap milik sendiri.
			expect(s.ambil().state.saya.bidak).toBe(BIDAK_SAYA);
			// tontonan kursi lain dari snapshot basi tidak dipakai.
			s.terimaTonton({ kursi: 2, lawanKursi: -1, kursiBawah: 2 });
			expect(s.papanTampil().map((b) => b.bidakId)).toEqual([1]);
			expect(papanTampil({ ...s.ambil(), ditonton: 1 })).toBe(TONTONAN_1.bidak);
			expect(sinergiTampil({ ...s.ambil(), ditonton: 0 })).toBe(SIN_SAYA);
		});

		it('K14: EvtCaturFase PERSIAPAN kembali ke kursi sendiri bila hidup', () => {
			const s = buatState();
			s.terima(snapAC6({ tontonan: TONTONAN_1 }), 0);
			s.terimaTonton({ kursi: 1, lawanKursi: 2, kursiBawah: 1 });
			s.terimaFase({ fase: FASE.HASIL, ronde: 3, sisaMs: 3000 }, 5);
			expect(s.ambil().ditonton).toBe(1);
			s.terimaFase({ fase: FASE.PERSIAPAN, ronde: 4, sisaMs: 30000 }, 10);
			const a = s.ambil();
			expect(a.ditonton).toBe(0);
			expect(a.kursiBawah).toBe(0);
			expect(a.lawanKursi).toBe(-1);
			expect(menontonLain(a)).toBe(false);
			// Snapshot lama masih membawa tontonan kursi 1: tidak dipakai lagi.
			expect(s.papanTampil().map((b) => b.bidakId)).toEqual([1]);
		});

		it('K14: kursi sendiri tersingkir tetap menonton saat PERSIAPAN', () => {
			const s = buatState();
			s.terima(snapAC6({ tontonan: TONTONAN_1 }, false), 0);
			s.terimaTonton({ kursi: 1, lawanKursi: -1, kursiBawah: 1 });
			expect(kursiSendiriHidup(s.ambil())).toBe(false);
			s.terimaFase({ fase: FASE.PERSIAPAN, ronde: 4, sisaMs: 30000 }, 10);
			expect(s.ambil().ditonton).toBe(1);
			expect(s.papanTampil()).toBe(TONTONAN_1.bidak);
		});

		it('kursiSendiriHidup: tanpa snapshot dianggap hidup', () => {
			expect(kursiSendiriHidup(buatState().ambil())).toBe(true);
			expect(menontonLain(buatState().ambil())).toBe(false);
		});
	});
});
