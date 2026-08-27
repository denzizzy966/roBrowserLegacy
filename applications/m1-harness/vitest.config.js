import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../vite.config.js';

// vite.config.js milik roBrowserLegacy membatasi vitest test.include ke
// 'tests/**/*.test.js' (mengikuti struktur tests/ yang terpisah dari
// src/). GoSocket.test.js sengaja diletakkan bersebelahan dengan kode
// di applications/m1-harness/ (sesuai task brief), sehingga tidak
// pernah ditemukan oleh vitest tanpa config tambahan ini.
//
// File ini hanya menambahkan satu include pattern di atas konfigurasi
// upstream (lewat mergeConfig) — vite.config.js bawaan tidak diubah
// sama sekali.
export default mergeConfig(baseConfig, defineConfig({
	test: {
		include: ['applications/m1-harness/**/*.test.js']
	}
}));
