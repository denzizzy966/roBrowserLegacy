import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../vite.config.js';

// mergeConfig dipakai agar resolve/alias upstream tetap terwarisi.
const merged = mergeConfig(baseConfig, defineConfig({
	test: {
		include: ['applications/m2-harness/**/*.test.js']
	}
}));

// PENTING: mergeConfig MENGGABUNGKAN array (concat), bukan mengganti. Tanpa
// penimpaan eksplisit ini, include menjadi ['tests/**/*.test.js', ...] dan
// `npm run test:m2` diam-diam menjalankan seluruh suite upstream.
merged.test.include = ['applications/m2-harness/**/*.test.js'];

// protobufjs memakai Uint8Array bertopang Buffer di Node; di bawah jsdom,
// ArrayBuffer-nya berada di vm realm berbeda sehingga instanceof gagal
// lintas realm. Di browser sungguhan tidak ada Buffer, jadi masalah ini
// tidak ada. Bila kelak ada test yang menyentuh DOM di direktori ini,
// pakai docblock // @vitest-environment jsdom per berkas.
merged.test.environment = 'node';

export default merged;
