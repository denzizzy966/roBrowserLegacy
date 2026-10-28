import { describe, it, expect, vi } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { renderUI, ikatAksi, formatWaktu, sandikanAksi } from './ui.js';
import { FASE } from './pesan.js';

const HERE        = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../../proto/ro.proto');

// State contoh berbentuk keluaran decodeCaturState.
function contoh() {
	const hp = [40, 100, 15, 70, 0, 85, 55, 100];
	return {
		ronde: 5, fase: FASE.PERSIAPAN, sisaMs: 25000,
		kursi: hp.map((h, i) => ({
			kursi: i, nama: `Pemain${i}`, hp: h, level: 3 + (i % 3), bot: i !== 0, hidup: h > 0, streak: i - 2
		})),
		saya: {
			kursi: 0, zeny: 17, exp: 4, expBerikut: 10, level: 4, kapasitas: 4, kunci: false,
			toko: [
				{ slot: 0, unitId: 'poring', harga: 1 },
				{ slot: 1, unitId: 'lunatic', harga: 1 },
				{ slot: 2, unitId: 'swordman', harga: 2 },
				{ slot: 3, unitId: '', harga: 0 },
				{ slot: 4, unitId: 'wizard', harga: 3 }
			],
			bidak: [
				{ bidakId: 1, unitId: 'poring', bintang: 1, diPapan: false, kolom: 0, baris: 0, entityId: 0 },
				{ bidakId: 2, unitId: 'acolyte', bintang: 2, diPapan: true, kolom: 3, baris: 1, entityId: 42 }
			],
			sinergi: [{ id: 'pemburu', jumlah: 3, tingkatAktif: 1, origin: true }],
			peluang: [{ tier: 1, persen: 70 }, { tier: 2, persen: 25 }, { tier: 3, persen: 5 }]
		}
	};
}

function render(isi = {}) {
	return renderUI({
		state: contoh(), fase: FASE.PERSIAPAN, ronde: 5, hasilTerakhir: null, selesai: null, sisaMs: 25000, ...isi
	});
}

describe('formatWaktu', () => {
	it('mm:ss, dibulatkan ke atas, tak negatif', () => {
		expect(formatWaktu(25000)).toBe('00:25');
		expect(formatWaktu(61001)).toBe('01:02');
		expect(formatWaktu(0)).toBe('00:00');
		expect(formatWaktu(-5)).toBe('00:00');
	});
});

describe('renderUI', () => {
	it('menunggu bila state belum tiba', () => {
		const html = renderUI({ state: null, fase: 0, ronde: 0, hasilTerakhir: null, selesai: null, sisaMs: 0 });
		expect(html).toContain('menunggu');
		expect(html).not.toContain('data-aksi');
	});

	it('memuat status, toko dengan data-aksi beli per slot, dan tombol toko', () => {
		const html = render();

		expect(html).toContain('id="status"');
		expect(html).toContain('00:25');
		expect(html).toContain('17');           // zeny
		expect(html).toContain('4/10');         // exp/expBerikut
		expect(html).toContain('1/4');          // kapasitas: satu bidak di papan dari 4
		expect(html).toContain('data-aksi="beli" data-arg="2"');
		expect(html).toContain('swordman');
		// Slot kosong tidak punya tombol beli.
		expect(html).not.toContain('data-aksi="beli" data-arg="3"');
		for (const aksi of ['refresh', 'kunci', 'beli-exp', 'lewati']) {
			expect(html).toContain(`data-aksi="${aksi}"`);
		}
		expect(html).toContain('>Kunci<');
	});

	it('teks tombol kunci menjadi Buka saat toko terkunci', () => {
		const st = contoh();
		st.saya.kunci = true;
		const html = render({ state: st });
		expect(html).toContain('>Buka<');
		expect(html).toContain('data-aksi="kunci" data-arg="0"');
	});

	it('8 baris kursi urut HP menurun, yang tersingkir ditandai', () => {
		const html = render();
		const kursi = html.slice(html.indexOf('id="kursi"'), html.indexOf('id="toko"'));
		const baris = kursi.match(/<tr class="kursi[^"]*"[\s\S]*?<\/tr>/g);

		expect(baris).toHaveLength(8);
		const hp = baris.map((b) => Number(b.match(/data-hp="(\d+)"/)[1]));
		expect(hp).toEqual([100, 100, 85, 70, 55, 40, 15, 0]);
		expect(baris[7]).toContain('tersingkir');
		expect(baris[7]).toContain('Pemain4');
		expect(baris.filter((b) => b.includes('tersingkir'))).toHaveLength(1);
	});

	it('bangku memuat select kolom/baris dan tombol taruh/jual; papan memuat ke-bangku', () => {
		const html = render();
		const bangku = html.slice(html.indexOf('id="bangku"'), html.indexOf('id="papan"'));
		const papan = html.slice(html.indexOf('id="papan"'), html.indexOf('id="sinergi"'));

		expect(bangku).toContain('<select');
		expect(bangku).toContain('data-kolom');
		expect(bangku).toContain('data-baris');
		expect(bangku).toContain('data-aksi="taruh" data-arg="1"');
		expect(bangku).toContain('data-aksi="jual" data-arg="1"');
		expect(bangku).toContain('poring ★1');
		expect(papan).toContain('acolyte ★2 (3,1)');
		expect(papan).toContain('data-aksi="ke-bangku" data-arg="2"');
		expect(papan).toContain('data-aksi="jual" data-arg="2"');
	});

	it('select bangku memilih petak kosong pertama sebagai bawaan', () => {
		const st = contoh();
		// (0,0) terisi: bawaan harus jatuh ke (1,0).
		st.saya.bidak[1].kolom = 0;
		st.saya.bidak[1].baris = 0;
		const bangku = render({ state: st });
		const potong = bangku.slice(bangku.indexOf('id="bangku"'), bangku.indexOf('id="papan"'));
		expect(potong).toMatch(/data-kolom[\s\S]*?<option value="1" selected>/);
		expect(potong).toMatch(/data-baris[\s\S]*?<option value="0" selected>/);
	});

	it('sinergi dan peluang', () => {
		const html = render();
		expect(html).toContain('pemburu');
		expect(html).toContain('T1 70%');
		expect(html).toContain('T3 5%');
	});

	it('tombol aktif saat PERSIAPAN dan disabled saat fase TEMPUR', () => {
		const tombol = (html) => html.match(/<button[^>]*>/g);

		expect(tombol(render()).some((b) => b.includes('disabled'))).toBe(false);
		const tempur = tombol(render({ fase: FASE.TEMPUR }));
		expect(tempur.length).toBeGreaterThan(0);
		expect(tempur.every((b) => b.includes('disabled'))).toBe(true);
	});

	it('hasil MENANG/KALAH/SERI dan peringkat selesai', () => {
		expect(render({ hasilTerakhir: { ronde: 4, menang: true, damageDiterima: 0, zenyMasuk: 6, seri: false } }))
			.toContain('MENANG');
		const kalah = render({ hasilTerakhir: { ronde: 4, menang: false, damageDiterima: 9, zenyMasuk: 5, seri: false } });
		expect(kalah).toContain('KALAH');
		expect(kalah).toContain('damage 9');
		expect(render({ hasilTerakhir: { ronde: 4, menang: false, damageDiterima: 0, zenyMasuk: 5, seri: true } }))
			.toContain('SERI');

		const selesai = render({ selesai: { peringkat: [1, 7, 5, 0, 3, 6, 2, 4], peringkatSaya: 3 } });
		expect(selesai).toContain('id="selesai"');
		expect(selesai).toContain('#4');
		expect(selesai).toContain('Pemain1');
		// Pertandingan selesai: tak ada lagi yang bisa dikirim.
		expect(selesai.match(/<button[^>]*>/g).every((b) => b.includes('disabled'))).toBe(true);
	});

	it('meloloskan HTML dari nama kursi', () => {
		const st = contoh();
		st.kursi[0].nama = '<b>x</b>';
		expect(render({ state: st })).toContain('&lt;b&gt;x&lt;/b&gt;');
	});
});

// DOM palsu minimal: root yang menyimpan listener, tombol berdataset, dan
// kartu yang memuat dua select.
function domPalsu() {
	const root = {
		addEventListener: vi.fn(function (type, fn) {
			this.type = type;
			this.fn = fn;
		})
	};
	function klik(dataset, select = null, disabled = false) {
		const tombol = { dataset, disabled };
		const kartu = select && {
			querySelector: (sel) => {
				if (sel === '[data-kolom]') {
					return { value: select.kolom };
				}
				return sel === '[data-baris]' ? { value: select.baris } : null;
			}
		};
		const target = {
			closest: (sel) => {
				if (sel === '[data-aksi]') {
					return tombol;
				}
				return sel === '.kartu' ? kartu : null;
			}
		};
		root.fn({ target });
	}
	return { root, klik };
}

describe('ikatAksi', () => {
	it('satu listener click; taruh membaca select pada kartu yang sama', () => {
		const { root, klik } = domPalsu();
		const kirim = vi.fn();
		ikatAksi(root, kirim);

		expect(root.addEventListener).toHaveBeenCalledTimes(1);
		expect(root.type).toBe('click');

		klik({ aksi: 'taruh', arg: '1' }, { kolom: '3', baris: '2' });
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
	});

	it('memetakan setiap aksi ke argumennya', () => {
		const { root, klik } = domPalsu();
		const kirim = vi.fn();
		ikatAksi(root, kirim);

		klik({ aksi: 'beli', arg: '2' });
		klik({ aksi: 'jual', arg: '7' });
		klik({ aksi: 'ke-bangku', arg: '8' });
		klik({ aksi: 'kunci', arg: '1' });
		klik({ aksi: 'kunci', arg: '0' });
		klik({ aksi: 'refresh' });
		klik({ aksi: 'beli-exp' });
		klik({ aksi: 'lewati' });

		expect(kirim.mock.calls).toEqual([
			['beli', { slot: 2 }],
			['jual', { bidakId: 7 }],
			['ke-bangku', { bidakId: 8 }],
			['kunci', { kunci: true }],
			['kunci', { kunci: false }],
			['refresh', {}],
			['beli-exp', {}],
			['lewati', {}]
		]);
	});

	it('mengabaikan klik di luar tombol dan tombol disabled', () => {
		const { root, klik } = domPalsu();
		const kirim = vi.fn();
		ikatAksi(root, kirim);

		root.fn({ target: { closest: () => null } });
		root.fn({ target: null });
		klik({ aksi: 'beli', arg: '0' }, null, true);
		expect(kirim).not.toHaveBeenCalled();
	});
});

describe('sandikanAksi', () => {
	const ClientMsg = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root.lookupType('ro.v1.ClientMsg');
	const balik = (buf) => ClientMsg.toObject(ClientMsg.decode(new Uint8Array(buf)));

	it('memetakan aksi UI ke perintah catur', () => {
		expect(balik(sandikanAksi(ClientMsg, 'beli', { slot: 2 }))).toEqual({ caturBeli: { slot: 2 } });
		expect(balik(sandikanAksi(ClientMsg, 'jual', { bidakId: 7 }))).toEqual({ caturJual: { bidakId: 7 } });
		expect(balik(sandikanAksi(ClientMsg, 'taruh', { bidakId: 1, kolom: 3, baris: 2 })))
			.toEqual({ caturTaruh: { bidakId: 1, kolom: 3, baris: 2 } });
		expect(balik(sandikanAksi(ClientMsg, 'ke-bangku', { bidakId: 8 }))).toEqual({ caturKeBangku: { bidakId: 8 } });
		expect(balik(sandikanAksi(ClientMsg, 'kunci', { kunci: true }))).toEqual({ caturKunci: { kunci: true } });
		expect(balik(sandikanAksi(ClientMsg, 'refresh', {}))).toEqual({ caturRefresh: {} });
		expect(balik(sandikanAksi(ClientMsg, 'beli-exp', {}))).toEqual({ caturBeliExp: {} });
		expect(balik(sandikanAksi(ClientMsg, 'lewati', {}))).toEqual({ caturLewati: {} });
		expect(balik(sandikanAksi(ClientMsg, 'keluar', {}))).toEqual({ caturKeluar: {} });
	});

	it('aksi tak dikenal melempar', () => {
		expect(() => sandikanAksi(ClientMsg, 'terbang', {})).toThrow(/terbang/);
	});
});
