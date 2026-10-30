import { describe, it, expect } from 'vitest';
import {
	itemDiTitik, itemSaatTahan, renderMenuBidak, posisiMenu, keluarRadius, opsiMenuBidak, RADIUS_MENU_PX, UKURAN_MENU_PX
} from './menuBidak.js';
import { buatTeks, formatZeny } from '../../teks.js';
import { FASE } from '../../pesan.js';

function deps(bahasa = 'id') {
	return { t: buatTeks({ pref: { bahasa } }).t, formatZeny };
}

describe('itemDiTitik (K5: Jual 90°, Pindah 210°, Batal 330°)', () => {
	const pusat = { x: 0, y: 0 };

	it('item pada sudutnya', () => {
		expect(RADIUS_MENU_PX).toBe(60);
		expect(itemDiTitik(pusat, { x: 0, y: -60 }, 60)).toBe('jual');
		expect(itemDiTitik(pusat, { x: -52, y: 30 }, 60)).toBe('pindah');
		expect(itemDiTitik(pusat, { x: 52, y: 30 }, 60)).toBe('batal');
	});

	it('di luar radius + 30 atau di pusat (< 30 px): null', () => {
		expect(itemDiTitik(pusat, { x: 0, y: -120 }, 60)).toBeNull();
		expect(itemDiTitik(pusat, { x: 0, y: -10 }, 60)).toBeNull();
	});

	it('toleransi ±60° dan jarak 30..radius+30', () => {
		// 90° + 55° = 145° (masih Jual), 90° - 55° = 35°
		const di = (sudut, r) => ({ x: Math.cos(sudut * Math.PI / 180) * r, y: -Math.sin(sudut * Math.PI / 180) * r });
		expect(itemDiTitik(pusat, di(145, 60), 60)).toBe('jual');
		expect(itemDiTitik(pusat, di(35, 60), 60)).toBe('jual');
		expect(itemDiTitik(pusat, di(155, 60), 60)).toBe('pindah');
		expect(itemDiTitik(pusat, di(25, 60), 60)).toBe('batal');
		expect(itemDiTitik(pusat, di(90, 30), 60)).toBe('jual');
		expect(itemDiTitik(pusat, di(90, 90), 60)).toBe('jual');
		expect(itemDiTitik(pusat, di(90, 91), 60)).toBeNull();
		// pusat lain
		expect(itemDiTitik({ x: 500, y: 300 }, { x: 500, y: 240 }, 60)).toBe('jual');
	});
});

describe('itemSaatTahan (tombol masih ditahan sejak tahan)', () => {
	it('pusat = titik tahan: sama dengan itemDiTitik', () => {
		const p = { x: 300, y: 300 };
		expect(itemSaatTahan(p, p, { x: 300, y: 240 })).toBe('jual');
		expect(itemSaatTahan(p, p, { x: 300, y: 295 })).toBeNull();
	});

	it('pusat digeser jepitan: titik tahan di sektor item tidak memilih sampai pointer bergerak 30 px', () => {
		const pusat = { x: 700, y: 605 };
		const tahan = { x: 700, y: 660 }; // 55 px di bawah pusat: sektor Pindah/Batal
		expect(itemDiTitik(pusat, tahan)).not.toBeNull();
		expect(itemSaatTahan(pusat, tahan, tahan)).toBeNull();
		expect(itemSaatTahan(pusat, tahan, { x: 710, y: 650 })).toBeNull();
		expect(itemSaatTahan(pusat, tahan, { x: 700, y: 545 })).toBe('jual');
	});
});

describe('keluarRadius (K5: seret biasa sesudah keluar radius + 30)', () => {
	it('lebih dari radius + 30 px dari pusat', () => {
		expect(keluarRadius({ x: 0, y: 0 }, { x: 0, y: -90 }, 60)).toBe(false);
		expect(keluarRadius({ x: 0, y: 0 }, { x: 0, y: -91 }, 60)).toBe(true);
		expect(keluarRadius({ x: 10, y: 10 }, { x: 80, y: 80 }, 60)).toBe(true);
	});
});

describe('posisiMenu (berpusat di titik, dijepit ke viewport)', () => {
	const layar = { lebar: 1536, tinggi: 695 };

	it('di tengah: host berpusat di titik', () => {
		expect(UKURAN_MENU_PX).toBe(140);
		expect(posisiMenu({ x: 700, y: 300 }, layar)).toEqual({ left: 630, top: 230, pusat: { x: 700, y: 300 } });
	});

	it('dekat tepi: pusat digeser supaya ketiga item (radius + 30) tetap di layar', () => {
		const p = posisiMenu({ x: 5, y: 690 }, layar);
		expect(p.pusat).toEqual({ x: 90, y: 605 });
		expect(p.left).toBe(20);
		expect(p.top).toBe(535);
		const q = posisiMenu({ x: 1530, y: 2 }, layar);
		expect(q.pusat).toEqual({ x: 1536 - 90, y: 90 });
	});
});

describe('renderMenuBidak', () => {
	const OPSI = { hargaJual: 9, bolehJual: true, bolehPindah: false, alasanPindah: 'menu.hanya_persiapan' };

	it('ID: Jual +9 zeny; Pindah nonaktif dengan alasan terjemahan; Batal', () => {
		const h = renderMenuBidak(OPSI, deps('id'));
		expect(h).toContain('Jual');
		expect(h).toContain('+9 zeny');
		expect(h).toMatch(/<div class="item pindah nonaktif" data-item="pindah" title="hanya saat Persiapan"/);
		expect(h).toContain('Pindah');
		expect(h).toContain('Batal');
		expect(h).toMatch(/<div class="item jual" data-item="jual"/);
		expect(h).toMatch(/<div class="item batal" data-item="batal"/);
	});

	it('EN', () => {
		const h = renderMenuBidak(OPSI, deps('en'));
		expect(h).toContain('Sell');
		expect(h).toContain('+9 zeny');
		expect(h).toContain('Move');
		expect(h).toContain('Cancel');
		expect(h).toMatch(/class="item pindah nonaktif" data-item="pindah" title="preparation only"/);
	});

	it('Jual nonaktif juga berkelas nonaktif; item disorot berkelas sorot; posisi pada sudutnya', () => {
		const h = renderMenuBidak({ ...OPSI, bolehJual: false, bolehPindah: true, sorot: 'batal' }, deps());
		expect(h).toMatch(/class="item jual nonaktif" data-item="jual" title="hanya saat Persiapan"/);
		expect(h).toMatch(/class="item pindah" data-item="pindah"/);
		expect(h).toMatch(/class="item batal sorot" data-item="batal"/);
		// pusat host 70,70; Jual tepat di atas pusat sejauh radius
		expect(h).toContain('data-item="jual" title="hanya saat Persiapan" style="left:70px;top:10px"');
		expect(h).toContain('style="left:18px;top:100px"');
		expect(h).toContain('style="left:122px;top:100px"');
	});

	it('R-F: opsi bidak bangku saat TEMPUR -> Jual aktif, Pindah nonaktif "hanya saat Persiapan" (ID/EN)', () => {
		const opsi = opsiMenuBidak({ bidak: { diPapan: false, hargaJual: 9 }, fase: FASE.TEMPUR, selesai: null });
		expect(renderMenuBidak(opsi, deps('id'))).toMatch(/class="item pindah nonaktif" data-item="pindah" title="hanya saat Persiapan"/);
		expect(renderMenuBidak(opsi, deps('en'))).toMatch(/class="item pindah nonaktif" data-item="pindah" title="preparation only"/);
		expect(renderMenuBidak(opsi, deps('id'))).toMatch(/<div class="item jual" data-item="jual"/);
	});

	it('harga di-format (ribuan) dan bukan angka -> 0', () => {
		expect(renderMenuBidak({ ...OPSI, hargaJual: 1234 }, deps())).toContain('+1,234 zeny');
		expect(renderMenuBidak({ ...OPSI, hargaJual: undefined }, deps())).toContain('+0 zeny');
	});
});

describe('opsiMenuBidak (K5, R-F)', () => {
	const bangku = { diPapan: false, hargaJual: 3 };
	const papan = { diPapan: true, hargaJual: 9 };
	const opsi = (bidak, fase, selesai = null) => opsiMenuBidak({ bidak, fase, selesai });

	it('bidak bangku saat PERSIAPAN: Jual dan Pindah aktif (juga saat menonton kursi lain: helper tidak memandang tontonan)', () => {
		expect(opsi(bangku, FASE.PERSIAPAN)).toEqual({
			hargaJual: 3, bolehJual: true, bolehPindah: true,
			alasanPindah: 'menu.hanya_persiapan', alasanJual: 'menu.hanya_persiapan'
		});
	});

	it('bidak bangku saat TEMPUR dan HASIL: Jual aktif, Pindah nonaktif dengan menu.hanya_persiapan', () => {
		for (const fase of [FASE.TEMPUR, FASE.HASIL]) {
			const o = opsi(bangku, fase);
			expect(o.bolehJual, fase).toBe(true);
			expect(o.bolehPindah, fase).toBe(false);
			expect(o.alasanPindah).toBe('menu.hanya_persiapan');
		}
	});

	it('bidak papan saat PERSIAPAN: keduanya aktif, harga jual dari bidak', () => {
		const o = opsi(papan, FASE.PERSIAPAN);
		expect([o.bolehJual, o.bolehPindah, o.hargaJual]).toEqual([true, true, 9]);
	});

	it('bidak papan di luar PERSIAPAN (seret.js tidak pernah menahannya): keduanya nonaktif', () => {
		for (const fase of [FASE.TEMPUR, FASE.HASIL]) {
			const o = opsi(papan, fase);
			expect([o.bolehJual, o.bolehPindah], fase).toEqual([false, false]);
			expect(o.alasanJual).toBe('menu.hanya_persiapan');
		}
	});

	it('sesudah pertandingan usai: keduanya nonaktif', () => {
		const o = opsi(bangku, FASE.PERSIAPAN, { peringkat: 1 });
		expect([o.bolehJual, o.bolehPindah]).toEqual([false, false]);
	});
});
