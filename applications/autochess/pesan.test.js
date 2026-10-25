import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	FASE,
	EFEK_STATUS,
	JENIS_DAMAGE_HEAL,
	encodeCaturMasuk,
	encodeCaturSiap,
	decodeSpawnLengkap,
	decodeCaturFase,
	decodeCaturHasil,
	decodeSkillMulai,
	decodeSkillKena,
	decodeStatus,
	decodeSP
} from './pesan.js';

// Membaca skema yang SAMA dengan yang dipakai server. Menyalin isi ro.proto
// ke dalam test akan membuatnya tetap lulus walau skema aslinya berubah.
const HERE        = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../../proto/ro.proto');

function types() {
	const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
	return {
		ClientMsg: root.lookupType('ro.v1.ClientMsg'),
		ServerMsg: root.lookupType('ro.v1.ServerMsg')
	};
}

function toArrayBuffer(u8) {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

// Menyandikan lalu mendekode lewat kawat, supaya test melihat persis apa
// yang dilihat client: field bernilai nol HILANG dari kawat, bukan nol.
function lewatKawat(ServerMsg, isi) {
	const raw = ServerMsg.encode(ServerMsg.create(isi)).finish();
	return ServerMsg.decode(new Uint8Array(toArrayBuffer(raw)));
}

describe('encodeCaturMasuk', () => {
	it('encodeCaturMasuk membawa seed', () => {
		const { ClientMsg } = types();

		const buf = encodeCaturMasuk(ClientMsg, 7);
		expect(buf).toBeInstanceOf(ArrayBuffer);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.caturMasuk).toBeTruthy();
		// uint64 tiba sebagai objek mirip Long; Number() menyamakannya.
		expect(Number(decoded.caturMasuk.seed)).toBe(7);
	});
});

describe('encodeCaturSiap', () => {
	it('encodeCaturSiap tiba sebagai caturSiap, bukan body kosong', () => {
		const { ClientMsg } = types();

		const buf = encodeCaturSiap(ClientMsg);
		expect(buf).toBeInstanceOf(ArrayBuffer);
		// Tag field 18 (wire type 2) plus panjang 0: tiga byte. Body
		// kosong akan nol byte dan server membalasnya "tanpa body".
		expect(buf.byteLength).toBe(3);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.body).toBe('caturSiap');
		expect(decoded.caturSiap).toBeTruthy();
		expect(decoded.caturMasuk).toBeFalsy();
	});
});

describe('decodeSpawnLengkap', () => {
	it('decodeSpawnLengkap membaca tampilan, tim, nama', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			spawn: {
				entityId: 5, x: 43, y: 42, type: 1, job: 9, hp: 80, maxHp: 100,
				tim: 1,
				tampilan: { sex: 1, kepala: 1, senjata: 10 },
				sp: 30, maxSp: 90, bintang: 2, nama: 'Wizard'
			}
		});

		// toEqual, bukan toMatchObject: field yang dibuang dekoder harus
		// gagal di sini. warnaRambut dan perisai tidak dikirim (nol), dan
		// harus tiba sebagai 0 -- renderer meneruskannya apa adanya.
		expect(decodeSpawnLengkap(msg)).toEqual({
			entityId: 5, x: 43, y: 42, type: 1, job: 9, hp: 80, maxHp: 100,
			tim: 1, sp: 30, maxSp: 90, bintang: 2, nama: 'Wizard',
			tampilan: { sex: 1, kepala: 1, warnaRambut: 0, senjata: 10, perisai: 0 }
		});
	});

	it('decodeSpawnLengkap tanpa field baru memberi nilai bawaan', () => {
		const { ServerMsg } = types();
		// EvtSpawn gaya MMO: tidak satu pun field 8-13 disetel.
		const msg = lewatKawat(ServerMsg, {
			spawn: { entityId: 9, x: 10, y: 11, type: 2, job: 1002, hp: 50, maxHp: 50 }
		});

		expect(decodeSpawnLengkap(msg)).toEqual({
			entityId: 9, x: 10, y: 11, type: 2, job: 1002, hp: 50, maxHp: 50,
			tim: 0, sp: 0, maxSp: 0, bintang: 0, nama: '', tampilan: null
		});
	});
});

describe('decodeCaturFase dan decodeCaturHasil', () => {
	it('decodeCaturFase dan decodeCaturHasil', () => {
		const { ServerMsg } = types();

		const fase = lewatKawat(ServerMsg, {
			caturFase: { fase: 2, ronde: 1, sisaMs: 60000, jenis: 1 }
		});
		// lawanKursi tidak dikirim (CREEP) dan harus tiba sebagai 0.
		expect(decodeCaturFase(fase)).toEqual({
			fase: FASE.TEMPUR, ronde: 1, sisaMs: 60000, lawanKursi: 0, jenis: 1
		});

		const hasil = lewatKawat(ServerMsg, {
			caturHasil: { ronde: 1, menang: true, damageDiterima: 0, zenyMasuk: 5 }
		});
		expect(decodeCaturHasil(hasil)).toEqual({
			ronde: 1, menang: true, damageDiterima: 0, zenyMasuk: 5
		});

		// Kalah: menang=false hilang dari kawat dan harus tiba sebagai
		// false, bukan undefined.
		const kalah = lewatKawat(ServerMsg, {
			caturHasil: { ronde: 2, damageDiterima: 7 }
		});
		expect(decodeCaturHasil(kalah)).toEqual({
			ronde: 2, menang: false, damageDiterima: 7, zenyMasuk: 0
		});
	});

	it('decodeCaturFase mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const spawn = lewatKawat(ServerMsg, { spawn: { entityId: 1 } });

		expect(decodeCaturFase(spawn)).toBeNull();
		expect(decodeCaturHasil(spawn)).toBeNull();
		expect(decodeSpawnLengkap(lewatKawat(ServerMsg, { caturFase: { fase: 1 } }))).toBeNull();
	});
});

describe('FASE', () => {
	it('sama dengan enum FaseCatur di ro.proto', () => {
		const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
		const e = root.lookupEnum('ro.v1.FaseCatur').values;
		expect(FASE).toEqual({
			PERSIAPAN: e.FASE_CATUR_PERSIAPAN,
			TEMPUR:    e.FASE_CATUR_TEMPUR,
			HASIL:     e.FASE_CATUR_HASIL
		});
	});
});

describe('decodeSkillMulai', () => {
	it('decodeSkillMulai membaca src, skid, lv, dst, x, y, castMs', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			skillMulai: {
				src: 1, skid: 89, lv: 10, dst: 4, x: 50, y: 49, castMs: 7800
			}
		});

		expect(decodeSkillMulai(msg)).toEqual({
			src: 1, skid: 89, lv: 10, dst: 4, x: 50, y: 49, castMs: 7800
		});
	});

	it('decodeSkillMulai menormalkan field yang absen/nol', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			skillMulai: { src: 1, skid: 5, lv: 1 }
		});

		expect(decodeSkillMulai(msg)).toEqual({
			src: 1, skid: 5, lv: 1, dst: 0, x: 0, y: 0, castMs: 0
		});
	});

	it('decodeSkillMulai mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const spawn = lewatKawat(ServerMsg, { spawn: { entityId: 1 } });
		expect(decodeSkillMulai(spawn)).toBeNull();
	});
});

describe('decodeSkillKena', () => {
	it('decodeSkillKena membaca src, skid, lv, x, y, dan daftar kena', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			skillKena: {
				src: 1, skid: 89, lv: 10, x: 50, y: 49,
				kena: [
					{ dst: 4, amount: 350, hpSisa: 150, jenis: 1 },
					{ dst: 5, amount: 200, hpSisa: 0, jenis: 3 }
				]
			}
		});

		expect(decodeSkillKena(msg)).toEqual({
			src: 1, skid: 89, lv: 10, x: 50, y: 49,
			kena: [
				{ dst: 4, amount: 350, hpSisa: 150, jenis: 1 },
				{ dst: 5, amount: 200, hpSisa: 0, jenis: 3 }
			]
		});
	});

	it('decodeSkillKena dengan kena kosong menghasilkan array kosong', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			skillKena: { src: 1, skid: 89, lv: 10, x: 50, y: 49 }
		});

		expect(decodeSkillKena(msg)).toEqual({
			src: 1, skid: 89, lv: 10, x: 50, y: 49, kena: []
		});
	});

	it('decodeSkillKena mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const spawn = lewatKawat(ServerMsg, { spawn: { entityId: 1 } });
		expect(decodeSkillKena(spawn)).toBeNull();
	});
});

describe('decodeStatus', () => {
	it('decodeStatus membaca entityId, efst, aktif, durasiMs', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			status: {
				entityId: 4,
				efst: EFEK_STATUS.BEKU,
				aktif: true,
				durasiMs: 3000
			}
		});

		expect(decodeStatus(msg)).toEqual({
			entityId: 4, efst: 1, aktif: true, durasiMs: 3000
		});
	});

	it('decodeStatus menangani nilai 0 dan aktif: false yang hilang dari kawat', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			status: { entityId: 4, efst: EFEK_STATUS.BEKU }
		});

		expect(decodeStatus(msg)).toEqual({
			entityId: 4, efst: 1, aktif: false, durasiMs: 0
		});
	});

	it('decodeStatus mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const spawn = lewatKawat(ServerMsg, { spawn: { entityId: 1 } });
		expect(decodeStatus(spawn)).toBeNull();
	});
});

describe('decodeSP', () => {
	it('decodeSP membaca entityId, sp, maxSp', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			sp: { entityId: 1, sp: 40, maxSp: 90 }
		});

		expect(decodeSP(msg)).toEqual({
			entityId: 1, sp: 40, maxSp: 90
		});
	});

	it('decodeSP menangani sp 0 yang hilang dari kawat', () => {
		const { ServerMsg } = types();
		const msg = lewatKawat(ServerMsg, {
			sp: { entityId: 1, maxSp: 90 }
		});

		expect(decodeSP(msg)).toEqual({
			entityId: 1, sp: 0, maxSp: 90
		});
	});

	it('decodeSP mengembalikan null untuk pesan lain', () => {
		const { ServerMsg } = types();
		const spawn = lewatKawat(ServerMsg, { spawn: { entityId: 1 } });
		expect(decodeSP(spawn)).toBeNull();
	});
});

describe('EFEK_STATUS dan JENIS_DAMAGE_HEAL', () => {
	it('EFEK_STATUS sama dengan enum EfekStatus di ro.proto', () => {
		const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
		const e = root.lookupEnum('ro.v1.EfekStatus').values;
		expect(EFEK_STATUS).toEqual({
			BEKU:    e.EFEK_STATUS_BEKU,
			PINGSAN: e.EFEK_STATUS_PINGSAN,
			TIDUR:   e.EFEK_STATUS_TIDUR,
			RACUN:   e.EFEK_STATUS_RACUN,
			BUTA:    e.EFEK_STATUS_BUTA,
			BISU:    e.EFEK_STATUS_BISU
		});
	});

	it('JENIS_DAMAGE_HEAL sama dengan nilai JENIS_DAMAGE_HEAL di ro.proto', () => {
		const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
		const e = root.lookupEnum('ro.v1.JenisDamage').values;
		expect(JENIS_DAMAGE_HEAL).toBe(e.JENIS_DAMAGE_HEAL);
	});
});
