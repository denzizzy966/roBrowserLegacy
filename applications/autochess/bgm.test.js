import { describe, it, expect } from 'vitest';
import { pilihBGM } from './bgm.js';

function f(name, rel = '') {
	return { name, webkitRelativePath: rel };
}

describe('pilihBGM', () => {
	it('memilih BGM/08.mp3 di antara beberapa mp3', () => {
		const berkas = [f('01.mp3', 'grf6/BGM/01.mp3'), f('08.mp3', 'grf6/BGM/08.mp3'), f('28.mp3', 'grf6/BGM/28.mp3')];
		expect(pilihBGM(berkas)).toBe(berkas[1]);
	});

	it('tanpa 08.mp3: mp3 pertama menurut nama', () => {
		const berkas = [f('b.mp3'), f('A.mp3'), f('data.ini')];
		expect(pilihBGM(berkas)).toBe(berkas[1].name < berkas[0].name ? berkas[1] : berkas[0]);
	});

	it('08.mp3 di luar folder BGM tidak diutamakan', () => {
		const berkas = [f('08.mp3', 'x/lain/08.mp3'), f('01.mp3', 'x/lain/01.mp3')];
		expect(pilihBGM(berkas)).toBe(berkas[1]);
	});

	it('tanpa mp3 -> null (Review Focus 4)', () => {
		expect(pilihBGM([f('data.ini'), f('data.grf')])).toBeNull();
		expect(pilihBGM([])).toBeNull();
		expect(pilihBGM(null)).toBeNull();
	});

	it('jalur Windows dan huruf besar', () => {
		const berkas = [f('08.MP3', 'grf6' + String.fromCharCode(92) + 'bgm' + String.fromCharCode(92) + '08.MP3')];
		expect(pilihBGM(berkas)).toBe(berkas[0]);
	});
});
