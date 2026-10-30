import { describe, it, expect } from 'vitest';
import { keputusanAuto, aturanDariKatalog, buatPemainOtomatis, JEDA_LEWATI_MS, BATAS_PANGGILAN } from './auto.js';
import { buatKatalog } from './katalog.js';
import { FASE } from './pesan.js';

// Tabel ini mencerminkan TestPerintahManusiaTerskrip di
// server/internal/pertandingan/penuh_test.go: input sama -> perintah sama,
// supaya port JS dan Go tidak menyimpang.

/** aturanSkripUji di Go. */
const TIER = { a: 1, b: 1, c: 2, d: 3, e: 1 };
const ATURAN = { bangku: 4, hargaExp: 5, levelMaks: 10, tier: (id) => TIER[id] ?? 0 };

/** stateSkrip di Go: EvtCaturState PERSIAPAN kecil (bentuk decodeCaturState). */
function stateSkrip(zeny, level, kapasitas, toko, ...bidak) {
	return {
		ronde: 1, fase: FASE.PERSIAPAN, sisaMs: 30000,
		kursi: [{ kursi: 0, nama: '', hp: 100, level, bot: false, hidup: true, streak: 0 }],
		saya: { kursi: 0, zeny, exp: 0, expBerikut: 0, level, kapasitas, kunci: false, toko: toko ?? [], bidak, sinergi: [], peluang: [] }
	};
}

/** tokoSkrip di Go: pasangan (unit, harga) berurutan slot; '' = slot kosong. */
function tokoSkrip(...isi) {
	const toko = [];
	for (let i = 0; i + 1 < isi.length; i += 2) {
		toko.push({ slot: i / 2, unitId: isi[i], harga: isi[i + 1] });
	}
	return toko;
}

function bangku(bidakId, unitId, bintang) {
	return { bidakId, unitId, bintang, diPapan: false, kolom: 0, baris: 0, entityId: 0 };
}

function papan(bidakId, unitId, kolom, baris) {
	return { bidakId, unitId, bintang: 1, diPapan: true, kolom, baris, entityId: 0 };
}

const taruh = (bidakId, kolom, baris) => ({ aksi: 'taruh', arg: { bidakId, kolom, baris } });
const beli = (slot) => ({ aksi: 'beli', arg: { slot } });
const jual = (bidakId) => ({ aksi: 'jual', arg: { bidakId } });
const beliExp = { aksi: 'beli-exp', arg: {} };

const KASUS = [
	{
		// Aturan 2: terkuat dulu (bintang, tier, id kecil), depan-tengah
		// dulu, sampai kapasitas; aturan lain tidak ikut.
		nama: 'taruh',
		s: stateSkrip(50, 3, 3, tokoSkrip('a', 1),
			papan(5, 'a', 3, 3), bangku(9, 'a', 1), bangku(7, 'd', 1), bangku(11, 'b', 2)),
		mau: [taruh(11, 4, 3), taruh(7, 2, 3)]
	},
	{
		nama: 'baris depan penuh',
		s: stateSkrip(0, 9, 9, null,
			papan(1, 'a', 0, 3), papan(2, 'a', 1, 3), papan(3, 'a', 2, 3), papan(4, 'a', 3, 3),
			papan(6, 'a', 4, 3), papan(7, 'a', 5, 3), papan(8, 'a', 6, 3), papan(10, 'a', 7, 3),
			bangku(20, 'c', 1)),
		mau: [taruh(20, 3, 2)]
	},
	{
		// Aturan 3: bangku penuh, dua salinan 1★ c (satu di papan) -> beli c.
		nama: 'beli gabung',
		s: stateSkrip(9, 1, 1, tokoSkrip('d', 3, 'c', 2),
			papan(1, 'c', 3, 3), bangku(2, 'c', 1), bangku(3, 'a', 1), bangku(4, 'b', 1), bangku(5, 'e', 2)),
		mau: [beli(1)]
	},
	{
		// Aturan 4: bangku penuh; terlemah = tier 1, bintang 1, id terbesar = 4.
		nama: 'jual',
		s: stateSkrip(9, 1, 1, tokoSkrip('d', 3),
			papan(1, 'c', 3, 3), bangku(2, 'a', 1), bangku(3, 'e', 2), bangku(4, 'b', 1), bangku(6, 'c', 1)),
		mau: [jual(4)]
	},
	{
		// Bangku penuh, toko hanya tier 1 yang belum dimiliki: tidak menjual;
		// zeny 9 - 5 < 10: tidak beli EXP.
		nama: 'bangku penuh tanpa slot berguna',
		s: stateSkrip(9, 1, 1, tokoSkrip('e', 1, '', 0),
			papan(1, 'c', 3, 3), bangku(2, 'a', 1), bangku(3, 'b', 1), bangku(4, 'a', 2), bangku(6, 'c', 1)),
		mau: []
	},
	{
		// Unit bidak terlemah sendiri di toko bukan alasan menjualnya.
		nama: 'tidak jual demi unit sendiri',
		s: stateSkrip(9, 1, 1, tokoSkrip('b', 1),
			papan(1, 'c', 3, 3), bangku(2, 'a', 2), bangku(3, 'e', 2), bangku(4, 'b', 1), bangku(6, 'c', 1)),
		mau: []
	},
	{
		// Aturan 5: dimiliki dulu, lalu termurah, lalu slot kecil; zeny
		// berjalan; berhenti saat bangku 4 penuh.
		nama: 'beli',
		s: stateSkrip(9, 1, 1, tokoSkrip('d', 3, 'e', 1, 'c', 2, 'b', 1, 'a', 1),
			papan(1, 'c', 3, 3), bangku(2, 'd', 2)),
		mau: [beli(2), beli(0), beli(1)]
	},
	{
		// Aturan 6: tidak ada yang terbeli, zeny 15 - 5 >= 10.
		nama: 'beli exp',
		s: stateSkrip(15, 3, 1, tokoSkrip('d', 30), papan(1, 'c', 3, 3)),
		mau: [beliExp]
	},
	{ nama: 'exp di level maks', s: stateSkrip(99, 10, 10, null), mau: [] },
	{ nama: 'exp tanpa cadangan', s: stateSkrip(14, 3, 1, null), mau: [] }
];

describe('keputusanAuto (tabel TestPerintahManusiaTerskrip)', () => {
	for (const k of KASUS) {
		it(k.nama, () => {
			expect(keputusanAuto(k.s, ATURAN)).toEqual(k.mau);
		});
	}

	it('di luar PERSIAPAN, tanpa saya, atau kursi tersingkir: []', () => {
		const tempur = stateSkrip(99, 3, 3, tokoSkrip('a', 1));
		tempur.fase = FASE.TEMPUR;
		const hasil = stateSkrip(99, 3, 3, tokoSkrip('a', 1));
		hasil.fase = FASE.HASIL;
		const mati = stateSkrip(99, 3, 3, tokoSkrip('a', 1));
		mati.kursi[0].hidup = false;
		for (const s of [null, {}, { fase: FASE.PERSIAPAN }, tempur, hasil, mati]) {
			expect(keputusanAuto(s, ATURAN)).toEqual([]);
		}
		// Kontrol: state yang sama dengan kursi hidup memang membeli.
		expect(keputusanAuto(stateSkrip(99, 3, 3, tokoSkrip('a', 1)), ATURAN)).toEqual([beli(0)]);
	});

	it('satu panggilan = satu aturan: tiap hasil hanya berisi satu jenis aksi', () => {
		for (const k of KASUS) {
			const jenis = new Set(keputusanAuto(k.s, ATURAN).map((p) => p.aksi));
			expect(jenis.size).toBeLessThanOrEqual(1);
		}
		// Taruh menang atas Beli walau zeny cukup dan bangku tidak penuh.
		const s = stateSkrip(50, 1, 2, tokoSkrip('a', 1, 'b', 1), bangku(3, 'd', 1));
		expect(keputusanAuto(s, ATURAN)).toEqual([taruh(3, 3, 3)]);
	});

	it('taruh tidak melebihi kapasitas', () => {
		const s = stateSkrip(0, 2, 2, null, bangku(1, 'a', 1), bangku(2, 'b', 1), bangku(3, 'c', 1));
		expect(keputusanAuto(s, ATURAN)).toEqual([taruh(3, 3, 3), taruh(1, 4, 3)]);
		const penuh = stateSkrip(0, 1, 1, null, papan(9, 'a', 0, 0), bangku(1, 'a', 1));
		expect(keputusanAuto(penuh, ATURAN)).toEqual([]);
	});

	it('beli gabung bila bangku penuh memilih slot terkecil, apa pun urutan toko', () => {
		const toko = [{ slot: 3, unitId: 'a', harga: 1 }, { slot: 1, unitId: 'a', harga: 1 }];
		const s = stateSkrip(5, 1, 1, toko, papan(1, 'a', 3, 3), bangku(2, 'a', 1), bangku(3, 'b', 1), bangku(4, 'c', 1), bangku(5, 'd', 1));
		expect(keputusanAuto(s, ATURAN)).toEqual([beli(1)]);
	});

	it('murni: dua panggilan sama persis dan state tidak berubah', () => {
		for (const k of KASUS) {
			const sebelum = structuredClone(k.s);
			const x = keputusanAuto(k.s, ATURAN);
			const y = keputusanAuto(k.s, ATURAN);
			expect(x).toEqual(y);
			expect(k.s).toEqual(sebelum);
		}
	});
});

describe('aturanDariKatalog', () => {
	it('membaca ekonomi.bangku, beli_exp.harga, level_maks, dan units[id].tier', () => {
		const log = [];
		const katalog = buatKatalog({
			units: { acolyte: { tier: 2 }, poring: { tier: 1 } },
			ekonomi: { bangku: 8, beli_exp: { harga: 5, exp: 4 }, level_maks: 10 }
		}, (m) => log.push(m));
		const a = aturanDariKatalog(katalog);
		expect([a.bangku, a.hargaExp, a.levelMaks]).toEqual([8, 5, 10]);
		expect(a.tier('acolyte')).toBe(2);
		expect(a.tier('poring')).toBe(1);
		// Unit asing bertier 0 (map Go tanpa kunci).
		expect(a.tier('asing')).toBe(0);
	});

	it('katalog tanpa ekonomi -> null', () => {
		expect(aturanDariKatalog(buatKatalog({}))).toBeNull();
		expect(aturanDariKatalog(null)).toBeNull();
	});
});

/** Jam dan timer palsu untuk pengendali. */
function lingkungan({ tolak = new Set(), gagal = () => false, menonton } = {}) {
	const terkirim = [];
	const timer = [];
	const log = [];
	let jam = 1000;
	const p = buatPemainOtomatis({
		kirim: (aksi, arg) => {
			if (tolak.has(aksi) || gagal(aksi, terkirim.length)) {
				return false;
			}
			terkirim.push({ aksi, arg });
			return true;
		},
		aturan: () => ATURAN,
		sekarang: () => jam,
		jadwalkan: (fn, ms) => {
			const t = { fn, saat: jam + ms, batal: false };
			timer.push(t);
			return t;
		},
		batalkan: (t) => { t.batal = true; },
		log: (m) => log.push(m),
		menonton
	});
	return {
		p, terkirim, log, timer,
		maju(ms) {
			jam += ms;
			for (const t of [...timer]) {
				if (!t.batal && !t.jalan && t.saat <= jam) {
					t.jalan = true;
					t.fn();
				}
			}
		}
	};
}

describe('buatPemainOtomatis', () => {
	it('AC6 K14: tidak memutuskan selama menonton kursi lain; state sesudah pulang memutuskan', () => {
		let lain = true;
		const L = lingkungan({ menonton: () => lain });
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1, 'b', 1)));
		expect(L.terkirim).toEqual([]);
		lain = false;
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1, 'b', 1)));
		expect(L.terkirim).toEqual([beli(0), beli(1)]);
	});

	it('mati: tidak mengirim apa pun', () => {
		const L = lingkungan();
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1)));
		L.maju(10000);
		expect(L.terkirim).toEqual([]);
		expect(L.p.status()).toEqual({ aktif: false, ronde: 1, perintahDikirim: 0 });
	});

	it('menunggu semua jawaban sebelum memanggil lagi, lalu lewati 2 s sesudah PERSIAPAN mulai', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		// Aturan 5: dua Beli sekaligus.
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1, 'b', 1)));
		expect(L.terkirim).toEqual([beli(0), beli(1)]);
		// Jawaban pertama: masih menunggu satu, tidak memutuskan.
		L.p.terimaState(stateSkrip(8, 1, 1, tokoSkrip('', 0, 'b', 1), bangku(1, 'a', 1)));
		expect(L.terkirim).toHaveLength(2);
		// Jawaban kedua: Taruh (aturan 2).
		L.p.terimaState(stateSkrip(7, 1, 1, tokoSkrip('', 0, '', 0), bangku(1, 'a', 1), bangku(2, 'b', 1)));
		expect(L.terkirim.slice(2)).toEqual([taruh(1, 3, 3)]);
		// Jawaban Taruh: tidak ada lagi (bangku 1, toko kosong, zeny 7 < 15).
		L.p.terimaState(stateSkrip(7, 1, 1, tokoSkrip('', 0, '', 0), papan(1, 'a', 3, 3), bangku(2, 'b', 1)));
		expect(L.terkirim).toHaveLength(3);
		L.maju(JEDA_LEWATI_MS - 1);
		expect(L.terkirim).toHaveLength(3);
		L.maju(1);
		expect(L.terkirim.at(-1)).toEqual({ aksi: 'lewati', arg: {} });
		// Sekali per ronde.
		L.maju(10000);
		expect(L.terkirim.filter((p) => p.aksi === 'lewati')).toHaveLength(1);
		expect(L.p.status()).toEqual({ aktif: true, ronde: 1, perintahDikirim: 4 });
	});

	it('lewati dibatalkan saat fase berganti, dan dijadwal ulang tiap ronde', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.maju(500);
		L.p.terimaFase({ fase: FASE.TEMPUR, ronde: 1 });
		L.maju(10000);
		expect(L.terkirim).toEqual([]);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 2 });
		const s2 = stateSkrip(0, 1, 1, null);
		s2.ronde = 2;
		L.p.terimaState(s2);
		L.maju(JEDA_LEWATI_MS);
		expect(L.terkirim).toEqual([{ aksi: 'lewati', arg: {} }]);
		expect(L.p.status().ronde).toBe(2);
	});

	it('EvtError: dicatat sekali, keputusan ronde itu berhenti, lewati tetap terkirim', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1)));
		expect(L.terkirim).toEqual([beli(0)]);
		L.p.terimaGalat('bangku penuh');
		// State apa pun sesudahnya tidak memicu keputusan lagi.
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1)));
		expect(L.terkirim).toEqual([beli(0)]);
		expect(L.log.filter((m) => m.includes('menolak'))).toHaveLength(1);
		L.maju(JEDA_LEWATI_MS);
		expect(L.terkirim.at(-1)).toEqual({ aksi: 'lewati', arg: {} });
	});

	it('dinyalakan di tengah PERSIAPAN: langsung memutuskan dari snapshot terakhir', () => {
		const L = lingkungan();
		const s = stateSkrip(9, 1, 1, tokoSkrip('a', 1));
		L.p.atur(true, { state: s, fase: FASE.PERSIAPAN, ronde: 1 });
		expect(L.terkirim).toEqual([beli(0)]);
	});

	it('dimatikan: timer lewati dibatalkan', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.p.atur(false);
		L.maju(10000);
		expect(L.terkirim).toEqual([]);
	});

	it('kirim gagal (belum tersambung) tidak berputar', () => {
		const L = lingkungan({ tolak: new Set(['beli']) });
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1)));
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1)));
		L.maju(JEDA_LEWATI_MS);
		expect(L.terkirim).toEqual([{ aksi: 'lewati', arg: {} }]);
	});

	it(`jaring pengaman: paling banyak ${BATAS_PANGGILAN} keputusan per PERSIAPAN`, () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		// Server yang (salah) selalu menjawab dengan state yang sama.
		for (let i = 0; i < BATAS_PANGGILAN + 20; i++) {
			L.p.terimaState(stateSkrip(15, 3, 1, null));
		}
		expect(L.terkirim.filter((p) => p.aksi === 'beli-exp')).toHaveLength(BATAS_PANGGILAN);
		L.maju(JEDA_LEWATI_MS);
		expect(L.terkirim.at(-1)).toEqual({ aksi: 'lewati', arg: {} });
	});

	// Review Task 4, Important 1: galat atau kirim gagal di tengah batch.
	const BATCH3 = () => stateSkrip(9, 1, 1, tokoSkrip('a', 1, 'b', 1, 'c', 2));
	const lewatiDari = (L) => L.terkirim.filter((p) => p.aksi === 'lewati');

	it('batch Beli,Beli,Beli dijawab galat, state, state: tepat satu lewati, 2 s sesudah awal PERSIAPAN', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(BATCH3());
		expect(L.terkirim).toEqual([beli(0), beli(1), beli(2)]);
		L.p.terimaGalat('bangku penuh');
		L.p.terimaState(stateSkrip(8, 1, 1, tokoSkrip('', 0, '', 0, 'c', 2), bangku(1, 'b', 1)));
		L.p.terimaState(stateSkrip(6, 1, 1, tokoSkrip('', 0, '', 0, '', 0), bangku(1, 'b', 1), bangku(2, 'c', 1)));
		// Tidak ada keputusan baru (Taruh) sesudah galat.
		expect(L.terkirim).toHaveLength(3);
		L.maju(JEDA_LEWATI_MS - 1);
		expect(lewatiDari(L)).toHaveLength(0);
		L.maju(1);
		expect(lewatiDari(L)).toHaveLength(1);
		L.p.terimaState(stateSkrip(6, 1, 1, null));
		L.maju(10000);
		expect(lewatiDari(L)).toHaveLength(1);
		expect(L.timer.filter((t) => !t.batal)).toHaveLength(1);
	});

	it('batch Beli,Beli,Beli dijawab state, state, galat (galat jawaban terakhir): tepat satu lewati', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(BATCH3());
		L.p.terimaState(stateSkrip(8, 1, 1, tokoSkrip('', 0, 'b', 1, 'c', 2), bangku(1, 'a', 1)));
		L.p.terimaState(stateSkrip(7, 1, 1, tokoSkrip('', 0, '', 0, 'c', 2), bangku(1, 'a', 1), bangku(2, 'b', 1)));
		expect(L.terkirim).toHaveLength(3);
		L.p.terimaGalat('zeny kurang');
		expect(L.terkirim).toHaveLength(3);
		L.maju(JEDA_LEWATI_MS);
		expect(L.terkirim.slice(3)).toEqual([{ aksi: 'lewati', arg: {} }]);
		L.maju(10000);
		expect(lewatiDari(L)).toHaveLength(1);
	});

	it('kirim gagal di tengah batch: lewati menyusul jawaban terakhir perintah yang sudah terkirim', () => {
		const L = lingkungan({ gagal: (aksi, n) => aksi === 'beli' && n === 1 });
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(BATCH3());
		expect(L.terkirim).toEqual([beli(0)]);
		L.maju(JEDA_LEWATI_MS);
		// Jawaban Beli pertama belum tiba: belum lewati.
		expect(lewatiDari(L)).toHaveLength(0);
		L.p.terimaState(stateSkrip(8, 1, 1, tokoSkrip('', 0, 'b', 1, 'c', 2), bangku(1, 'a', 1)));
		L.maju(0);
		expect(L.terkirim).toEqual([beli(0), { aksi: 'lewati', arg: {} }]);
	});

	it('state tak diminta di luar batch tidak membuat penghitung jawaban negatif', () => {
		const L = lingkungan();
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		// Mati: state dan galat tetap tiba (mis. klik pemain sendiri).
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.p.terimaGalat('bangku penuh');
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.p.atur(true);
		// Hidup tanpa batch: state tanpa keputusan, dua kali.
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		expect(L.terkirim).toEqual([]);
		// Batch dua Beli: jawaban pertama TIDAK boleh memicu keputusan.
		L.p.terimaState(stateSkrip(9, 1, 1, tokoSkrip('a', 1, 'b', 1)));
		expect(L.terkirim).toEqual([beli(0), beli(1)]);
		L.p.terimaState(stateSkrip(8, 1, 1, tokoSkrip('', 0, 'b', 1), bangku(1, 'a', 1)));
		expect(L.terkirim).toHaveLength(2);
		L.p.terimaState(stateSkrip(7, 1, 1, tokoSkrip('', 0, '', 0), bangku(1, 'a', 1), bangku(2, 'b', 1)));
		expect(L.terkirim.slice(2)).toEqual([taruh(1, 3, 3)]);
	});

	it('dinyalakan di tengah ronde: jadwal lewati tetap dari awal PERSIAPAN, bukan saat dinyalakan', () => {
		const L = lingkungan();
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.maju(1500);
		const s = stateSkrip(0, 1, 1, null);
		L.p.atur(true, { state: s, fase: FASE.PERSIAPAN, ronde: 1 });
		L.maju(499);
		expect(lewatiDari(L)).toHaveLength(0);
		L.maju(1);
		expect(lewatiDari(L)).toHaveLength(1);
	});

	it('dimatikan lalu dinyalakan lagi di ronde yang sama: awal PERSIAPAN tidak bergeser', () => {
		const L = lingkungan();
		L.p.atur(true);
		L.p.terimaFase({ fase: FASE.PERSIAPAN, ronde: 1 });
		L.p.terimaState(stateSkrip(0, 1, 1, null));
		L.maju(1000);
		L.p.atur(false);
		L.maju(500);
		L.p.atur(true, { state: stateSkrip(0, 1, 1, null), fase: FASE.PERSIAPAN, ronde: 1 });
		L.maju(499);
		expect(lewatiDari(L)).toHaveLength(0);
		L.maju(1);
		expect(lewatiDari(L)).toHaveLength(1);
	});
});
