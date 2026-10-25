// Klien autochess AC1: satu arena, satu pertempuran demo dari aktor
// pertandingan server (server/internal/pertandingan).
//
// Boot-nya salinan harness (applications/harness/main.js) sampai
// tersambung; komentar panjang di sana menjelaskan setiap jebakan yang
// dihindari di sini (urutan Queue, kamera yang wajib punya target
// sebelum frame pertama, onMessage yang harus ditimpa SETELAH connect,
// dan antrean entity yang menahan pesan sampai map siap).
//
// Yang berbeda dari harness:
// - CmdCaturMasuk menggantikan CmdEnterMap; server memilih map-nya.
// - CmdCaturSiap dikirim dari MapRenderer.onLoad; server menahan fase
//   dan spawn sampai pesan itu tiba.
// - Tidak ada avatar pemain. spot hanyalah titik tumpu kamera di pusat
//   papan dan SENGAJA tidak masuk EntityManager.
// - Spawn memakai decodeSpawnLengkap (tim, nama, tampilan), dan PC yang
//   mati ikut dihapus: di sini PC adalah bidak, bukan kamera.
// - EvtCaturFase dan EvtCaturHasil ditampilkan di banner #fase.
//
// Nol berkas client/src/ berubah: semuanya lewat API publik.

import Queue         from 'Utils/Queue.js';
import Client        from 'Core/Client.js';
import Thread        from 'Core/Thread.js';
import BGM           from 'Audio/BGM.js';
import Renderer      from 'Renderer/Renderer.js';
import MapRenderer   from 'Renderer/MapRenderer.js';
import Altitude      from 'Renderer/Map/Altitude.js';
import Camera        from 'Renderer/Camera.js';
import Entity        from 'Renderer/Entity/Entity.js';
import EntityManager from 'Renderer/EntityManager.js';
import Session       from 'Engine/SessionStorage.js';
import Intro         from 'UI/Components/Intro/Intro.js';
import Network       from 'Network/NetworkManager.js';

import GoSocket          from '../m1-harness/GoSocket.js';
import { loadSchema }    from '../m1-harness/proto.js';
import { buatPenggerak } from '../shared/entitas.js';
import { decodeDamage, decodeDeath } from '../harness/tempur.js';
import { rswFileName, decodeMapInfo, decodeServerError, decodeMove, decodeDespawn, buatAntrean } from '../harness/mapinfo.js';
import { FASE, encodeCaturMasuk, encodeCaturSiap, decodeSpawnLengkap, decodeCaturFase, decodeCaturHasil } from './pesan.js';
import { SKALA_PETAK, pusatPapan } from './papan.js';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5121;
const SCHEMA_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/proto/ro.proto`;

// Pojok papan di guild_vs3, sama dengan bawaan flag -catur-asal roserver.
// Hanya dipakai untuk MEMERIKSA bahwa spawn dari EvtMapInfo memang pusat
// papan; posisi kamera tetap diambil dari server.
const ASAL_PAPAN = { x: 42, y: 41 };

// Kamera. Disetel di browser sampai seluruh papan 16x16 cell (x 42-57,
// y 41-56) muat di layar; lihat docs/superpowers/notes/
// 2026-10-25-ac1-seam-verifikasi.md. ZOOM adalah jarak kamera (bawaan
// RO 125), SUDUT adalah Camera.angleFinal[0] (bawaan RO 230; rentang
// isometrik 190-270, makin besar makin tegak dari atas). Pada 1280x800
// dengan panel log terbuka, 220/250 memperlihatkan x 25-75, y 40-62;
// sisi bawah papan yang paling sempit karena panel log menutupinya.
const ZOOM  = 220;
const SUDUT = 250;

const logEl  = document.getElementById('log');
const faseEl = document.getElementById('fase');

function log(msg) {
	logEl.textContent += msg + '\n';
	logEl.scrollTop = logEl.scrollHeight;
	console.log('[ac]', msg);
}

const NAMA_FASE = {
	[FASE.PERSIAPAN]: 'PERSIAPAN',
	[FASE.TEMPUR]:    'TEMPUR',
	[FASE.HASIL]:     'HASIL'
};

function namaFase(fase) {
	// Fase 0 hanya tiba karena bug (lihat FaseCatur di ro.proto) dan
	// harus TERLIHAT sebagai bug, bukan ditebak.
	return NAMA_FASE[fase] || `TIDAK DIKENAL (${fase})`;
}

// PC yang mati dihapus seperti mob: kamera tidak menempel ke bidak mana
// pun, jadi tidak ada target kamera yang bisa menjadi hantu.
const penggerak = buatPenggerak({ log, hapusPCSetelahMati: true });

// Semua pesan yang menyentuh entity -- dan juga fase/hasil, supaya
// banner tidak mengumumkan apa pun tentang papan yang belum tergambar --
// ditahan di sini sampai MapRenderer.onLoad berjalan. Alasannya ada di
// komentar antrean di applications/harness/main.js: EntityManager.free()
// di dalam callback setMap menyapu setiap entity yang dibuat lebih awal.
const antrean = buatAntrean();

// WAJIB ADA SEBELUM FRAME PERTAMA DIRENDER (lihat harness): Camera.update
// mendereferensi target.position tanpa penjagaan. Di sini spot tidak
// pernah masuk EntityManager, jadi tidak ada avatar yang tergambar.
const spot = Session.Entity = new Entity();

/**
 * Menyetel zoom dan sudut kamera ke angka autochess.
 *
 * Camera.init() menyetel zoomFinal di dalam import('Renderer/MapRenderer.js')
 * .then(...) -- ASINKRON. Menugaskan zoomFinal langsung sesudah init()
 * akan ditimpa Preferences.zoom (125) sesaat kemudian. Karena itu penugasan
 * kita juga menunggu import yang sama, lalu satu task lagi, supaya
 * pasti berjalan sesudah milik init().
 */
function aturKamera() {
	import('Renderer/MapRenderer.js').then(() => {
		setTimeout(() => {
			Camera.zoomFinal = ZOOM;
			Camera.angleFinal[0] = SUDUT;
		}, 0);
	});
}

function aturBanner(teks) {
	faseEl.textContent = teks;
}

let schema   = null;
let goSocket = null;
let mulaiBerkas = 0;
let sudahPernahMuat = false;

function detikSejakBerkas() {
	return ((performance.now() - mulaiBerkas) / 1000).toFixed(1);
}

const q = new Queue();

q.add(function () {
	log('menyiapkan worker pembaca GRF ...');
	BGM.setAvailableExtensions(['mp3']);
	Thread.hook('THREAD_READY', q.next);
	Thread.init();
});

q.add(function () {
	log('menyiapkan renderer WebGL ...');
	Renderer.init();
	q._next();
});

q.add(function () {
	log('pilih berkas GRF-mu (data.ini beserta GRF-nya) pada dialog yang muncul.');
	Intro.onFilesSubmit = function (files) {
		mulaiBerkas = performance.now();
		log(`${files.length} berkas diterima, mengindeks GRF ...`);
		Client.onFilesLoaded = q.next;
		Client.init(files);
	};
	Intro.append();
});

q.add(async function () {
	Intro.remove();
	log(`GRF terindeks dalam ${detikSejakBerkas()} s.`);

	try {
		log(`memuat skema dari ${SCHEMA_URL} ...`);
		schema = await loadSchema(SCHEMA_URL);
		log('skema termuat.');
	} catch (err) {
		log(`! gagal memuat skema: ${err.message}`);
		return;
	}

	// Titik sisip resmi roBrowserLegacy, sama dengan harness.
	Network.setSocketFactory((host, port) => {
		goSocket = new GoSocket(host, port);
		return goSocket;
	});

	log(`menyambung ke ws://${SERVER_HOST}:${SERVER_PORT}/ws ...`);

	Network.connect(SERVER_HOST, SERVER_PORT, (success) => {
		if (!success) {
			log('! gagal menyambung — apakah roserver sudah berjalan?');
			return;
		}
		log('tersambung.');

		// TEMUAN M1: connect() baru saja mengarahkan onMessage ke pengurai
		// Gravity; ditimpa di sini, sesudahnya.
		goSocket.onMessage = terimaPesan;

		log('> minta masuk pertandingan (seed 0: server yang memilih)');
		Network.send(encodeCaturMasuk(schema.ClientMsg, 0));
	}, false);
});

/** Menangani satu frame dari server. */
function terimaPesan(data) {
	try {
		const err = decodeServerError(schema.ServerMsg, data);
		if (err) {
			log(`! server menolak: ${err}`);
			return;
		}

		const info = decodeMapInfo(schema.ServerMsg, data);
		if (info) {
			muatArena(info);
			return;
		}

		// Sisanya menerima ServerMsg yang sudah didekode; didekode SEKALI.
		const msg = schema.ServerMsg.decode(new Uint8Array(data));

		const fase = decodeCaturFase(msg);
		if (fase) {
			antrean.jalankan(() => {
				log(`< fase: ${namaFase(fase.fase)} ronde ${fase.ronde} (sisa ${fase.sisaMs} ms)`);
				aturBanner(`Ronde ${fase.ronde} — ${namaFase(fase.fase)}`);
			});
			return;
		}

		const hasil = decodeCaturHasil(msg);
		if (hasil) {
			antrean.jalankan(() => {
				const teks = hasil.menang ? 'MENANG' : 'KALAH';
				log(`< hasil: ${teks} (ronde ${hasil.ronde})`);
				aturBanner(teks);
			});
			return;
		}

		const sp = decodeSpawnLengkap(msg);
		if (sp) {
			antrean.jalankan(() => penggerak.spawnkan(sp));
			return;
		}

		const dp = decodeDespawn(msg);
		if (dp) {
			antrean.jalankan(() => {
				// removeEntity, BUKAN removeGID (lihat harness).
				if (EntityManager.get(dp.entityId)) {
					EntityManager.remove(dp.entityId);
					log(`< despawn entity ${dp.entityId}`);
				} else {
					log(`! despawn untuk entity ${dp.entityId} yang tak dikenal — abaikan`);
				}
			});
			return;
		}

		const mv = decodeMove(msg);
		if (mv) {
			antrean.jalankan(() => {
				const e = EntityManager.get(mv.entityId);
				if (!e) {
					log(`! gerak untuk entity ${mv.entityId} yang tak dikenal — abaikan`);
					return;
				}
				log(`< gerak entity ${mv.entityId}: ${mv.path.length - 1} langkah, ${mv.speedMs} ms/cell`);
				penggerak.jalankanSepanjang(e, mv.path, mv.speedMs);
			});
			return;
		}

		if (msg.damage) {
			const d = decodeDamage(msg.damage);
			antrean.jalankan(() => penggerak.tampilkanDamage(d));
			return;
		}

		if (msg.death) {
			const dt = decodeDeath(msg.death);
			antrean.jalankan(() => penggerak.matikanSprite(dt.entityId));
			return;
		}

		log(`< pesan tanpa body yang dikenali (${data.byteLength} byte)`);
	} catch (err) {
		log(`! frame tidak dapat didekode (${data.byteLength} byte): ${err.message}`);
		log('! kemungkinan skema client dan server berbeda — coba hard reload (Ctrl+Shift+R)');
	}
}

/** EvtMapInfo: muat map arena dan arahkan kamera ke pusat papan. */
function muatArena(info) {
	log(`< server: map ${info.mapName} ${info.xs}x${info.ys}, spawn (${info.spawnX},${info.spawnY})`);

	const pusat = pusatPapan(ASAL_PAPAN, SKALA_PETAK);
	if (pusat.x !== info.spawnX || pusat.y !== info.spawnY) {
		log(`! spawn server (${info.spawnX},${info.spawnY}) bukan pusat papan client (${pusat.x},${pusat.y}) — asal/skala papan client dan server berbeda`);
	}

	MapRenderer.onLoad = function () {
		// Waktu sejak berkas dipilih hanya bermakna pada muatan pertama;
		// sesudah __ac.ulang() angkanya hanya umur halaman.
		const waktu = sudahPernahMuat ? '' : ` (${detikSejakBerkas()} s sejak berkas dipilih)`;
		sudahPernahMuat = true;
		log(`map termuat: ${info.mapName}${waktu}`);

		// Kamera WAJIB punya target pada setiap jalur sebelum onLoad
		// selesai: onMapComplete memanggil Renderer.render(onRender) tanpa
		// syarat sesudahnya, dan onRender mendereferensi target.position.
		spot.position[0] = info.spawnX;
		spot.position[1] = info.spawnY;
		spot.position[2] = Altitude.getCellHeight(info.spawnX, info.spawnY);

		Camera.setTarget(spot);
		Camera.init();
		aturKamera();

		// Dibungkus sendiri: badan yang diantre berjalan di dalam callback
		// map loader, dan lemparan yang lolos menghentikan onMapComplete
		// tanpa satu baris log pun (lihat harness).
		try {
			const dikuras = antrean.siapkan();
			log(`antrean dikuras: ${dikuras} pesan yang tertahan dijalankan sekarang.`);
		} catch (err) {
			log(`! gagal menjalankan pesan yang tertahan: ${err.message}`);
		}

		// Map tergambar dan antrean terbuka: baru sekarang server boleh
		// mengirim fase dan spawn. Server MENAHAN pertempuran sampai pesan
		// ini (atau batas 20 detiknya), supaya spawn, jalan, dan serangan
		// pertama terlihat langsung -- bukan diputar sekaligus dari
		// antrean seperti sebelum CmdCaturSiap ada. Dikirim di LUAR try di
		// atas: pesan tertahan yang gagal tidak boleh menggantung
		// pertandingan sampai batas waktunya.
		log('> siap');
		Network.send(encodeCaturSiap(schema.ClientMsg));
	};

	// SEBELUM setMap: pesan untuk map lama dibuang, dan setiap pesan sejak
	// titik ini ditahan sampai onLoad di atas.
	antrean.reset();
	aturBanner('');

	const rsw = rswFileName(info.mapName);
	log(`memuat ${rsw} dari GRF ...`);
	MapRenderer.setMap(rsw);
}

q.run();

/**
 * Meminta pertandingan baru tanpa memuat ulang halaman (dan GRF-nya).
 * Registry server membatalkan pertandingan lama sebelum yang baru
 * mengirim apa pun, jadi EvtMapInfo baru menyapu bidak lama lewat
 * setMap -> EntityManager.free(). Untuk verifikasi manual saja.
 *
 * CmdCaturSiap TIDAK dikirim di sini: EvtMapInfo pertandingan baru
 * melewati muatArena seperti biasa, dan onLoad-nya yang mengirim siap
 * setelah map tergambar ulang.
 */
function ulang(seed = 0) {
	if (!schema || !goSocket) {
		log('! belum tersambung');
		return;
	}
	log(`> minta masuk pertandingan lagi (seed ${seed})`);
	Network.send(encodeCaturMasuk(schema.ClientMsg, seed));
}

// Untuk penyetelan kamera manual di konsol browser:
// __ac.Camera.zoomFinal = 90; __ac.Camera.angleFinal[0] = 240; __ac.ulang();
window.__ac = { Camera, EntityManager, Session, log, ZOOM, SUDUT, antrean, ulang };
