import { describe, it, expect, vi } from 'vitest';
import SC from 'DB/Status/StatusConst.js';
import StatusInfo from 'DB/Status/StatusInfo.js';
import { EFEK_STATUS } from './pesan.js';
import { efstKeStatus, pathIkon, buatPemuatIkon, STATUS_DARI_EFST } from './statusIkon.js';

describe('efstKeStatus', () => {
	it('memetakan keenam status autochess ke indeks status roBrowser', () => {
		expect(efstKeStatus(EFEK_STATUS.BEKU)).toBe(SC.BODYSTATE_FREEZING);
		expect(efstKeStatus(EFEK_STATUS.PINGSAN)).toBe(SC.BODYSTATE_STUN);
		expect(efstKeStatus(EFEK_STATUS.TIDUR)).toBe(SC.BODYSTATE_SLEEP);
		expect(efstKeStatus(EFEK_STATUS.RACUN)).toBe(SC.HEALTHSTATE_POISON);
		expect(efstKeStatus(EFEK_STATUS.BUTA)).toBe(SC.HEALTHSTATE_BLIND);
		expect(efstKeStatus(EFEK_STATUS.BISU)).toBe(SC.HEALTHSTATE_SILENCE);
		expect(Object.keys(STATUS_DARI_EFST)).toHaveLength(6);
	});

	it('status tak dikenal -> null', () => {
		expect(efstKeStatus(0)).toBeNull();
		expect(efstKeStatus(7)).toBeNull();
		expect(efstKeStatus(undefined)).toBeNull();
		expect(efstKeStatus('toString')).toBeNull();
	});
});

describe('pathIkon', () => {
	it('BEKU -> ikon BODYSTATE_FREEZING di data/texture/effect/', () => {
		expect(pathIkon(EFEK_STATUS.BEKU, StatusInfo)).toEqual(['data/texture/effect/bd_freezing.tga']);
	});

	it('StatusInfo roBrowser tidak punya ikon keenam status ini (alasan IKON_RESMI)', () => {
		for (const indeks of Object.values(STATUS_DARI_EFST)) {
			expect(StatusInfo[indeks]?.icon).toBeUndefined();
		}
	});

	it('ikon StatusTable didahulukan bila kelak ada, lalu cadangan resmi', () => {
		const tabel = { [SC.HEALTHSTATE_BLIND]: { icon: 'buta.tga' } };
		expect(pathIkon(EFEK_STATUS.BUTA, tabel)).toEqual([
			'data/texture/effect/buta.tga',
			'data/texture/effect/hl_blind.tga',
			'data/texture/effect/handicapstate_deepblind.tga'
		]);
	});

	it('status tak dikenal -> tanpa path', () => {
		expect(pathIkon(99, StatusInfo)).toEqual([]);
	});
});

/** Client palsu: berkas yang ada dikembalikan seketika atau ditahan sampai dilepas. */
function buatFakes({ ada = [], tahan = false } = {}) {
	const tertahan = [];
	const Client = {
		loadFile: vi.fn((path, onload, onerror) => {
			const jalan = () => (ada.includes(path) ? onload(`data:${path}`) : onerror?.());
			if (tahan) {
				tertahan.push(jalan);
			} else {
				jalan();
			}
		})
	};
	const Texture = {
		load: vi.fn((data, cb) => {
			const kanvas = { asal: data, toDataURL: () => `url(${data})` };
			cb.call(kanvas, true);
		})
	};
	return { Client, Texture, lepas: () => tertahan.splice(0).forEach((f) => f()) };
}

describe('buatPemuatIkon', () => {
	it('memuat sekali per efst dan menyimpan gambarnya di cache', () => {
		const { Client, Texture } = buatFakes({ ada: ['data/texture/effect/bd_freezing.tga'] });
		const pemuat = buatPemuatIkon({ Client, Texture, StatusTable: StatusInfo });
		const cb1 = vi.fn();
		const g1 = pemuat.ambil(EFEK_STATUS.BEKU, cb1);
		const g2 = pemuat.ambil(EFEK_STATUS.BEKU);
		expect(g1).toBe(g2);
		expect(g1.asal).toBe('data:data/texture/effect/bd_freezing.tga');
		expect(cb1).toHaveBeenCalledWith(g1);
		expect(Client.loadFile).toHaveBeenCalledTimes(1);
		expect(pemuat.url(EFEK_STATUS.BEKU)).toBe('url(data:data/texture/effect/bd_freezing.tga)');
		expect(Client.loadFile).toHaveBeenCalledTimes(1);
	});

	it('pemanggil selama pemuatan ikut menunggu; loadFile tetap sekali', () => {
		const { Client, Texture, lepas } = buatFakes({ ada: ['data/texture/effect/bd_stun.tga'], tahan: true });
		const pemuat = buatPemuatIkon({ Client, Texture, StatusTable: StatusInfo });
		const a = vi.fn();
		const b = vi.fn();
		expect(pemuat.ambil(EFEK_STATUS.PINGSAN, a)).toBeNull();
		expect(pemuat.ambil(EFEK_STATUS.PINGSAN, b)).toBeNull();
		expect(Client.loadFile).toHaveBeenCalledTimes(1);
		lepas();
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		expect(a.mock.calls[0][0].asal).toBe('data:data/texture/effect/bd_stun.tga');
	});

	it('url: padaSiap dipanggil saat ikon menyusul, tidak saat termuat seketika', () => {
		const tunda = buatFakes({ ada: ['data/texture/effect/bd_sleep.tga'], tahan: true });
		const p1 = buatPemuatIkon({ Client: tunda.Client, Texture: tunda.Texture, StatusTable: StatusInfo });
		const padaSiap = vi.fn();
		expect(p1.url(EFEK_STATUS.TIDUR, padaSiap)).toBeNull();
		tunda.lepas();
		expect(padaSiap).toHaveBeenCalledTimes(1);
		expect(p1.url(EFEK_STATUS.TIDUR)).toBe('url(data:data/texture/effect/bd_sleep.tga)');

		const seketika = buatFakes({ ada: ['data/texture/effect/hl_poison.tga'] });
		const p2 = buatPemuatIkon({ Client: seketika.Client, Texture: seketika.Texture, StatusTable: StatusInfo });
		const tidakDipanggil = vi.fn();
		expect(p2.url(EFEK_STATUS.RACUN, tidakDipanggil)).toBe('url(data:data/texture/effect/hl_poison.tga)');
		expect(tidakDipanggil).not.toHaveBeenCalled();
	});

	it('jatuh ke path berikutnya bila berkas tidak ada; semua gagal -> null sekali log', () => {
		const { Client, Texture } = buatFakes({ ada: ['data/texture/effect/handicapstate_deepblind.tga'] });
		const log = vi.fn();
		const pemuat = buatPemuatIkon({ Client, Texture, StatusTable: StatusInfo, log });
		expect(pemuat.ambil(EFEK_STATUS.BUTA).asal).toBe('data:data/texture/effect/handicapstate_deepblind.tga');
		expect(Client.loadFile).toHaveBeenCalledTimes(2);

		const kosong = buatFakes();
		const p2 = buatPemuatIkon({ Client: kosong.Client, Texture: kosong.Texture, StatusTable: StatusInfo, log });
		const cb = vi.fn();
		expect(p2.ambil(EFEK_STATUS.BISU, cb)).toBeNull();
		expect(cb).toHaveBeenCalledWith(null);
		expect(p2.ambil(EFEK_STATUS.BISU)).toBeNull();
		expect(kosong.Client.loadFile).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledTimes(1);
		expect(p2.url(EFEK_STATUS.BISU)).toBeNull();
	});

	it('Texture.load gagal dianggap berkas tidak ada', () => {
		const { Client } = buatFakes({ ada: ['data/texture/effect/hl_silence.tga'] });
		const Texture = { load: vi.fn((data, cb) => cb.call(null, false)) };
		const pemuat = buatPemuatIkon({ Client, Texture, StatusTable: StatusInfo });
		expect(pemuat.ambil(EFEK_STATUS.BISU)).toBeNull();
	});

	it('efst tak dikenal -> null tanpa memuat apa pun', () => {
		const { Client, Texture } = buatFakes();
		const pemuat = buatPemuatIkon({ Client, Texture, StatusTable: StatusInfo });
		const cb = vi.fn();
		expect(pemuat.ambil(42, cb)).toBeNull();
		expect(cb).toHaveBeenCalledWith(null);
		expect(pemuat.url(42)).toBeNull();
		expect(Client.loadFile).not.toHaveBeenCalled();
	});
});
