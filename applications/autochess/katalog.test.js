import { describe, it, expect, vi } from 'vitest';

import { muatKatalog, buatKatalog } from './katalog.js';

const CONTOH = {
	units: {
		novice: {
			nama: { id: 'Novis', en: 'Novice' }, tier: 1, harga: 1, origin: 'prontera', kelas: 'vanguard',
			sprite: { tipe: 'pc', job: 0, sex: 1, senjata: 0, id: 0 }
		},
		poring: {
			nama: { id: 'Poring', en: 'Poring' }, tier: 1, harga: 1, origin: 'payon', kelas: 'wonder',
			sprite: { tipe: 'mob', job: 0, sex: 0, senjata: 0, id: 1002 }
		}
	},
	sinergi: { prontera: { origin: true, nama: { id: 'Kerajaan Prontera', en: 'Prontera Kingdom' }, ambang: [2, 4, 6] } },
	lore: { origin: { prontera: { nama: { id: 'Kerajaan Prontera', en: 'Prontera Kingdom' }, lore: { id: 'ibu kota', en: 'capital' }, icon: 'x', color: '#4dabf7' } }, kelas: { vanguard: { nama: { id: 'Garda', en: 'Vanguard' }, deskripsi: { id: 'garda depan', en: 'front line' } } } },
	peluang: { 1: [100, 0, 0, 0, 0], 2: [80, 20, 0, 0, 0] },
	ekonomi: { refresh: 2, beli_exp: { harga: 4, exp: 4 }, bangku: 8 }
};

describe('statBintang, skillUnit, unitSinergi', () => {
	const stat = (hp) => ({ hp, atk: 10, matk: 0, def: 1, mdef: 1, aspd: 1, jangkauan: 1, sp_awal: 0, sp_maks: 100, elemen: 'netral', ukuran: 'medium', ras: 'human' });
	const json = {
		units: { novice: { nama: { id: 'Novis', en: 'Novice' }, stat_bintang: [stat(100), stat(180), stat(320)], skill: { id: 'AL_HEAL', lv: 1, nama: { id: 'Heal', en: 'Heal' }, ringkasan: { id: '', en: '' } } } },
		sinergi: { prontera: { units: ['novice'] } }
	};
	it('statBintang mengembalikan stat per bintang, null di luar 1..3 atau id asing', () => {
		const k = buatKatalog(json);
		expect(k.statBintang('novice', 1).hp).toBe(100);
		expect(k.statBintang('novice', 3).hp).toBe(320);
		expect(k.statBintang('novice', 0)).toBeNull();
		expect(k.statBintang('novice', 4)).toBeNull();
		expect(k.statBintang('novice', 1.5)).toBeNull();
		expect(k.statBintang('x', 1)).toBeNull();
	});
	it('skillUnit dan unitSinergi', () => {
		const k = buatKatalog(json);
		expect(k.skillUnit('novice').id).toBe('AL_HEAL');
		expect(k.skillUnit('x')).toBeNull();
		expect(k.unitSinergi('prontera')).toEqual(['novice']);
		expect(k.unitSinergi('x')).toEqual([]);
		expect(buatKatalog({}).unitSinergi('prontera')).toEqual([]);
	});
});

describe('buatKatalog', () => {
	it('idUnitDariNama mencari unit dari nama EN (nama EvtSpawn); nama ID tidak diindeks', () => {
		const log = vi.fn();
		const k = buatKatalog(CONTOH, log);
		expect(k.idUnitDariNama('Novice')).toBe('novice');
		expect(k.idUnitDariNama('Novis')).toBeNull();
		expect(k.idUnitDariNama('Dracula')).toBeNull();
		expect(k.idUnitDariNama('')).toBeNull();
		expect(buatKatalog({}).idUnitDariNama('Novice')).toBeNull();
		expect(log).not.toHaveBeenCalled();
	});

	it('nama EN ganda: id pertama menang, dicatat satu kali saja', () => {
		const log = vi.fn();
		const k = buatKatalog({ units: {
			a: { nama: { id: 'A1', en: 'Sama' } }, b: { nama: { id: 'B1', en: 'Sama' } }, c: { nama: { id: 'Sama', en: 'C' } }
		} }, log);
		expect(k.idUnitDariNama('Sama')).toBe('a');
		expect(k.idUnitDariNama('C')).toBe('c');
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toContain('Sama');
	});

	it('unit, namaUnit, spriteUnit untuk id yang dikenal', () => {
		const k = buatKatalog(CONTOH);
		expect(k.unit('novice').tier).toBe(1);
		expect(k.namaUnit('novice', 'en')).toBe('Novice');
		expect(k.namaUnit('novice', 'id')).toBe('Novis');
		expect(k.spriteUnit('poring')).toEqual({ tipe: 'mob', job: 0, sex: 0, senjata: 0, id: 1002 });
	});

	it('sinergi, namaSinergi, loreOrigin', () => {
		const k = buatKatalog(CONTOH);
		expect(k.sinergi('prontera').ambang).toEqual([2, 4, 6]);
		expect(k.namaSinergi('prontera', 'en')).toBe('Prontera Kingdom');
		expect(k.loreOrigin('prontera').color).toBe('#4dabf7');
		expect(k.loreOrigin('payon')).toBeNull();
	});

	it('peluang(level) memberi 5 angka atau null; ekonomi apa adanya', () => {
		const k = buatKatalog(CONTOH);
		expect(k.peluang(2)).toEqual([80, 20, 0, 0, 0]);
		expect(k.peluang(9)).toBeNull();
		expect(k.ekonomi.beli_exp.harga).toBe(4);
	});

	it('id tak dikenal: cadangan nama = id, sprite null, log sekali per id', () => {
		const log = vi.fn();
		const k = buatKatalog(CONTOH, log);
		expect(k.unit('hantu')).toEqual({ nama: { id: 'hantu', en: 'hantu' } });
		expect(k.namaUnit('hantu', 'en')).toBe('hantu');
		expect(k.spriteUnit('hantu')).toBeNull();
		expect(log).toHaveBeenCalledTimes(1);
		k.namaSinergi('siluman', 'id');
		k.sinergi('siluman');
		expect(log).toHaveBeenCalledTimes(2);
	});

	it('bahasa tak dikenal jatuh ke id; JSON kosong tidak melempar', () => {
		const k = buatKatalog({});
		expect(k.namaUnit('a', 'fr')).toBe('a');
		expect(k.peluang(1)).toBeNull();
		expect(k.ekonomi).toEqual({});
		expect(buatKatalog(CONTOH).namaUnit('novice', 'fr')).toBe('Novis');
	});
});

describe('muatKatalog', () => {
	it('mengembalikan JSON bila 2xx', async () => {
		const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => CONTOH });
		expect(await muatKatalog(f, 'http://x/k.json')).toBe(CONTOH);
		expect(f).toHaveBeenCalledWith('http://x/k.json');
	});

	it('melempar galat berbahasa Indonesia bila bukan 2xx', async () => {
		const f = async () => ({ ok: false, status: 500, json: async () => ({}) });
		await expect(muatKatalog(f, 'http://x/k.json')).rejects.toThrow(/katalog.*500/);
	});
});

describe('loreKelas', () => {
	it('mengembalikan entri kelas atau null', () => {
		const k = buatKatalog(CONTOH);
		expect(k.loreKelas('vanguard').deskripsi.en).toBe('front line');
		expect(k.loreKelas('x')).toBeNull();
		expect(buatKatalog({}).loreKelas('vanguard')).toBeNull();
	});
});

describe('loreUnit dan skill terstruktur (AC7 K17/K18)', () => {
	const skill = {
		id: 'KN_BOWLINGBASH', lv: 5, nama: { id: 'B', en: 'B' }, ringkasan: { id: 'r', en: 'r' }, jenis: 'fisik', target: 'area_musuh',
		rasio: 2.8, status: { nama: 'pingsan', peluang: 30, durasi_ms: 2000 }, jangkauan: 1, splash: 2, cast_ms: 0, sp_maks: 80
	};
	const json = { units: { knight: { nama: { id: 'Ksatria', en: 'Knight' }, skill, lore: { id: '', en: 'A knight.' } }, polos: { nama: { id: 'P', en: 'P' } } } };

	it('loreUnit mengembalikan {id, en} atau null', () => {
		const k = buatKatalog(json);
		expect(k.loreUnit('knight')).toEqual({ id: '', en: 'A knight.' });
		expect(k.loreUnit('polos')).toBeNull();
		expect(k.loreUnit('x')).toBeNull();
		expect(buatKatalog({}).loreUnit('knight')).toBeNull();
	});

	it('skillUnit mengembalikan field baru apa adanya', () => {
		expect(buatKatalog(json).skillUnit('knight')).toEqual(skill);
	});
});
