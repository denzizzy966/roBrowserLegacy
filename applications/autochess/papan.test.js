import { describe, it, expect } from 'vitest';
import { SKALA_PETAK, KOLOM, BARIS, TIM_A, TIM_B, cellDariPetak, pusatPapan } from './papan.js';

// Tabel ini SAMA dengan TestCellDari di server/internal/arena
// (pertempuran_test.go). Bila salah satu berubah, yang lain wajib ikut:
// client dan server harus sepakat di cell mana sebuah bidak berdiri.
const ASAL = { x: 42, y: 41 };

describe('cellDariPetak', () => {
	const tabel = [
		{ nama: 'A(0,0)', tim: TIM_A, kolom: 0, baris: 0, x: 43, y: 42 },
		{ nama: 'A(7,3)', tim: TIM_A, kolom: 7, baris: 3, x: 57, y: 48 },
		{ nama: 'B(0,0)', tim: TIM_B, kolom: 0, baris: 0, x: 57, y: 56 },
		{ nama: 'B(7,3)', tim: TIM_B, kolom: 7, baris: 3, x: 43, y: 50 },
		{ nama: 'B(3,2)', tim: TIM_B, kolom: 3, baris: 2, x: 51, y: 52 }
	];

	for (const k of tabel) {
		it(`${k.nama} sepadan dengan arena.CellDari`, () => {
			expect(cellDariPetak(ASAL, SKALA_PETAK, k.kolom, k.baris, k.tim)).toEqual({ x: k.x, y: k.y });
		});
	}
});

describe('pusatPapan', () => {
	it('titik tengah papan 8x8 dari asal {42,41} skala 2 adalah {50,49}', () => {
		expect(KOLOM).toBe(8);
		expect(BARIS).toBe(8);
		expect(pusatPapan(ASAL, SKALA_PETAK)).toEqual({ x: 50, y: 49 });
	});
});
