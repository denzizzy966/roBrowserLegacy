/**
 * Logika murni untuk pesan autochess. Dipisahkan dari main.js supaya dapat
 * diuji tanpa WebGL, tanpa GRF, dan tanpa server yang berjalan.
 *
 * protobufjs menghilangkan field bernilai nol dari kawat, dan field yang
 * absen terbaca sebagai undefined -- Number(undefined) adalah NaN, bukan
 * nol. Karena itu setiap angka di sini dinormalkan dengan Number(x ?? 0).
 */

import { encodeSatuField } from '../harness/tempur.js';
import { decodeSpawn } from '../harness/mapinfo.js';

/**
 * Fase ronde, sama dengan enum FaseCatur di proto/ro.proto. Nilai 0
 * (TIDAK_DIKENAL) sengaja tidak punya nama: ia hanya tiba karena bug.
 */
export const FASE = { PERSIAPAN: 1, TEMPUR: 2, HASIL: 3 };

/**
 * Efek status ailment, sama dengan enum EfekStatus di proto/ro.proto. Nilai 0
 * (TIDAK_DIKENAL) sengaja tidak punya nama: ia hanya tiba karena bug.
 */
export const EFEK_STATUS = {
	BEKU:    1,
	PINGSAN: 2,
	TIDUR:   3,
	RACUN:   4,
	BUTA:    5,
	BISU:    6
};

/**
 * Nilai jenis damage pemulihan HP, sama dengan JENIS_DAMAGE_HEAL di ro.proto.
 */
export const JENIS_DAMAGE_HEAL = 4;

function angka(x) {
	return Number(x ?? 0);
}

/**
 * Membangun ClientMsg berisi CmdCaturMasuk.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {number} seed - 0 berarti server yang memilih seed
 * @returns {ArrayBuffer}
 */
export function encodeCaturMasuk(ClientMsg, seed) {
	return encodeSatuField(ClientMsg, 'caturMasuk', { seed });
}

/**
 * Membangun ClientMsg berisi CmdCaturSiap: map dari EvtMapInfo terakhir
 * sudah tergambar, pertempuran boleh dimulai.
 *
 * Pesannya kosong, tetapi oneof-nya tetap TERKIRIM: protobufjs menulis
 * field pesan yang disetel walau isinya kosong (tag + panjang 0), jadi
 * server melihat caturSiap, bukan body kosong. Test round-trip-nya
 * menjaga hal ini.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @returns {ArrayBuffer}
 */
export function encodeCaturSiap(ClientMsg) {
	return encodeSatuField(ClientMsg, 'caturSiap', {});
}

/**
 * Membangun ClientMsg berisi CmdCaturBeli: beli unit di slot toko.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {number} slot - indeks slot toko
 * @returns {ArrayBuffer}
 */
export function encodeCaturBeli(ClientMsg, slot) {
	return encodeSatuField(ClientMsg, 'caturBeli', { slot });
}

/**
 * Membangun ClientMsg berisi CmdCaturJual: jual bidak.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {number} bidakId
 * @returns {ArrayBuffer}
 */
export function encodeCaturJual(ClientMsg, bidakId) {
	return encodeSatuField(ClientMsg, 'caturJual', { bidakId });
}

/**
 * Membangun ClientMsg berisi CmdCaturRefresh: kocok ulang toko.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @returns {ArrayBuffer}
 */
export function encodeCaturRefresh(ClientMsg) {
	return encodeSatuField(ClientMsg, 'caturRefresh', {});
}

/**
 * Membangun ClientMsg berisi CmdCaturKunci. Bool eksplisit, bukan toggle,
 * supaya pesan yang hilang atau diulang tidak membalik keadaan.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {boolean} kunci
 * @returns {ArrayBuffer}
 */
export function encodeCaturKunci(ClientMsg, kunci) {
	return encodeSatuField(ClientMsg, 'caturKunci', { kunci });
}

/**
 * Membangun ClientMsg berisi CmdCaturBeliExp: beli EXP dengan Zeny.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @returns {ArrayBuffer}
 */
export function encodeCaturBeliExp(ClientMsg) {
	return encodeSatuField(ClientMsg, 'caturBeliExp', {});
}

/**
 * Membangun ClientMsg berisi CmdCaturTaruh: taruh bidak ke petak papan.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {number} bidakId
 * @param {number} kolom
 * @param {number} baris
 * @returns {ArrayBuffer}
 */
export function encodeCaturTaruh(ClientMsg, bidakId, kolom, baris) {
	return encodeSatuField(ClientMsg, 'caturTaruh', { bidakId, kolom, baris });
}

/**
 * Membangun ClientMsg berisi CmdCaturKeBangku: tarik bidak dari papan.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {number} bidakId
 * @returns {ArrayBuffer}
 */
export function encodeCaturKeBangku(ClientMsg, bidakId) {
	return encodeSatuField(ClientMsg, 'caturKeBangku', { bidakId });
}

/**
 * Membangun ClientMsg berisi CmdCaturKeluar: tinggalkan pertandingan.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @returns {ArrayBuffer}
 */
export function encodeCaturKeluar(ClientMsg) {
	return encodeSatuField(ClientMsg, 'caturKeluar', {});
}

/**
 * Membangun ClientMsg berisi CmdCaturLewati: lewati sisa timer persiapan.
 * Bukan caturSiap (kesiapan render).
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @returns {ArrayBuffer}
 */
export function encodeCaturLewati(ClientMsg) {
	return encodeSatuField(ClientMsg, 'caturLewati', {});
}

/**
 * Membaca EvtSpawn beserta field autochess (8-13).
 *
 * EvtSpawn dari zone MMO tidak menyetel satu pun field baru; hasilnya
 * tetap lengkap dengan nilai bawaan yang bermakna nol (lihat ro.proto).
 * tampilan null membedakan "bukan PC / tidak dikirim" dari PC perempuan
 * (sex 0). Di dalam tampilan setiap angka dijamin terdefinisi, karena
 * renderer meneruskan sex/senjata/perisai apa adanya.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number, x:number, y:number, type:number, job:number,
 *   hp:number, maxHp:number, tim:number, sp:number, maxSp:number,
 *   bintang:number, nama:string,
 *   tampilan:{sex:number, kepala:number, warnaRambut:number, senjata:number, perisai:number}|null}|null}
 */
export function decodeSpawnLengkap(msg) {
	const dasar = decodeSpawn(msg);
	if (!dasar) {
		return null;
	}
	const s = msg.spawn;
	const t = s.tampilan;
	return {
		...dasar,
		tim:     angka(s.tim),
		sp:      angka(s.sp),
		maxSp:   angka(s.maxSp),
		bintang: angka(s.bintang),
		nama:    s.nama || '',
		tampilan: t ? {
			sex:         angka(t.sex),
			kepala:      angka(t.kepala),
			warnaRambut: angka(t.warnaRambut),
			senjata:     angka(t.senjata),
			perisai:     angka(t.perisai)
		} : null
	};
}

/**
 * Membaca EvtCaturFase dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{fase:number, ronde:number, sisaMs:number, lawanKursi:number, jenis:number, salinan:boolean}|null}
 */
export function decodeCaturFase(msg) {
	const f = msg && msg.caturFase;
	if (!f) {
		return null;
	}
	return {
		fase:       angka(f.fase),
		ronde:      angka(f.ronde),
		// Durasi tersisa, bukan tenggat absolut (lihat ro.proto).
		sisaMs:     angka(f.sisaMs),
		// Tidak bermakna saat jenis CREEP.
		lawanKursi: angka(f.lawanKursi),
		jenis:      angka(f.jenis),
		// Lawan adalah salinan papan kursi lain; kursi itu tidak terluka.
		salinan:    Boolean(f.salinan)
	};
}

/**
 * Membaca EvtCaturHasil dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{ronde:number, menang:boolean, damageDiterima:number, zenyMasuk:number, seri:boolean}|null}
 */
export function decodeCaturHasil(msg) {
	const h = msg && msg.caturHasil;
	if (!h) {
		return null;
	}
	return {
		ronde:          angka(h.ronde),
		// false juga hilang dari kawat; tiba sebagai undefined.
		menang:         Boolean(h.menang),
		damageDiterima: angka(h.damageDiterima),
		zenyMasuk:      angka(h.zenyMasuk),
		// Habis waktu tanpa pemenang; bukan kekalahan.
		seri:           Boolean(h.seri)
	};
}

/**
 * Membaca EvtCaturState (snapshot penuh sisi pemain) dari sebuah ServerMsg.
 * Daftar selalu array walau kosong (proto3 membuang repeated kosong dari
 * kawat); unitId slot toko kosong tiba sebagai ''.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{ronde:number, fase:number, sisaMs:number, kursi:object[], saya:object}|null}
 */
export function decodeCaturState(msg) {
	const b = msg && msg.caturState;
	if (!b) {
		return null;
	}
	const s = b.saya || {};
	return {
		ronde:  angka(b.ronde),
		fase:   angka(b.fase),
		// Durasi tersisa, bukan tenggat absolut.
		sisaMs: angka(b.sisaMs),
		kursi:  (b.kursi || []).map((k) => ({
			kursi:  angka(k.kursi),
			nama:   k.nama || '',
			hp:     angka(k.hp),
			level:  angka(k.level),
			bot:    Boolean(k.bot),
			hidup:  Boolean(k.hidup),
			streak: angka(k.streak)
		})),
		saya: {
			kursi:      angka(s.kursi),
			zeny:       angka(s.zeny),
			exp:        angka(s.exp),
			expBerikut: angka(s.expBerikut),
			level:      angka(s.level),
			kapasitas:  angka(s.kapasitas),
			kunci:      Boolean(s.kunci),
			toko:       (s.toko || []).map((t) => ({
				slot:   angka(t.slot),
				// '' = slot kosong.
				unitId: t.unitId || '',
				harga:  angka(t.harga)
			})),
			bidak:      (s.bidak || []).map((d) => ({
				bidakId:  angka(d.bidakId),
				unitId:   d.unitId || '',
				bintang:  angka(d.bintang),
				diPapan:  Boolean(d.diPapan),
				kolom:    angka(d.kolom),
				baris:    angka(d.baris),
				// 0 = tidak ada entity di arena untuk bidak ini: di
				// bangku, atau di papan selama TEMPUR/HASIL (entity
				// PERSIAPAN sudah dilepas), atau spawn-nya ditolak.
				entityId: angka(d.entityId)
			})),
			sinergi:    (s.sinergi || []).map((n) => ({
				id:           n.id || '',
				jumlah:       angka(n.jumlah),
				tingkatAktif: angka(n.tingkatAktif),
				origin:       Boolean(n.origin)
			})),
			peluang:    (s.peluang || []).map((p) => ({
				tier:   angka(p.tier),
				persen: angka(p.persen)
			}))
		}
	};
}

/**
 * Membaca EvtCaturSelesai dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{peringkat:number[], peringkatSaya:number}|null}
 */
export function decodeCaturSelesai(msg) {
	const b = msg && msg.caturSelesai;
	if (!b) {
		return null;
	}
	return {
		peringkat:     (b.peringkat || []).map(angka),
		peringkatSaya: angka(b.peringkatSaya)
	};
}

/**
 * Membaca EvtSkillMulai dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{src:number, skid:number, lv:number, dst:number, x:number, y:number, castMs:number}|null}
 */
export function decodeSkillMulai(msg) {
	const m = msg && msg.skillMulai;
	if (!m) {
		return null;
	}
	return {
		src:    angka(m.src),
		skid:   angka(m.skid),
		lv:     angka(m.lv),
		dst:    angka(m.dst),
		x:      angka(m.x),
		y:      angka(m.y),
		castMs: angka(m.castMs)
	};
}

/**
 * Membaca EvtSkillKena dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{src:number, skid:number, lv:number, x:number, y:number,
 *   kena:Array<{dst:number, amount:number, hpSisa:number, jenis:number}>}|null}
 */
export function decodeSkillKena(msg) {
	const m = msg && msg.skillKena;
	if (!m) {
		return null;
	}
	return {
		src:  angka(m.src),
		skid: angka(m.skid),
		lv:   angka(m.lv),
		x:    angka(m.x),
		y:    angka(m.y),
		kena: (m.kena || []).map((k) => ({
			dst:    angka(k.dst),
			amount: angka(k.amount),
			hpSisa: angka(k.hpSisa),
			jenis:  angka(k.jenis)
		}))
	};
}

/**
 * Membaca EvtStatus dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number, efst:number, aktif:boolean, durasiMs:number}|null}
 */
export function decodeStatus(msg) {
	const s = msg && msg.status;
	if (!s) {
		return null;
	}
	return {
		entityId: angka(s.entityId),
		efst:     angka(s.efst),
		// false juga hilang dari kawat; tiba sebagai undefined.
		aktif:    Boolean(s.aktif),
		durasiMs: angka(s.durasiMs)
	};
}

/**
 * Membaca EvtSP dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number, sp:number, maxSp:number}|null}
 */
export function decodeSP(msg) {
	const s = msg && msg.sp;
	if (!s) {
		return null;
	}
	return {
		entityId: angka(s.entityId),
		sp:       angka(s.sp),
		maxSp:    angka(s.maxSp)
	};
}

/**
 * Membungkus badan sebuah handler pesan (termasuk callback antrean.jalankan)
 * agar lemparannya dicatat sebagai galat RENDERING, bukan galat skema.
 *
 * Dibungkus per callback, bukan sekali di sekeliling antrean: pesan yang
 * tertahan dikuras berurutan di dalam onLoad, dan satu lemparan tanpa
 * bungkus ini akan membuang semua pesan di belakangnya.
 *
 * @param {function(): void} fn
 * @param {function(string): void} log
 * @returns {function(): void}
 */
export function amankan(fn, log) {
	return function () {
		try {
			fn();
		} catch (err) {
			log(`! galat saat menjalankan pesan: ${err.message}`);
			console.error(err);
		}
	};
}

/**
 * Membuat penerima frame server dengan DUA penanganan galat terpisah.
 *
 * Sebelum AC2 satu try/catch membungkus decode DAN handler, sehingga
 * setiap galat rendering (mis. entity.cast yang tak ada) dilaporkan
 * sebagai "skema client dan server berbeda" -- arahan yang salah.
 * Sekarang hanya galat dekode yang menyebut skema.
 *
 * @param {object} d
 * @param {function(ArrayBuffer): any} d.dekode  melempar bila frame rusak
 * @param {function(any, ArrayBuffer): void} d.tangani  dispatch handler
 * @param {function(string): void} d.log
 * @returns {function(ArrayBuffer): void}
 */
export function buatPenerima({ dekode, tangani, log }) {
	return function terimaPesan(data) {
		let pesan;
		try {
			pesan = dekode(data);
		} catch (err) {
			log(`! frame tidak dapat didekode (${data.byteLength} byte): ${err.message}`);
			log('! kemungkinan skema client dan server berbeda — coba hard reload (Ctrl+Shift+R)');
			return;
		}
		amankan(() => tangani(pesan, data), log)();
	};
}
