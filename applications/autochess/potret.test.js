import { describe, it, expect, vi } from 'vitest';

import { buatPotret, adaPiksel, FPS_MAKS, BATAS_STATIS_MS } from './potret.js';

// Entity palsu: hanya yang potret.js sentuh. renderEntity bisa diganti
// per uji lewat EntityPalsu.render (dipanggil dengan entity-nya).
class EntityPalsu {
	static TYPE_PC = 0;
	static TYPE_MOB = 5;
	static semua = [];
	static render = () => {};

	constructor() {
		this.ACTION = { IDLE: 0 };
		this.action = -1;
		this.direction = 0;
		this.hideShadow = false;
		this.diset = null;
		this.weapon = undefined;
		this.renderEntity = vi.fn(() => EntityPalsu.render(this));
		EntityPalsu.semua.push(this);
	}

	set(unit) {
		this.diset = unit;
		Object.assign(this, unit);
	}
}

/** Kanvas palsu: getImageData mengembalikan alfa yang bisa diatur. */
function kanvasPalsu(width = 160, height = 180) {
	const ctx = {
		alfa: 0,
		clearRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		scale: vi.fn(),
		getImageData: vi.fn((x, y, w, h) => {
			const data = new Uint8ClampedArray(w * h * 4);
			for (let i = 3; i < data.length; i += 4) {
				data[i] = ctx.alfa;
			}
			return { data };
		})
	};
	return { width, height, ctx, getContext: () => ctx };
}

/**
 * Lingkungan uji: antrean raf yang dikuras manual dan jam sekarang()
 * yang maju sesuai langkah frame.
 */
function siapkan() {
	EntityPalsu.semua = [];
	EntityPalsu.render = () => {};
	let jam = 1000;
	let antrean = [];
	const raf = vi.fn((fn) => {
		antrean.push(fn);
		return antrean.length;
	});
	const log = vi.fn();
	const SpriteRenderer = { bind2DContext: vi.fn() };
	const Camera = { direction: 2 };
	const potret = buatPotret({
		Entity: EntityPalsu, SpriteRenderer, Camera, raf, sekarang: () => jam, log
	});
	/** Maju n frame dengan jarak langkahMs; tiap frame menguras raf sekali. */
	function maju(n, langkahMs = 1000 / 60) {
		for (let i = 0; i < n; i++) {
			jam += langkahMs;
			const giliran = antrean;
			antrean = [];
			for (const fn of giliran) {
				fn(jam);
			}
		}
	}
	return { potret, raf, log, SpriteRenderer, Camera, maju, antrean: () => antrean };
}

const NOVICE = { tipe: 'pc', job: 0, sex: 1, senjata: 1 };
const PORING = { tipe: 'mob', id: 1002 };

describe('adaPiksel', () => {
	it('true bila ada alfa > 0 di blok 4x4 tengah', () => {
		const k = kanvasPalsu();
		expect(adaPiksel(k.ctx, k.width, k.height)).toBe(false);
		k.ctx.alfa = 1;
		expect(adaPiksel(k.ctx, k.width, k.height)).toBe(true);
		expect(k.ctx.getImageData.mock.calls[0]).toEqual([78, 88, 4, 4]);
	});
});

describe('buatPotret', () => {
	it('membuat entity PC dengan resep spawnkan dan mob tanpa head/sex', () => {
		const { potret } = siapkan();
		expect(potret.hidup(NOVICE, kanvasPalsu())).toBe(true);
		expect(potret.hidup(PORING, kanvasPalsu())).toBe(true);
		const [pc, mob] = EntityPalsu.semua;
		expect(pc.diset).toMatchObject({ objecttype: 0, job: 0, sex: 1, head: 1, hideShadow: true });
		expect(pc.weapon).toBe(1);
		expect(mob.diset).toMatchObject({ objecttype: 5, job: 1002, hideShadow: true });
		expect(mob.diset).not.toHaveProperty('head');
		expect(mob.diset).not.toHaveProperty('sex');
		expect(mob.weapon).toBeUndefined();
		expect(pc.GID).toBeLessThan(0);
		expect(mob.GID).toBeLessThan(0);
		expect(pc.GID).not.toBe(mob.GID);
		for (const e of [pc, mob]) {
			expect(e.direction).toBe(4);
			expect(e.action).toBe(0);
			expect(e.hideShadow).toBe(true);
			expect(e.animation).toEqual({ tick: 1000, frame: 0, repeat: true, play: true, next: false, delay: 0, save: false });
		}
	});

	it('sprite null atau tipe asing ditolak dengan log', () => {
		const { potret, log, raf } = siapkan();
		expect(potret.hidup(null, kanvasPalsu())).toBe(false);
		expect(potret.statis({ tipe: 'npc' }, kanvasPalsu())).toBe(false);
		expect(log).toHaveBeenCalledTimes(2);
		expect(raf).not.toHaveBeenCalled();
	});

	it('hidup merender paling banyak FPS_MAKS kali per detik simulasi', () => {
		const { potret, maju } = siapkan();
		potret.hidup(NOVICE, kanvasPalsu());
		maju(60);
		const e = EntityPalsu.semua[0];
		const n = e.renderEntity.mock.calls.length;
		expect(FPS_MAKS).toBe(15);
		expect(n).toBeLessThanOrEqual(15);
		expect(n).toBeGreaterThanOrEqual(14);
		// Juga pada layar 144 Hz.
		maju(144, 1000 / 144);
		const n2 = e.renderEntity.mock.calls.length - n;
		expect(n2).toBeLessThanOrEqual(15);
		expect(n2).toBeGreaterThanOrEqual(13);
	});

	it('menyetel Camera.direction 4, clearRect, dan bind2DContext di titik kaki sebelum render, lalu memulihkan arah kamera', () => {
		const { potret, maju, SpriteRenderer, Camera } = siapkan();
		const k = kanvasPalsu(160, 180);
		let arahSaatRender = null;
		EntityPalsu.render = () => {
			arahSaatRender = Camera.direction;
		};
		potret.hidup(NOVICE, k, { kaki: 0.5 });
		maju(1);
		expect(arahSaatRender).toBe(4);
		expect(Camera.direction).toBe(2);
		expect(k.ctx.clearRect).toHaveBeenCalledWith(0, 0, 160, 180);
		expect(SpriteRenderer.bind2DContext).toHaveBeenCalledWith(k.ctx, 80, 90);
	});

	it('kaki bawaan 0.87 dan skala memperbesar lewat ctx.scale', () => {
		const { potret, maju, SpriteRenderer } = siapkan();
		const a = kanvasPalsu(100, 100);
		const b = kanvasPalsu(100, 100);
		potret.hidup(NOVICE, a);
		potret.hidup(PORING, b, { skala: 2 });
		maju(1);
		expect(SpriteRenderer.bind2DContext).toHaveBeenCalledWith(a.ctx, 50, 87);
		expect(a.ctx.scale).not.toHaveBeenCalled();
		expect(b.ctx.scale).toHaveBeenCalledWith(2, 2);
		expect(SpriteRenderer.bind2DContext).toHaveBeenCalledWith(b.ctx, 25, 43.5);
		expect(b.ctx.restore).toHaveBeenCalled();
	});

	it('statis berhenti setelah frame pertama yang tidak kosong', () => {
		const { potret, maju, antrean } = siapkan();
		const k = kanvasPalsu();
		potret.statis(PORING, k);
		maju(10);
		const e = EntityPalsu.semua[0];
		const sebelum = e.renderEntity.mock.calls.length;
		expect(sebelum).toBeGreaterThan(0);
		k.ctx.alfa = 255;
		maju(10);
		const sesudah = e.renderEntity.mock.calls.length;
		expect(sesudah).toBe(sebelum + 1);
		maju(30);
		expect(e.renderEntity.mock.calls.length).toBe(sesudah);
		// Tidak ada kanvas tersisa: loop berhenti meminta frame.
		expect(antrean()).toHaveLength(0);
	});

	it('statis menyerah dengan satu log setelah BATAS_STATIS_MS tetap kosong', () => {
		const { potret, maju, log, antrean } = siapkan();
		potret.statis(PORING, kanvasPalsu());
		expect(BATAS_STATIS_MS).toBe(5000);
		maju(60 * 6);
		const e = EntityPalsu.semua[0];
		const n = e.renderEntity.mock.calls.length;
		expect(n).toBeGreaterThan(60);
		maju(60);
		expect(e.renderEntity.mock.calls.length).toBe(n);
		expect(antrean()).toHaveLength(0);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain('1002');
	});

	it('hentikan melepas satu kanvas, yang lain tetap dirender', () => {
		const { potret, maju } = siapkan();
		const a = kanvasPalsu();
		const b = kanvasPalsu();
		potret.hidup(NOVICE, a);
		potret.hidup(PORING, b);
		maju(5);
		expect(potret.hentikan(a)).toBe(true);
		expect(potret.hentikan(a)).toBe(false);
		const [ea, eb] = EntityPalsu.semua;
		const na = ea.renderEntity.mock.calls.length;
		const nb = eb.renderEntity.mock.calls.length;
		maju(30);
		expect(ea.renderEntity.mock.calls.length).toBe(na);
		expect(eb.renderEntity.mock.calls.length).toBeGreaterThan(nb);
	});

	it('hidup pada kanvas yang sama mengganti potret lamanya', () => {
		const { potret, maju } = siapkan();
		const k = kanvasPalsu();
		potret.hidup(NOVICE, k);
		potret.hidup(PORING, k);
		maju(30);
		const [lama, baru] = EntityPalsu.semua;
		expect(lama.renderEntity).not.toHaveBeenCalled();
		expect(baru.renderEntity).toHaveBeenCalled();
	});

	it('hentikanSemua mengosongkan loop', () => {
		const { potret, maju, antrean } = siapkan();
		potret.hidup(NOVICE, kanvasPalsu());
		potret.hidup(PORING, kanvasPalsu());
		maju(1);
		potret.hentikanSemua();
		maju(30);
		expect(antrean()).toHaveLength(0);
		for (const e of EntityPalsu.semua) {
			expect(e.renderEntity).toHaveBeenCalledTimes(1);
		}
	});

	it('renderEntity yang melempar dicatat sekali dan tidak menghentikan kanvas lain', () => {
		const { potret, maju, log } = siapkan();
		EntityPalsu.render = (e) => {
			if (e.job === 0) {
				throw new Error('sprite hilang');
			}
		};
		potret.hidup(NOVICE, kanvasPalsu());
		potret.hidup(PORING, kanvasPalsu());
		maju(60);
		const [rusak, sehat] = EntityPalsu.semua;
		expect(rusak.renderEntity.mock.calls.length).toBeGreaterThan(1);
		expect(sehat.renderEntity.mock.calls.length).toBeGreaterThanOrEqual(14);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain('sprite hilang');
	});

	it('hanya satu permintaan raf tertunda meski banyak kanvas didaftarkan', () => {
		const { potret, antrean } = siapkan();
		potret.hidup(NOVICE, kanvasPalsu());
		potret.hidup(PORING, kanvasPalsu());
		potret.statis(PORING, kanvasPalsu());
		expect(antrean()).toHaveLength(1);
	});
});
