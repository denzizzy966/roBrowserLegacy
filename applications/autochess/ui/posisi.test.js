import { describe, it, expect, vi } from 'vitest';
import { gabungPosisi, buatPemantauPosisi, JENDELA_DAPAT_DIGESER } from './posisi.js';
import { hitungTataLetak, aturTataLetak } from './tataLetak.js';

describe('gabungPosisi', () => {
	const letak = hitungTataLetak(1600, 900);

	it('posisi tersimpan yang masih di layar menang atas tata letak; kotak ikut pindah', () => {
		const h = gabungPosisi(letak, { DPS: { left: 300, top: 200 } }, 1600, 900);
		expect(h.DPS).toEqual({ top: 200, left: 300, kotak: { ...letak.DPS.kotak, x: 300, y: 200 } });
	});

	it('jendela anchor-bawah (InfoPemain) menjadi top/left tanpa bottom', () => {
		const h = gabungPosisi(letak, { InfoPemain: { left: 400, top: 300 } }, 1600, 900);
		expect(h.InfoPemain.top).toBe(300);
		expect(h.InfoPemain.left).toBe(400);
		expect('bottom' in h.InfoPemain).toBe(false);
	});

	it('tersimpan di luar layar (viewport mengecil) kembali ke tata letak', () => {
		// DPS disimpan di 1600x900 pada x=1300; di 1280x720 kotaknya 1300+220 > 1280.
		const kecil = hitungTataLetak(1280, 720);
		const h = gabungPosisi(kecil, { DPS: { left: 1300, top: 200 } }, 1280, 720);
		expect(h.DPS).toBe(kecil.DPS);
		const bawah = gabungPosisi(kecil, { Lore: { left: 100, top: 700 } }, 1280, 720);
		expect(bawah.Lore).toBe(kecil.Lore);
	});

	it('kotak harus muat seluruhnya: tepi tepat pas diterima, lewat 1 px ditolak', () => {
		const pas = gabungPosisi(letak, { DPS: { left: 1600 - 220, top: 900 - 180 } }, 1600, 900);
		expect(pas.DPS.left).toBe(1380);
		const lewat = gabungPosisi(letak, { DPS: { left: 1600 - 220 + 1, top: 10 } }, 1600, 900);
		expect(lewat.DPS).toBe(letak.DPS);
		expect(gabungPosisi(letak, { DPS: { left: -1, top: 10 } }, 1600, 900).DPS).toBe(letak.DPS);
	});

	it('InfoPemain memakai tinggi TERBUKA untuk muat di layar', () => {
		// terlipat 18 px muat di y=800, tetapi terbuka (166 px) tidak.
		const h = gabungPosisi(letak, { InfoPemain: { left: 10, top: 800 } }, 1600, 900);
		expect(h.InfoPemain).toBe(letak.InfoPemain);
	});

	it('jendela yang tidak pernah digeser tidak tersentuh; data rusak diabaikan', () => {
		const h = gabungPosisi(letak, { DPS: { left: 300, top: 200 }, Hantu: { left: 1, top: 1 }, Lore: { left: 'x', top: 5 }, Log: null }, 1600, 900);
		for (const n of Object.keys(letak)) {
			if (n !== 'DPS') {
				expect(h[n]).toBe(letak[n]);
			}
		}
		expect(h.Hantu).toBeUndefined();
		expect(gabungPosisi(letak, undefined, 1600, 900)).toEqual(letak);
	});

	it('tidak mengubah masukan', () => {
		const salinan = JSON.stringify(letak);
		gabungPosisi(letak, { DPS: { left: 300, top: 200 } }, 1600, 900);
		expect(JSON.stringify(letak)).toBe(salinan);
	});
});

describe('aturTataLetak dengan posisi tersimpan', () => {
	function hostPalsu() {
		return { style: {} };
	}
	function jendelaPalsu() {
		return Object.fromEntries(Object.keys(hitungTataLetak(1600, 900)).map((n) => [n, { _host: hostPalsu() }]));
	}

	it('menerapkan posisi tersimpan ke host dan sisanya dari hitungan; resize ke layar lebih kecil mengembalikan', () => {
		const j = jendelaPalsu();
		aturTataLetak(j, { width: 1600, height: 900 }, { DPS: { left: 300, top: 200 } });
		expect(j.DPS._host.style).toMatchObject({ left: '300px', top: '200px', right: 'auto', bottom: 'auto' });
		expect(j.Timer._host.style).toMatchObject({ left: '8px', top: '8px' });

		// Layar mengecil sehingga posisi tersimpan tidak muat -> tata letak hitungan.
		aturTataLetak(j, { width: 1280, height: 720 }, { DPS: { left: 1300, top: 200 } });
		expect(j.DPS._host.style.left).toBe(`${hitungTataLetak(1280, 720).DPS.left}px`);

		// Layar yang masih memuatnya: tetap di tempat yang digeser.
		aturTataLetak(j, { width: 1280, height: 720 }, { DPS: { left: 300, top: 200 } });
		expect(j.DPS._host.style).toMatchObject({ left: '300px', top: '200px' });
	});

	it('tanpa posisi tersimpan identik dengan tata letak hitungan', () => {
		const j = jendelaPalsu();
		const letak = aturTataLetak(j, { width: 1600, height: 900 });
		expect(letak).toEqual(hitungTataLetak(1600, 900));
	});
});

describe('buatPemantauPosisi', () => {
	/** Dokumen palsu yang merekam pendengar. */
	function dokumenPalsu() {
		const p = {};
		return {
			addEventListener: (e, fn) => ((p[e] ??= []).push(fn)),
			kirim: (e) => (p[e] ?? []).forEach((fn) => fn({ type: e }))
		};
	}
	function siapkan() {
		const jendela = {};
		for (const n of [...JENDELA_DAPAT_DIGESER, 'Timer']) {
			jendela[n] = { _host: { style: { left: '', top: '' }, offsetLeft: 0, offsetTop: 0 } };
		}
		const pref = { save: vi.fn() };
		const dokumen = dokumenPalsu();
		const pantau = buatPemantauPosisi({ jendela, pref, dokumen });
		// tata letak diterapkan, lalu garis dasar dicatat
		for (const n of JENDELA_DAPAT_DIGESER) {
			Object.assign(jendela[n]._host.style, { left: '10px', top: 'auto' });
		}
		pantau.catat();
		return { jendela, pref, dokumen, pantau };
	}
	const geser = (host, left, top) => {
		host.style.left = `${left}px`;
		host.style.top = `${top}px`;
		host.offsetLeft = left;
		host.offsetTop = top;
	};

	it('tanpa perubahan tidak menyimpan apa pun', () => {
		const { pantau, pref } = siapkan();
		expect(pantau.pantau()).toBe(false);
		expect(pref.save).not.toHaveBeenCalled();
	});

	it('geseran yang sudah dilepas disimpan per nama dan save() dipanggil sekali', () => {
		const { jendela, pref, pantau } = siapkan();
		geser(jendela.DPS._host, 321, 123);
		expect(pantau.pantau()).toBe(true);
		expect(pref.DPS).toEqual({ left: 321, top: 123 });
		expect(pref.save).toHaveBeenCalledTimes(1);
		// Denyut berikutnya tanpa geseran baru: tidak menyimpan ulang.
		expect(pantau.pantau()).toBe(false);
		expect(pref.save).toHaveBeenCalledTimes(1);
	});

	it('selama tombol pointer ditekan (geseran berjalan) tidak menyimpan; sesudah dilepas menyimpan', () => {
		const { jendela, pref, dokumen, pantau } = siapkan();
		dokumen.kirim('mousedown');
		geser(jendela.Lore._host, 50, 60);
		expect(pantau.pantau()).toBe(false);
		expect(pref.Lore).toBeUndefined();
		dokumen.kirim('mouseup');
		expect(pantau.pantau()).toBe(true);
		expect(pref.Lore).toEqual({ left: 50, top: 60 });
	});

	it('jendela bukan-seret (Timer, KartuBidak) tidak pernah disimpan', () => {
		const { jendela, pref, pantau } = siapkan();
		geser(jendela.Timer._host, 5, 5);
		expect(pantau.pantau()).toBe(false);
		expect(pref.Timer).toBeUndefined();
	});

	it('menata ulang (catat) memperbarui garis dasar: tata letak baru bukan geseran', () => {
		const { jendela, pref, pantau } = siapkan();
		Object.assign(jendela.DPS._host.style, { left: '999px', top: '1px' }); // tata letak baru
		pantau.catat();
		expect(pantau.pantau()).toBe(false);
		expect(pref.DPS).toBeUndefined();
	});
});
