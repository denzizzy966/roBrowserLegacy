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

import GoSocket        from '../m1-harness/GoSocket.js';
import { loadSchema }  from '../m1-harness/proto.js';
import { rswFileName, encodeEnterMap, decodeMapInfo, decodeServerError, validateSpawn } from './mapinfo.js';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5121;
const SCHEMA_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/proto/ro.proto`;
const MAP_NAME    = 'geffen';

const logEl = document.getElementById('log');

function log(msg) {
	logEl.textContent += msg + '\n';
	logEl.scrollTop = logEl.scrollHeight;
	console.log('[m2]', msg);
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
			const err = decodeServerError(schema.ServerMsg, data);
			if (err) {
				log(`! server menolak: ${err}`);
				return;
			}

			const info = decodeMapInfo(schema.ServerMsg, data);
			if (!info) {
				log(`< pesan tanpa body yang dikenali (${data.byteLength} byte)`);
				return;
			}

			log(`< server: map ${info.mapName} ${info.xs}x${info.ys}, spawn (${info.spawnX},${info.spawnY})`);

			MapRenderer.onLoad = function () {
				log(`map termuat: ${info.mapName}`);
				log(`dimensi menurut GRF: ${Altitude.width}x${Altitude.height}`);

				const check = validateSpawn(info, Altitude.width, Altitude.height);
				if (!check.ok) {
					log(`! ${check.reason}`);
					log('! karakter TIDAK ditempatkan — periksa versi client GRF vs map_cache.dat rAthena');
					return;
				}

				spot.position[0] = info.spawnX;
				spot.position[1] = info.spawnY;
				spot.position[2] = Altitude.getCellHeight(info.spawnX, info.spawnY);

				Camera.setTarget(spot);
				Camera.init();

				log(`karakter di (${info.spawnX},${info.spawnY},${spot.position[2].toFixed(2)}), kamera mengikuti.`);
			};

			const rsw = rswFileName(info.mapName);
			log(`memuat ${rsw} dari GRF ...`);
			MapRenderer.setMap(rsw);
		};

		log(`> minta masuk map: ${MAP_NAME}`);
		Network.send(encodeEnterMap(schema.ClientMsg, MAP_NAME));
	}, false);
});

q.run();

window.__m2 = { Configs, MapRenderer, Altitude, log };
