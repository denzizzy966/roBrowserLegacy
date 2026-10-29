import { describe, it, expect } from 'vitest';
import { renderDaftarPemain, avatarKursi, kodeAvatar, urutKursi, MOB_BOT } from './daftarPemain.js';
import { buatTeks } from '../../teks.js';

const id = buatTeks();
const en = buatTeks({ pref: { bahasa: 'en' } });

const KURSI = [
	{ kursi: 0, nama: 'Saya', hp: 80, level: 3, bot: false, hidup: true, streak: 0 },
	{ kursi: 1, nama: 'Bot 1', hp: 100, level: 2, bot: true, hidup: true, streak: 1 },
	{ kursi: 2, nama: 'Bot 2', hp: 0, level: 4, bot: true, hidup: false, streak: 0 },
	{ kursi: 3, nama: 'Bot 3', hp: 55, level: 2, bot: true, hidup: true, streak: 0 },
	{ kursi: 4, nama: 'Bot 4', hp: 100, level: 2, bot: true, hidup: true, streak: 0 },
	{ kursi: 5, nama: 'Bot 5', hp: 20, level: 1, bot: true, hidup: true, streak: 0 },
	{ kursi: 6, nama: 'Bot 6', hp: 0, level: 5, bot: true, hidup: false, streak: 0 },
	{ kursi: 7, nama: 'Bot 7', hp: 90, level: 2, bot: true, hidup: true, streak: 0 }
];

function snap(kursi = KURSI) {
	return { state: { kursi, saya: { kursi: 0 } }, fase: 1 };
}

/** Nomor kursi menurut urutan baris di HTML. */
function urutanBaris(h) {
	return [...h.matchAll(/class="baris[^"]*" data-kursi="(\d+)"/g)].map((m) => Number(m[1]));
}

describe('renderDaftarPemain', () => {
	it('8 baris urut HP turun, tersingkir paling bawah', () => {
		expect(urutanBaris(renderDaftarPemain(snap(), { t: id.t }))).toEqual([1, 4, 7, 0, 3, 5, 2, 6]);
	});
	it('urutKursi tidak mengubah array asal', () => {
		const salinan = [...KURSI];
		urutKursi(KURSI);
		expect(KURSI).toEqual(salinan);
	});
	it('baris sendiri berkelas sendiri, yang lain tidak', () => {
		const h = renderDaftarPemain(snap(), { t: id.t });
		expect(h).toContain('class="baris sendiri" data-kursi="0"');
		expect(h.match(/sendiri/g)).toHaveLength(1);
	});
	it('kursi tersingkir abu-abu dengan label dwibahasa, tanpa bar HP', () => {
		const h = renderDaftarPemain(snap(), { t: id.t });
		expect(h).toContain('class="baris tersingkir" data-kursi="2"');
		expect(h).toContain('class="baris tersingkir" data-kursi="6"');
		expect(h.match(/Tersingkir/g)).toHaveLength(2);
		expect(h.match(/class="bar-hp"/g)).toHaveLength(6);
		expect(renderDaftarPemain(snap(), { t: en.t })).toContain('Eliminated');
	});
	it('bar HP hijau selebar persen HP, dan level', () => {
		const h = renderDaftarPemain(snap(), { t: id.t });
		expect(h).toContain('<div style="width:80%">');
		expect(h).toContain('<div style="width:55%">');
		expect(h).toContain('Lv. 3');
	});
	it('kanvas avatar 36x42 per kursi menurut Q11', () => {
		const h = renderDaftarPemain(snap(), { t: id.t });
		expect(h.match(/<canvas class="avatar" width="36" height="42"/g)).toHaveLength(8);
		expect(h).toContain('data-avatar="pc:0:1"');
		expect(h).toContain('data-avatar="mob:1002"');
		expect(h).toContain('data-avatar="mob:1014"');
	});
	it('avatarKursi: manusia novice, bot mob per nomor kursi', () => {
		expect(avatarKursi({ kursi: 0, bot: false })).toEqual({ tipe: 'pc', job: 0, sex: 1, senjata: 1 });
		for (let k = 1; k <= 7; k++) {
			expect(avatarKursi({ kursi: k, bot: true })).toEqual({ tipe: 'mob', id: MOB_BOT[k - 1] });
		}
		expect(kodeAvatar(avatarKursi({ kursi: 3, bot: true }))).toBe('mob:1007');
	});
	it('nama kosong jatuh ke Anda/Bot n; nama server diloloskan', () => {
		const h = renderDaftarPemain(snap([
			{ kursi: 0, nama: '', hp: 100, level: 1, bot: false, hidup: true },
			{ kursi: 1, nama: '', hp: 100, level: 1, bot: true, hidup: true },
			{ kursi: 2, nama: '<b>', hp: 100, level: 1, bot: true, hidup: true }
		]), { t: id.t });
		expect(h).toContain('Anda');
		expect(h).toContain('Bot 1');
		expect(h).toContain('&lt;b&gt;');
	});
	it('tanpa state: kosong', () => {
		expect(renderDaftarPemain({ state: null }, { t: id.t })).toBe('');
	});
});
