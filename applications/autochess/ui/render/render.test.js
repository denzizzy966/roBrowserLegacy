import { describe, it, expect } from 'vitest';
import { renderTimer } from './timer.js';
import { renderKapasitas } from './kapasitas.js';
import { renderZeny } from './zeny.js';
import { renderExp } from './exp.js';
import { buatTeks, formatZeny } from '../../teks.js';

const { t } = buatTeks();
const ekonomi = { beli_exp: { harga: 4, exp: 4 }, level_maks: 10 };

function snap(saya = {}, ekstra = {}) {
	return {
		state: { saya: { zeny: 10, level: 3, exp: 2, expBerikut: 8, kapasitas: 3, bidak: [{ diPapan: true }, { diPapan: false }], ...saya } },
		fase: 1, ronde: 4, hasilTerakhir: null, selesai: null, sisaMs: 65000, ...ekstra
	};
}

describe('renderTimer', () => {
	it('memuat mm:ss, ronde, dan nama fase', () => {
		const h = renderTimer(snap(), t);
		expect(h).toContain('01:05');
		expect(h).toContain('Ronde 4');
		expect(h).toContain('Persiapan');
	});
	it('fase hasil menampilkan menang/kalah/seri', () => {
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { menang: true } }), t)).toContain('MENANG');
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { menang: false } }), t)).toContain('KALAH');
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { seri: true } }), t)).toContain('SERI');
	});
});

describe('renderKapasitas', () => {
	it('n/maks dari bidak di papan', () => {
		expect(renderKapasitas(snap(), t)).toContain('1/3');
	});
	it('tanpa state: 0/0', () => {
		expect(renderKapasitas({ state: null }, t)).toContain('0/0');
	});
});

describe('renderZeny', () => {
	it('memformat ribuan', () => {
		expect(renderZeny(snap({ zeny: 1234 }), t, formatZeny)).toContain('1,234');
	});
});

describe('renderExp', () => {
	it('lebar bar persen dan tombol aktif di PERSIAPAN', () => {
		const h = renderExp(snap({ exp: 2, expBerikut: 8, zeny: 10 }), t, ekonomi);
		expect(h).toContain('width:25%');
		expect(h).toContain('2/8');
		expect(h).toContain('data-aksi="beli-exp"');
		expect(h).not.toContain('disabled');
		expect(h).toContain('(4z)');
	});
	it('disabled di luar PERSIAPAN', () => {
		expect(renderExp(snap({}, { fase: 2 }), t, ekonomi)).toContain('disabled');
	});
	it('disabled bila zeny kurang', () => {
		expect(renderExp(snap({ zeny: 3 }), t, ekonomi)).toContain('disabled');
	});
	it('MAX di level 10', () => {
		const h = renderExp(snap({ level: 10, expBerikut: 0 }), t, ekonomi);
		expect(h).toContain('MAX');
		expect(h).toContain('width:100%');
		expect(h).toContain('disabled');
	});
	it('MAX mengikuti ekonomi.level_maks, bukan angka tetap', () => {
		expect(renderExp(snap({ level: 6, expBerikut: 16 }), t, { ...ekonomi, level_maks: 6 })).toContain('MAX');
		expect(renderExp(snap({ level: 10, expBerikut: 40 }), t, { ...ekonomi, level_maks: 12 })).not.toContain('MAX');
	});
	it('tanpa level_maks: MAX dari expBerikut <= 0', () => {
		const tanpa = { beli_exp: { harga: 4, exp: 4 } };
		expect(renderExp(snap({ level: 10, expBerikut: 40 }), t, tanpa)).not.toContain('MAX');
		expect(renderExp(snap({ level: 7, expBerikut: 0 }), t, tanpa)).toContain('MAX');
	});
});
