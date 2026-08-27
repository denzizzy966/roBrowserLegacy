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
const merged = mergeConfig(baseConfig, defineConfig({
	test: {
		include: ['applications/m1-harness/**/*.test.js']
	}
}));

merged.test.include = ['applications/m1-harness/**/*.test.js'];

export default merged;
