// Patch blob AC6 (K10, pengecualian D3): SoundManager harus membuang
// elemen <audio> miliknya saat berkasnya dihapus dari MemoryManager,
// karena MemoryManager.remove mencabut URL blob-nya. Tanpa itu elemen
// cache dipakai ulang dengan src yang sudah dicabut dan browser mencatat
// "blob: ... net::ERR_FILE_NOT_FOUND".
//
// SoundManager diimpor sungguhan dengan MemoryManager sungguhan; hanya
// modul yang menyeret renderer (Client, Session, gl-matrix, Preferences)
// yang di-mock, dan document/elemen audio dipalsukan secukupnya.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Memory from 'Core/MemoryManager.js';

vi.mock('Core/Client.js', async () => {
	const { default: Mem } = await import('Core/MemoryManager.js');
	return { default: { loadFile: (nama, onload) => Mem.get(nama, onload) } };
});
vi.mock('Preferences/Audio.js', () => ({ default: { Sound: { volume: 1, play: true }, save() {} } }));
vi.mock('Engine/SessionStorage.js', () => ({ default: {} }));
vi.mock('Utils/gl-matrix.js', () => ({ default: {} }));

const dibuat = [];

function audioPalsu() {
	const pendengar = {};
	const el = {
		src: '',
		volume: 1,
		currentTime: 0,
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
		remove: vi.fn(),
		addEventListener(nama, fn) {
			(pendengar[nama] ||= []).push(fn);
		},
		picu(nama) {
			(pendengar[nama] || []).forEach(fn => fn.call(el));
		}
	};
	dibuat.push(el);
	return el;
}

let SoundManager;

beforeAll(async () => {
	globalThis.document = { createElement: () => audioPalsu() };
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	SoundManager = (await import('Audio/SoundManager.js')).default;
});

describe('SoundManager dan URL blob yang dicabut MemoryManager', () => {
	it('elemen di cache dibuang saat berkasnya dihapus; putar berikutnya memakai URL baru', () => {
		Memory.set('data/wav/a.wav', 'blob:lama');
		SoundManager.play('a.wav');
		const lama = dibuat.at(-1);
		expect(lama.src).toBe('blob:lama');
		lama.picu('ended'); // masuk cache

		Memory.remove(null, 'data/wav/a.wav');
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lama');
		expect(lama.remove).toHaveBeenCalled();

		Memory.set('data/wav/a.wav', 'blob:baru');
		SoundManager.play('a.wav');
		const baru = dibuat.at(-1);
		expect(baru).not.toBe(lama);
		expect(baru.src).toBe('blob:baru');
		expect(lama.play).toHaveBeenCalledTimes(1);
	});

	it('elemen yang sedang berbunyi saat berkas dihapus tidak masuk cache sesudah selesai', () => {
		Memory.set('data/wav/b.wav', 'blob:b1');
		SoundManager.play('b.wav');
		const berbunyi = dibuat.at(-1);

		Memory.remove(null, 'data/wav/b.wav');
		expect(berbunyi.pause).not.toHaveBeenCalled(); // tidak dipotong
		berbunyi.picu('ended');
		expect(berbunyi.remove).toHaveBeenCalled();

		Memory.set('data/wav/b.wav', 'blob:b2');
		SoundManager.play('b.wav');
		const baru = dibuat.at(-1);
		expect(baru).not.toBe(berbunyi);
		expect(baru.src).toBe('blob:b2');
	});

	it('berkas lain tidak tersentuh', () => {
		Memory.set('data/wav/c.wav', 'blob:c');
		SoundManager.play('c.wav');
		const c = dibuat.at(-1);
		c.picu('ended');

		Memory.set('data/wav/d.wav', 'blob:d');
		Memory.remove(null, 'data/wav/d.wav');
		expect(c.remove).not.toHaveBeenCalled();

		SoundManager.play('c.wav');
		expect(c.play).toHaveBeenCalledTimes(2); // dipakai ulang dari cache
	});
});
