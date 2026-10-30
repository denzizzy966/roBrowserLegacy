import { describe, it, expect } from 'vitest';
import { ekorLog, renderLog, BARIS_LOG_MAKS, diDasar, perbaruiLog } from './log.js';

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

describe('perbaruiLog (autoscroll hanya di dasar)', () => {
	/** Elemen palsu: menulis html memperpanjang isi dan, seperti browser, tidak menggeser scrollTop. */
	function elemen({ scrollTop = 0, scrollHeight = 500, clientHeight = 100 } = {}) {
		return { scrollTop, scrollHeight, clientHeight };
	}
	const tulis = (el, html) => {
		if (el._htmlTerakhir === html) {
			return false;
		}
		el._htmlTerakhir = html;
		el.scrollHeight += 13; // satu baris baru
		return true;
	};

	it('diDasar: tepat di dasar dan dalam toleransi 4 px', () => {
		expect(diDasar(elemen({ scrollTop: 400 }))).toBe(true);
		expect(diDasar(elemen({ scrollTop: 396 }))).toBe(true);
		expect(diDasar(elemen({ scrollTop: 395 }))).toBe(false);
	});

	it('di dasar sebelum menulis -> menggulir ke dasar baru', () => {
		const el = elemen({ scrollTop: 400 });
		el._htmlTerakhir = 'lama';
		expect(perbaruiLog(el, 'baru', tulis)).toBe(true);
		expect(el.scrollTop).toBe(513);
	});

	it('pembaca menggulir ke atas -> scrollTop dipertahankan walau isi berubah', () => {
		const el = elemen({ scrollTop: 120 });
		el._htmlTerakhir = 'lama';
		perbaruiLog(el, 'baru1', tulis);
		perbaruiLog(el, 'baru2', tulis);
		expect(el.scrollTop).toBe(120);
	});

	it('isi sama (tidak berubah) -> scrollTop tak disentuh', () => {
		const el = elemen({ scrollTop: 120 });
		el._htmlTerakhir = 'sama';
		expect(perbaruiLog(el, 'sama', tulis)).toBe(false);
		expect(el.scrollTop).toBe(120);
	});

	it('tulis ulang sesudah lupakanTulisan (ganti bahasa) mempertahankan gulungan', () => {
		const atas = elemen({ scrollTop: 120 });
		atas._htmlTerakhir = 'lama';
		atas._pernahDitulis = true; // diset lupakanTulisan
		delete atas._htmlTerakhir;
		perbaruiLog(atas, 'lama', tulis);
		expect(atas.scrollTop).toBe(120);
		const bawah = elemen({ scrollTop: 400 });
		bawah._pernahDitulis = true;
		perbaruiLog(bawah, 'lama', tulis);
		expect(bawah.scrollTop).toBe(513);
	});

	it('penulisan pertama dan paksaDasar selalu ke dasar', () => {
		const pertama = elemen({ scrollTop: 0 });
		perbaruiLog(pertama, 'x', tulis);
		expect(pertama.scrollTop).toBe(513);
		const paksa = elemen({ scrollTop: 10 });
		paksa._htmlTerakhir = 'lama';
		perbaruiLog(paksa, 'baru', tulis, true);
		expect(paksa.scrollTop).toBe(513);
	});
});
