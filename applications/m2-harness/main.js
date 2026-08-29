import Queue       from 'Utils/Queue.js';
import Configs     from 'Core/Configs.js';
import Client      from 'Core/Client.js';
import Thread      from 'Core/Thread.js';
import BGM         from 'Audio/BGM.js';
import Renderer    from 'Renderer/Renderer.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import Altitude    from 'Renderer/Map/Altitude.js';
import Camera      from 'Renderer/Camera.js';
import Entity      from 'Renderer/Entity/Entity.js';
import Session     from 'Engine/SessionStorage.js';
import Intro       from 'UI/Components/Intro/Intro.js';
import Network     from 'Network/NetworkManager.js';
import Mouse       from 'Controls/MouseEventHandler.js';

import GoSocket        from '../m1-harness/GoSocket.js';
import { loadSchema }  from '../m1-harness/proto.js';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, spawnPlacement, decodeZoneTick, lompatanTick, tickTerbuang, decodeMove, pathKeInt16, encodeMove } from './mapinfo.js';

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
	entity.resetRoute(adaRute);

	entity.walk.path  = pathKeInt16(jalur);
	entity.walk.index = 2;              // lewati asal, sama seperti walkTo
	entity.walk.total = jalur.length * 2;
	entity.walk.speed = speedMs;
	entity.walk.pos.set(entity.position);
	entity.walk.lastPos.set(entity.position);
	entity.walk.tick = entity.walk.prevTick = Date.now();

	const dx = jalur[1].x - jalur[0].x;
	const dy = jalur[1].y - jalur[0].y;
	entity.direction = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;
	entity.headDir = 0;

	entity.setAction({
		action: entity.ACTION.WALK,
		frame: 0,
		repeat: true,
		play: true
	});
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
		log(`> minta gerak ke (${x},${y})`);
		Network.send(encodeMove(schema.ClientMsg, x, y));
	});
}

let schema   = null;
let goSocket = null;

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
					log(`< server: map ${info.mapName} ${info.xs}x${info.ys}, spawn (${info.spawnX},${info.spawnY})`);

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

						Camera.setTarget(spot);
						Camera.init();

						log(p.ok
							? `karakter di (${spot.position[0]},${spot.position[1]},${spot.position[2].toFixed(2)}), kamera mengikuti.`
							: `  kamera dijatuhkan ke titik tengah (${spot.position[0]},${spot.position[1]}) agar render tetap jalan.`);

						pasangKanvasKlik();
					};

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

				// decodeMove menerima ServerMsg yang sudah didekode (lihat JSDoc-nya
				// di mapinfo.js), berbeda dari decode* lain di atas yang mendekode
				// dari buffer mentah sendiri-sendiri.
				const msg = schema.ServerMsg.decode(new Uint8Array(data));
				const mv = decodeMove(msg);
				if (mv) {
					log(`< gerak: ${mv.path.length - 1} langkah, ${mv.speedMs} ms/cell`);
					jalankanSepanjang(spot, mv.path, mv.speedMs);
					window.__m2.gerakTerakhir = mv;
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

window.__m2 = { Configs, MapRenderer, Altitude, Camera, Session, spot, log, tick: null, gerakTerakhir: null };
