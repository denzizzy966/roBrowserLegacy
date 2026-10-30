import { describe, it, expect, vi } from 'vitest';

import { KAMUS, buatTeks, formatZeny } from './teks.js';

// Pref palsu berbentuk sama dengan keluaran Preferences.get: objek polos
// berisi bahasa dan save().
function prefPalsu(bahasa = 'id') {
	return { bahasa, save: vi.fn() };
}

// Semua alasan tetap EvtError yang bisa sampai ke pemain: empat belas dari
// server/internal/catur/galat.go, lalu milik aktor pertandingan dan
// roserver (lihat komentar per kelompok). Kunci kamus HARUS sama persis
// dengan teks server supaya pesan galat bisa dicocokkan; alasan baru di
// server wajib ditambahkan di sini dan di KAMUS.
const ALASAN_SERVER = [
	'zeny tidak cukup',
	'slot kosong',
	'bangku penuh',
	'bidak bukan milik kursi',
	'kursi sudah tersingkir',
	'perintah tidak dikenal',
	'belum didukung',
	'kursi tidak dikenal',
	'kapasitas papan penuh',
	'cell terisi',
	'cell di luar separuh sendiri',
	'level maksimum',
	// AC6 (galat.go): kunci per slot dan perintah selama mode tempur
	'slot kosong tidak bisa dikunci',
	'bidak sedang bertempur',
	// server/internal/pertandingan/aktor.go (pesanBukanPersiapan,
	// pesanPerintahGagal, pesanGalatInternal, mulai) dan registry.go
	'bukan fase persiapan',
	'perintah gagal karena galat internal',
	'pertandingan berhenti karena galat internal',
	'pertandingan gagal dimulai',
	// AC6 (aktor.go): pesanSedangMenonton, pesanBelumTersingkir,
	// pesanKursiTakBisaDitonton
	'sedang menonton kursi lain',
	'belum tersingkir',
	'kursi tidak bisa ditonton',
	'server sedang berhenti, pertandingan tidak dimulai',
	// server/cmd/roserver/main.go
	'server sibuk, coba lagi',
	'mode catur tidak aktif'
];

describe('KAMUS', () => {
	it('punya sedikitnya 60 kunci, masing-masing dengan teks id dan en', () => {
		const kunci = Object.keys(KAMUS);
		expect(kunci.length).toBeGreaterThanOrEqual(60);
		for (const k of kunci) {
			expect(typeof KAMUS[k].id, k).toBe('string');
			expect(typeof KAMUS[k].en, k).toBe('string');
			expect(KAMUS[k].id.length, k).toBeGreaterThan(0);
			expect(KAMUS[k].en.length, k).toBeGreaterThan(0);
		}
	});

	it('mencakup fase, judul jendela, tombol, label, dan kata efek sinergi', () => {
		const wajib = [
			'fase.persiapan', 'fase.tempur', 'fase.hasil',
			'jendela.timer', 'jendela.daftarPemain', 'jendela.kapasitas', 'jendela.zeny', 'jendela.sinergi',
			'jendela.dps', 'jendela.infoPemain', 'jendela.exp', 'jendela.bangku', 'jendela.toko', 'jendela.lore',
			'tombol.beli', 'tombol.jual', 'tombol.refresh', 'tombol.kunci', 'tombol.buka', 'tombol.beliExp',
			'tombol.lewati', 'tombol.tutup', 'tombol.keBangku', 'tombol.bahasa',
			'label.ronde', 'label.level', 'label.zeny', 'label.hp', 'label.streak', 'label.kapasitas',
			'label.peluang', 'label.tier', 'label.bintang', 'label.tersingkir', 'label.menang', 'label.kalah',
			'label.seri', 'label.peringkat', 'label.selesai', 'label.lawan', 'label.salinan', 'label.creep',
			'efek.hp_max', 'efek.atk', 'efek.matk', 'efek.def', 'efek.mdef', 'efek.aspd_persen',
			'efek.jangkauan', 'efek.sp_awal', 'sasaran.semua', 'sasaran.anggota'
		];
		for (const k of wajib) {
			expect(KAMUS[k], k).toBeDefined();
		}
	});

	it('menerjemahkan setiap alasan penolakan server persis dengan teks server sebagai kunci', () => {
		for (const alasan of ALASAN_SERVER) {
			expect(KAMUS[alasan], alasan).toBeDefined();
		}
		expect(KAMUS['zeny tidak cukup']).toEqual({ id: 'Zeny tidak cukup', en: 'Not enough Zeny' });
	});
});

describe('buatTeks', () => {
	it('t memakai bahasa dari pref', () => {
		expect(buatTeks({ pref: prefPalsu('id') }).t('fase.persiapan')).toBe(KAMUS['fase.persiapan'].id);
		expect(buatTeks({ pref: prefPalsu('en') }).t('fase.persiapan')).toBe(KAMUS['fase.persiapan'].en);
	});

	it('t mengganti placeholder {0}, {1} dengan argumen', () => {
		const teks = buatTeks({ pref: prefPalsu('id') });
		expect(teks.t('label.ronde', 3)).toBe('Ronde 3');
		expect(teks.t('label.salinan', 2, 3)).toBe('2/3 salinan');
		teks.setBahasa('en');
		expect(teks.t('label.ronde', 3)).toBe('Round 3');
	});

	it('kunci tak dikenal mengembalikan kunci itu sendiri dan log hanya sekali', () => {
		const log = vi.fn();
		const teks = buatTeks({ pref: prefPalsu('id'), log });
		expect(teks.t('tidak.ada')).toBe('tidak.ada');
		expect(teks.t('tidak.ada')).toBe('tidak.ada');
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain('tidak.ada');
	});

	it('kunci tak dikenal tanpa log tidak melempar', () => {
		expect(buatTeks({ pref: prefPalsu('id') }).t('x.y')).toBe('x.y');
	});

	it('setBahasa menyimpan pref dan memanggil padaUbah', () => {
		const pref = prefPalsu('id');
		const teks = buatTeks({ pref });
		const fn = vi.fn();
		teks.padaUbah(fn);
		expect(teks.setBahasa('en')).toBe(true);
		expect(teks.bahasa()).toBe('en');
		expect(pref.bahasa).toBe('en');
		expect(pref.save).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('en');
	});

	it('setBahasa ke bahasa yang sama tidak memanggil padaUbah', () => {
		const teks = buatTeks({ pref: prefPalsu('id') });
		const fn = vi.fn();
		teks.padaUbah(fn);
		expect(teks.setBahasa('id')).toBe(true);
		expect(fn).not.toHaveBeenCalled();
	});

	it('setBahasa menolak kode yang tidak didukung', () => {
		const pref = prefPalsu('id');
		const teks = buatTeks({ pref });
		const fn = vi.fn();
		teks.padaUbah(fn);
		expect(teks.setBahasa('jp')).toBe(false);
		expect(teks.bahasa()).toBe('id');
		expect(pref.save).not.toHaveBeenCalled();
		expect(fn).not.toHaveBeenCalled();
	});

	it('padaUbah mengembalikan fungsi pelepas', () => {
		const teks = buatTeks({ pref: prefPalsu('id') });
		const fn = vi.fn();
		const lepas = teks.padaUbah(fn);
		lepas();
		teks.setBahasa('en');
		expect(fn).not.toHaveBeenCalled();
	});

	it('pref dengan bahasa asing jatuh ke id', () => {
		const teks = buatTeks({ pref: prefPalsu('xx') });
		expect(teks.bahasa()).toBe('id');
		expect(teks.t('tombol.beli')).toBe(KAMUS['tombol.beli'].id);
	});

	it('tanpa pref memakai id dan setBahasa tetap bekerja', () => {
		const teks = buatTeks();
		expect(teks.bahasa()).toBe('id');
		expect(teks.setBahasa('en')).toBe(true);
		expect(teks.t('tombol.beli')).toBe(KAMUS['tombol.beli'].en);
	});
});

describe('formatZeny', () => {
	it('memakai koma sebagai pemisah ribuan gaya RO', () => {
		expect(formatZeny(0)).toBe('0');
		expect(formatZeny(999)).toBe('999');
		expect(formatZeny(1234)).toBe('1,234');
		expect(formatZeny(1234567)).toBe('1,234,567');
		expect(formatZeny(-1234)).toBe('-1,234');
	});

	it('membulatkan ke bawah pecahan dan menganggap bukan-angka sebagai 0', () => {
		expect(formatZeny(1234.9)).toBe('1,234');
		expect(formatZeny(NaN)).toBe('0');
		expect(formatZeny(undefined)).toBe('0');
	});
});
