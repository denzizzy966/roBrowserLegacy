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
 * @returns {{fase:number, ronde:number, sisaMs:number, lawanKursi:number, jenis:number}|null}
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
		jenis:      angka(f.jenis)
	};
}

/**
 * Membaca EvtCaturHasil dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{ronde:number, menang:boolean, damageDiterima:number, zenyMasuk:number}|null}
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
		zenyMasuk:      angka(h.zenyMasuk)
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
