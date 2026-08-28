import Queue       from 'Utils/Queue.js';
import Configs     from 'Core/Configs.js';
import Client      from 'Core/Client.js';
import Thread      from 'Core/Thread.js';
import BGM         from 'Audio/BGM.js';
import Renderer    from 'Renderer/Renderer.js';
import MapRenderer from 'Renderer/MapRenderer.js';
import Altitude    from 'Renderer/Map/Altitude.js';
import Intro       from 'UI/Components/Intro/Intro.js';

const MAP_NAME = 'geffen';

const logEl = document.getElementById('log');

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
	};

	log(`memuat map ${MAP_NAME}.rsw ...`);
	MapRenderer.setMap(`${MAP_NAME}.rsw`);
});

q.run();

// Dipakai saat verifikasi manual dari konsol DevTools.
window.__m2 = { Configs, MapRenderer, Altitude, log };
