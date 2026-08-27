import Network  from '../../src/Network/NetworkManager.js';
import GoSocket from './GoSocket.js';
import { loadSchema, encodePing, decodePong } from './proto.js';

const SERVER_HOST = 'localhost';
const SERVER_PORT = 5121;
const SCHEMA_URL  = `http://${SERVER_HOST}:${SERVER_PORT}/proto/ro.proto`;

const logEl = document.getElementById('log');

function log(msg) {
	logEl.textContent += msg + '\n';
	console.log('[m1]', msg);
}

let schema   = null;
// NetworkManager menyimpan socket di variabel privat modul; kita simpan
// referensinya sendiri agar bisa merebut kembali onMessage setelah connect.
let goSocket = null;

document.getElementById('connect').addEventListener('click', async () => {
	try {
		log(`memuat skema dari ${SCHEMA_URL} ...`);
		schema = await loadSchema(SCHEMA_URL);
		log('skema termuat.');
	} catch (err) {
		log(`! gagal memuat skema: ${err.message}`);
		return;
	}

	// Titik sisip resmi roBrowserLegacy: seluruh transport dialihkan ke
	// server Go tanpa menyentuh kode upstream. NetworkManager memanggil
	// factory dengan tepat dua argumen: (host, port), dan ia sendiri yang
	// menetapkan onComplete serta onClose — jangan disetel di sini.
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
		// masuk ke pengurai paket Gravity. Protokol kita bukan Gravity,
		// jadi kita ambil alih kembali di sini.
		goSocket.onMessage = (data) => {
			const pong = decodePong(schema.ServerMsg, data);
			if (!pong) {
				log(`< pesan tanpa body yang dikenali (${data.byteLength} byte)`);
				return;
			}
			const rtt = Date.now() - pong.clientTimeMs;
			log(`< pong "${pong.text}" server_time=${pong.serverTimeMs} rtt=${rtt}ms`);
		};

		document.getElementById('send').disabled = false;
	}, false);
});

document.getElementById('send').addEventListener('click', () => {
	const now = Date.now();
	const buf = encodePing(schema.ClientMsg, 'halo dari browser', now);
	log(`> ping "halo dari browser" (${buf.byteLength} byte)`);
	Network.send(buf);
});
