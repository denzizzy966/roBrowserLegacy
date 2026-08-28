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
 * @param {object} ServerMsg - tipe ServerMsg dari skema protobuf
 * @param {ArrayBuffer} data - pesan terenkripsi
 * @returns {{tick:number, entities:number, serverTimeMs:number}|null}
 */
export function decodeZoneTick(ServerMsg, data) {
	const msg = ServerMsg.decode(new Uint8Array(data));
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
 * Delta tick selalu 20 secara konstruksi: z.tick naik satu per tick yang
 * DITERIMA, dan heartbeat terbit di tiap kelipatan 20. Jadi delta ≠ 20
 * berarti heartbeat MESSAGE HILANG dalam transit, bukan zone yang membuang
 * tick.
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

/**
 * Memperkirakan berapa tick yang dibuang zone antara dua heartbeat.
 *
 * Inilah sinyal kelambatan yang sebenarnya. Delta `tick` antar-heartbeat
 * selalu 20 secara konstruksi -- z.tick naik satu per tick yang DITERIMA,
 * dan heartbeat terbit di tiap kelipatan 20. Zone yang tersendat tidak
 * melompat lebih pendek; ia tiba lebih lambat.
 *
 * time.Ticker di Go MEMBUANG tick bila penerimanya lambat, ia tidak
 * mengantre. Jadi kelebihan waktu di atas 1000 ms dibagi 50 ms adalah
 * perkiraan jumlah tick yang hilang.
 *
 * @param {number|null} sebelumnya - serverTimeMs heartbeat sebelumnya
 * @param {number} sekarang - serverTimeMs heartbeat sekarang
 * @returns {number|null} null bila belum ada pembanding; 0 bila sehat
 */
export function tickTerbuang(sebelumnya, sekarang) {
	if (sebelumnya === null || sebelumnya === undefined) {
		return null;
	}
	const kelebihan = (sekarang - sebelumnya) - 1000;
	if (kelebihan <= 0) {
		return 0;
	}
	return Math.round(kelebihan / 50);
}
