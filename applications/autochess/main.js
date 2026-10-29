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
// - AC2: EvtSkillMulai, EvtSkillKena, EvtStatus, dan EvtSP digambar oleh
//   efek.js; galat dekode dan galat handler dilaporkan terpisah
//   (buatPenerima di pesan.js).
// - AC3: EvtCaturState, EvtCaturFase, EvtCaturHasil, dan EvtCaturSelesai
//   masuk state.js; panel #ui (ui.js) digambar ulang tiap 250 ms dan
//   tombolnya mengirim perintah catur lewat kirim(aksi, arg).
// - AC4: teks.js (kamus ID/EN, bahasa dari Preferences) dan potret.js
//   (sprite unit ke kanvas 2D); __ac.cobaPotret adalah spike-nya.
//   sorot.js (sorotan petak, spike __ac.cobaSorot) dan seret.js
//   (seret-lepas bangku <-> papan <-> toko lewat pointer events).
//   bintang.js (naik bintang: EF_ANGEL di papan, kilat + levelup.wav di
//   bangku) dan bgm.js (BGM dari mp3 yang dipilih di dialog Intro).
//
// Nol berkas client/src/ berubah: semuanya lewat API publik.

import Queue         from 'Utils/Queue.js';
import Client        from 'Core/Client.js';
import Thread        from 'Core/Thread.js';
import BGM           from 'Audio/BGM.js';
import SoundManager  from 'Audio/SoundManager.js';
import PrefAudio     from 'Preferences/Audio.js';
import EffectConst   from 'DB/Effects/EffectConst.js';
import Renderer      from 'Renderer/Renderer.js';
import MapRenderer   from 'Renderer/MapRenderer.js';
import Altitude      from 'Renderer/Map/Altitude.js';
import Camera        from 'Renderer/Camera.js';
import SpriteRenderer from 'Renderer/SpriteRenderer.js';
import Preferences   from 'Core/Preferences.js';
import Entity        from 'Renderer/Entity/Entity.js';
import EntityManager from 'Renderer/EntityManager.js';
import Session       from 'Engine/SessionStorage.js';
import Intro         from 'UI/Components/Intro/Intro.js';
import Network       from 'Network/NetworkManager.js';
import EffectManager from 'Renderer/EffectManager.js';
import Damage        from 'Renderer/Effects/Damage.js';
import SK            from 'DB/Skills/SkillConst.js';
import SkillEffect   from 'DB/Skills/SkillEffect.js';
import FlatColorTile from 'Renderer/Effects/FlatColorTile.js';
import Mouse         from 'Controls/MouseEventHandler.js';
import Cursor        from 'UI/CursorManager.js';

import GoSocket          from '../m1-harness/GoSocket.js';
import { loadSchema }    from '../m1-harness/proto.js';
import { buatPenggerak } from '../shared/entitas.js';
import { decodeDamage, decodeDeath, hidupkanBar, mainkanAksi } from '../harness/tempur.js';
import { rswFileName, decodeMapInfo, decodeServerError, decodeMove, decodeDespawn, buatAntrean } from '../harness/mapinfo.js';
import {
	encodeCaturMasuk, encodeCaturSiap, decodeSpawnLengkap, decodeCaturFase, decodeCaturHasil,
	decodeCaturState, decodeCaturSelesai,
	decodeSkillMulai, decodeSkillKena, decodeStatus, decodeSP, JENIS_DAMAGE_HEAL, buatPenerima, amankan, FASE
} from './pesan.js';
import { buatManajerEfek } from './efek.js';
import { SKALA_PETAK, pusatPapan } from './papan.js';
import { buatState } from './state.js';
import { muatKatalog, buatKatalog } from './katalog.js';
import { buatTeks, formatZeny } from './teks.js';
import { buatPotret } from './potret.js';
import { buatSorot } from './sorot.js';
import { buatSeret } from './seret.js';
import { buatDPS } from './dps.js';
import { deteksiNaikBintang } from './bintang.js';
import { pilihBGM } from './bgm.js';
import TimerJ     from './ui/Timer/Timer.js';
import KapasitasJ from './ui/Kapasitas/Kapasitas.js';
import ZenyJ      from './ui/Zeny/Zeny.js';
import ExpJ       from './ui/Exp/Exp.js';
import TokoJ      from './ui/Toko/Toko.js';
import TombolTokoJ from './ui/TombolToko/TombolToko.js';
import BangkuJ     from './ui/Bangku/Bangku.js';
import DaftarPemainJ from './ui/DaftarPemain/DaftarPemain.js';
import InfoPemainJ from './ui/InfoPemain/InfoPemain.js';
import SinergiJ   from './ui/Sinergi/Sinergi.js';
import LoreJ      from './ui/Lore/Lore.js';
import DPSJ       from './ui/DPS/DPS.js';
import TombolDPSJ from './ui/TombolDPS/TombolDPS.js';
import { renderUI, perbaruiTimer, ikatAksi, sandikanAksi, namaFase, simpanPilihan, pulihkanPilihan } from './ui.js';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5121;
const SCHEMA_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/proto/ro.proto`;
const KATALOG_URL = `http://${SERVER_HOST}:${SERVER_PORT}/catur/katalog.json`;

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
const uiEl   = document.getElementById('ui');

function log(msg) {
	logEl.textContent += msg + '\n';
	logEl.scrollTop = logEl.scrollHeight;
	console.log('[ac]', msg);
}

// PC yang mati dihapus seperti mob: kamera tidak menempel ke bidak mana
// pun, jadi tidak ada target kamera yang bisa menjadi hantu.
const penggerak = buatPenggerak({ log, hapusPCSetelahMati: true });

// AC2: skill, status, dan SP. Modul client/src/ disuntikkan supaya efek.js
// teruji tanpa WebGL.
const efek = buatManajerEfek({
	EntityManager, EffectManager, Damage, Renderer, Altitude, SkillEffect,
	hidupkanBar, mainkanAksi, log
});

// AC4: bahasa UI tersimpan di localStorage 'AutochessBahasa' (Q5).
const teks = buatTeks({ pref: Preferences.get('AutochessBahasa', { bahasa: 'id' }, 1.0), log });
teks.padaUbah((kode) => {
	log(`bahasa UI: ${kode}`);
	gambarJendela();
});

// AC4: potret sprite unit ke kanvas 2D (Q2). Butuh GRF terindeks; sebelum
// itu kanvasnya kosong (statis menyerah sesudah 5 s dengan satu log).
const potret = buatPotret({ Entity, SpriteRenderer, Camera, log });

// AC4: sorotan petak papan (Q4) lewat FlatColorTile + EffectManager.
const sorot = buatSorot({ EffectManager, FlatColorTile, Altitude, Renderer, asal: ASAL_PAPAN, skala: SKALA_PETAK, log });

// Total damage per entity untuk jendela DPS (F); direset tiap TEMPUR.
const dps = buatDPS();

// AC4: seret-lepas bidak (Q3). Jendela dan katalog diambil saat dipakai:
// host jendela baru ada sesudah append, katalog diganti saat termuat.
const seret = buatSeret({
	dokumen: document, Mouse, Renderer, Cursor, asal: ASAL_PAPAN, skala: SKALA_PETAK,
	ambilSnap: () => st.ambil(), kirim, potret, katalog: () => katalog,
	elemenBangku: () => BangkuJ._host, elemenToko: () => TokoJ._host, sorot, log
});

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
// Diganti baru setiap EvtMapInfo (lihat muatArena).
let st = buatState();
// Katalog nama/sprite/sinergi dari server; kosong sampai termuat (atau bila gagal).
let katalog = buatKatalog({});
// HTML #ui terakhir yang digambar; '' memaksa redraw (lihat gambarUI).
let htmlTerakhir = '';
// performance.now() saat tombol pointer ditekan di dalam #ui; null =
// tidak ada yang ditahan (lihat gambarUI).
let ditahanSejak = null;
// AC4 (Q6): BGM tidak ada di GRF, jadi mp3 diambil dari berkas yang
// dipilih pemain di dialog Intro dan dimainkan lewat object URL.
let bgmBerkas = null;
let bgmUrl = null;
let pertandinganSelesai = false;

/** Memuat BGM terpilih sekali, setelah map pertama termuat. */
function mulaiBGM() {
	if (!bgmBerkas || (bgmUrl && !BGM.audio.paused)) {
		return;
	}
	bgmUrl ??= URL.createObjectURL(bgmBerkas);
	BGM.filename = bgmBerkas.name;
	BGM.load(bgmUrl); // menghormati PrefAudio.BGM.play
	log(`bgm: ${bgmBerkas.name}`);
}

/** Kendali tombol BGM di InfoPemain; null bila tidak ada mp3. */
const kendaliBGM = {
	aktif: () => Boolean(PrefAudio.BGM.play),
	toggle() {
		PrefAudio.BGM.play = !PrefAudio.BGM.play;
		PrefAudio.save();
		if (!PrefAudio.BGM.play) {
			BGM.stop();
		} else if (bgmUrl && !pertandinganSelesai) {
			BGM.load(bgmUrl);
		}
		log(`bgm: ${PrefAudio.BGM.play ? 'hidup' : 'mati'}`);
	}
};

/** Efek + suara untuk bidak yang baru naik bintang (Q7). */
function rayakanNaikBintang(nb) {
	log(`naik bintang: ${nb.unitId} ★${nb.bintang}`);
	const entity = nb.entityId > 0 ? EntityManager.get(nb.entityId) : null;
	if (entity) {
		EffectManager.spam({ effectId: EffectConst.EF_ANGEL, ownerAID: nb.entityId, position: entity.position });
		return;
	}
	if (!nb.diPapan) {
		BangkuJ.kilat(nb.bidakId);
	}
	SoundManager.play('levelup.wav');
}

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
		bgmBerkas = pilihBGM(files);
		log(`${files.length} berkas diterima, mengindeks GRF ...`);
		Client.onFilesLoaded = q.next;
		Client.init(files);
	};
	Intro.append();
});

q.add(async function () {
	Intro.remove();
	log(`GRF terindeks dalam ${detikSejakBerkas()} s.`);
	siapkanKursor();

	try {
		log(`memuat skema dari ${SCHEMA_URL} ...`);
		schema = await loadSchema(SCHEMA_URL);
		log('skema termuat.');
	} catch (err) {
		log(`! gagal memuat skema: ${err.message}`);
		return;
	}

	// Katalog tidak kritis untuk koneksi: bila gagal, UI jatuh ke id mentah.
	try {
		const json = await muatKatalog(fetch, KATALOG_URL);
		katalog = buatKatalog(json, log);
		log(`katalog termuat: ${Object.keys(json.units ?? {}).length} unit, ${Object.keys(json.sinergi ?? {}).length} sinergi`);
	} catch (err) {
		log(`! katalog gagal dimuat, lanjut tanpa nama: ${err.message}`);
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

/**
 * Mendekode satu frame. Galat di SINI -- dan hanya di sini -- berarti
 * skema client dan server berbeda (lihat buatPenerima di pesan.js).
 *
 * Frame non-MapInfo didekode TIGA kali (galat, MapInfo, lalu ServerMsg)
 * -- sama dengan harness. Dibiarkan: decodeServerError/decodeMapInfo milik
 * harness menerima byte, dan biayanya kecil dibanding satu tick.
 */
function dekodeFrame(data) {
	return {
		galat: decodeServerError(schema.ServerMsg, data),
		info:  decodeMapInfo(schema.ServerMsg, data),
		msg:   schema.ServerMsg.decode(new Uint8Array(data))
	};
}

/**
 * Menahan fn sampai map siap (lihat antrean), dengan badannya dibungkus
 * amankan: satu pesan yang gagal digambar tidak membuang pesan tertahan
 * di belakangnya, dan tidak dilaporkan sebagai galat skema.
 */
function jalankan(fn) {
	antrean.jalankan(amankan(fn, log));
}

/** Meneruskan satu frame yang sudah didekode ke handler-nya. */
function tanganiPesan({ galat, info, msg }, data) {
	if (galat) {
		log(`! server menolak: ${galat}`);
		return;
	}

	if (info) {
		muatArena(info);
		return;
	}

	// State catur diperbarui SEKETIKA, di luar antrean: panel #ui tidak
	// bergantung pada map, dan jam countdown harus mulai saat pesan tiba,
	// bukan saat antrean dikuras.
	const cs = decodeCaturState(msg);
	if (cs) {
		st.terima(cs, performance.now());
		// Efek naik bintang dibungkus: kegagalannya tidak boleh menahan gambar ulang.
		amankan(() => deteksiNaikBintang(st.sebelumnya(), cs).forEach(rayakanNaikBintang), log)();
		gambarJendelaAman();
		return;
	}

	const selesai = decodeCaturSelesai(msg);
	if (selesai) {
		st.terimaSelesai(selesai);
		pertandinganSelesai = true;
		BGM.stop();
		log(`< selesai: peringkatmu #${selesai.peringkatSaya}`);
		return;
	}

	const fase = decodeCaturFase(msg);
	if (fase) {
		st.terimaFase(fase, performance.now());
		if (fase.fase === FASE.TEMPUR) {
			dps.reset();
		}
		gambarJendelaAman();
		jalankan(() => {
			log(`< fase: ${namaFase(fase.fase)} ronde ${fase.ronde} (sisa ${fase.sisaMs} ms)`);
			aturBanner(`Ronde ${fase.ronde} — ${namaFase(fase.fase)}`);
		});
		return;
	}

	const hasil = decodeCaturHasil(msg);
	if (hasil) {
		st.terimaHasil(hasil);
		gambarJendelaAman();
		jalankan(() => {
			let teks = hasil.menang ? 'MENANG' : 'KALAH';
			if (hasil.seri) {
				teks = 'SERI';
			}
			log(`< hasil: ${teks} (ronde ${hasil.ronde})`);
			aturBanner(teks);
		});
		return;
	}

	const sp = decodeSpawnLengkap(msg);
	if (sp) {
		jalankan(() => penggerak.spawnkan(sp));
		return;
	}

	const dp = decodeDespawn(msg);
	if (dp) {
		jalankan(() => {
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
		jalankan(() => {
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
		dps.damage(d.src, d.amount, d.jenis);
		jalankan(() => penggerak.tampilkanDamage(d));
		return;
	}

	if (msg.death) {
		const dt = decodeDeath(msg.death);
		jalankan(() => penggerak.matikanSprite(dt.entityId));
		return;
	}

	const sm = decodeSkillMulai(msg);
	if (sm) {
		jalankan(() => {
			log(`< skill ${sm.skid} lv ${sm.lv}: ${sm.src} -> ${sm.dst || `(${sm.x},${sm.y})`}, cast ${sm.castMs} ms`);
			efek.mulaiSkill(sm);
		});
		return;
	}

	const sk = decodeSkillKena(msg);
	if (sk) {
		dps.skill(sk.src, sk.kena);
		jalankan(() => {
			const daftar = sk.kena.map((k) => `${k.dst}:${k.amount}${k.jenis === JENIS_DAMAGE_HEAL ? '+' : ''}`).join(' ');
			log(`< skill ${sk.skid} kena dari ${sk.src} di (${sk.x},${sk.y}): ${daftar || '(tak ada korban)'}`);
			efek.kenaSkill(sk);
		});
		return;
	}

	// Bukan `st`: nama itu milik state catur di lingkup modul, dan
	// `const` di sini akan menutupinya (TDZ) untuk seluruh fungsi.
	const status = decodeStatus(msg);
	if (status) {
		jalankan(() => {
			log(`< status ${status.efst} ${status.aktif ? 'aktif' : 'lepas'} pada ${status.entityId}${status.aktif ? ` (${status.durasiMs} ms)` : ''}`);
			efek.ubahStatus(status);
		});
		return;
	}

	// EvtSP tidak dicatat ke log: ia tiba setiap SP berubah, beberapa kali
	// per detik per bidak, dan akan menenggelamkan baris lain.
	const spBaru = decodeSP(msg);
	if (spBaru) {
		jalankan(() => efek.ubahSP(spBaru));
		return;
	}

	log(`< pesan tanpa body yang dikenali (${data.byteLength} byte)`);
}

/** Menangani satu frame dari server. */
const terimaPesan = buatPenerima({ dekode: dekodeFrame, tangani: tanganiPesan, log });

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
		mulaiBGM();

		// Kamera WAJIB punya target pada setiap jalur sebelum onLoad
		// selesai: onMapComplete memanggil Renderer.render(onRender) tanpa
		// syarat sesudahnya, dan onRender mendereferensi target.position.
		spot.position[0] = info.spawnX;
		spot.position[1] = info.spawnY;
		spot.position[2] = Altitude.getCellHeight(info.spawnX, info.spawnY);

		pasangJendela();

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
	// titik ini ditahan sampai onLoad di atas. State catur juga dibuang:
	// server mengirim EvtMapInfo lebih dulu daripada state pertandingan
	// baru (lihat aktor.go), jadi selesai/hasil pertandingan lama tidak
	// boleh tertinggal.
	antrean.reset();
	pertandinganSelesai = false;
	st = buatState();
	htmlTerakhir = '';
	aturBanner('');

	const rsw = rswFileName(info.mapName);
	log(`memuat ${rsw} dari GRF ...`);
	MapRenderer.setMap(rsw);
}

q.run();

/**
 * Mengirim satu perintah catur dari panel #ui (atau konsol: __ac.kirim).
 *
 * @param {string} aksi - nama data-aksi (lihat ui.js), atau 'keluar'
 * @param {object} [arg]
 * @returns {boolean} false bila belum tersambung atau aksi tak dikenal
 */
function kirim(aksi, arg = {}) {
	if (!schema || !goSocket) {
		log('! belum tersambung');
		return false;
	}
	let buf;
	try {
		buf = sandikanAksi(schema.ClientMsg, aksi, arg);
	} catch (err) {
		log(`! ${err.message}`);
		return false;
	}
	log(`> ${aksi} ${JSON.stringify(arg)}`);
	Network.send(buf);
	return true;
}

/**
 * Tekan lebih lama dari ini tidak lagi menahan redraw: pointerup bisa
 * tidak pernah tiba (mis. popup select bawaan menelannya), dan panel
 * tidak boleh membeku melintasi pergantian fase karenanya.
 */
const BATAS_TAHAN_MS = 1000;

/**
 * Dipanggil tiap 250 ms. Hitung mundur hanya ditulis ke node #timer
 * (perbaruiTimer); innerHTML #ui baru diganti bila keluaran renderUI
 * berubah, yaitu saat pesan server mengubah state -- renderUI tidak
 * bergantung jam. Dulu timer ikut di HTML sehingga panel dibangun ulang
 * tiap detik: klik yang mouseup-nya jatuh sesudah penggantian hilang
 * (~1 dari 10) dan dropdown yang terbuka tertutup.
 *
 * Bila berubah, panel dibangun ulang juga saat sebuah select difokus
 * (melewatinya membekukan fase dan status disabled tombol); pilihan dan
 * fokus disimpan lalu dipulihkan per bidak (simpanPilihan/pulihkanPilihan
 * di ui.js). Satu-satunya penundaan: selama tombol pointer ditahan di
 * dalam #ui (paling lama BATAS_TAHAN_MS), supaya klik yang sedang
 * berlangsung tidak kehilangan tombolnya; redraw menyusul saat dilepas.
 */
function gambarUI() {
	const sekarang = performance.now();
	const ditahan = ditahanSejak !== null && sekarang - ditahanSejak < BATAS_TAHAN_MS;
	const html = renderUI(st.ambil());
	if (html !== htmlTerakhir && !ditahan) {
		const simpanan = simpanPilihan(uiEl, document.activeElement);
		uiEl.innerHTML = html;
		htmlTerakhir = html;
		pulihkanPilihan(uiEl, simpanan);
	}
	perbaruiTimer(uiEl, st.sisaMs(sekarang));
}

const gambarUIAman = amankan(gambarUI, log);

// AC4: jendela bergaya RO (Timer, Kapasitas, Zeny, Exp, Toko + tombol K,
// Bangku, DaftarPemain, InfoPemain). Mereka baru ditempel sesudah map
// termuat; Task 10 mempensiunkan panel #ui. Toko tersembunyi sampai dibuka
// lewat TombolToko atau tombol K.
const JENDELA = [TimerJ, KapasitasJ, ZenyJ, ExpJ, TokoJ, TombolTokoJ, BangkuJ, DaftarPemainJ, InfoPemainJ, SinergiJ, LoreJ, DPSJ, TombolDPSJ];
let jendelaTertempel = false;

function pasangJendela() {
	if (!jendelaTertempel) {
		jendelaTertempel = true;
		JENDELA.forEach((j) => j.append());
		// Bidak papan diseret dari kanvas 3D (petak di bawah pointer).
		Renderer.canvas.addEventListener('pointerdown', (ev) => seret.mulaiDariPapan(ev));
	}
	gambarJendela();
}

/** Menggambar ulang semua jendela dari state terbaru; diam bila belum ada state. */
function gambarJendela() {
	if (!jendelaTertempel) {
		return;
	}
	const snap = st.ambil();
	if (!snap.state) {
		return;
	}
	snap.sisaMs = st.sisaMs(performance.now());
	// teks: InfoPemain mengganti bahasa sendiri (setBahasa); padaUbah di
	// atas lalu menggambar ulang semua jendela.
	const deps = { t: teks.t, bahasa: teks.bahasa(), teks, formatZeny, ekonomi: katalog.ekonomi, katalog, potret, kirim, seret, dps, bgm: bgmBerkas ? kendaliBGM : null, gambarUlang: gambarJendelaAman };
	JENDELA.forEach((j) => j.gambar(snap, deps));
	// Separuh sendiri disorot redup selama PERSIAPAN. Idempoten, jadi
	// cukup dipanggil tiap gambar: pergantian fase terlihat paling lambat
	// 250 ms, dan tile yang dibuang EffectManager.free dibuat ulang.
	sorot.separuhSendiri(snap.fase === FASE.PERSIAPAN && !snap.selesai);
}

const gambarJendelaAman = amankan(gambarJendela, log);

uiEl.addEventListener('pointerdown', () => {
	ditahanSejak = performance.now();
});
// Di window (capture): pelepasan di luar #ui juga harus membuka tahanan.
// setTimeout 0, bukan langsung: click dikirim sesudah pointerup dalam
// task yang sama, dan tombolnya harus masih ada saat itu.
function lepasPointer() {
	if (ditahanSejak === null) {
		return;
	}
	ditahanSejak = null;
	setTimeout(gambarUIAman, 0);
}
window.addEventListener('pointerup', lepasPointer, true);
window.addEventListener('pointercancel', lepasPointer, true);
window.addEventListener('blur', lepasPointer);

ikatAksi(uiEl, kirim);

// Tombol K membuka/menutup Toko (seperti tombol kanan-bawah gambar
// referensi), kecuali saat mengetik di kolom isian.
window.addEventListener('keydown', (ev) => {
	if (!jendelaTertempel || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey || ev.key?.toLowerCase() !== 'k') {
		return;
	}
	const tag = ev.target?.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) {
		return;
	}
	TokoJ.toggle();
});

// Tombol F membuka/menutup jendela DPS (aturan pengetikan sama dengan K).
window.addEventListener('keydown', (ev) => {
	if (!jendelaTertempel || ev.repeat || ev.ctrlKey || ev.altKey || ev.metaKey || ev.key?.toLowerCase() !== 'f') {
		return;
	}
	const tag = ev.target?.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) {
		return;
	}
	DPSJ.toggle();
});
setInterval(gambarUIAman, 250);
setInterval(gambarJendelaAman, 250);

// Menutup tab = menyerah: server membebaskan kursi seketika, bukan
// menunggu socket putus.
window.addEventListener('beforeunload', () => {
	if (schema && goSocket) {
		Network.send(sandikanAksi(schema.ClientMsg, 'keluar', {}));
	}
});

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

/**
 * SPIKE AC2 (Task 1): memutar satu skill lengkap dari konsol untuk
 * membuktikan EffectManager bekerja di luar MapEngine -- risiko teratas
 * spec Bagian 13. Bukan jalur produksi; EvtSkillMulai/EvtSkillKena
 * memakai efek.js.
 *
 * SM_BASH dan AC_DOUBLE TIDAK punya effectId di SkillEffect.js: efeknya
 * hidup di beginCastEffectId, beforeHitEffectId, dan hitEffectId. Karena
 * itu keempat pembungkus spamSkill* dipanggil, bukan spamSkill saja.
 *
 * @param {number} skid  id skill (lihat __ac.SK)
 * @param {number} dstEntityId  GID sasaran; jatuh ke src bila tak ada
 * @param {number} [srcEntityId=1]  GID perapal
 * @param {number} [castMs=800]  lama cast bar; 0 = instan
 * @returns {boolean} false bila perapal tidak ditemukan
 */
function cobaEfek(skid, dstEntityId, srcEntityId = 1, castMs = 800) {
	const src = EntityManager.get(srcEntityId);
	const dst = EntityManager.get(dstEntityId) || src;
	if (!src || !dst) {
		log(`! cobaEfek: entity src=${srcEntityId} atau dst=${dstEntityId} tidak ditemukan`);
		return false;
	}
	src.setAction({
		action: src.ACTION.SKILL,
		frame:  0,
		repeat: false,
		play:   true,
		next:   { action: src.ACTION.IDLE, frame: 0, repeat: true, play: true }
	});
	if (castMs > 0) {
		src.cast.set(castMs);
	}
	EffectManager.spamSkillCast(skid, src.GID, Renderer.tick, src.GID);
	setTimeout(() => {
		src.cast.clean();
		const pos = [dst.position[0], dst.position[1], dst.position[2]];
		EffectManager.spamSkill(skid, dst.GID, pos, Renderer.tick, src.GID);
		EffectManager.spamSkillBeforeHit(skid, dst.GID, Renderer.tick, src.GID);
		EffectManager.spamSkillHit(skid, dst.GID, Renderer.tick, src.GID);
	}, Math.max(0, castMs));
	log(`cobaEfek skid=${skid} src=${src.GID} dst=${dst.GID} castMs=${castMs}`);
	return true;
}

// Kanvas spike yang sudah ditempel; menentukan posisi kanvas berikutnya.
let jumlahPotret = 0;

/**
 * SPIKE AC4 (Task 2): menempelkan kanvas 160x180 di pojok kiri atas
 * (berderet ke kanan tiap panggilan) dan menggambar potret unit katalog
 * di dalamnya. Membuktikan Entity.renderEntity ke kanvas 2D bekerja di
 * luar CharSelect -- risiko utama AC4. Bukan jalur produksi.
 *
 * @param {string} unitId id unit katalog (mis. 'novice', 'poring', 'wizard')
 * @param {'hidup'|'statis'} [mode='hidup']
 * @returns {HTMLCanvasElement|null} kanvasnya, atau null bila unit tak dikenal
 */
function cobaPotret(unitId, mode = 'hidup') {
	const sprite = katalog.spriteUnit(unitId);
	if (!sprite) {
		log(`! cobaPotret: unit "${unitId}" tidak ada di katalog`);
		return null;
	}
	const kanvas = document.createElement('canvas');
	kanvas.width = 160;
	kanvas.height = 180;
	kanvas.title = `${unitId} (${mode})`;
	Object.assign(kanvas.style, {
		position: 'absolute',
		left: `${8 + jumlahPotret * 168}px`,
		top: '8px',
		background: '#1c1c28',
		border: '1px solid #556',
		zIndex: '1000'
	});
	jumlahPotret++;
	document.body.appendChild(kanvas);
	const ok = mode === 'statis' ? potret.statis(sprite, kanvas) : potret.hidup(sprite, kanvas);
	log(`cobaPotret ${unitId} (${mode}): ${JSON.stringify(sprite)} -> ${ok ? 'terdaftar' : 'DITOLAK'}`);
	return ok ? kanvas : null;
}

/**
 * Memuat kursor RO (data/sprite/cursors.spr) supaya Cursor.setType dari
 * seret.js (PICK saat menyeret) dan kursor tangan GUIComponent pada
 * `.draggable` terlihat. Cursor.init diam selamanya bila berkasnya tidak
 * ada (lihat siapkanKursor di harness); kursor browser tetap dipakai.
 */
function siapkanKursor() {
	let selesai = false;
	Cursor.init(() => {
		selesai = true;
		log('kursor RO termuat.');
	});
	setTimeout(() => {
		if (!selesai) {
			log('! kursor RO tidak termuat (cursors.spr/.act tidak ada di GRF?) -- kursor browser dipakai.');
		}
	}, 5000);
}

/**
 * SPIKE AC4 (Task 6): menyorot terang satu petak (orientasi TIM_A) lewat
 * sorot.js; cobaSorot(null) memadamkannya. Bukan jalur produksi.
 *
 * @param {number|null} kolom 0..7
 * @param {number} [baris] 0..7
 */
function cobaSorot(kolom, baris) {
	sorot.petak(kolom, baris);
	log(`cobaSorot (${kolom},${baris})`);
}

// Untuk penyetelan kamera manual di konsol browser:
// __ac.Camera.zoomFinal = 90; __ac.Camera.angleFinal[0] = 240; __ac.ulang();
// Spike efek: __ac.cobaEfek(__ac.SK.WZ_STORMGUST, 4, 1, 1000);
// AC3: __ac.state() memberi snapshot state catur untuk e2e, dan
// __ac.kirim('beli', {slot: 0}) mengirim perintah tanpa panel.
// AC4: __ac.BGM.audio (cek BGM), __ac.rayakanNaikBintang({...}) (spike naik bintang), __ac.cobaPotret('novice'), __ac.cobaPotret('wizard', 'statis'),
// __ac.bahasa('en'), __ac.t('fase.persiapan'), __ac.Toko.buka(),
// __ac.cobaSorot(3, 2) / __ac.cobaSorot(null), __ac.seret.aktif(),
// __ac.Bangku / __ac.DaftarPemain / __ac.InfoPemain.
window.__ac = {
	BGM, SoundManager, bgmKendali: kendaliBGM, deteksiNaikBintang, rayakanNaikBintang, st: () => st,
	Camera, EntityManager, EffectManager, SK, Session, log, ZOOM, SUDUT, antrean, ulang, cobaEfek,
	kirim, state: () => st.ambil(), katalog: () => katalog,
	potret, cobaPotret, sorot, cobaSorot, seret, bahasa: (kode) => teks.setBahasa(kode), t: teks.t, Toko: TokoJ,
	Bangku: BangkuJ, DaftarPemain: DaftarPemainJ, InfoPemain: InfoPemainJ,
	Sinergi: SinergiJ, Lore: LoreJ, DPS: DPSJ, dps: () => dps.ambil(), lore: (id) => LoreJ.buka(id)
};
