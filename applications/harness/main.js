import Queue         from 'Utils/Queue.js';
import Configs       from 'Core/Configs.js';
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
import Mouse         from 'Controls/MouseEventHandler.js';
import Cursor        from 'UI/CursorManager.js';

import GoSocket        from '../m1-harness/GoSocket.js';
import { loadSchema }  from '../m1-harness/proto.js';
import { buatPenggerak } from '../shared/entitas.js';
import { decodeDamage, decodeDeath, decodeItemTanah, decodeItemHilang, encodeSatuField, pilihTerdekat, BERKAS_SKIN_DAMAGE, ringkasProbeSkin, TIPE_MOB } from './tempur.js';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, spawnPlacement, decodeZoneTick, lompatanTick, tickTerbuang, decodeMove, decodeSpawn, decodeDespawn, encodeMove, buatAntrean } from './mapinfo.js';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5121;
const SCHEMA_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/proto/ro.proto`;
// Prontera, kota awal Ragnarok. Sampai sekarang tidak mungkin: cache
// rAthena tidak memuatnya. Ia datang dari cache hasil bangkitan
// server/cmd/mapcachegen, langsung dari data.grf milik pemain.
const MAP_NAME    = 'prontera';

const logEl = document.getElementById('log');

function log(msg) {
	logEl.textContent += msg + '\n';
	logEl.scrollTop = logEl.scrollHeight;
	console.log('[m2]', msg);
}

// Spawn, jalan, damage, dan mati tinggal di applications/shared/entitas.js
// supaya klien autochess memakai kode yang sama. Harness memberi log dan
// panel damage-nya sendiri; PC TIDAK dihapus saat mati (bawaan
// hapusPCSetelahMati false) karena kamera menempel ke sprite kita.
const penggerak = buatPenggerak({ log, catatHUD });

// Mendaftarkan spot ke EntityManager, dan memberinya identitas yang cukup
// agar cabang jalan di walkProcess benar-benar bisa dimasuki.
//
// Dua hal yang HARUS terjadi, dan keduanya dulu tidak terjadi sama sekali;
// tanpa keduanya jalur yang disuntikkan jalankanSepanjang tidak pernah
// dibaca oleh apa pun, dan sprite mustahil berjalan:
//
// 1. spot masuk render list. walkProcess() punya tepat SATU pemanggil di
//    seluruh pohon client (Renderer/Entity/EntityRender.js:85), dan render()
//    itu hanya tercapai lewat loop EntityManager.render() atas _list --
//    yang cuma diisi addEntity (EntityManager.js:157). Harness tidak pernah
//    mengimpor EntityManager, jadi spot.position tak pernah berubah, dan
//    karena Camera.setTarget(spot) adalah satu-satunya target kamera,
//    pandangan pun tidak ikut bergerak. Satu-satunya efek klik yang teramati
//    adalah baris log.
//
// 2. objecttype disetel lewat set(), bukan ditugaskan langsung. `new Entity()`
//    tanpa data memakai bawaan prototype TYPE_UNKNOWN (Entity.js:596); Init
//    di EntityAction.js melakukan switch atas objecttype dan tidak cocok satu
//    case pun, sehingga ACTION.WALK tetap -1 (nilai awal di konstruktor
//    Action()). setAction({action: -1}) lalu dipaksa jadi IDLE, jadi
//    entity.action TIDAK PERNAH bisa sama dengan ACTION.WALK dan cabang gerak
//    di walkProcess tak pernah dimasuki -- gantinya walkProcess mencetak
//    peringatan CHARACTER STUCK IN WALKING ANIMATION plus console.trace TIAP
//    FRAME (EntityWalk.js:400-412). `case 'objecttype'` di Entity.js:278-281
//    memanggil entityAction.call(this), DAN ITULAH yang memberi ACTION.WALK = 1
//    untuk TYPE_PC. Menugaskan field-nya saja tidak memicu apa pun.
//
// job 0 (Novice) / sex 1 (pria) sengaja dipilih sebagai kombinasi paling
// aman: DB.isPlayer(0) benar (DBManager.js:926 -- rentangnya 0..44), dan
// DB.getBodyPath(0, 1) menyusun path dari ClassTable[JobId.NOVICE] yang ada
// dan SexTable[1] yang ada, jadi tidak ada indeks tabel yang meleset.
//
// Nol berkas client/src/ berubah: semuanya lewat API publik.
function daftarkanEntity(info) {
	// EntityManager.free() sudah berjalan sebelum onLoad ini
	// (MapRenderer.js:175 lalu :183), dan free() memanggil clean() yang
	// menyetel GID = -1. Jadi identitas WAJIB dipasang ulang di sini, dan
	// entity yang ditambahkan di sini tidak akan tersapu.
	if (!info.entityId) {
		log('! entity_id dari server 0 — sprite didaftarkan dengan GID 0; periksa EvtMapInfo');
	}

	// head WAJIB disebutkan. Entity.prototype._head bernilai -1
	// (Entity.js:605), dan UpdateHead keluar lebih awal saat head < 0
	// (EntityView.js:617-619) -- jadi berkas sprite kepala tidak pernah
	// dimuat sama sekali dan Novice muncul tanpa kepala. Badan tetap
	// tergambar karena UpdateBody dipicu terpisah oleh job, sehingga
	// gejalanya tampak seperti sprite rusak alih-alih field yang hilang.
	// 1 adalah gaya rambut pertama, ada untuk kedua jenis kelamin.
	spot.set({ objecttype: Entity.TYPE_PC, GID: info.entityId, job: 0, sex: 1, head: 1 });
	// HP pemain sendiri, dari EvtMapInfo. Tanpa ini panel damage
	// menampilkan setiap pukulan yang diterima pemain sebagai "0%":
	// __m2MaxHP hanya dipasang di penggerak.spawnkan, yang melayani entity
	// LAIN dan tidak pernah menyentuh sprite kita sendiri.
	//
	// Bar HP dan nama sengaja TIDAK dipasang untuk pemain (keputusan
	// M6e); yang dibutuhkan hanya angkanya untuk panel.
	spot.__m2MaxHP = info.maxHp;
	EntityManager.add(spot);

	penggerak.periksaPendaftaran(spot);
}

// Memasang penangan klik-untuk-berjalan pada kanvas WebGL.
//
// Kanvas BELUM ada di DOM saat MapRenderer.onLoad() dipanggil: onMapComplete
// di src/Renderer/MapRenderer.js memanggil onLoad() lebih dulu, baru
// Renderer.show() (yang melakukan document.body.appendChild(canvas))
// sesudahnya -- persis komentar di atas soal onRender yang juga baru
// berjalan "tanpa syarat setelah onLoad selesai". querySelector('canvas')
// yang dipanggil langsung di dalam onLoad karena itu akan selalu null;
// digulir lewat requestAnimationFrame sampai kanvas benar-benar muncul.
function pasangKanvasKlik() {
	const kanvas = document.querySelector('canvas');
	if (!kanvas) {
		requestAnimationFrame(pasangKanvasKlik);
		return;
	}
	if (kanvas.__m2Klik) {
		return;
	}
	kanvas.__m2Klik = true;

	// Kursor mengikuti apa yang ada di bawahnya. Dipasang di kanvas yang
	// sama dengan klik, supaya keduanya hidup dan mati bersama.
	kanvas.addEventListener('mousemove', perbaruiKursor);

	kanvas.addEventListener('mousedown', () => {
		const x = Mouse.world.x | 0;
		const y = Mouse.world.y | 0;
		if (x < 0 || y < 0) {
			return; // kursor tidak menyentuh tanah
		}

		// Urutan prioritas klik: mob mengalahkan item, item mengalahkan
		// gerak. Mob lebih dulu karena mob yang berdiri di atas item yang
		// baru ia jatuhkan adalah keadaan yang SERING terjadi, dan tidak
		// bisa diserang kalau item menang.
		const gidMob = mobDiPetak(x, y);
		if (gidMob !== null) {
			log(`> attack ${gidMob}`);
			Network.send(encodeSatuField(schema.ClientMsg, 'attack', { targetId: gidMob }));
			return;
		}

		const groundId = itemDiPetak(x, y);
		if (groundId !== null) {
			log(`> pickup ${groundId}`);
			Network.send(encodeSatuField(schema.ClientMsg, 'pickup', { groundId }));
			return;
		}

		log(`> minta gerak ke (${x},${y})`);
		Network.send(encodeMove(schema.ClientMsg, x, y));
	});
}

// ---------------------------------------------------------------------
// M6c -- tampilan combat.
//
// Ketiga mekanisme di bawah dipilih berdasarkan investigasi Task 1
// (docs/superpowers/notes/2026-08-30-m6c-permukaan-client.md), yang
// menjawab satu pertanyaan untuk masing-masing: apakah ada yang MEMBACA
// KEMBALI apa yang kita tulis. Itu pertanyaan yang menjatuhkan M4.
// ---------------------------------------------------------------------

// hudDamage adalah panel damage milik harness sendiri.
//
// Ia ADA karena angka damage bawaan roBrowserLegacy bisa diam TANPA satu
// pun galat: Damage.add keluar lebih awal bila sprite skinnya belum
// termuat ("Need to wait the client to load damage sprite"), dan
// Client.getFiles tidak meneruskan onerror -- satu berkas hilang di GRF
// membuat callback-nya tidak pernah dipanggil, selamanya.
//
// Milestone ini harus BISA DIAMATI, jadi observabilitasnya tidak boleh
// bergantung pada aset yang mungkin tidak ada di GRF pemain.
let hudDamage = null;

function pastikanHUD() {
	if (hudDamage) {
		return hudDamage;
	}
	hudDamage = document.createElement('div');
	hudDamage.id = 'm2-hud-damage';
	Object.assign(hudDamage.style, {
		position: 'fixed', top: '8px', right: '8px', zIndex: 9999,
		font: '12px/1.45 monospace', color: '#fff',
		background: 'rgba(0,0,0,.62)', padding: '6px 9px',
		borderRadius: '4px', pointerEvents: 'none',
		maxWidth: '340px', whiteSpace: 'pre',
	});
	hudDamage.textContent = 'damage:\n(belum ada)';
	document.body.appendChild(hudDamage);
	return hudDamage;
}

const riwayatDamage = [];

function catatHUD(baris) {
	riwayatDamage.push(baris);
	while (riwayatDamage.length > 8) {
		riwayatDamage.shift();
	}
	pastikanHUD().textContent = 'damage:\n' + riwayatDamage.join('\n');
}

/**
 * Memeriksa apakah keempat berkas skin damage ada di GRF pemain.
 *
 * Memakai Client.getFile dengan onerror -- yang Damage.init sendiri TIDAK
 * lakukan lewat Client.getFiles, dan itulah sebabnya kegagalannya sunyi.
 */
function probeSkinDamage() {
	const hasil = [];
	let sisa = BERKAS_SKIN_DAMAGE.length;
	BERKAS_SKIN_DAMAGE.forEach((nama) => {
		const selesai = (ada) => {
			hasil.push({ nama, ada });
			if (--sisa === 0) {
				const r = ringkasProbeSkin(hasil);
				log((r.lengkap ? '' : '! ') + r.pesan);
			}
		};
		try {
			Client.getFile(nama, () => selesai(true), () => selesai(false));
		} catch (e) {
			selesai(false);
		}
	});
}

// itemTanah memetakan groundId ke penanda yang digambar harness sendiri.
//
// Item lantai TIDAK memakai Entity.TYPE_ITEM roBrowserLegacy, dan itu
// temuan Task 1, bukan kemalasan: DB.getItemInfo dan ItemTable keduanya
// berkunci id NUMERIK, sementara server mengirim AegisName dari tabel
// drop mob_db. Tidak ada indeks nama->id di client. Jalur peningkatannya
// tercatat di EvtItemTanah pada proto.
const itemTanah = new Map();

/** Menggambar penanda item di tanah. */
function gambarItem(it) {
	itemTanah.set(it.groundId, it);
	log(`< item ${it.namaItem} di (${it.x},${it.y}) id ${it.groundId} -- klik petaknya untuk memungut`);
}

/** Menghapus penanda item. */
function hapusItem(groundId) {
	if (itemTanah.delete(groundId)) {
		log(`< item hilang: ${groundId}`);
	}
}

/** Mencari item tanah di dekat petak yang diklik, untuk CmdPickup. */
function itemDiPetak(x, y) {
	const daftar = [];
	for (const [id, it] of itemTanah) {
		daftar.push({ id, x: it.x, y: it.y });
	}
	return pilihTerdekat(daftar, x, y);
}

/**
 * Menyesuaikan kursor dengan apa yang ada di bawahnya.
 *
 * Cursor.setType(ACTION.ATTACK) adalah kursor pedang RO. Ia butuh
 * Cursor.init() yang memuat data/sprite/cursors.spr dari GRF -- pola
 * yang sama dengan skin damage, jadi kegagalannya BISA senyap dan
 * probenya dilaporkan.
 */
function perbaruiKursor() {
	if (!kursorSiap) {
		return;
	}
	const x = Mouse.world.x | 0;
	const y = Mouse.world.y | 0;
	if (x < 0 || y < 0) {
		return;
	}
	const adaMob = mobDiPetak(x, y) !== null;
	const adaItem = itemDiPetak(x, y) !== null;
	if (adaMob) {
		Cursor.setType(Cursor.ACTION.ATTACK);
	} else if (adaItem) {
		Cursor.setType(Cursor.ACTION.PICK);
	} else {
		Cursor.setType(Cursor.ACTION.DEFAULT);
	}
}

let kursorSiap = false;

/**
 * Memuat sprite kursor RO, lalu menyalakan kursor kontekstual.
 *
 * Cursor.init memuat data/sprite/cursors.spr dan .act lewat
 * Client.getFiles -- yang TIDAK meneruskan onerror, persis seperti
 * Damage.init. Satu berkas hilang di GRF membuat callback-nya tidak
 * pernah dipanggil, tanpa galat dan tanpa timeout.
 *
 * Karena itu keberhasilannya DILAPORKAN, bukan diasumsikan: tanpa baris
 * ini, kursor yang tidak pernah berubah tampak seperti kode yang salah
 * alih-alih aset yang hilang.
 */
function siapkanKursor() {
	let selesai = false;
	Cursor.init(() => {
		selesai = true;
		kursorSiap = true;
		log('kursor RO termuat -- pedang saat menunjuk monster, tangan saat menunjuk item');
	});
	// Cursor.init memanggil callback-nya SEGERA bila sprite sudah termuat
	// sebelumnya, jadi pemeriksaan tertunda ini hanya menangkap kasus
	// callback yang tidak pernah datang.
	setTimeout(() => {
		if (!selesai) {
			log('! kursor RO TIDAK termuat: data/sprite/cursors.spr atau .act ' +
				'tidak ada di GRF-mu. Cursor.init memakai Client.getFiles yang ' +
				'tidak meneruskan onerror, jadi ia diam selamanya. Kursor tetap ' +
				'kursor browser biasa; sisanya berjalan normal.');
		}
	}, 5000);
}



/** Mencari mob di dekat petak yang diklik, untuk CmdAttack. */
function mobDiPetak(x, y) {
	const daftar = [];
	EntityManager.forEach((e) => {
		// === terhadap angka, BUKAN truthiness: TYPE_PC bernilai NOL,
		// dan `if (e.objecttype)` akan menganggap setiap pemain
		// bukan-entity.
		if (e.objecttype !== 5 || !e.position) {
			return;
		}
		daftar.push({ id: e.GID, x: Math.round(e.position[0]), y: Math.round(e.position[1]) });
	});
	return pilihTerdekat(daftar, x, y);
}

let schema   = null;
let goSocket = null;

// Semua pesan yang MENYENTUH entity lewat sini dulu.
//
// Zone.enter mengembalikan, dalam SATU Apply:
// [EvtMapInfo -> B, EvtSpawn(B) -> penonton, EvtSpawn(A) -> B, EvtMove(A) -> B],
// dan GoSocket meneruskan tiap frame ke onmessage segera tanpa buffering.
// Jadi EvtSpawn(A) tiba ~1 ms sesudah EvtMapInfo -- sementara
// MapRenderer.setMap yang baru saja dipanggil masih menunggu GRF, dan
// EntityManager.free() yang ada DI DALAM callback-nya baru berjalan
// 300-800 ms kemudian. Entity pemain A dibuat dengan benar, lalu dihapus.
//
// Akibatnya persis kriteria M5 yang gagal: browser 1 melihat pemain 2
// muncul dan berjalan, browser 2 melihat map kosong dan mencetak
// `! gerak untuk entity N yang tak dikenal` tiap kali pemain 1 bergerak.
// Karena interest bersifat edge-triggered (keputusan S3), tidak ada
// EvtSpawn susulan kecuali pemain 1 berjalan keluar radius lalu kembali.
//
// Logikanya sendiri ada di mapinfo.js supaya teruji tanpa WebGL; di sini
// hanya pemasangannya. EntityManager.free() bukan milik kita
// (keputusan D3), jadi perbaikannya memang harus di harness.
const antrean = buatAntrean();

// WAJIB ADA SEBELUM FRAME PERTAMA DIRENDER. MapRenderer.onRender memanggil
// Camera.update(tick), yang mendereferensi this.target.position tanpa
// penjagaan, lalu membaca Session.Entity.position. Bila keduanya null,
// setiap frame melempar TypeError yang ditelan try/catch di Renderer.js —
// kanvas kosong selamanya sementara panel log tetap menampilkan
// "map termuat". Pola ini disalin dari src/App/MapViewer.js:35.
const spot = Session.Entity = new Entity();

let tickSebelumnya = null;
let serverTimeSebelumnya = null;

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
	log('pilih berkas GRF-mu (data.grf) pada dialog yang muncul.');
	Intro.onFilesSubmit = function (files) {
		log(`${files.length} berkas diterima, mengindeks GRF ...`);
		Client.onFilesLoaded = q.next;
		Client.init(files);
	};
	Intro.append();
});

q.add(async function () {
	Intro.remove();

	// GRF sudah terindeks di sini, jadi probe skin damage dapat berjalan.
	// Hasilnya menjawab satu pertanyaan yang selama ini hanya bisa
	// ditebak: apakah angka damage bawaan akan tergambar, atau diam
	// karena berkas skinnya tidak ada di GRF ini.
	probeSkinDamage();
	siapkanKursor();

	try {
		log(`memuat skema dari ${SCHEMA_URL} ...`);
		schema = await loadSchema(SCHEMA_URL);
		log('skema termuat.');
	} catch (err) {
		log(`! gagal memuat skema: ${err.message}`);
		return;
	}

	// Titik sisip resmi roBrowserLegacy: transport dialihkan ke server Go
	// tanpa menyentuh kode upstream. Factory dipanggil dengan tepat
	// (host, port); NetworkManager sendiri yang menetapkan onComplete dan
	// onClose, jadi jangan disetel di sini.
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

		// TEMUAN M1 — jangan pindahkan blok ini ke dalam factory.
		// NetworkManager.connect() menjalankan `socket.onMessage = receive`
		// tepat sebelum memanggil callback ini, mengarahkan seluruh data
		// masuk ke pengurai paket Gravity. Protokol kita bukan Gravity.
		goSocket.onMessage = (data) => {
			try {
				const err = decodeServerError(schema.ServerMsg, data);
				if (err) {
					log(`! server menolak: ${err}`);
					return;
				}

				const info = decodeMapInfo(schema.ServerMsg, data);
				if (info) {
					log(`< server: map ${info.mapName} ${info.xs}x${info.ys}, spawn (${info.spawnX},${info.spawnY}), entity ${info.entityId}`);

					MapRenderer.onLoad = function () {
						log(`map termuat: ${info.mapName}`);
						log(`dimensi menurut GRF: ${Altitude.width}x${Altitude.height}`);

						const p = spawnPlacement(info, Altitude.width, Altitude.height);

						if (!p.ok) {
							log(`! ${p.reason}`);
							log('! karakter TIDAK ditempatkan di spawn server — periksa versi client GRF vs map_cache.dat rAthena');
						}

						// Kamera WAJIB punya target pada setiap jalur, termasuk saat
						// spawn ditolak. MapRenderer.onMapComplete memanggil
						// Renderer.render(onRender) tanpa syarat setelah onLoad selesai,
						// dan onRender mendereferensi Camera.target.position. Keluar
						// lebih awal tanpa setTarget membuat setiap frame melempar
						// TypeError yang ditelan try/catch di Renderer.js — konsol
						// dibanjiri selamanya dan kanvas tidak pernah menggambar.
						spot.position[0] = p.x;
						spot.position[1] = p.y;
						spot.position[2] = Altitude.getCellHeight(p.x, p.y);

						daftarkanEntity(info);

						Camera.setTarget(spot);
						Camera.init();

						log(p.ok
							? `karakter di (${spot.position[0]},${spot.position[1]},${spot.position[2].toFixed(2)}), kamera mengikuti.`
							: `  kamera dijatuhkan ke titik tengah (${spot.position[0]},${spot.position[1]}) agar render tetap jalan.`);

						pasangKanvasKlik();

						// Map benar-benar siap: EntityManager.free() sudah
						// berjalan (MapRenderer.js:194-197), Altitude sudah
						// dimuat sehingga getCellHeight tidak lagi diam-diam
						// mengembalikan 0.0, dan sprite kita sendiri sudah
						// terdaftar. BARU sekarang entity pemain lain aman
						// dibuat.
						//
						// Dibungkus try/catch sendiri, bukan dibiarkan naik:
						// selama sebuah pesan ditangani langsung di
						// goSocket.onMessage ia dilindungi try/catch di sana,
						// tapi badan yang DIANTRE berjalan di sini -- di dalam
						// callback map loader. Lemparan yang lolos akan
						// menghentikan onMapComplete di tengah jalan tanpa satu
						// baris log pun, persis kelas kegagalan senyap yang
						// perbaikan ini ada untuk menghapus.
						try {
							const dikuras = antrean.siapkan();
							log(`antrean entity dikuras: ${dikuras} pesan yang tertahan dijalankan sekarang.`);
						} catch (err) {
							log(`! gagal menjalankan pesan entity yang tertahan: ${err.message}`);
						}
					};

					// SEBELUM setMap, bukan sesudah: begitu setMap dipanggil,
					// EntityManager.free() sudah terjadwal dan setiap entity
					// yang dibuat sampai onLoad berjalan pasti tersapu.
					// Ditaruh di sini, bukan sekali di tingkat modul, supaya
					// pergantian map di kemudian hari ikut tertutup -- pesan
					// yang tertahan untuk map LAMA dibuang, bukan dikuras ke
					// map BARU.
					antrean.reset();

					const rsw = rswFileName(info.mapName);
					log(`memuat ${rsw} dari GRF ...`);
					MapRenderer.setMap(rsw);
					return;
				}

				const ht = decodeZoneTick(schema.ServerMsg, data);
				if (ht) {
					const lompat = lompatanTick(tickSebelumnya, ht.tick);
					const terbuang = tickTerbuang(serverTimeSebelumnya, ht.serverTimeMs);
					tickSebelumnya = ht.tick;
					serverTimeSebelumnya = ht.serverTimeMs;

					let catatan = lompat === null ? '' : lompat === 20 ? `  (+${lompat})` : `  (+${lompat}  <- heartbeat hilang!)`;
					if (terbuang !== null && terbuang > 0) {
						catatan += ` zone membuang ${terbuang} tick!`;
					}

					log(`< zone tick ${ht.tick}, ${ht.entities} entity${catatan}`);
					window.__m2.tick = ht;
					return;
				}

				// decodeMove, decodeSpawn, dan decodeDespawn menerima ServerMsg yang
				// sudah didekode (lihat JSDoc masing-masing di mapinfo.js), berbeda
				// dari decode* lain di atas yang mendekode dari buffer mentah
				// sendiri-sendiri. msg didekode SEKALI di sini, di atas ketiga
				// cabang yang memakainya.
				const msg = schema.ServerMsg.decode(new Uint8Array(data));

				const sp = decodeSpawn(msg);
				if (sp) {
					// Ditahan sampai map siap. Tanpa ini entity dibuat lalu
					// dihapus EntityManager.free() beberapa ratus milidetik
					// kemudian -- lihat buatAntrean di mapinfo.js.
					antrean.jalankan(() => penggerak.spawnkan(sp));
					return;
				}

				const dp = decodeDespawn(msg);
				if (dp) {
					// Ikut diantre, dan itu WAJIB: despawn yang dijalankan
					// sekarang sementara spawn-nya masih tertahan akan
					// menghapus sesuatu yang belum ada, lalu spawn yang
					// menyusul membuat sprite hantu yang menetap selamanya.
					// Urutan tiba dipertahankan oleh antrean.
					antrean.jalankan(() => {
						// removeEntity, BUKAN removeGID. removeGID hanya
						// menghapus entri peta dan MEMBIARKAN entity tetap di
						// _list, sehingga ia terus dirender selamanya. Nama
						// yang lebih pendek adalah yang salah.
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
					// Diantre bersama spawn dan despawn, di antrean yang SAMA:
					// EvtMove(A) yang datang menyusul EvtSpawn(A) dalam satu
					// Apply harus tetap berjalan SESUDAH spawn-nya, dan itu
					// hanya terjamin bila keduanya melewati antrean yang sama.
					antrean.jalankan(() => {
						// Rute berdasarkan entity_id, bukan saring. Di M4 ini
						// penjaga yang MEMBUANG gerak yang bukan milik kita;
						// M5 justru menginginkannya.
						//
						// EntityManager.get() memotong jalan lewat
						// Session.Entity.GID === gid, jadi satu pemanggilan
						// melayani sprite kita sendiri maupun pemain lain.
						const e = EntityManager.get(mv.entityId);
						if (!e) {
							// BUKAN diabaikan diam-diam: ini satu-satunya
							// gejala yang terlihat bila urutan EvtSpawn dan
							// EvtMove kacau, dan menelannya membuat bug urutan
							// menyamar sebagai "kadang pemain lain tidak
							// bergerak".
							log(`! gerak untuk entity ${mv.entityId} yang tak dikenal — abaikan`);
							return;
						}
						log(`< gerak entity ${mv.entityId}: ${mv.path.length - 1} langkah, ${mv.speedMs} ms/cell`);
						penggerak.jalankanSepanjang(e, mv.path, mv.speedMs);
						window.__m2.gerakTerakhir = mv;
					});
					return;
				}

				if (msg.damage) {
					const d = decodeDamage(msg.damage);
					// Diantre bersama spawn/despawn/move: angka damage yang
					// digambar sebelum spawn korbannya berjalan akan mencari
					// entity yang belum ada.
					antrean.jalankan(() => penggerak.tampilkanDamage(d));
					return;
				}

				if (msg.death) {
					const dt = decodeDeath(msg.death);
					antrean.jalankan(() => penggerak.matikanSprite(dt.entityId));
					return;
				}

				if (msg.itemTanah) {
					const it = decodeItemTanah(msg.itemTanah);
					antrean.jalankan(() => gambarItem(it));
					return;
				}

				if (msg.itemHilang) {
					const h = decodeItemHilang(msg.itemHilang);
					antrean.jalankan(() => hapusItem(h.groundId));
					return;
				}

				log(`< pesan tanpa body yang dikenali (${data.byteLength} byte)`);
			} catch (err) {
				log(`! frame tidak dapat didekode (${data.byteLength} byte): ${err.message}`);
				log('! kemungkinan skema client dan server berbeda — coba hard reload (Ctrl+Shift+R)');
			}
		};

		log(`> minta masuk map: ${MAP_NAME}`);
		Network.send(encodeEnterMap(schema.ClientMsg, MAP_NAME));
	}, false);
});

q.run();

// EntityManager ikut diekspos supaya verifikasi manusia di konsol browser
// dapat membuktikan pendaftaran tanpa membaca kode: __m2.spot.ACTION.WALK
// harus 1, dan __m2.EntityManager.forEach(e => console.log(e === __m2.spot))
// harus mencetak true tepat sekali.
// antrean ikut diekspos karena C1 hanya dapat dibuktikan penuh oleh mata
// manusia: __m2.antrean.jumlahTertunda() harus > 0 selama map masih dimuat
// pada browser KEDUA, dan 0 sesudah baris "antrean entity dikuras" muncul.
window.__m2 = { Configs, MapRenderer, Altitude, Camera, Session, EntityManager, antrean, spot, log, tick: null, gerakTerakhir: null };
