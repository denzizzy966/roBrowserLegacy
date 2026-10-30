import { describe, it, expect } from 'vitest';
import { renderTimer } from './timer.js';
import { buatTeks } from '../../teks.js';

// AC6 (K4): renderKapasitas, renderZeny, dan renderExp dihapus; isinya
// pindah ke renderBilahDeck (bilahDeck.test.js).
const { t } = buatTeks();

function snap(saya = {}, ekstra = {}) {
	return {
		state: { saya: { zeny: 10, level: 3, exp: 2, expBerikut: 8, kapasitas: 3, bidak: [{ diPapan: true }, { diPapan: false }], ...saya } },
		fase: 1, ronde: 4, hasilTerakhir: null, selesai: null, sisaMs: 65000, ...ekstra
	};
}

describe('renderTimer', () => {
	it('memuat mm:ss, ronde, dan nama fase', () => {
		const h = renderTimer(snap(), t);
		expect(h).toContain('01:05');
		expect(h).toContain('Ronde 4');
		expect(h).toContain('Persiapan');
	});
	it('fase hasil menampilkan menang/kalah/seri', () => {
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { menang: true } }), t)).toContain('MENANG');
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { menang: false } }), t)).toContain('KALAH');
		expect(renderTimer(snap({}, { fase: 3, hasilTerakhir: { seri: true } }), t)).toContain('SERI');
	});
});
