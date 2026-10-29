import { describe, it, expect } from 'vitest';
import { formatWaktu } from './waktu.js';
import { formatWaktu as formatWaktuUI } from '../../ui.js';

describe('formatWaktu (waktu.js)', () => {
	it('mm:ss dibulatkan ke atas, tidak pernah negatif', () => {
		expect(formatWaktu(25000)).toBe('00:25');
		expect(formatWaktu(61001)).toBe('01:02');
		expect(formatWaktu(29500)).toBe('00:30');
		expect(formatWaktu(0)).toBe('00:00');
		expect(formatWaktu(-5)).toBe('00:00');
	});
	it('ui.js meneruskan fungsi yang sama (panel debug)', () => {
		expect(formatWaktuUI).toBe(formatWaktu);
	});
});
