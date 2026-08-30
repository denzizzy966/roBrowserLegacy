import { describe, it, expect } from 'vitest';
import { decodeDamage, decodeDeath, decodeItemTanah, decodeItemHilang, persenDarah } from './tempur.js';

describe('decodeDamage', () => {
	it('membaca keempat field', () => {
		expect(decodeDamage({ src: 4, dst: 1, amount: 7, hpSisa: 23 }))
			.toEqual({ src: 4, dst: 1, amount: 7, hpSisa: 23 });
	});

	// hpSisa NOL adalah nilai sah -- ia berarti target mati. Falsy-check
	// akan menelannya, dan itu jebakan yang sama persis dengan
	// objecttype 0 di M6a.
	it('tidak menelan hpSisa nol', () => {
		expect(decodeDamage({ src: 1, dst: 2, amount: 5, hpSisa: 0 }).hpSisa).toBe(0);
	});

	// Field protobuf yang absen berarti nol, bukan undefined: server yang
	// mengirim damage 0 dan server yang tidak mengirim field damage sama
	// sekali menghasilkan byte yang identik di kawat.
	it('field absen jadi nol, bukan undefined', () => {
		const d = decodeDamage({ src: 1, dst: 2 });
		expect(d).toEqual({ src: 1, dst: 2, amount: 0, hpSisa: 0 });
	});
});

describe('decodeDeath', () => {
	it('membaca entityId', () => {
		expect(decodeDeath({ entityId: 12 })).toEqual({ entityId: 12 });
	});
});

describe('decodeItemTanah', () => {
	it('membaca keempat field', () => {
		expect(decodeItemTanah({ groundId: 9, namaItem: 'Fluff', x: 150, y: 185 }))
			.toEqual({ groundId: 9, namaItem: 'Fluff', x: 150, y: 185 });
	});

	// Koordinat nol sah: petak (0,0) ada di setiap map.
	it('tidak menelan koordinat nol', () => {
		const it = decodeItemTanah({ groundId: 9, namaItem: 'Fluff', x: 0, y: 0 });
		expect(it.x).toBe(0);
		expect(it.y).toBe(0);
	});

	it('nama absen jadi string kosong, bukan undefined', () => {
		expect(decodeItemTanah({ groundId: 9, x: 1, y: 2 }).namaItem).toBe('');
	});
});

describe('decodeItemHilang', () => {
	it('membaca groundId', () => {
		expect(decodeItemHilang({ groundId: 9 })).toEqual({ groundId: 9 });
	});
});

describe('persenDarah', () => {
	it('menghitung persen bulat', () => {
		expect(persenDarah(30, 30)).toBe(100);
		expect(persenDarah(15, 30)).toBe(50);
		expect(persenDarah(1, 30)).toBe(3);
	});

	// maxHp nol akan menghasilkan NaN atau Infinity tanpa penjaga.
	it('maxHp nol tidak menghasilkan NaN', () => {
		expect(persenDarah(0, 0)).toBe(0);
		expect(persenDarah(5, 0)).toBe(0);
	});

	it('dijepit ke 0..100', () => {
		expect(persenDarah(-5, 30)).toBe(0);
		expect(persenDarah(60, 30)).toBe(100);
	});
});
