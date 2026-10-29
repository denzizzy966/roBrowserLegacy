import { describe, it, expect } from 'vitest';
import { buatDPS } from './dps.js';
import { JENIS_DAMAGE_HEAL } from './pesan.js';

describe('buatDPS', () => {
	it('mengakumulasi damage dan skill, urut turun', () => {
		const d = buatDPS();
		d.damage(5, 10, 0);
		d.damage(5, 15, 0);
		d.damage(7, 30, 0);
		d.skill(5, [{ amount: 20, jenis: 0 }, { amount: 5, jenis: 0 }]);
		expect(d.ambil()).toEqual([{ entityId: 5, total: 50 }, { entityId: 7, total: 30 }]);
	});
	it('mengabaikan heal dan MISS', () => {
		const d = buatDPS();
		d.damage(5, 40, JENIS_DAMAGE_HEAL);
		d.damage(5, 0, 0);
		d.skill(5, [{ amount: 9, jenis: JENIS_DAMAGE_HEAL }, { amount: 0, jenis: 0 }]);
		expect(d.ambil()).toEqual([]);
	});
	it('reset mengosongkan', () => {
		const d = buatDPS();
		d.damage(1, 5, 0);
		d.reset();
		expect(d.ambil()).toEqual([]);
	});
});
