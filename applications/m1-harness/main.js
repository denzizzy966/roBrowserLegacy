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

// NetworkManager menyimpan socket di variabel privat modul, jadi kita
// simpan referensinya sendiri saat factory dipanggil.
let goSocket = null;

// Titik sisip resmi roBrowserLegacy: seluruh transport dialihkan ke
// server Go tanpa menyentuh kode upstream. NetworkManager memanggil
// factory dengan tepat dua argumen: (host, port), dan ia sendiri yang
// menetapkan onComplete serta onClose — jangan disetel di sini.
Network.setSocketFactory((host, port) => {
	goSocket = new GoSocket(host, port);
	return goSocket;
});

document.getElementById('connect').addEventListener('click', () => {
	log('menyambung ke ws://localhost:5121/ws ...');

	Network.connect('localhost', 5121, (success) => {
		if (!success) {
			log('! gagal menyambung — apakah roserver sudah berjalan?');
			return;
		}
		log('tersambung.');

		// TEMUAN M1 — jangan pindahkan blok ini ke dalam factory.
		// NetworkManager.connect() menjalankan `socket.onMessage = receive`
		// tepat sebelum memanggil callback ini, mengarahkan seluruh data
		// masuk ke pengurai paket Gravity. Protokol kita bukan Gravity,
		// jadi kita ambil alih kembali di sini. Justru urutan itu yang
		// membuatnya mungkin: onMessage disetel SEBELUM callback dipanggil.
		goSocket.onMessage = (data) => {
			log(`< diterima ${data.byteLength} byte: ${hex(data)}`);
		};

		document.getElementById('send').disabled = false;
	}, false);
});

document.getElementById('send').addEventListener('click', () => {
	const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
	log(`> mengirim ${payload.byteLength} byte: ${hex(payload)}`);
	Network.send(payload);
});
