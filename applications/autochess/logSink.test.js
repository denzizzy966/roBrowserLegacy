import { describe, it, expect } from 'vitest';
import { buatSinkLog } from './logSink.js';

/** Elemen palsu: append menambah teks; textContent bisa ditimpa. */
function elemen() {
	return {
		textContent: '',
		append(teks) {
			this.textContent += teks;
		}
	};
}
const baris = (el) => el.textContent.split('\n').slice(0, -1);

describe('buatSinkLog', () => {
	it('di bawah batas: semua baris, berurutan, tiap baris diakhiri newline', () => {
		const el = elemen();
		const tambah = buatSinkLog(el);
		tambah('satu');
		tambah('map termuat: guild_vs3');
		expect(el.textContent).toBe('satu\nmap termuat: guild_vs3\n');
	});

	it('melewati batas: baris awal ("map termuat") tetap, tengah dipangkas, ekor terbaru ada', () => {
		const el = elemen();
		const tambah = buatSinkLog(el, { kepala: 10, maks: 50, batch: 20 });
		tambah('menyiapkan');
		tambah('map termuat: guild_vs3');
		for (let i = 2; i < 500; i++) {
			tambah(`baris ${i}`);
		}
		const b = baris(el);
		expect(b[0]).toBe('menyiapkan');
		expect(b[1]).toBe('map termuat: guild_vs3');
		expect(b.at(-1)).toBe('baris 499');
		expect(b.length).toBeLessThanOrEqual(50 + 20);
		expect(b.some((x) => /^\.\.\. \d+ baris dipangkas \.\.\.$/.test(x))).toBe(true);
	});

	it('jumlah yang dipangkas akurat: baris asli = ada + dipangkas', () => {
		const el = elemen();
		const tambah = buatSinkLog(el, { kepala: 5, maks: 30, batch: 10 });
		const total = 400;
		for (let i = 0; i < total; i++) {
			tambah(`b${i}`);
		}
		const b = baris(el);
		const penanda = b.find((x) => x.includes('dipangkas'));
		const dipangkas = Number(/(\d+) baris dipangkas/.exec(penanda)[1]);
		expect(b.length - 1 + dipangkas).toBe(total);
	});

	it('tidak membaca textContent saat menambah di bawah batas (hanya append)', () => {
		let dibaca = 0;
		let isi = '';
		const el = {
			get textContent() {
				dibaca++;
				return isi;
			},
			set textContent(v) {
				isi = v;
			},
			append(t) {
				isi += t;
			}
		};
		const tambah = buatSinkLog(el);
		for (let i = 0; i < 1000; i++) {
			tambah(`b${i}`);
		}
		expect(dibaca).toBe(0);
	});
});
