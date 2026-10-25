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
