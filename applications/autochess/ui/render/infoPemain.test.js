import { describe, it, expect } from 'vitest';
import { renderInfoPemain } from './infoPemain.js';
import { buatTeks, formatZeny } from '../../teks.js';

function snap(ekstra = {}, saya = {}, kursi = {}) {
	return {
		state: {
			kursi: [
				{ kursi: 0, nama: 'Saya', hp: 73, level: 4, bot: false, hidup: true, streak: 2, ...kursi },
				{ kursi: 1, nama: 'Bot 1', hp: 100, level: 2, bot: true, hidup: true, streak: -1 }
			],
			saya: { kursi: 0, zeny: 1234, level: 4, ...saya }
		},
		fase: 1, ronde: 6, selesai: null, ...ekstra
	};
}

/** deps dari satu buatTeks, seperti main.js: bahasa = teks.bahasa(). */
function depsDari(teks) {
	return { t: teks.t, bahasa: teks.bahasa(), formatZeny };
}

/** Tag pembuka tombol data-aksi tertentu. */
function tombol(h, aksi) {
	return h.match(new RegExp(`<button[^>]*data-aksi="${aksi}"[^>]*>([^<]*)<`));
}

describe('renderInfoPemain', () => {
	it('nama, HP, level, Zeny berformat, streak, ronde, fase', () => {
		const h = renderInfoPemain(snap(), depsDari(buatTeks()));
		expect(h).toContain('Saya');
		expect(h).toContain('<span class="hp">73</span>');
		expect(h).toContain('<span class="lv">4</span>');
		expect(h).toContain('1,234');
		expect(h).toContain('<span class="streak menang">+2</span>');
		expect(h).toContain('<span class="ronde">6</span>');
		expect(h).toContain('Persiapan');
	});
	it('streak kalah bertanda minus', () => {
		expect(renderInfoPemain(snap({}, {}, { streak: -3 }), depsDari(buatTeks()))).toContain('<span class="streak kalah">-3</span>');
	});
	it('Lewati aktif hanya di PERSIAPAN dan sebelum selesai', () => {
		const d = depsDari(buatTeks());
		expect(tombol(renderInfoPemain(snap(), d), 'lewati')[0]).not.toContain('disabled');
		expect(tombol(renderInfoPemain(snap({ fase: 2 }), d), 'lewati')[0]).toContain('disabled');
		expect(tombol(renderInfoPemain(snap({ fase: 3 }), d), 'lewati')[0]).toContain('disabled');
		expect(tombol(renderInfoPemain(snap({ selesai: { peringkatSaya: 2 } }), d), 'lewati')[0]).toContain('disabled');
		expect(tombol(renderInfoPemain({ state: null, fase: 1 }, d), 'lewati')[0]).toContain('disabled');
	});
	it('tombol bahasa dan log selalu aktif', () => {
		const h = renderInfoPemain(snap({ fase: 2 }), depsDari(buatTeks()));
		expect(tombol(h, 'bahasa')[0]).not.toContain('disabled');
		expect(tombol(h, 'log')[0]).not.toContain('disabled');
	});
	it('label tombol bahasa menampilkan bahasa LAIN dan berbalik mengikuti bahasa()', () => {
		const teks = buatTeks();
		let b = tombol(renderInfoPemain(snap(), depsDari(teks)), 'bahasa');
		expect(b[1]).toBe('EN');
		expect(b[0]).toContain('data-arg="en"');
		teks.setBahasa('en');
		b = tombol(renderInfoPemain(snap(), depsDari(teks)), 'bahasa');
		expect(b[1]).toBe('ID');
		expect(b[0]).toContain('data-arg="id"');
		expect(renderInfoPemain(snap(), depsDari(teks))).toContain('Preparation');
	});
	it('tersingkir menandai nama; tanpa state tetap tergambar', () => {
		expect(renderInfoPemain(snap({}, {}, { hidup: false, hp: 0 }), depsDari(buatTeks()))).toContain('class="nama tersingkir"');
		const h = renderInfoPemain({ state: null, fase: 0, ronde: 0 }, depsDari(buatTeks()));
		expect(h).toContain('Anda');
		expect(h).toContain('Menunggu');
	});
	it('nama server diloloskan', () => {
		expect(renderInfoPemain(snap({}, {}, { nama: '<i>x' }), depsDari(buatTeks()))).toContain('&lt;i&gt;x');
	});

	it('tombol BGM nonaktif tanpa mp3, aktif dengan deps.bgm', () => {
		const teks = buatTeks();
		expect(renderInfoPemain(snap(), depsDari(teks)))
			.toMatch(/<button[^>]*data-aksi="bgm"[^>]* disabled/);
		const h = renderInfoPemain(snap(), { ...depsDari(teks), bgm: { aktif: () => true, toggle() {} } });
		expect(h).not.toMatch(/<button[^>]*data-aksi="bgm"[^>]* disabled/);
		expect(tombol(h, 'bgm')[1]).toBe('Musik');
		const mati = renderInfoPemain(snap(), { ...depsDari(teks), bgm: { aktif: () => false, toggle() {} } });
		expect(tombol(mati, 'bgm')[1]).toContain('✕');
	});

	it('AC6 K11: tombol Lewati ke peringkat akhir hanya bila kursi sendiri tersingkir', () => {
		const d = depsDari(buatTeks());
		const hidup = renderInfoPemain(snap(), d);
		expect(tombol(hidup, 'selesaikan')).toBeNull();
		expect(hidup).toContain('class="zeny"');

		const mati = renderInfoPemain(snap({}, {}, { hidup: false, hp: 0 }), d);
		expect(tombol(mati, 'selesaikan')[1]).toBe('Lewati ke peringkat akhir');
		expect(tombol(mati, 'selesaikan')[0]).not.toContain('disabled');
		// Baris Zeny dan Beruntun memberi tempat; Lewati biasa mati.
		expect(mati).not.toContain('class="zeny"');
		expect(mati).not.toContain('class="streak');
		expect(tombol(mati, 'lewati')[0]).toContain('disabled');

		const en = buatTeks();
		en.setBahasa('en');
		expect(tombol(renderInfoPemain(snap({}, {}, { hidup: false, hp: 0 }), depsDari(en)), 'selesaikan')[1]).toBe('Skip to final ranking');
		// Sesudah pertandingan selesai tidak ada lagi yang dilewati.
		expect(tombol(renderInfoPemain(snap({ selesai: { peringkatSaya: 8 } }, {}, { hidup: false, hp: 0 }), d), 'selesaikan')).toBeNull();
		// Tanpa state: tidak ada tombol.
		expect(tombol(renderInfoPemain({ state: null, fase: 1 }, d), 'selesaikan')).toBeNull();
	});
});
