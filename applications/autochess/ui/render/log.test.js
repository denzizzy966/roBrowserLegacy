import { describe, it, expect } from 'vitest';
import { ekorLog, renderLog, BARIS_LOG_MAKS } from './log.js';

describe('ekorLog', () => {
	it('kosong -> tanpa baris', () => {
		expect(ekorLog('')).toEqual([]);
		expect(ekorLog('\n')).toEqual([]);
		expect(ekorLog(null)).toEqual([]);
	});
	it('semua baris bila kurang dari maks, dengan atau tanpa newline penutup', () => {
		expect(ekorLog('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
		expect(ekorLog('a\nb\nc')).toEqual(['a', 'b', 'c']);
		expect(ekorLog('satu')).toEqual(['satu']);
	});
	it('hanya maks baris TERAKHIR', () => {
		const teks = Array.from({ length: 500 }, (_, i) => `baris ${i}`).join('\n') + '\n';
		const ekor = ekorLog(teks, 200);
		expect(ekor).toHaveLength(BARIS_LOG_MAKS);
		expect(ekor[0]).toBe('baris 300');
		expect(ekor.at(-1)).toBe('baris 499');
		expect(ekorLog('a\nb\nc\nd\n', 2)).toEqual(['c', 'd']);
		expect(ekorLog('a\nb\nc\nd\n', 4)).toEqual(['a', 'b', 'c', 'd']);
		expect(ekorLog('a\nb\nc\nd\n', 3)).toEqual(['b', 'c', 'd']);
		expect(ekorLog('a\nb\n', 1)).toEqual(['b']);
	});
	it('baris kosong di tengah dipertahankan', () => {
		expect(ekorLog('a\n\nb\n')).toEqual(['a', '', 'b']);
	});
});

describe('renderLog', () => {
	it('satu div per baris; HTML di-escape', () => {
		const h = renderLog('map termuat: guild_vs3\n<b>x</b> & "y"\n');
		expect(h).toContain('<div class="baris">map termuat: guild_vs3</div>');
		expect(h).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
		expect(h).not.toContain('<b>');
	});
	it('baris berawalan "!" diberi kelas galat', () => {
		expect(renderLog('! gagal\nbiasa\n')).toBe('<div class="baris galat">! gagal</div><div class="baris">biasa</div>');
	});
	it('log kosong -> string kosong', () => {
		expect(renderLog('')).toBe('');
	});
});
