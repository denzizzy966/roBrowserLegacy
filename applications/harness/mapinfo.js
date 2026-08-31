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
		mapName:  msg.mapInfo.mapName,
		xs:       Number(msg.mapInfo.xs),
		ys:       Number(msg.mapInfo.ys),
		spawnX:   Number(msg.mapInfo.spawnX),
		spawnY:   Number(msg.mapInfo.spawnY),
		// entityId memberi tahu client entity mana DIRINYA. Komentar di
		// proto/ro.proto:47-48 menyatakan M4 memerlukannya untuk
		// mencocokkan EvtMove dengan sprite yang benar; dekoder ini dulu
		// membuangnya, sehingga harness tidak punya cara membedakan gerak
		// miliknya dari gerak pemain lain (lihat penjaga di main.js).
		// Dipakai juga sebagai GID saat entity didaftarkan ke
		// EntityManager.
		entityId: Number(msg.mapInfo.entityId),
		// hp dan maxHp MILIK PEMAIN SENDIRI, ditambahkan M6f. Tanpa
		// keduanya, panel damage menampilkan setiap pukulan yang
		// diterima pemain sebagai "0%": client tahu HP setiap mob lewat
		// EvtSpawn, tetapi tidak tahu HP-nya sendiri.
		//
		// Nol eksplisit, bukan Number(undefined) yang menghasilkan NaN.
		hp:       msg.mapInfo.hp === undefined || msg.mapInfo.hp === null ? 0 : Number(msg.mapInfo.hp),
		maxHp:    msg.mapInfo.maxHp === undefined || msg.mapInfo.maxHp === null ? 0 : Number(msg.mapInfo.maxHp)
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
 * Membaca EvtMove dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number, path:Array<{x:number,y:number}>, speedMs:number}|null}
 */
export function decodeMove(msg) {
	const m = msg && msg.move;
	if (!m) {
		return null;
	}
	return {
		entityId: Number(m.entityId),
		path: (m.path || []).map((s) => ({ x: Number(s.x), y: Number(s.y) })),
		speedMs: Number(m.speedMs)
	};
}

/**
 * Membaca EvtSpawn dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number, x:number, y:number, type:number, job:number}|null}
 */
export function decodeSpawn(msg) {
	const s = msg && msg.spawn;
	if (!s) {
		return null;
	}
	return {
		entityId: Number(s.entityId),
		x:        Number(s.x),
		y:        Number(s.y),
		type:     Number(s.type),
		job:      Number(s.job),
		// hp dan maxHp ditambahkan M6c. Number(undefined) adalah NaN,
		// bukan nol -- protobuf menghilangkan field bernilai nol dari
		// kawat, jadi mob ber-HP nol dan mob dari server lama tiba
		// dengan byte yang sama. Nol adalah jawaban yang benar untuk
		// keduanya.
		hp:       s.hp === undefined || s.hp === null ? 0 : Number(s.hp),
		maxHp:    s.maxHp === undefined || s.maxHp === null ? 0 : Number(s.maxHp)
	};
}

// Enum EntityType protokol kita -> konstanta objecttype
// roBrowserLegacy (Entity.TYPE_PC = 0, Entity.TYPE_MOB = 5).
//
// Disalin, BUKAN diimpor: Entity.TYPE_* adalah static class field di
// client/src/, dan menyalinnya menjaga protokol wire kita tidak terikat
// pada penomoran internal sebuah fork client (keputusan A5). Pola yang
// sama dengan tabel ARAH di M4.
const TIPE_KE_OBJECTTYPE = {
	1: 0, // ENTITY_TYPE_PC  -> Entity.TYPE_PC
	2: 5  // ENTITY_TYPE_MOB -> Entity.TYPE_MOB
};

/**
 * Menerjemahkan EntityType protokol ke objecttype roBrowserLegacy.
 *
 * Mengembalikan null untuk tipe yang tidak dikenal, TERMASUK nilai nol
 * proto3 (ENTITY_TYPE_TIDAK_DIKENAL). Pemanggil harus melewatinya, bukan
 * menebak: sprite yang salah digambar tidak menunjuk sebabnya.
 *
 * @param {number} type
 * @returns {number|null}
 */
export function objecttypeDari(type) {
	const o = TIPE_KE_OBJECTTYPE[type];
	return typeof o === 'undefined' ? null : o;
}

/**
 * Membaca EvtDespawn dari sebuah ServerMsg.
 *
 * @param {object} msg - ServerMsg hasil decode
 * @returns {{entityId:number}|null}
 */
export function decodeDespawn(msg) {
	const d = msg && msg.despawn;
	if (!d) {
		return null;
	}
	return { entityId: Number(d.entityId) };
}

/**
 * Antrean pesan yang menyentuh entity, ditahan sampai map siap.
 *
 * MapRenderer.setMap memuat map secara ASINKRON, dan di dalam callback
 * itulah EntityManager.free() menghapus seluruh entity. EvtSpawn yang
 * tiba di antara keduanya membuat entity yang beberapa ratus milidetik
 * kemudian dihapus -- tanpa galat, tanpa peringatan. Lihat catatan
 * review akhir M5.
 *
 * Urutan yang sesungguhnya terjadi, dan yang tidak satu pun tes dapat
 * lihat: EvtMapInfo memanggil MapRenderer.setMap, yang menjadwalkan
 * Background.setLoading(cb) -- asinkron, menunggu Client.loadFile dari
 * GRF plus transisi 500 ms pada tampilan pertama. EvtSpawn tiba ~1 ms
 * sesudahnya dan membuat entity. Baru 300-800 ms kemudian callback itu
 * berjalan dan memanggil MapRenderer.free() -> EntityManager.free(),
 * yang mengosongkan _list dan _gidMap. Pemain lain lenyap sebelum frame
 * pertama pernah digambar (src/Renderer/MapRenderer.js:156-167, lalu :194-197).
 *
 * Perbaikannya ada DI SINI, bukan di EntityManager.free(): keputusan D3
 * melarang menyentuh berkas client/src/, dan free() memang bukan milik
 * kita. Menahan pesan sampai map siap juga yang benar secara semantik --
 * entity yang dibuat sebelum Altitude dimuat mendapat tinggi 0.0 dari
 * Altitude.getCellHeight yang diam-diam mengembalikan nol.
 *
 * Fungsi murni supaya perilakunya teruji tanpa WebGL.
 *
 * @returns {{reset:function, jalankan:function, siapkan:function, jumlahTertunda:function}}
 */
export function buatAntrean() {
	let siap = false;
	let tertunda = [];
	return {
		/** Tandai map belum siap dan buang apa pun yang masih tertahan. */
		reset() { siap = false; tertunda = []; },
		/** Jalankan fn sekarang bila map siap, kalau tidak tahan dulu. */
		jalankan(fn) { if (siap) { fn(); } else { tertunda.push(fn); } },
		/** Map siap: jalankan semua yang tertahan, dalam urutan tiba. */
		siapkan() {
			siap = true;
			const antre = tertunda;
			tertunda = [];
			for (const fn of antre) { fn(); }
			return antre.length;
		},
		/** Jumlah yang sedang tertahan; untuk log dan tes. */
		jumlahTertunda() { return tertunda.length; }
	};
}

/**
 * Meratakan jalur menjadi Int16Array berpasangan x,y.
 *
 * Bentuk ini disamakan dengan walk.path milik client, yang juga memuat
 * cell asal di elemen pertama lalu melewatinya lewat walk.index = 2.
 *
 * Panjangnya mengikuti jalur yang datang. MAX_WALKPATH = 32 di upstream
 * hanya muncul di dua alokasi buffer; walkProcess sendiri cuma membaca
 * walk.total, jadi buffer yang lebih panjang aman.
 *
 * @param {Array<{x:number,y:number}>} path
 * @returns {Int16Array}
 */
export function pathKeInt16(path) {
	const out = new Int16Array(path.length * 2);
	for (let i = 0; i < path.length; i++) {
		out[i * 2] = path[i].x;
		out[i * 2 + 1] = path[i].y;
	}
	return out;
}

/**
 * Membangun ClientMsg berisi CmdMove.
 *
 * @param {object} ClientMsg - tipe pesan dari skema
 * @param {number} x
 * @param {number} y
 * @returns {ArrayBuffer}
 */
export function encodeMove(ClientMsg, x, y) {
	const pesan = ClientMsg.create({ move: { x, y } });
	return toArrayBuffer(ClientMsg.encode(pesan).finish());
}

// Tabel arah roBrowserLegacy, disalin dari src/Renderer/Entity/EntityWalk.js:17.
// Disalin, bukan diimpor: ia `const` tingkat modul yang tidak diekspor,
// dan keputusan D3 melarang menyentuh berkas client/src/ untuk
// mengekspornya. Diindeks [dx+1][dy+1]; 0=selatan, 2=barat, 4=utara,
// 6=timur.
const ARAH = [
	[1, 2, 3],
	[0, 0, 4],
	[7, 6, 5]
];

/**
 * Arah hadap untuk satu langkah petak.
 *
 * Hanya sah untuk langkah satu petak (dx, dy di {-1,0,1}) -- yang
 * selalu benar untuk jalur A* server. Mengembalikan 0 untuk offset di
 * luar itu, sama seperti sel tengah tabel untuk (0,0).
 *
 * @param {number} dx
 * @param {number} dy
 * @returns {number} arah 0..7
 */
export function arahLangkah(dx, dy) {
	const baris = ARAH[dx + 1];
	if (!baris || typeof baris[dy + 1] === 'undefined') {
		return 0;
	}
	return baris[dy + 1];
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
