import { describe, it, expect } from 'vitest';
import { renderBangku, JUMLAH_SLOT_BANGKU, bidakBangku } from './bangku.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks, formatZeny } from '../../teks.js';

const katalog = buatKatalog({
	units: {
		poring: { nama: { id: 'Poring', en: 'Poring' }, sprite: { tipe: 'mob', id: 1002 } },
		archer: { nama: { id: 'Pemanah', en: 'Archer' }, sprite: { tipe: 'pc', job: 3, sex: 1, senjata: 11 } }
	}
});
const id = buatTeks();
const en = buatTeks({ pref: { bahasa: 'en' } });
const depsID = { t: id.t, bahasa: 'id', katalog, formatZeny };
const depsEN = { t: en.t, bahasa: 'en', katalog, formatZeny };

const BIDAK = [
	{ bidakId: 7, unitId: 'archer', bintang: 2, diPapan: false, hargaJual: 9 },
	{ bidakId: 3, unitId: 'poring', bintang: 1, diPapan: false, hargaJual: 1 },
	{ bidakId: 5, unitId: 'poring', bintang: 1, diPapan: true }
];

function snap(bidak = BIDAK, ekstra = {}) {
	return { state: { saya: { bidak } }, fase: 1, selesai: null, ...ekstra };
}

/** Potongan HTML satu slot menurut nomornya. */
function slot(h, n) {
	const awal = h.indexOf(`data-slot="${n}"`);
	const akhir = h.indexOf('data-slot=', awal + 1);
	return h.slice(awal, akhir < 0 ? undefined : akhir);
}

describe('renderBangku', () => {
	it('selalu 8 slot', () => {
		const h = renderBangku(snap(), depsID);
		expect(JUMLAH_SLOT_BANGKU).toBe(8);
		expect(h.match(/class="slot[ "]/g)).toHaveLength(8);
		for (let i = 0; i < 8; i++) {
			expect(h).toContain(`data-slot="${i}"`);
		}
	});
	it('bidak bangku urut bidakId, bidak papan tidak ikut', () => {
		expect(bidakBangku(snap()).map((b) => b.bidakId)).toEqual([3, 7]);
		const h = renderBangku(snap(), depsID);
		expect(slot(h, 0)).toContain('data-bidak="3"');
		expect(slot(h, 1)).toContain('data-bidak="7"');
		expect(h).not.toContain('data-bidak="5"');
	});
	it('slot terisi: draggable, kanvas potret 72x84, bintang, nama', () => {
		const h = renderBangku(snap(), depsID);
		expect(h).toContain('class="slot terisi draggable" data-slot="1" data-bidak="7"');
		const s = slot(h, 1);
		expect(s).toContain('<canvas class="potret" data-unit="archer" width="72" height="84">');
		expect(s).toContain('★2');
		expect(s).toContain('Pemanah');
	});
	it('slot kosong polos tanpa data-bidak dan tanpa kanvas', () => {
		const s = slot(renderBangku(snap(), depsID), 2);
		expect(s).not.toContain('data-bidak');
		expect(s).not.toContain('canvas');
		expect(s).not.toContain('draggable');
	});
	it('tanpa tombol jual: jual lewat seret ke Toko, tooltip memuat petunjuk seret', () => {
		const h = renderBangku(snap(), depsID);
		expect(h).not.toContain('<button');
		expect(h).not.toContain('data-aksi');
		expect(slot(h, 0)).toContain(`title="Poring&#10;Harga jual: 1 zeny&#10;${id.t('petunjuk.seret')}"`);
	});
	it('nama unit mengikuti bahasa', () => {
		const h = renderBangku(snap(), depsEN);
		expect(h).toContain('Archer');
		expect(h).toContain(`title="Archer&#10;Sell price: 9 zeny&#10;${en.t('petunjuk.seret')}"`);
	});
	it('tanpa state: 8 slot kosong', () => {
		const h = renderBangku({ state: null, fase: 0 }, depsID);
		expect(h.match(/class="slot"/g)).toHaveLength(8);
	});
	it('AC7 K7: title slot memuat harga jual dari server', () => {
		expect(slot(renderBangku(snap(), depsID), 1)).toContain('Harga jual: 9 zeny');
		// Field tidak ada (server lama): 0.
		const h = renderBangku(snap([{ bidakId: 1, unitId: 'poring', bintang: 1, diPapan: false }]), depsID);
		expect(slot(h, 0)).toContain('Harga jual: 0 zeny');
	});
	it('AC7 K13: petunjuk seret menyebut kolom Toko dan menu tahan', () => {
		expect(id.t('petunjuk.seret')).toContain('Toko');
		expect(id.t('petunjuk.seret')).toContain('tahan');
		expect(en.t('petunjuk.seret')).toContain('Shop');
	});
	it('meloloskan unitId asing', () => {
		const h = renderBangku(snap([{ bidakId: 1, unitId: '<x>', bintang: 1, diPapan: false }]), depsID);
		expect(h).not.toContain('<x>');
		expect(h).toContain('&lt;x&gt;');
	});
});
