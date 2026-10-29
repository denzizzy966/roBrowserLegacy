import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buatSorot, cellPetak, BARIS_SENDIRI } from './sorot.js';

const ASAL = { x: 42, y: 41 };
const SKALA = 2;

/** Pabrik FlatColorTile palsu: satu kelas per nama, seperti aslinya (cache). */
function buatPabrik() {
	const cache = {};
	const pabrik = vi.fn((nama, warna) => {
		if (!cache[nama]) {
			cache[nama] = class FlatColorTile {
				constructor(pos) {
					this.position = pos;
				}
				static free() {
					this.ready = false;
				}
			};
			cache[nama].warna = warna;
		}
		return cache[nama];
	});
	return pabrik;
}

/** EffectManager palsu: hanya mencatat add; render meniru init/needCleanUp. */
function buatEM() {
	const daftar = [];
	return {
		daftar,
		add: vi.fn((efek, Params) => {
			efek.needInit = true;
			efek._Params = Params;
			daftar.push(efek);
		}),
		/** Satu frame: init yang baru, buang yang needCleanUp. */
		render() {
			for (let i = daftar.length - 1; i >= 0; i--) {
				const e = daftar[i];
				if (e.needCleanUp) {
					e.ready = false;
					daftar.splice(i, 1);
				} else if (e.needInit) {
					e.ready = true;
					e.needInit = false;
				}
			}
		},
		/** Meniru EffectManager.free (ganti map): semua dibuang. */
		free() {
			for (const e of daftar) {
				e.ready = false;
			}
			daftar.length = 0;
		}
	};
}

let EM, sorot;
const Altitude = { getCellHeight: (x, y) => x + y / 100 };

beforeEach(() => {
	EM = buatEM();
	sorot = buatSorot({
		EffectManager: EM, FlatColorTile: buatPabrik(), Altitude, Renderer: { tick: 1000 },
		asal: ASAL, skala: SKALA
	});
});

/** Tile hidup menurut nama kelas. */
function hidup(nama) {
	return EM.daftar.filter((e) => e.constructor.name === nama && !e.needCleanUp);
}

describe('cellPetak', () => {
	it('petak (3,2) skala 2 menutup cell 48..49 x 45..46', () => {
		expect(cellPetak(ASAL, SKALA, 3, 2)).toEqual([[48, 45], [49, 45], [48, 46], [49, 46]]);
	});
});

describe('buatSorot', () => {
	it('warna redup dan terang memakai kelas bernama unik (EffectManager mengelompokkan per nama)', () => {
		sorot.separuhSendiri(true);
		sorot.petak(3, 2);
		const nama = new Set(EM.daftar.map((e) => e.constructor.name));
		expect(nama).toEqual(new Set(['AcSorotRedup', 'AcSorotTerang']));
	});

	it('separuhSendiri(true) dua kali menambah tile sekali saja', () => {
		sorot.separuhSendiri(true);
		EM.render();
		sorot.separuhSendiri(true);
		expect(EM.add).toHaveBeenCalledTimes(BARIS_SENDIRI * 8 * SKALA * SKALA);
		expect(hidup('AcSorotRedup')).toHaveLength(128);
	});

	it('tile redup berada di baris 0..3 dengan tinggi dari Altitude dan Params.Inst.position yang sama', () => {
		sorot.separuhSendiri(true);
		const ys = EM.daftar.map((e) => e.position[1]);
		expect(Math.min(...ys)).toBe(41);
		expect(Math.max(...ys)).toBe(48);
		const e = EM.daftar[0];
		expect(e.position[2]).toBe(Altitude.getCellHeight(e.position[0], e.position[1]));
		expect(e._Params.Inst.position).toBe(e.position);
		expect(e._Params.Inst.duration).toBe(0);
	});

	it('separuhSendiri(false) membuang semua tile redup', () => {
		sorot.separuhSendiri(true);
		EM.render();
		sorot.separuhSendiri(false);
		EM.render();
		expect(hidup('AcSorotRedup')).toHaveLength(0);
		expect(EM.daftar).toHaveLength(0);
	});

	it('dibuat ulang bila EffectManager.free membuangnya (ganti map)', () => {
		sorot.separuhSendiri(true);
		EM.render();
		EM.free();
		sorot.separuhSendiri(true);
		expect(hidup('AcSorotRedup')).toHaveLength(128);
	});

	it('petak(k, b) memindah tile terang yang sama lewat position; petak(null) memadamkan', () => {
		sorot.petak(3, 2);
		EM.render();
		const tile = hidup('AcSorotTerang');
		expect(tile).toHaveLength(4);
		expect(tile.map((e) => [e.position[0], e.position[1]])).toEqual(cellPetak(ASAL, SKALA, 3, 2));

		sorot.petak(1, 0);
		expect(EM.add).toHaveBeenCalledTimes(4);
		expect(hidup('AcSorotTerang')).toEqual(tile);
		expect(tile.map((e) => [e.position[0], e.position[1]])).toEqual(cellPetak(ASAL, SKALA, 1, 0));
		expect(tile[0].position[2]).toBe(Altitude.getCellHeight(44, 41));

		sorot.petak(null);
		EM.render();
		expect(hidup('AcSorotTerang')).toHaveLength(0);
	});

	it('hentikan() melepas semua tile redup dan terang', () => {
		sorot.separuhSendiri(true);
		sorot.petak(2, 1);
		EM.render();
		sorot.hentikan();
		EM.render();
		expect(EM.daftar).toHaveLength(0);
	});
});
