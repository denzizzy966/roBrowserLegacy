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
import DB            from 'DB/DBManager.js';
import Damage        from 'Renderer/Effects/Damage.js';

import GoSocket        from '../m1-harness/GoSocket.js';
import { loadSchema }  from '../m1-harness/proto.js';
import { decodeDamage, decodeDeath, decodeItemTanah, decodeItemHilang, persenDarah, encodeSatuField, pilihTerdekat, BERKAS_SKIN_DAMAGE, ringkasProbeSkin, barisHUD, JENIS_MISS, JENIS_KRITIKAL, namaMob, hidupkanBar } from './tempur.js';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, spawnPlacement, decodeZoneTick, lompatanTick, tickTerbuang, decodeMove, decodeSpawn, decodeDespawn, objecttypeDari, pathKeInt16, encodeMove, arahLangkah, buatAntrean } from './mapinfo.js';

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
	EntityManager.add(spot);

	periksaPendaftaran(spot);
}

// Membuktikan sebuah entity benar-benar akan dirender DAN benar-benar bisa
// berjalan, lalu mencetak diagnostik keras bila tidak.
//
// Diangkat jadi pembantu bersama, bukan disalin: daftarkanEntity (sprite
// kita) dan spawnkanLain (pemain lain) memanggil set() dengan payload yang
// SAMA, jadi bila payload itu kelak rusak keduanya rusak berbarengan --
// tapi sampai review akhir M5 hanya sisi kita yang memeriksanya. Pemain
// lain akan diam-diam berhenti beranimasi sementara sprite kita berteriak,
// dan pemeriksaan inilah yang membuat kegagalan render senyap di M4 dapat
// ditemukan sama sekali.
function periksaPendaftaran(entity) {
	// Diperiksa lewat _list yang sesungguhnya, BUKAN EntityManager.get():
	// get() memotong jalan lewat `Session.Entity.GID === gid` dan akan
	// mengembalikan spot walau ia tidak pernah masuk render list --
	// pemeriksaan yang selalu lulus dan karenanya tidak memeriksa apa pun.
	let diRenderList = false;
	EntityManager.forEach((e) => {
		if (e === entity) {
			diRenderList = true;
			return false;
		}
		return true;
	});

	const walkSah = entity.ACTION.WALK >= 0;
	log(diRenderList && walkSah
		? `entity terdaftar: GID ${entity.GID}, objecttype ${entity.objecttype}, ACTION.WALK ${entity.ACTION.WALK} — walkProcess akan berjalan tiap frame.`
		: `! PENDAFTARAN GAGAL: diRenderList=${diRenderList}, ACTION.WALK=${entity.ACTION.WALK} — sprite tidak akan berjalan.`);
	if (diRenderList && !walkSah) {
		log('! ACTION.WALK masih -1 sementara entity SUDAH dirender: konsol akan dibanjiri CHARACTER STUCK IN WALKING ANIMATION tiap frame.');
	}
}

// Membuat entity untuk pemain LAIN maupun monster.
//
// Sama persis dengan daftarkanEntity, minus dua hal: ia tidak pernah
// menjadi Session.Entity, dan kamera tidak pernah menargetnya. objecttype
// tidak lagi ditulis tetap ke TYPE_PC -- ia ditentukan dari sp.type lewat
// objecttypeDari, dan head/sex kini hanya diberikan untuk PC (lihat
// komentar di dalam fungsi ini).
function spawnkanLain(sp) {
	if (EntityManager.get(sp.entityId)) {
		// Sudah ada. Bisa terjadi bila server mengirim spawn dua kali;
		// perbarui posisi alih-alih membuat entity kedua di GID yang sama.
		const ada = EntityManager.get(sp.entityId);
		ada.position[0] = sp.x;
		ada.position[1] = sp.y;
		ada.position[2] = Altitude.getCellHeight(sp.x, sp.y);
		log(`< spawn ulang entity ${sp.entityId} di (${sp.x},${sp.y})`);
		return ada;
	}

	const objecttype = objecttypeDari(sp.type);
	if (objecttype === null) {
		// Menggambar tebakan lebih buruk daripada tidak menggambar.
		log(`! spawn entity ${sp.entityId} bertipe ${sp.type} yang tak dikenal — dilewati`);
		return null;
	}

	const lain = new Entity();
	const unit = { objecttype, GID: sp.entityId, job: sp.job };
	// head dan sex khusus PC. getBodyPath untuk id non-pemain (mob,
	// 1001-3999) jatuh ke cabang terakhirnya, 'data/sprite/몬스터/' +
	// MonsterTable[id] -- bukan data/sprite/npc/, itu cabang isNPC (id
	// 46-129, 401-999) yang tidak pernah disentuh mob. Memberi head pada
	// mob membuat UpdateHead mencari sprite kepala untuk id 1002 (keputusan
	// A10). Ini kesalahan M4 yang DIBALIK: bukan field yang hilang,
	// melainkan field yang tidak semestinya ada.
	if (objecttype === Entity.TYPE_PC) {
		unit.sex = 1;
		unit.head = 1;
	}
	lain.set(unit);
	lain.position[0] = sp.x;
	lain.position[1] = sp.y;
	lain.position[2] = Altitude.getCellHeight(sp.x, sp.y);
	// __m2MaxHP disimpan di entity supaya EvtDamage -- yang hanya membawa
	// hp_sisa -- dapat dihitung jadi persen. Prefiks __m2 menandai ia
	// milik harness, bukan field roBrowserLegacy.
	lain.__m2MaxHP = sp.maxHp;
	EntityManager.add(lain);

	// M6e -- nama dan bar HP, untuk MOB saja.
	//
	// Keduanya milik roBrowserLegacy dan sudah dirender tiap frame oleh
	// EntityRender (baris 152 dan 158), yang dijalankan
	// EntityManager.render(). Harness sudah masuk rantai itu sejak
	// perbaikan M5 -- jebakan walkProcess M4 tidak berlaku di sini.
	//
	// Pemain sengaja tidak diberi keduanya: bar HP pemain milik
	// UI/Components/BasicInfo, dan HP-nya sudah terlihat di panel HUD.
	if (objecttype === 5) {
		lain.display.name = namaMob(sp.job, (j) => DB.getMonsterName(j));
		lain.display.add();
		if (!hidupkanBar(lain.life, sp.hp, sp.maxHp)) {
			// TIDAK diabaikan diam-diam: bar yang tidak menyala adalah
			// gejala satu-satunya bila EvtSpawn tiba tanpa hp/max_hp.
			log(`! bar HP entity ${sp.entityId} tidak menyala (hp ${sp.hp}/${sp.maxHp})`);
		}
	}
	log(`< spawn entity ${sp.entityId} di (${sp.x},${sp.y})`);
	periksaPendaftaran(lain);
	return lain;
}

// Menyuntikkan jalur dari server ke struktur walk milik roBrowserLegacy.
//
// Ini padanan walkTo() yang melakukan semuanya KECUALI memanggil A*
// client: keputusan D8 menyerahkan pathfinding sepenuhnya ke server,
// sehingga dua implementasi tidak perlu sepakat sampai ke urutan
// tie-break.
//
// Hanya menyentuh field publik. Nol berkas client/src/ berubah.
function jalankanSepanjang(entity, jalur, speedMs) {
	if (jalur.length < 2) {
		return;
	}

	const adaRute = entity.walk && entity.walk.total > 0;
	// Dibaca SEBELUM resetRoute, sama seperti walkTo asli (EntityWalk.js:335):
	// resetRoute tidak menyentuh entity.action, tapi urutan ini menjaga
	// niatnya tetap jelas bagi pembaca berikutnya.
	const sudahBerjalan = entity.action === entity.ACTION.WALK;
	entity.resetRoute(adaRute);

	entity.walk.path  = pathKeInt16(jalur);
	entity.walk.index = 2;              // lewati asal, sama seperti walkTo
	entity.walk.total = jalur.length * 2;
	entity.walk.speed = speedMs;
	entity.walk.pos.set(entity.position);
	entity.walk.lastPos.set(entity.position);
	entity.walk.tick = entity.walk.prevTick = Date.now();

	// Langkah dari A* server selalu satu petak, jadi dx/dy selalu di
	// {-1,0,1} dan tabel arahLangkah cukup -- tidak perlu trigonometri.
	const dx = jalur[1].x - jalur[0].x;
	const dy = jalur[1].y - jalur[0].y;
	entity.direction = arahLangkah(dx, dy);
	entity.headDir = 0;

	// Klik ulang saat sprite SEDANG berjalan adalah kejadian normal;
	// setAction tanpa syarat akan menyentak animasi balik ke frame 0
	// tiap klik. walkTo asli membungkusnya sama persis (EntityWalk.js:374).
	if (!sudahBerjalan) {
		entity.setAction({
			action: entity.ACTION.WALK,
			frame: 0,
			repeat: true,
			play: true
		});
	}
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

/**
 * Menampilkan satu angka damage di atas korban, dan memainkan animasi
 * serang pada penyerang.
 *
 * Damage.add TERJANGKAU tanpa menyentuh client/src: ia statis pada
 * default export Renderer/Effects/Damage.js, dan seluruh siklus hidupnya
 * digerakkan MapRenderer -- Damage.init di onMapComplete (jalur setMap
 * yang harness pakai) dan Damage.render di loop render tiap frame.
 * Karena itu Damage.add akan benar-benar tergambar; tidak seperti
 * entity.walk di M4, yang diisi dengan benar dan tak pernah dibaca.
 */
function tampilkanDamage(d) {
	const korban = EntityManager.get(d.dst);
	if (!korban) {
		// BUKAN diabaikan diam-diam: ini gejala yang terlihat bila urutan
		// EvtSpawn dan EvtDamage kacau.
		log(`! damage untuk entity ${d.dst} yang tak dikenal -- abaikan`);
		return;
	}
	log(`< damage ${d.src} -> ${d.dst}: ${d.amount} (sisa ${d.hpSisa} = ${persenDarah(d.hpSisa, korban.__m2MaxHP)}%)`);

	// Panel HUD SELALU dicatat, bahkan bila Damage.add berhasil: ia yang
	// menjamin milestone dapat diamati, dan angka bawaan adalah bonus.
	catatHUD(barisHUD(d, korban.__m2MaxHP));

	// Bar HP korban ikut turun. hpSisa dipakai apa adanya -- server yang
	// menghitungnya, dan client tidak pernah mengurangi sendiri (spec
	// induk Bagian 8.3).
	hidupkanBar(korban.life, d.hpSisa, korban.__m2MaxHP);

	// Jenis diteruskan ke tampilan bawaan roBrowserLegacy juga.
	// Damage.TYPE punya MISS dan CRIT sejak lama (Damage.js:680).
	//
	// Ini BONUS, bukan tumpuan: skinnya bisa diam tanpa galat, dan panel
	// HUD di atas yang menjamin milestone dapat diamati.
	let tipe = Damage.TYPE.DAMAGE | Damage.TYPE.ENEMY;
	if (d.jenis === JENIS_MISS) {
		tipe = Damage.TYPE.MISS;
	} else if (d.jenis === JENIS_KRITIKAL) {
		tipe |= Damage.TYPE.CRIT;
	}
	Damage.add(d.amount, korban, Renderer.tick, null, tipe);

	// Animasi serang pada PENYERANG. setAction dipasang ke tiap instance
	// Entity (EntityAction.js), jadi terjangkau dari luar. ACTION.ATTACK
	// bernilai -2 dan diterjemahkan sendiri ke ATTACK1/2/3 menurut senjata.
	const penyerang = EntityManager.get(d.src);
	if (penyerang && penyerang.setAction) {
		penyerang.setAction({
			action: penyerang.ACTION.ATTACK,
			frame: 0,
			repeat: false,
			play: true,
			next: { action: penyerang.ACTION.IDLE, frame: 0, repeat: true, play: true, next: false },
		});
	}
}

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
					antrean.jalankan(() => spawnkanLain(sp));
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
						jalankanSepanjang(e, mv.path, mv.speedMs);
						window.__m2.gerakTerakhir = mv;
					});
					return;
				}

				if (msg.damage) {
					const d = decodeDamage(msg.damage);
					// Diantre bersama spawn/despawn/move: angka damage yang
					// digambar sebelum spawn korbannya berjalan akan mencari
					// entity yang belum ada.
					antrean.jalankan(() => tampilkanDamage(d));
					return;
				}

				if (msg.death) {
					const dt = decodeDeath(msg.death);
					antrean.jalankan(() => {
						log(`< mati: entity ${dt.entityId}`);
						// Dihapus DI SINI, bukan menunggu EvtDespawn: mob mati
						// dihapus dari zone, jadi tidak akan pernah ada despawn
						// untuknya. Pemain yang mati justru TIDAK dihapus --
						// EvtSpawn menyusul di titik spawn -- jadi menghapusnya
						// di sini pun aman: spawn berikutnya membuatnya lagi.
						if (EntityManager.get(dt.entityId)) {
							EntityManager.remove(dt.entityId);
						}
					});
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
