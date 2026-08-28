/**
 * Logika murni untuk pesan map. Dipisahkan dari main.js supaya dapat diuji
 * tanpa WebGL, tanpa GRF, dan tanpa server yang berjalan.
 */

/**
 * MapRenderer.setMap menuntut nama berkas .rsw, sedangkan server mengirim
 * nama map polos ("geffen").
 */
export function rswFileName(mapName) {
	if (!mapName) {
		throw new Error('nama map kosong');
	}
	return mapName.endsWith('.rsw') ? mapName : `${mapName}.rsw`;
}

function toArrayBuffer(u8) {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export function encodeEnterMap(ClientMsg, mapName) {
	const msg = ClientMsg.create({ enterMap: { mapName } });
	return toArrayBuffer(ClientMsg.encode(msg).finish());
}

export function decodeMapInfo(ServerMsg, arrayBuffer) {
	const msg = ServerMsg.decode(new Uint8Array(arrayBuffer));
	if (!msg.mapInfo) {
		return null;
	}
	return {
		mapName: msg.mapInfo.mapName,
		xs:      Number(msg.mapInfo.xs),
		ys:      Number(msg.mapInfo.ys),
		spawnX:  Number(msg.mapInfo.spawnX),
		spawnY:  Number(msg.mapInfo.spawnY)
	};
}

export function decodeServerError(ServerMsg, arrayBuffer) {
	const msg = ServerMsg.decode(new Uint8Array(arrayBuffer));
	return msg.error ? msg.error.reason : null;
}

/**
 * Memeriksa bahwa gambaran server tentang sebuah map cocok dengan GRF pemain,
 * dan bahwa spawn berada di dalam batas.
 *
 * Server membaca dimensi dari map_cache.dat rAthena; client membacanya dari
 * .gat di dalam GRF pemain. Keduanya diturunkan dari sumber yang sama, tetapi
 * dari versi client yang mungkin berbeda. Bila keduanya menyimpang, map tetap
 * tampil dan karakter tetap muncul -- hanya di tempat yang salah. Itu kelas
 * galat yang paling lama tidak ketahuan, jadi diperiksa keras di sini.
 */
export function validateSpawn(info, altitudeWidth, altitudeHeight) {
	if (info.xs !== altitudeWidth || info.ys !== altitudeHeight) {
		return {
			ok: false,
			reason: `dimensi tidak cocok: server ${info.xs}x${info.ys}, GRF ${altitudeWidth}x${altitudeHeight}`
		};
	}
	if (info.spawnX < 0 || info.spawnY < 0 ||
	    info.spawnX >= altitudeWidth || info.spawnY >= altitudeHeight) {
		return {
			ok: false,
			reason: `spawn (${info.spawnX},${info.spawnY}) di luar batas ${altitudeWidth}x${altitudeHeight}`
		};
	}
	return { ok: true };
}

/**
 * Menentukan di mana karakter ditempatkan.
 *
 * Dipisahkan dari main.js karena main.js membutuhkan WebGL dan karenanya
 * tidak dapat diuji otomatis sama sekali. Keputusannya sendiri murni:
 * validasi, lalu pilih spawn server atau titik tengah map sebagai cadangan.
 * Dengan begini, x dan y yang tertukar — baik di jalur sukses maupun di
 * jalur cadangan — gagal di CI alih-alih hanya terlihat oleh mata manusia
 * pada map yang kebetulan tidak persegi.
 *
 * ok bernilai false berarti spawn server ditolak; x dan y tetap berisi
 * posisi cadangan yang aman agar kamera tetap punya target.
 */
export function spawnPlacement(info, altitudeWidth, altitudeHeight) {
	const check = validateSpawn(info, altitudeWidth, altitudeHeight);
	if (!check.ok) {
		return {
			ok:     false,
			reason: check.reason,
			x:      altitudeWidth  >> 1,
			y:      altitudeHeight >> 1
		};
	}
	return { ok: true, x: info.spawnX, y: info.spawnY };
}

/**
 * Membaca EvtZoneTick dari sebuah ServerMsg.
 *
 * Menerima pesan yang sudah di-decode, bukan ArrayBuffer — berbeda dari
 * decodeMapInfo/decodeServerError. Ini karena EvtZoneTick tidak memerlukan
 * dekode protobuf penuh: ia datang melalui msg.zoneTick yang sudah tersedia
 * di hasil decode ServerMsg sebelumnya.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{tick:number, entities:number, serverTimeMs:number}|null}
 */
export function decodeZoneTick(msg) {
	const t = msg && msg.zoneTick;
	if (!t) {
		return null;
	}
	return {
		tick:         Number(t.tick),
		entities:     Number(t.entities),
		serverTimeMs: Number(t.serverTimeMs)
	};
}

/**
 * Selisih antara dua heartbeat berurutan.
 *
 * Inilah yang membuat heartbeat berguna. Server mengirimnya sekali per
 * detik tetapi membawa hitungan tick SESUNGGUHNYA, jadi lompatan yang
 * sehat adalah 20. Lompatan yang mengecil berarti zone membuang tick --
 * sesuatu yang mustahil terlihat bila kita hanya menghitung pesan yang
 * datang.
 *
 * @param {number|null} sebelumnya - tick heartbeat sebelumnya
 * @param {number} sekarang - tick heartbeat sekarang
 * @returns {number|null} null bila belum ada pembanding
 */
export function lompatanTick(sebelumnya, sekarang) {
	if (sebelumnya === null || sebelumnya === undefined) {
		return null;
	}
	return sekarang - sebelumnya;
}
