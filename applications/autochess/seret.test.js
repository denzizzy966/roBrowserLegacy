import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buatSeret, putuskanDrop } from './seret.js';
import { FASE } from './pesan.js';

// Papan {42,41} skala 2: petak (3,2) TIM_A = cell x 48..49, y 45..46.
const ASAL = { x: 42, y: 41 };
const SKALA = 2;

const RECT_BANGKU = { left: 480, right: 1120, top: 790, bottom: 900, width: 640, height: 110 };
const RECT_TOKO = { left: 490, right: 1110, top: 500, bottom: 770, width: 620, height: 270 };
const RECT_TERSEMBUNYI = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };

const BIDAK = [
	{ bidakId: 1, unitId: 'poring', bintang: 1, diPapan: false, kolom: 0, baris: 0 },
	{ bidakId: 2, unitId: 'poring', bintang: 1, diPapan: true, kolom: 5, baris: 1 },
	{ bidakId: 3, unitId: 'archer', bintang: 1, diPapan: true, kolom: 3, baris: 2 }
];

function snapDengan(ekstra = {}) {
	return { state: { saya: { bidak: BIDAK } }, fase: FASE.PERSIAPAN, ronde: 1, selesai: null, ...ekstra };
}

/** Dokumen palsu: cukup untuk kanvas hantu, listener, dan elementFromPoint. */
function buatDokumen() {
	const pendengar = new Map();
	const dok = {
		dipasang: [],
		diBawah: null,
		createElement: vi.fn(() => {
			const el = { width: 0, height: 0, style: {}, dilepas: false };
			el.remove = () => {
				el.dilepas = true;
				dok.dipasang = dok.dipasang.filter((x) => x !== el);
			};
			return el;
		}),
		body: {
			appendChild: (el) => {
				dok.dipasang.push(el);
				return el;
			}
		},
		addEventListener: (nama, fn) => {
			pendengar.set(nama, [...(pendengar.get(nama) ?? []), fn]);
		},
		removeEventListener: (nama, fn) => {
			pendengar.set(nama, (pendengar.get(nama) ?? []).filter((f) => f !== fn));
		},
		elementFromPoint: () => dok.diBawah,
		picu(nama, ev) {
			for (const fn of [...(pendengar.get(nama) ?? [])]) {
				fn(ev);
			}
		},
		jumlahPendengar: () => [...pendengar.values()].reduce((n, l) => n + l.length, 0)
	};
	return dok;
}

function pev(x, y, ekstra = {}) {
	return { clientX: x, clientY: y, pageX: x, pageY: y, button: 0, preventDefault: vi.fn(), ...ekstra };
}

let dok, Mouse, Renderer, Cursor, kirim, potret, sorot, log, snap, rectToko, seret;

beforeEach(() => {
	dok = buatDokumen();
	Mouse = { screen: { x: 0, y: 0 }, world: { x: -1, y: -1, z: 0 }, intersect: false };
	Renderer = { canvas: { nama: 'kanvas-3d' } };
	Cursor = { ACTION: { DEFAULT: 0, PICK: 9 }, setType: vi.fn() };
	kirim = vi.fn(() => true);
	potret = { statis: vi.fn(() => true), hentikan: vi.fn() };
	sorot = { petak: vi.fn(), separuhSendiri: vi.fn() };
	log = vi.fn();
	snap = snapDengan();
	rectToko = RECT_TERSEMBUNYI;
	seret = buatSeret({
		dokumen: dok, Mouse, Renderer, Cursor, asal: ASAL, skala: SKALA,
		ambilSnap: () => snap, kirim, potret,
		katalog: { spriteUnit: () => ({ tipe: 'mob', id: 1002 }) },
		elemenBangku: { getBoundingClientRect: () => RECT_BANGKU },
		elemenToko: () => ({ getBoundingClientRect: () => rectToko }),
		sorot, log
	});
});

/** Pointer di atas kanvas 3D dengan Mouse.world di cell (x, y). */
function diAtasPapan(x, y) {
	dok.diBawah = Renderer.canvas;
	Mouse.world.x = x;
	Mouse.world.y = y;
}

function lepasDi(x, y) {
	dok.picu('pointermove', pev(x, y));
	dok.picu('pointerup', pev(x, y));
}

/** Hantu dilepas, kursor kembali, sorotan padam, listener dicabut. */
function harusBersih() {
	expect(dok.dipasang).toHaveLength(0);
	expect(potret.hentikan).toHaveBeenCalledTimes(1);
	expect(Cursor.setType).toHaveBeenLastCalledWith(Cursor.ACTION.DEFAULT);
	expect(sorot.petak).toHaveBeenLastCalledWith(null);
	expect(dok.jumlahPendengar()).toBe(0);
	expect(seret.aktif()).toBe(false);
}

describe('seret dari bangku', () => {
	it('memasang hantu 72x84 (potret.statis), kursor PICK, dan aktif', () => {
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(true);
		expect(seret.aktif()).toBe(true);
		expect(dok.dipasang).toHaveLength(1);
		const hantu = dok.dipasang[0];
		expect([hantu.width, hantu.height]).toEqual([72, 84]);
		expect(hantu.style.position).toBe('fixed');
		expect(hantu.style.pointerEvents).toBe('none');
		expect(potret.statis).toHaveBeenCalledWith({ tipe: 'mob', id: 1002 }, hantu, expect.any(Object));
		expect(Cursor.setType).toHaveBeenCalledWith(Cursor.ACTION.PICK);
	});

	it('jalur bahagia: lepas di petak (3,2) kosong -> taruh {bidakId, kolom, baris}', () => {
		snap = snapDengan({ state: { saya: { bidak: BIDAK.filter((b) => b.bidakId !== 3) } } });
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(48.4, 45.7);
		lepasDi(760, 550);
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
		harusBersih();
	});

	it('Mouse.screen diisi dari pointer dan Mouse.intersect hanya true di atas kanvas', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.diBawah = { nama: 'jendela' };
		dok.picu('pointermove', pev(700, 820));
		expect(Mouse.screen).toEqual({ x: 700, y: 820 });
		expect(Mouse.intersect).toBe(false);
		dok.diBawah = Renderer.canvas;
		dok.picu('pointermove', pev(710, 500));
		expect(Mouse.screen).toEqual({ x: 710, y: 500 });
		expect(Mouse.intersect).toBe(true);
		const hantu = dok.dipasang[0];
		expect(hantu.style.left).toMatch(/px$/);
	});

	it('kursor PICK ditegaskan lagi bila pemasang lain mengembalikannya ke DEFAULT', () => {
		let jenis = 0;
		Cursor.getActualType = () => jenis;
		Cursor.setType = vi.fn((t) => { jenis = t; });
		seret.mulaiDariBangku(1, pev(600, 840));
		jenis = Cursor.ACTION.DEFAULT; // mis. mouseout dari slot .draggable
		dok.picu('pointermove', pev(650, 700));
		expect(jenis).toBe(Cursor.ACTION.PICK);
		const n = Cursor.setType.mock.calls.length;
		dok.picu('pointermove', pev(660, 690));
		expect(Cursor.setType.mock.calls.length).toBe(n);
	});

	it('sorotan mengikuti petak separuh sendiri di bawah pointer, padam di luar', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(44.2, 41.5);
		dok.picu('pointermove', pev(500, 600));
		expect(sorot.petak).toHaveBeenLastCalledWith(1, 0);
		diAtasPapan(44.2, 52.5); // baris 5: separuh lawan
		dok.picu('pointermove', pev(500, 300));
		expect(sorot.petak).toHaveBeenLastCalledWith(null);
	});

	it('Review Focus 2: lepas di baris 5 (separuh lawan) -> tidak mengirim', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(48.5, 52.5);
		lepasDi(760, 300);
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('Review Focus 2: lepas di petak terisi bidak sendiri -> tidak mengirim', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(48.5, 45.5); // (3,2) ditempati bidak 3
		lepasDi(760, 550);
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('Review Focus 2: fase TEMPUR -> tidak mengirim apa pun (papan maupun toko)', () => {
		snap = snapDengan({ fase: FASE.TEMPUR });
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(44.5, 41.5);
		lepasDi(500, 600);
		rectToko = RECT_TOKO;
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.diBawah = { nama: 'toko' };
		lepasDi(800, 600);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('Review Focus 2: satu baris log paling banyak per seret yang batal', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		diAtasPapan(48.5, 52.5);
		dok.picu('pointermove', pev(760, 300));
		dok.picu('pointermove', pev(761, 301));
		dok.picu('pointerup', pev(761, 301));
		expect(log).toHaveBeenCalledTimes(1);
	});

	it('Review Focus 5: Mouse.world.x === -1 -> batal', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.diBawah = Renderer.canvas;
		Mouse.world.x = -1;
		Mouse.world.y = -1;
		lepasDi(760, 550);
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('Review Focus 5: pointer di atas jendela (bukan kanvas) -> batal walau Mouse.world basi', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		Mouse.world.x = 44.5;
		Mouse.world.y = 41.5;
		dok.diBawah = { nama: 'DaftarPemain' };
		lepasDi(100, 300);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('lepas di dalam Toko yang terbuka -> jual', () => {
		rectToko = RECT_TOKO;
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.diBawah = { nama: 'toko' };
		lepasDi(800, 600);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		harusBersih();
	});

	it('Toko tersembunyi (rect 0) bukan sasaran jual', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.diBawah = { nama: 'toko' };
		lepasDi(800, 600);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('bidak bangku dilepas kembali di bangku -> diam, tanpa kirim dan tanpa log', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		lepasDi(700, 850);
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
		harusBersih();
	});

	it('pointercancel membatalkan dan membersihkan', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointercancel', pev(600, 840));
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('bidak yang tidak ada di bangku, tombol kanan, atau seret ganda ditolak', () => {
		expect(seret.mulaiDariBangku(99, pev(600, 840))).toBe(false);
		expect(seret.mulaiDariBangku(2, pev(600, 840))).toBe(false); // bidak papan
		expect(seret.mulaiDariBangku(1, pev(600, 840, { button: 2 }))).toBe(false);
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(true);
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(false);
		expect(dok.dipasang).toHaveLength(1);
	});
});

describe('seret dari papan', () => {
	it('memilih bidak sendiri di petak bawah pointer dan memindahkannya ke petak kosong', () => {
		diAtasPapan(48.5, 45.5); // (3,2): bidak 3
		expect(seret.mulaiDariPapan(pev(760, 550))).toBe(true);
		diAtasPapan(42.5, 41.5); // (0,0) kosong
		lepasDi(450, 650);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 3, kolom: 0, baris: 0 });
		harusBersih();
	});

	it('lepas di bangku -> ke-bangku', () => {
		diAtasPapan(52.5, 43.5); // (5,1): bidak 2
		seret.mulaiDariPapan(pev(860, 600));
		dok.diBawah = { nama: 'Bangku' };
		lepasDi(700, 850);
		expect(kirim).toHaveBeenCalledWith('ke-bangku', { bidakId: 2 });
		harusBersih();
	});

	it('lepas di Toko -> jual bidak papan', () => {
		rectToko = RECT_TOKO;
		diAtasPapan(52.5, 43.5);
		seret.mulaiDariPapan(pev(860, 600));
		lepasDi(800, 600);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 2 });
	});

	it('dilepas di petaknya sendiri -> diam', () => {
		diAtasPapan(48.5, 45.5);
		seret.mulaiDariPapan(pev(760, 550));
		lepasDi(760, 550);
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	});

	it('hanya di PERSIAPAN, hanya petak berisi bidak sendiri, hanya bila Mouse.world sah', () => {
		diAtasPapan(48.5, 45.5);
		snap = snapDengan({ fase: FASE.TEMPUR });
		expect(seret.mulaiDariPapan(pev(760, 550))).toBe(false);
		snap = snapDengan();
		diAtasPapan(44.5, 41.5); // (1,0) kosong
		expect(seret.mulaiDariPapan(pev(500, 650))).toBe(false);
		Mouse.world.x = -1;
		expect(seret.mulaiDariPapan(pev(500, 650))).toBe(false);
		expect(dok.dipasang).toHaveLength(0);
		expect(Cursor.setType).not.toHaveBeenCalled();
	});
});

describe('putuskanDrop', () => {
	const dasar = {
		bidak: BIDAK[0], titik: { x: 760, y: 550 }, rectBangku: RECT_BANGKU, rectToko: RECT_TERSEMBUNYI,
		diKanvas: true, world: { x: 44.5, y: 41.5 }, asal: ASAL, skala: SKALA
	};

	it('selesai (pertandingan usai) -> batal', () => {
		expect(putuskanDrop({ ...dasar, snap: snapDengan({ selesai: { peringkatSaya: 1 } }) }).aksi).toBeUndefined();
	});

	it('baris 3 masih sah, baris 4 sudah separuh lawan', () => {
		expect(putuskanDrop({ ...dasar, snap: snapDengan(), world: { x: 44.5, y: 47.5 } }))
			.toEqual({ aksi: 'taruh', arg: { bidakId: 1, kolom: 1, baris: 3 } });
		expect(putuskanDrop({ ...dasar, snap: snapDengan(), world: { x: 44.5, y: 49.5 } }).aksi).toBeUndefined();
	});

	it('di luar papan 8x8 -> batal dengan alasan', () => {
		const h = putuskanDrop({ ...dasar, snap: snapDengan(), world: { x: 30, y: 41.5 } });
		expect(h.aksi).toBeUndefined();
		expect(h.alasan).toBeTruthy();
	});
});
