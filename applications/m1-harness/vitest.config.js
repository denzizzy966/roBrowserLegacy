import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../vite.config.js';

// vite.config.js milik roBrowserLegacy membatasi vitest test.include ke
// 'tests/**/*.test.js' (mengikuti struktur tests/ yang terpisah dari
// src/). GoSocket.test.js sengaja diletakkan bersebelahan dengan kode
// di applications/m1-harness/ (sesuai task brief), sehingga tidak
// pernah ditemukan oleh vitest tanpa config tambahan ini.
//
// File ini menambahkan resolve/alias dan environment dari konfigurasi
// upstream (lewat mergeConfig) — vite.config.js bawaan tidak diubah
// sama sekali — lalu mengganti test.include agar HANYA test m1-harness
// yang berjalan. mergeConfig menggabungkan array (concat), bukan
// mengganti, jadi include harus ditimpa secara eksplisit di sini agar
// `npm run test:m1` tidak diam-diam menjalankan seluruh suite tests/.
// vite.config.js bawaan juga menyetel test.environment ke 'jsdom'. jsdom
// menjalankan modul test di dalam konteks vm terpisah dari realm Node
// utama. protobufjs mendeteksi Buffer milik Node (tersedia di kedua
// realm lewat jsdom) dan memakainya untuk encode — tetapi ArrayBuffer
// yang mendasari Buffer itu berasal dari realm Node utama, sedangkan
// identifier `ArrayBuffer` yang dilihat proto.test.js berasal dari
// realm vm jsdom. Keduanya tampak sama (constructor.name === "ArrayBuffer")
// namun `instanceof` gagal lintas realm. Ini artefak lingkungan test
// semata: di browser sungguhan tidak ada Buffer global sama sekali,
// jadi protobufjs memakai Uint8Array biasa dan masalah ini tidak
// pernah muncul. Tak ada test m1-harness yang butuh API DOM (tidak ada
// document/window), jadi override ke 'node' menghilangkan artefak ini
// tanpa mengubah proto.js/proto.test.js/GoSocket.test.js sama sekali.
const merged = mergeConfig(baseConfig, defineConfig({
	test: {
		include: ['applications/m1-harness/**/*.test.js'],
		environment: 'node'
	}
}));

merged.test.include = ['applications/m1-harness/**/*.test.js'];
merged.test.environment = 'node';

export default merged;
