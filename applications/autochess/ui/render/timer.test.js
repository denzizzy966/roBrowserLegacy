import { describe, it, expect } from 'vitest';
import { renderTimer, teksTontonan } from './timer.js';
import { buatTeks } from '../../teks.js';
import { FASE } from '../../pesan.js';

const id = buatTeks();
const en = buatTeks({ pref: { bahasa: 'en' } });

const KURSI = [
	{ kursi: 0, nama: 'Pemain', hp: 80, level: 3, bot: false, hidup: true, streak: 0 },
	{ kursi: 1, nama: 'Bot 1', hp: 90, level: 3, bot: true, hidup: true, streak: 0 },
	{ kursi: 2, nama: '', hp: 70, level: 3, bot: true, hidup: true, streak: 0 },
	{ kursi: 3, nama: '<Bot 3>', hp: 60, level: 3, bot: true, hidup: true, streak: 0 }
];

function snap(isi = {}) {
	return {
		state: { kursi: KURSI, saya: { kursi: 0 } },
		fase: FASE.PERSIAPAN, ronde: 2, sisaMs: 12000, hasilTerakhir: null, selesai: null,
		ditonton: 0, kursiBawah: 0, lawanKursi: -1,
		...isi
	};
}

describe('renderTimer', () => {
	it('waktu, ronde, fase; tanpa baris tontonan di papan sendiri', () => {
		const h = renderTimer(snap(), id.t);
		expect(h).toContain('00:12');
		expect(h).toContain('Ronde 2');
		expect(h).toContain('Persiapan');
		expect(h).not.toContain('class="tonton"');
		// Snapshot bentuk pra-AC6 (tanpa ditonton) juga tanpa baris tontonan.
		expect(renderTimer({ state: { kursi: KURSI, saya: { kursi: 0 } }, fase: 1, ronde: 1 }, id.t)).not.toContain('tonton');
	});

	it('PERSIAPAN: "Menonton: <nama>" saja, ID dan EN', () => {
		const s = snap({ ditonton: 1, kursiBawah: 1 });
		expect(renderTimer(s, id.t)).toContain('<div class="tonton">Menonton: Bot 1</div>');
		expect(renderTimer(s, en.t)).toContain('<div class="tonton">Watching: Bot 1</div>');
	});

	it('TEMPUR: "bawah vs atas" menurut kursiBawah (Tim A di bawah, K13)', () => {
		// Kursi 1 ditonton dan ia Tim A: ia di bawah.
		expect(teksTontonan(snap({ fase: FASE.TEMPUR, ditonton: 1, lawanKursi: 3, kursiBawah: 1 }), id.t))
			.toBe('Menonton: Bot 1 vs <Bot 3>');
		// Kursi 1 ditonton tetapi Tim B: lawannya di bawah, ia di atas.
		expect(teksTontonan(snap({ fase: FASE.TEMPUR, ditonton: 1, lawanKursi: 3, kursiBawah: 3 }), en.t))
			.toBe('Watching: <Bot 3> vs Bot 1');
		// Lawan kursi 0 (manusia) dan nama kosong jatuh ke Bot n.
		expect(teksTontonan(snap({ fase: FASE.HASIL, ditonton: 2, lawanKursi: 0, kursiBawah: 2 }), id.t))
			.toBe('Menonton: Bot 2 vs Pemain');
	});

	it('TEMPUR creep (lawanKursi -1): lawan = monster liar', () => {
		expect(teksTontonan(snap({ fase: FASE.TEMPUR, ditonton: 1, lawanKursi: -1, kursiBawah: 1 }), id.t))
			.toBe('Menonton: Bot 1 vs Monster liar');
		expect(teksTontonan(snap({ fase: FASE.TEMPUR, ditonton: 1, lawanKursi: -1, kursiBawah: 1 }), en.t))
			.toBe('Watching: Bot 1 vs Creeps');
	});

	it('nama server diloloskan di HTML', () => {
		const h = renderTimer(snap({ fase: FASE.TEMPUR, ditonton: 3, lawanKursi: 1, kursiBawah: 3 }), id.t);
		expect(h).toContain('Menonton: &lt;Bot 3&gt; vs Bot 1');
	});
});
