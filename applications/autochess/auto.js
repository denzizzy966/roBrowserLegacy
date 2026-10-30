/**
 * Pemain otomatis untuk soak browser (AC5 Task 4, keputusan R2).
 *
 * keputusanAuto adalah port JS PERSIS dari PerintahManusiaTerskrip di
 * server/internal/pertandingan/skrip.go: satu kebijakan, dua pemakai (test
 * aktor Go dan soak client). Doc comment fungsi Go itu adalah
 * spesifikasinya; test kedua port memakai tabel kasus yang sama
 * (penuh_test.go TestPerintahManusiaTerskrip dan auto.test.js), jadi
 * input yang sama memberi perintah yang sama.
 *
 * SATU PANGGILAN = SATU ATURAN: aturan pertama (1..6) yang berlaku
 * menentukan seluruh hasil; pemakai memanggil lagi dengan EvtCaturState
 * sesudah semua perintahnya dijawab, sampai hasilnya kosong.
 *
 *  1. Hanya di PERSIAPAN dan selama kursi sendiri hidup; selain itu [].
 *  2. TARUH: bidak bangku terkuat (★ turun, tier turun, bidakId naik) ke
 *     petak kosong pertama (baris 3,2,1,0; kolom 3,4,2,5,1,6,0,7) selama
 *     papan < kapasitas. Hasil: semua Taruh itu.
 *  3. BELI-GABUNG: slot terjangkau terkecil yang unitnya sudah punya
 *     TEPAT dua salinan 1★. Hasil: satu Beli.
 *  4. JUAL: bila bangku penuh, bidak bangku terlemah (tier naik, ★ naik,
 *     bidakId turun) bila ada slot terjangkau bertier lebih tinggi atau
 *     berunit sudah dimiliki (bukan unitnya sendiri). Hasil: satu Jual.
 *  5. BELI: selama bangku < Bangku, slot terjangkau terbaik (dimiliki
 *     dulu, lalu termurah, lalu slot terkecil); zeny dan bangku berjalan.
 *     Hasil: semua Beli itu.
 *  6. BELI EXP: level < LevelMaks dan zeny - HargaExp >= 10. Hasil: satu
 *     BeliExp.
 * Tidak pernah refresh, kunci, atau ke-bangku.
 *
 * buatPemainOtomatis adalah pengendali tipis di atasnya (jam dan kirim
 * disuntikkan, jadi teruji tanpa browser): menjalankan keputusan tiap
 * snapshot PERSIAPAN, menunggu semua jawaban sebelum memanggil lagi, dan
 * mengirim `lewati` JEDA_LEWATI_MS sesudah PERSIAPAN dimulai bila tidak
 * ada lagi yang perlu dilakukan.
 */

import { FASE } from './pesan.js';

/** Sisa zeny minimum sesudah BeliExp (aturan 6), cadanganExpSkrip di Go. */
export const CADANGAN_EXP = 10;

/** Urutan pindai petak kosong: depan ke belakang, tengah ke tepi. */
const BARIS_SKRIP = [3, 2, 1, 0];
const KOLOM_SKRIP = [3, 4, 2, 5, 1, 6, 0, 7];

/** Jeda dari awal PERSIAPAN sampai `lewati` dikirim (ms). */
export const JEDA_LEWATI_MS = 2000;

/**
 * Batas panggilan keputusan per PERSIAPAN. Rangkaian aturan selalu
 * berhenti (lihat skrip.go); batas ini hanya jaring pengaman bila server
 * menjawab di luar dugaan, supaya soak tidak berputar tanpa akhir.
 */
export const BATAS_PANGGILAN = 60;

/**
 * Menyusun angka aturan skrip dari katalog (padanan SkripAturanDari):
 * `ekonomi.bangku`, `ekonomi.beli_exp.harga`, `ekonomi.level_maks`, dan
 * `units[id].tier`.
 *
 * @param {object} katalog keluaran buatKatalog (katalog.js)
 * @returns {{bangku:number, hargaExp:number, levelMaks:number, tier:function(string):number}|null}
 *   null bila ekonomi katalog tidak lengkap (katalog gagal dimuat).
 */
export function aturanDariKatalog(katalog) {
	const e = katalog?.ekonomi ?? {};
	const bangku = e.bangku;
	const hargaExp = e.beli_exp?.harga;
	const levelMaks = e.level_maks;
	if (![bangku, hargaExp, levelMaks].every(Number.isFinite)) {
		return null;
	}
	return {
		bangku, hargaExp, levelMaks,
		// Unit tak dikenal bertier 0, sama dengan map Go yang tidak berisi kuncinya.
		tier: (unitId) => Number(katalog.unit(unitId)?.tier ?? 0)
	};
}

/**
 * Perintah kursi sendiri menurut kebijakan R2: hasil aturan pertama yang
 * berlaku, atau []. MURNI: tanpa acak, tanpa jam, dan tidak mengubah
 * state.
 *
 * @param {object|null} state hasil decodeCaturState (pesan.js)
 * @param {{bangku:number, hargaExp:number, levelMaks:number, tier:function(string):number}} aturan
 * @returns {Array<{aksi:string, arg:object}>} aksi sama dengan PENYANDI ui.js
 */
export function keputusanAuto(state, aturan) {
	// Aturan 1.
	if (!state || !state.saya || state.fase !== FASE.PERSIAPAN) {
		return [];
	}
	const saya = state.saya;
	if ((state.kursi ?? []).some((k) => k.kursi === saya.kursi && !k.hidup)) {
		return [];
	}

	const terisi = new Set();
	const salinan1 = new Map();
	const dimiliki = new Set();
	const bangku = [];
	let papan = 0;
	for (const b of saya.bidak ?? []) {
		dimiliki.add(b.unitId);
		if (b.bintang === 1) {
			salinan1.set(b.unitId, (salinan1.get(b.unitId) ?? 0) + 1);
		}
		if (b.diPapan) {
			papan++;
			terisi.add(`${b.kolom},${b.baris}`);
		} else {
			bangku.push(b);
		}
	}
	const tier = aturan.tier;

	// Aturan 2: bidak bangku terkuat dulu.
	const urut = [...bangku].sort((x, y) =>
		(y.bintang - x.bintang) || (tier(y.unitId) - tier(x.unitId)) || (x.bidakId - y.bidakId));
	const taruh = [];
	for (const b of urut) {
		if (papan >= saya.kapasitas) {
			break;
		}
		const p = petakKosong(terisi);
		if (!p) {
			break;
		}
		terisi.add(`${p.kolom},${p.baris}`);
		papan++;
		taruh.push({ aksi: 'taruh', arg: { bidakId: b.bidakId, kolom: p.kolom, baris: p.baris } });
	}
	if (taruh.length > 0) {
		return taruh;
	}

	const toko = saya.toko ?? [];
	const terjangkau = (t, zeny) => t.unitId !== '' && t.harga <= zeny;

	// Aturan 3: slot terkecil dipilih eksplisit, tidak bergantung pada
	// urutan toko di snapshot.
	let gabung = null;
	for (const t of toko) {
		if (terjangkau(t, saya.zeny) && salinan1.get(t.unitId) === 2 && (gabung === null || t.slot < gabung.slot)) {
			gabung = t;
		}
	}
	if (gabung) {
		return [{ aksi: 'beli', arg: { slot: gabung.slot } }];
	}

	// Aturan 4.
	if (bangku.length >= aturan.bangku) {
		let lemah = bangku[0];
		for (const b of bangku.slice(1)) {
			const tb = tier(b.unitId);
			const tl = tier(lemah.unitId);
			if (tb < tl || (tb === tl && (b.bintang < lemah.bintang ||
				(b.bintang === lemah.bintang && b.bidakId > lemah.bidakId)))) {
				lemah = b;
			}
		}
		const berguna = toko.some((t) => terjangkau(t, saya.zeny) &&
			(tier(t.unitId) > tier(lemah.unitId) || (dimiliki.has(t.unitId) && t.unitId !== lemah.unitId)));
		if (berguna) {
			return [{ aksi: 'jual', arg: { bidakId: lemah.bidakId } }];
		}
	}

	// Aturan 5.
	const beli = [];
	let zeny = saya.zeny;
	let isi = bangku.length;
	const dibeli = new Set();
	while (isi < aturan.bangku) {
		let pilih = null;
		for (const t of toko) {
			if (!terjangkau(t, zeny) || dibeli.has(t.slot)) {
				continue;
			}
			if (pilih === null || lebihBaik(t, pilih, dimiliki)) {
				pilih = t;
			}
		}
		if (pilih === null) {
			break;
		}
		dibeli.add(pilih.slot);
		zeny -= pilih.harga;
		isi++;
		beli.push({ aksi: 'beli', arg: { slot: pilih.slot } });
	}
	if (beli.length > 0) {
		return beli;
	}

	// Aturan 6.
	if (saya.level < aturan.levelMaks && saya.zeny - aturan.hargaExp >= CADANGAN_EXP) {
		return [{ aksi: 'beli-exp', arg: {} }];
	}
	return [];
}

/** Petak kosong pertama dalam urutan pindai, atau null. */
function petakKosong(terisi) {
	for (const baris of BARIS_SKRIP) {
		for (const kolom of KOLOM_SKRIP) {
			if (!terisi.has(`${kolom},${baris}`)) {
				return { kolom, baris };
			}
		}
	}
	return null;
}

/** Urutan slot aturan 5: dimiliki dulu, lalu termurah, lalu slot terkecil. */
function lebihBaik(t, u, dimiliki) {
	const dt = dimiliki.has(t.unitId);
	const du = dimiliki.has(u.unitId);
	if (dt !== du) {
		return dt;
	}
	if (t.harga !== u.harga) {
		return t.harga < u.harga;
	}
	return t.slot < u.slot;
}

/**
 * Pengendali pemain otomatis. Setiap perintah yang terkirim menunggu
 * tepat satu jawaban (EvtCaturState untuk yang diterima, EvtError untuk
 * yang ditolak -- lihat aktor.go tangani); keputusan berikutnya baru
 * diambil sesudah semua jawaban tiba. EvtError (atau kirim yang gagal)
 * menghentikan keputusan di PERSIAPAN itu (dicatat, tidak diulang); begitu
 * jawaban terakhir batch yang sedang terbang tiba, `lewati` dijadwalkan
 * seperti biasa (sekali per ronde, JEDA_LEWATI_MS sesudah awal PERSIAPAN).
 *
 * Awal PERSIAPAN dicatat walau pemain otomatis mati, jadi menyalakannya di
 * tengah ronde tidak menggeser jadwal `lewati`.
 *
 * @param {object} d
 * @param {function(string, object): boolean} d.kirim kirim(aksi, arg) main.js
 * @param {function(): object|null} d.aturan aturanDariKatalog terkini
 * @param {function(): number} d.sekarang jam ms (performance.now)
 * @param {function(function(): void, number): any} d.jadwalkan setTimeout
 * @param {function(any): void} d.batalkan clearTimeout
 * @param {function(string): void} [d.log]
 * @param {number} [d.jedaLewatiMs]
 */
export function buatPemainOtomatis({ kirim, aturan, sekarang, jadwalkan, batalkan, log = () => {}, jedaLewatiMs = JEDA_LEWATI_MS }) {
	let aktif = false;
	let perintahDikirim = 0;
	// Ronde PERSIAPAN yang sedang berjalan; null di luar PERSIAPAN.
	let ronde = null;
	// Ronde PERSIAPAN terakhir yang dimulai (untuk status), 0 = belum ada.
	let rondeTerakhir = 0;
	let mulai = 0;
	let menunggu = 0;
	let panggilan = 0;
	let berhenti = false;
	let lewatiTerkirim = false;
	let timer = null;

	function batalTimer() {
		if (timer !== null) {
			batalkan(timer);
			timer = null;
		}
	}

	function akhiriRonde() {
		batalTimer();
		ronde = null;
		menunggu = 0;
	}

	/**
	 * Satu jawaban (state atau galat) untuk batch yang sedang terbang.
	 * Hanya mengurangi selama ada perintah yang menunggu, tidak pernah di
	 * bawah 0: state tak diminta di luar batch (mis. awal PERSIAPAN) tidak
	 * mengubah apa pun.
	 */
	function terimaJawaban() {
		if (menunggu > 0) {
			menunggu--;
		}
	}

	function mulaiRonde(r) {
		batalTimer();
		ronde = r;
		rondeTerakhir = r;
		mulai = sekarang();
		menunggu = 0;
		panggilan = 0;
		berhenti = false;
		lewatiTerkirim = false;
	}

	function jadwalLewati() {
		if (timer !== null || lewatiTerkirim || ronde === null) {
			return;
		}
		const r = ronde;
		timer = jadwalkan(() => {
			timer = null;
			if (!aktif || ronde !== r || lewatiTerkirim) {
				return;
			}
			lewatiTerkirim = true;
			if (kirim('lewati', {})) {
				perintahDikirim++;
			}
		}, Math.max(0, mulai + jedaLewatiMs - sekarang()));
	}

	function langkah(state) {
		if (lewatiTerkirim) {
			return;
		}
		if (berhenti) {
			// Keputusan ronde ini sudah dihentikan (galat, kirim gagal, atau
			// batas): sisa batch sudah dijawab, jadi lewati menyusul.
			jadwalLewati();
			return;
		}
		const a = aturan();
		if (!a) {
			log('! auto: katalog tanpa ekonomi -- hanya lewati');
			berhenti = true;
			jadwalLewati();
			return;
		}
		if (panggilan >= BATAS_PANGGILAN) {
			log(`! auto: ${BATAS_PANGGILAN} keputusan di ronde ${ronde} -- berhenti, lewati`);
			berhenti = true;
			jadwalLewati();
			return;
		}
		panggilan++;
		const perintah = keputusanAuto(state, a);
		if (perintah.length === 0) {
			jadwalLewati();
			return;
		}
		for (const { aksi, arg } of perintah) {
			if (!kirim(aksi, arg)) {
				berhenti = true;
				break;
			}
			menunggu++;
			perintahDikirim++;
		}
		if (berhenti && menunggu === 0) {
			jadwalLewati();
		}
	}

	return {
		/**
		 * Menyalakan/mematikan. Saat dinyalakan di tengah PERSIAPAN,
		 * keputusan langsung diambil dari snapshot terakhir.
		 * @param {boolean} nyala
		 * @param {{state: object|null, fase: number, ronde: number}} [snap] st.ambil()
		 */
		atur(nyala, snap) {
			aktif = Boolean(nyala);
			if (!aktif) {
				// Ronde dan awal PERSIAPAN tetap dicatat; hanya timer dibatalkan.
				batalTimer();
				return;
			}
			if (snap?.state && snap.fase === FASE.PERSIAPAN && snap.state.fase === FASE.PERSIAPAN) {
				// Awal PERSIAPAN yang sudah tercatat (EvtCaturFase) dipakai;
				// hanya ronde yang belum pernah terlihat dimulai dari sekarang.
				if (ronde !== snap.ronde) {
					mulaiRonde(snap.ronde);
				}
				if (menunggu === 0) {
					langkah(snap.state);
				}
			}
		},

		/** EvtCaturFase: PERSIAPAN memulai ronde baru, fase lain mengakhirinya. */
		terimaFase(fase) {
			if (fase.fase === FASE.PERSIAPAN) {
				mulaiRonde(fase.ronde);
			} else {
				akhiriRonde();
			}
		},

		/** EvtCaturState (sesudah st.terima). */
		terimaState(state) {
			terimaJawaban();
			if (state.fase !== FASE.PERSIAPAN) {
				return;
			}
			if (ronde !== state.ronde) {
				mulaiRonde(state.ronde);
			}
			if (!aktif || menunggu > 0) {
				return;
			}
			langkah(state);
		},

		/** EvtError: dicatat, keputusan ronde ini berhenti, lalu lewati. */
		terimaGalat(pesan) {
			terimaJawaban();
			if (!aktif || ronde === null) {
				return;
			}
			if (!berhenti) {
				log(`! auto: server menolak (${pesan}) -- keputusan ronde ${ronde} dihentikan`);
			}
			berhenti = true;
			if (menunggu === 0) {
				jadwalLewati();
			}
		},

		/** EvtCaturSelesai: tidak ada PERSIAPAN lagi. */
		terimaSelesai() {
			akhiriRonde();
		},

		/** @returns {{aktif:boolean, ronde:number, perintahDikirim:number}} ronde = PERSIAPAN terakhir */
		status() {
			return { aktif, ronde: rondeTerakhir, perintahDikirim };
		}
	};
}
