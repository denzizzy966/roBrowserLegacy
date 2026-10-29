import { describe, it, expect } from 'vitest';
import { renderDPS } from './dps.js';

const katalog = { namaUnit: (id) => `U-${id}` };
const deps = { bahasa: 'id', katalog };
const snap = {
	state: { saya: { bidak: [
		{ entityId: 0, unitId: 'a', bintang: 1 },
		{ entityId: 11, unitId: 'b', bintang: 2 },
		{ entityId: 12, unitId: 'c', bintang: 1 }
	] } }
};

describe('renderDPS', () => {
	it('hanya bidak di papan, urut turun, bar relatif ke maksimum', () => {
		const h = renderDPS(snap, deps, [{ entityId: 12, total: 50 }, { entityId: 99, total: 500 }]);
		expect(h).not.toContain('U-a');
		expect(h.indexOf('U-c')).toBeLessThan(h.indexOf('U-b'));
		expect(h).toContain('width:100%');
		expect(h).toContain('width:0%');
		expect(h).toContain('★2');
		expect(h).toContain('<span class="total">50</span>');
	});
	it('tanpa bidak di papan tampil kosong', () => {
		expect(renderDPS({ state: { saya: { bidak: [] } } }, deps, [])).toContain('kosong');
	});
});
