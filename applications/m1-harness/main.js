import Network  from '../../src/Network/NetworkManager.js';
import GoSocket from './GoSocket.js';

const logEl = document.getElementById('log');

function log(msg) {
	logEl.textContent += msg + '\n';
	console.log('[m1]', msg);
}

function hex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join(' ');
}

// Titik sisip resmi roBrowserLegacy: seluruh transport dialihkan ke
// server Go tanpa menyentuh kode upstream. NetworkManager memanggil
// factory dengan tepat dua argumen: (host, port).
Network.setSocketFactory((host, port) => {
	const socket = new GoSocket(host, port);

	// Pada M1 pesan masuk ditangani di sini, TIDAK diteruskan ke pengurai
	// paket Gravity milik NetworkManager. Alasannya dicatat di seam report.
	socket.onMessage = (data) => {
		log(`< diterima ${data.byteLength} byte: ${hex(data)}`);
	};

	return socket;
});

let socket = null;

document.getElementById('connect').addEventListener('click', () => {
	log('menyambung ke ws://localhost:5121/ws ...');

	Network.connect('localhost', 5121, (success) => {
		if (!success) {
			log('! gagal menyambung — apakah roserver sudah berjalan?');
			return;
		}
		log('tersambung.');
		document.getElementById('send').disabled = false;
	}, false);
});

document.getElementById('send').addEventListener('click', () => {
	const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
	log(`> mengirim ${payload.byteLength} byte: ${hex(payload)}`);
	Network.send(payload);
});
