import Queue       from 'Utils/Queue.js';
import Configs     from 'Core/Configs.js';
import Client      from 'Core/Client.js';
import Thread      from 'Core/Thread.js';
import BGM         from 'Audio/BGM.js';
import Renderer    from 'Renderer/Renderer.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import Altitude    from 'Renderer/Map/Altitude.js';
import Intro       from 'UI/Components/Intro/Intro.js';
import Camera      from 'Renderer/Camera.js';
import Entity      from 'Renderer/Entity/Entity.js';
import Session     from 'Engine/SessionStorage.js';

const MAP_NAME = 'geffen';

const logEl = document.getElementById('log');

// WAJIB ADA SEBELUM FRAME PERTAMA DIRENDER.
//
// MapRenderer.onRender memanggil Camera.update(tick) di baris pertamanya, dan
// Camera.update mendereferensi this.target.position tanpa penjagaan. Bila
// Camera.target masih null, ia melempar TypeError setiap frame — dan
// Renderer.js membungkus tiap callback render dalam try/catch, sehingga
// galatnya hanya muncul di konsol DevTools. Semua yang setelahnya
// (Ground.render, Models.render, Water.render) tidak pernah berjalan.
//
// Gejalanya adalah yang paling menyesatkan: panel log di halaman tetap
// menampilkan "map termuat" beserta dimensi yang benar, karena keduanya
// dihitung sebelum crash, sementara kanvas kosong selamanya.
//
// MapRenderer.onRender juga membaca Session.Entity.position, jadi entity-nya
// harus terdaftar di sana. Pola ini disalin dari src/App/MapViewer.js:35.
const spot = Session.Entity = new Entity();

function log(msg) {
	logEl.textContent += msg + '\n';
	logEl.scrollTop = logEl.scrollHeight;
	console.log('[m2]', msg);
}

// Urutan ini disalin dari src/App/MapViewer.js jalur "normal access".
// Thread menjalankan worker pembaca GRF; Renderer menyiapkan konteks WebGL;
// Intro meminta pemain memilih berkas GRF-nya sendiri (keputusan D2 spec:
// aset Gravity tidak pernah didistribusikan).
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

q.add(function () {
	Intro.remove();

	MapRenderer.onLoad = function () {
		log(`map termuat: ${MAP_NAME}`);
		log(`dimensi menurut GRF: ${Altitude.width}x${Altitude.height}`);

		// Titik tengah map hanya penempatan sementara supaya ada sesuatu
		// untuk diikuti kamera. Task 3 menggantinya dengan posisi spawn
		// yang ditentukan server.
		spot.position[0] = Altitude.width  >> 1;
		spot.position[1] = Altitude.height >> 1;
		spot.position[2] = Altitude.getCellHeight(spot.position[0], spot.position[1]);

		Camera.setTarget(spot);
		Camera.init();

		log(`kamera diarahkan ke (${spot.position[0]},${spot.position[1]}).`);
	};

	log(`memuat map ${MAP_NAME}.rsw ...`);
	MapRenderer.setMap(`${MAP_NAME}.rsw`);
});

q.run();

// Dipakai saat verifikasi manual dari konsol DevTools.
window.__m2 = { Configs, MapRenderer, Altitude, Camera, spot, log };
