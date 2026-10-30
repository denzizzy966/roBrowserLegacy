import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buatSeret, putuskanDrop, petakDiBawahPointer, AMBANG_SERET_PX, JEDA_TAHAN_MS } from './seret.js';
import { FASE } from './pesan.js';

// Papan {42,41} skala 2: petak (3,2) TIM_A = cell x 48..49, y 45..46.
const ASAL = { x: 42, y: 41 };
const SKALA = 2;

const RECT_BANGKU = { left: 480, right: 1120, top: 790, bottom: 900, width: 640, height: 110 };
// AC7 K1: jendela Toko = kolom kanan 170x453 (tataLetak), sasaran jual
// selama seret/bawa. Tidak menutupi papan.
const RECT_TOKO = { left: 1422, right: 1592, top: 380, bottom: 833, width: 170, height: 453 };
const RECT_TERSEMBUNYI = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
// Titik di dalam RECT_TOKO.
const DI_TOKO = { x: 1500, y: 600 };

const BIDAK = [
	{ bidakId: 1, unitId: 'poring', bintang: 1, diPapan: false, kolom: 0, baris: 0, hargaJual: 1 },
	{ bidakId: 2, unitId: 'poring', bintang: 1, diPapan: true, kolom: 5, baris: 1, hargaJual: 1, entityId: 41 },
	{ bidakId: 3, unitId: 'archer', bintang: 1, diPapan: true, kolom: 3, baris: 2, hargaJual: 2, entityId: 42 }
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
		// Toko yang tampil menutupi apa pun di bawahnya (lihat tokoPalsu).
		elementFromPoint: (x, y) => (dok.tokoDi?.(x, y) ? dok.tokoDi.el : dok.diBawah),
		// Urutan pendaftaran = urutan panggil; stopPropagation/
		// stopImmediatePropagation (pev) menghentikan pendengar berikutnya,
		// cukup untuk meniru capture di dokumen sebelum tombol sasaran.
		picu(nama, ev) {
			for (const fn of [...(pendengar.get(nama) ?? [])]) {
				if (ev?.berhenti) {
					break;
				}
				fn(ev);
			}
		},
		jumlahPendengar: () => [...pendengar.values()].reduce((n, l) => n + l.length, 0)
	};
	return dok;
}

function pev(x, y, ekstra = {}) {
	const ev = {
		clientX: x, clientY: y, pageX: x, pageY: y, button: 0, berhenti: false,
		preventDefault: vi.fn(() => {
			ev.defaultPrevented = true;
		}),
		stopPropagation: vi.fn(() => {
			ev.berhenti = true;
		}),
		stopImmediatePropagation: vi.fn(() => {
			ev.berhenti = true;
		}),
		...ekstra
	};
	return ev;
}

let dok, jen, Mouse, Renderer, Cursor, kirim, potret, sorot, log, snap, ambilSnap, seret;
let toko, zonaJual, rectToko, beku, infoDiBawah, cariBidak, pewaktu, tunda, batalTunda;

/**
 * Jendela Toko palsu (kolom kanan RECT_TOKO) dengan modeJual seperti
 * Toko.js: dibuka sementara bila tertutup, ditutup lagi sesudahnya.
 */
function tokoPalsu(dokumen) {
	let buka = false;
	let jual = null;
	let tadi = false;
	const t = {
		el: { nama: 'toko' },
		terbuka: () => buka,
		buka: vi.fn(() => {
			buka = true;
		}),
		tutup: vi.fn(() => {
			buka = false;
		}),
		modeJual(bidak) {
			if (bidak) {
				if (!jual) {
					tadi = buka;
					buka = true;
				}
				jual = bidak;
			} else if (jual) {
				jual = null;
				buka = tadi;
			}
		},
		zonaJualAktif: () => jual !== null
	};
	dokumen.tokoDi = (x, y) => buka && x >= RECT_TOKO.left && x <= RECT_TOKO.right && y >= RECT_TOKO.top && y <= RECT_TOKO.bottom;
	dokumen.tokoDi.el = t.el;
	return t;
}

/** Pewaktu palsu: tunda mencatat, jalankanPewaktu memicu yang masih hidup. */
function jalankanPewaktu() {
	const siap = [...pewaktu.values()];
	pewaktu.clear();
	for (const p of siap) {
		p.fn();
	}
}

beforeEach(() => {
	dok = buatDokumen();
	jen = buatDokumen(); // cukup sebagai window palsu: listener + picu
	Mouse = { screen: { x: 0, y: 0 }, world: { x: -1, y: -1, z: 0 }, intersect: false };
	Renderer = { canvas: { nama: 'kanvas-3d' } };
	Cursor = { ACTION: { DEFAULT: 0, PICK: 9 }, setType: vi.fn() };
	kirim = vi.fn(() => true);
	potret = { statis: vi.fn(() => true), hentikan: vi.fn() };
	sorot = { petak: vi.fn(), separuhSendiri: vi.fn() };
	log = vi.fn();
	snap = snapDengan();
	ambilSnap = () => snap;
	toko = tokoPalsu(dok);
	rectToko = RECT_TOKO;
	zonaJual = {
		tampil: vi.fn((b) => toko.modeJual(b)),
		sembunyi: vi.fn(() => toko.modeJual(null)),
		rect: () => (toko.zonaJualAktif() && toko.terbuka() ? rectToko : null)
	};
	beku = false;
	infoDiBawah = null;
	cariBidak = vi.fn(() => infoDiBawah);
	pewaktu = new Map();
	let nomor = 0;
	tunda = vi.fn((fn, ms) => {
		nomor += 1;
		pewaktu.set(nomor, { fn, ms });
		return nomor;
	});
	batalTunda = vi.fn((id) => pewaktu.delete(id));
	seret = buatSeret({
		dokumen: dok, Mouse, Renderer, Cursor, asal: ASAL, skala: SKALA,
		ambilSnap: () => ambilSnap(), kirim, potret,
		katalog: { spriteUnit: () => ({ tipe: 'mob', id: 1002 }), namaUnit: (id) => `nama-${id}` },
		elemenBangku: { getBoundingClientRect: () => RECT_BANGKU },
		zonaJual, cariBidak: (ev) => cariBidak(ev), beku: () => beku,
		sorot, log, jendela: jen, tunda, batalTunda
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

/** pointerdown pada slot bangku lalu gerak melewati ambang: seret dimulai. */
function seretBangku(id, x = 600, y = 840) {
	const ok = seret.mulaiDariBangku(id, pev(x, y));
	dok.picu('pointermove', pev(x + 10, y - 10));
	return ok;
}

/** pointerdown pada kanvas (bidak papan di bawah Mouse.world) lalu lewat ambang. */
function seretPapan(x, y) {
	const ok = seret.mulaiDariPapan(pev(x, y));
	dok.picu('pointermove', pev(x + 10, y));
	return ok;
}

/**
 * Klik kiri lengkap selama bawa: pointerdown (penentu), pointerup, lalu
 * `click` pada tombol UI ber-data-aksi di bawah pointer. Mengembalikan
 * event click-nya.
 */
function klikBawa(x, y) {
	dok.picu('pointerdown', pev(x, y));
	dok.picu('pointerup', pev(x, y));
	const klik = pev(x, y, { target: { dataset: { aksi: 'beli-exp' } } });
	dok.picu('click', klik);
	return klik;
}

/** Hantu dilepas, kursor kembali, sorotan padam, listener dicabut. */
function harusBersih() {
	expect(dok.dipasang).toHaveLength(0);
	expect(potret.hentikan).toHaveBeenCalledTimes(1);
	expect(Cursor.setType).toHaveBeenLastCalledWith(Cursor.ACTION.DEFAULT);
	expect(sorot.petak).toHaveBeenLastCalledWith(null);
	expect(dok.jumlahPendengar()).toBe(0);
	expect(jen.jumlahPendengar()).toBe(0);
	expect(seret.aktif()).toBe(false);
	expect(seret.modus()).toBeNull();
	expect(toko.zonaJualAktif()).toBe(false);
}

describe('seret dari bangku', () => {
	it('memasang hantu 72x84 (potret.statis), kursor PICK, dan aktif sesudah lewat ambang', () => {
		expect(seretBangku(1)).toBe(true);
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
		seretBangku(1);
		diAtasPapan(48.4, 45.7);
		lepasDi(760, 550);
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
		harusBersih();
	});

	it('Mouse.screen diisi dari pointer dan Mouse.intersect hanya true di atas kanvas', () => {
		seretBangku(1);
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
		seretBangku(1);
		jenis = Cursor.ACTION.DEFAULT; // mis. mouseout dari slot .draggable
		dok.picu('pointermove', pev(650, 700));
		expect(jenis).toBe(Cursor.ACTION.PICK);
		const n = Cursor.setType.mock.calls.length;
		dok.picu('pointermove', pev(660, 690));
		expect(Cursor.setType.mock.calls.length).toBe(n);
	});

	it('sorotan mengikuti petak separuh sendiri di bawah pointer, padam di luar', () => {
		seretBangku(1);
		diAtasPapan(44.2, 41.5);
		dok.picu('pointermove', pev(500, 600));
		expect(sorot.petak).toHaveBeenLastCalledWith(1, 0);
		diAtasPapan(44.2, 52.5); // baris 5: separuh lawan
		dok.picu('pointermove', pev(500, 300));
		expect(sorot.petak).toHaveBeenLastCalledWith(null);
	});

	it('Review Focus 2: lepas di baris 5 (separuh lawan) -> tidak mengirim', () => {
		seretBangku(1);
		diAtasPapan(48.5, 52.5);
		lepasDi(760, 300);
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('AC7 K8: lepas di petak terisi bidak sendiri -> taruh (tukar di server)', () => {
		seretBangku(1);
		diAtasPapan(48.5, 45.5); // (3,2) ditempati bidak 3
		lepasDi(760, 550);
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
		harusBersih();
	});

	it('AC7 K3: fase TEMPUR -> papan tidak mengirim, zona jual (Toko) tetap menjual bidak bangku', () => {
		snap = snapDengan({ fase: FASE.TEMPUR });
		seretBangku(1);
		diAtasPapan(44.5, 41.5);
		lepasDi(500, 600);
		expect(kirim).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(expect.stringContaining('hanya bisa saat fase persiapan'));
		seretBangku(1);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
	});

	it('Review Focus 2: satu baris log paling banyak per seret yang batal', () => {
		seretBangku(1);
		diAtasPapan(48.5, 52.5);
		dok.picu('pointermove', pev(760, 300));
		dok.picu('pointermove', pev(761, 301));
		dok.picu('pointerup', pev(761, 301));
		expect(log).toHaveBeenCalledTimes(1);
	});

	it('Review Focus 5: Mouse.world.x === -1 -> batal', () => {
		seretBangku(1);
		dok.diBawah = Renderer.canvas;
		Mouse.world.x = -1;
		Mouse.world.y = -1;
		lepasDi(760, 550);
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('Review Focus 5: pointer di atas jendela (bukan kanvas) -> batal walau Mouse.world basi', () => {
		seretBangku(1);
		Mouse.world.x = 44.5;
		Mouse.world.y = 41.5;
		dok.diBawah = { nama: 'DaftarPemain' };
		lepasDi(100, 300);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('AC7 K1: lepas di rect Toko (zona jual) -> jual', () => {
		seretBangku(1);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		harusBersih();
	});

	it('AC7 K1: rect Toko kosong (zona tidak aktif) bukan sasaran jual', () => {
		rectToko = RECT_TERSEMBUNYI;
		seretBangku(1);
		dok.diBawah = { nama: 'Toko' };
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('bidak bangku dilepas kembali di bangku -> diam, tanpa kirim dan tanpa log', () => {
		seretBangku(1);
		lepasDi(700, 850);
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
		harusBersih();
	});

	it('lemparan saat memutuskan drop tetap membereskan hantu dan listener; seret berikutnya jalan', () => {
		seretBangku(1);
		ambilSnap = () => {
			throw new Error('state rusak');
		};
		diAtasPapan(44.5, 41.5);
		dok.picu('pointermove', pev(500, 650));
		expect(() => dok.picu('pointerup', pev(500, 650))).toThrow('state rusak');
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();

		ambilSnap = () => snap;
		expect(seretBangku(1)).toBe(true);
		lepasDi(500, 650);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 1, baris: 0 });
	});

	it('blur jendela membatalkan seret yang berjalan tanpa kirim dan tanpa log', () => {
		seretBangku(1);
		diAtasPapan(44.5, 41.5);
		dok.picu('pointermove', pev(500, 650));
		Mouse.intersect = true;
		jen.picu('blur', { type: 'blur' });
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
		expect(Mouse.intersect).toBe(true); // blur tanpa koordinat: dibiarkan
		harusBersih();
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(true);
	});

	it('pointercancel membatalkan dan membersihkan', () => {
		seretBangku(1);
		dok.picu('pointercancel', pev(600, 840));
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('bidak yang tidak ada di bangku, tombol kanan, atau seret ganda ditolak', () => {
		expect(seret.mulaiDariBangku(99, pev(600, 840))).toBe(false);
		expect(seret.mulaiDariBangku(2, pev(600, 840))).toBe(false); // bidak papan
		expect(seret.mulaiDariBangku(1, pev(600, 840, { button: 2 }))).toBe(false);
		expect(seretBangku(1)).toBe(true);
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(false);
		expect(dok.dipasang).toHaveLength(1);
	});
});

describe('seret dari papan', () => {
	it('memilih bidak sendiri di petak bawah pointer dan memindahkannya ke petak kosong', () => {
		diAtasPapan(48.5, 45.5); // (3,2): bidak 3
		expect(seretPapan(760, 550)).toBe(true);
		diAtasPapan(42.5, 41.5); // (0,0) kosong
		lepasDi(450, 650);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 3, kolom: 0, baris: 0 });
		harusBersih();
	});

	it('AC7 K8: papan ke petak bidak sendiri lain -> taruh (keduanya bertukar di server)', () => {
		diAtasPapan(48.5, 45.5); // (3,2): bidak 3
		seretPapan(760, 550);
		diAtasPapan(52.5, 43.5); // (5,1): bidak 2
		lepasDi(860, 600);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 3, kolom: 5, baris: 1 });
	});

	it('lepas di bangku -> ke-bangku', () => {
		diAtasPapan(52.5, 43.5); // (5,1): bidak 2
		seretPapan(860, 600);
		dok.diBawah = { nama: 'Bangku' };
		lepasDi(700, 850);
		expect(kirim).toHaveBeenCalledWith('ke-bangku', { bidakId: 2 });
		harusBersih();
	});

	it('lepas di zona jual (Toko) -> jual bidak papan saat PERSIAPAN', () => {
		diAtasPapan(52.5, 43.5);
		seretPapan(860, 600);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 2 });
	});

	it('dilepas di petaknya sendiri -> diam', () => {
		diAtasPapan(48.5, 45.5);
		seretPapan(760, 550);
		lepasDi(760, 550);
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	});

	it('hanya di PERSIAPAN, hanya petak berisi bidak sendiri, hanya bila Mouse.world sah', () => {
		diAtasPapan(48.5, 45.5);
		snap = snapDengan({ fase: FASE.TEMPUR });
		expect(seret.mulaiDariPapan(pev(760, 550))).toBe(false); // cariBidak: tidak ada entity
		snap = snapDengan();
		diAtasPapan(44.5, 41.5); // (1,0) kosong
		expect(seret.mulaiDariPapan(pev(500, 650))).toBe(false);
		Mouse.world.x = -1;
		expect(seret.mulaiDariPapan(pev(500, 650))).toBe(false);
		expect(dok.dipasang).toHaveLength(0);
		expect(Cursor.setType).not.toHaveBeenCalled();
		expect(seret.modus()).toBeNull();
	});
});

describe('putuskanDrop', () => {
	const dasar = {
		bidak: BIDAK[0], bidakKini: BIDAK[0], titik: { x: 760, y: 550 }, rectBangku: RECT_BANGKU, rectJual: RECT_TOKO,
		diKanvas: true, world: { x: 44.5, y: 41.5 }, asal: ASAL, skala: SKALA
	};

	it('selesai (pertandingan usai) -> batal dengan alasan', () => {
		const h = putuskanDrop({ ...dasar, snap: snapDengan({ selesai: { peringkatSaya: 1 } }) });
		expect(h.aksi).toBeUndefined();
		expect(h.alasan).toBe('hanya bisa saat fase persiapan');
		const diToko = putuskanDrop({ ...dasar, titik: DI_TOKO, snap: snapDengan({ selesai: { peringkatSaya: 1 } }) });
		expect(diToko.aksi).toBeUndefined();
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

	it('AC7 K3: bidak bangku dilepas di zona jual saat TEMPUR -> jual', () => {
		expect(putuskanDrop({ ...dasar, titik: DI_TOKO, diKanvas: false, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ aksi: 'jual', arg: { bidakId: 1 } });
		expect(putuskanDrop({ ...dasar, titik: DI_TOKO, diKanvas: false, snap: snapDengan({ fase: FASE.HASIL }) }))
			.toEqual({ aksi: 'jual', arg: { bidakId: 1 } });
	});

	it('AC7 K3: bidak papan dilepas di zona jual saat TEMPUR -> alasan hanya persiapan', () => {
		expect(putuskanDrop({
			...dasar, bidak: BIDAK[1], bidakKini: BIDAK[1], titik: DI_TOKO, diKanvas: false,
			snap: snapDengan({ fase: FASE.TEMPUR })
		})).toEqual({ alasan: 'hanya bisa saat fase persiapan' });
	});

	it('AC7 K3: drop selain zona jual di luar PERSIAPAN -> alasan hanya persiapan', () => {
		expect(putuskanDrop({ ...dasar, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ alasan: 'hanya bisa saat fase persiapan' });
		expect(putuskanDrop({ ...dasar, titik: { x: 700, y: 850 }, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ alasan: 'hanya bisa saat fase persiapan' });
	});

	it('AC7 K8: petak terisi bidak sendiri -> taruh (tukar di server)', () => {
		// (3,2) ditempati bidak 3; dari bangku dan dari papan.
		expect(putuskanDrop({ ...dasar, snap: snapDengan(), world: { x: 48.5, y: 45.5 } }))
			.toEqual({ aksi: 'taruh', arg: { bidakId: 1, kolom: 3, baris: 2 } });
		expect(putuskanDrop({ ...dasar, bidak: BIDAK[1], bidakKini: BIDAK[1], snap: snapDengan(), world: { x: 48.5, y: 45.5 } }))
			.toEqual({ aksi: 'taruh', arg: { bidakId: 2, kolom: 3, baris: 2 } });
	});

	it('AC7 K15: bidakKini null -> alasan bidak sudah tidak ada (juga di zona jual)', () => {
		expect(putuskanDrop({ ...dasar, bidakKini: null, snap: snapDengan() }))
			.toEqual({ alasan: 'bidak sudah tidak ada' });
		expect(putuskanDrop({ ...dasar, bidakKini: null, titik: DI_TOKO, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ alasan: 'bidak sudah tidak ada' });
	});

	it('AC7 K15: bidak bangku yang kini di papan saat TEMPUR -> alasan naik otomatis (juga di zona jual)', () => {
		const naik = { ...BIDAK[0], diPapan: true, kolom: 4, baris: 3 };
		expect(putuskanDrop({ ...dasar, bidakKini: naik, titik: DI_TOKO, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ alasan: 'bidak sudah naik otomatis ke papan' });
		expect(putuskanDrop({ ...dasar, bidakKini: naik, snap: snapDengan({ fase: FASE.TEMPUR }) }))
			.toEqual({ alasan: 'bidak sudah naik otomatis ke papan' });
	});

	it('AC7 K15: bidakKini dipakai untuk kolom/baris saat sama-petak', () => {
		// Bidak 2 diangkat dari (5,1); snapshot terbaru: kini di (1,0).
		const kini = { ...BIDAK[1], kolom: 1, baris: 0 };
		expect(putuskanDrop({ ...dasar, bidak: BIDAK[1], bidakKini: kini, snap: snapDengan(), world: { x: 44.5, y: 41.5 } }))
			.toEqual({ alasan: null });
		expect(putuskanDrop({ ...dasar, bidak: BIDAK[1], bidakKini: kini, snap: snapDengan(), world: { x: 52.5, y: 43.5 } }))
			.toEqual({ aksi: 'taruh', arg: { bidakId: 2, kolom: 5, baris: 1 } });
	});

	it('rect jual null (zona tidak aktif) bukan sasaran', () => {
		const h = putuskanDrop({ ...dasar, rectJual: null, titik: DI_TOKO, diKanvas: false, snap: snapDengan() });
		expect(h).toEqual({ alasan: 'dilepas di luar papan' });
	});
});

describe('pegangan (AC7 K2/K5)', () => {
	it('konstanta: ambang 4 px, jeda tahan 400 ms', () => {
		expect(AMBANG_SERET_PX).toBe(4);
		expect(JEDA_TAHAN_MS).toBe(400);
	});

	it('pointerdown lalu gerak 3 px: belum ada hantu, modus diam', () => {
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(true);
		dok.picu('pointermove', pev(603, 840));
		expect(dok.dipasang).toHaveLength(0);
		expect(seret.modus()).toBe('diam');
		expect(seret.aktif()).toBe(false);
		expect(zonaJual.tampil).not.toHaveBeenCalled();
		expect(Cursor.setType).not.toHaveBeenCalled();
	});

	it('gerak 5 px: hantu 72x84 dipasang, zonaJual.tampil(bidak), kursor PICK, modus seret', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointermove', pev(603, 844)); // jarak 5
		expect(dok.dipasang).toHaveLength(1);
		expect([dok.dipasang[0].width, dok.dipasang[0].height]).toEqual([72, 84]);
		expect(zonaJual.tampil).toHaveBeenCalledWith(BIDAK[0]);
		expect(Cursor.setType).toHaveBeenCalledWith(Cursor.ACTION.PICK);
		expect(seret.modus()).toBe('seret');
		expect(seret.aktif()).toBe(true);
		// Pewaktu tahan dibatalkan saat seret dimulai.
		expect(pewaktu.size).toBe(0);
	});

	it('pointerdown + pointerup tanpa gerak sebelum 400 ms: padaKlik sekali, tanpa kirim, tanpa hantu', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		seret.mulaiDariBangku(1, pev(600, 840));
		expect(tunda).toHaveBeenCalledWith(expect.any(Function), JEDA_TAHAN_MS);
		dok.picu('pointerup', pev(600, 840));
		expect(klik).toHaveBeenCalledTimes(1);
		expect(klik).toHaveBeenCalledWith({
			sumber: 'bangku', bidakId: 1, unitId: 'poring', bintang: 1, sendiri: true, nama: 'nama-poring'
		});
		expect(kirim).not.toHaveBeenCalled();
		expect(dok.dipasang).toHaveLength(0);
		expect(pewaktu.size).toBe(0);
		expect(dok.jumlahPendengar()).toBe(0);
		expect(jen.jumlahPendengar()).toBe(0);
		expect(seret.modus()).toBeNull();
		expect(zonaJual.sembunyi).not.toHaveBeenCalled();
	});

	it('pointerdown diam 400 ms: padaTahan({bidak, titik}), pegangan dilepas, tanpa hantu', () => {
		const klik = vi.fn();
		const tahan = vi.fn();
		seret.padaKlik(klik);
		seret.padaTahan(tahan);
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointermove', pev(602, 841)); // getar kecil di bawah ambang
		jalankanPewaktu();
		expect(tahan).toHaveBeenCalledTimes(1);
		expect(tahan).toHaveBeenCalledWith({ bidak: BIDAK[0], titik: { x: 602, y: 841 } });
		expect(seret.modus()).toBeNull();
		expect(dok.jumlahPendengar()).toBe(0);
		dok.picu('pointerup', pev(602, 841));
		expect(klik).not.toHaveBeenCalled();
		expect(dok.dipasang).toHaveLength(0);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('lanjutkanSeret(bidak, ev): hantu dipasang dan drop berikutnya memutuskan seperti seret biasa', () => {
		seret.padaTahan(() => {});
		seret.mulaiDariBangku(1, pev(600, 840));
		jalankanPewaktu();
		expect(seret.lanjutkanSeret(BIDAK[0], pev(700, 800))).toBe(true);
		expect(seret.modus()).toBe('seret');
		expect(dok.dipasang).toHaveLength(1);
		expect(zonaJual.tampil).toHaveBeenCalledWith(BIDAK[0]);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		harusBersih();
	});

	it('klik bidak sendiri di papan saat PERSIAPAN: padaKlik sumber papan dengan bidakId dan entityId', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		diAtasPapan(48.5, 45.5); // (3,2): bidak 3
		expect(seret.mulaiDariPapan(pev(760, 550))).toBe(true);
		dok.picu('pointerup', pev(760, 550));
		expect(klik).toHaveBeenCalledWith({
			sumber: 'papan', bidakId: 3, unitId: 'archer', bintang: 1, sendiri: true, entityId: 42, nama: 'nama-archer'
		});
	});

	it('tahan bidak sendiri di papan saat PERSIAPAN: padaTahan dengan record bidak', () => {
		const tahan = vi.fn();
		seret.padaTahan(tahan);
		diAtasPapan(48.5, 45.5);
		seret.mulaiDariPapan(pev(760, 550));
		jalankanPewaktu();
		expect(tahan).toHaveBeenCalledWith({ bidak: BIDAK[2], titik: { x: 760, y: 550 } });
	});

	it('mulaiDariPapan bidak lawan saat TEMPUR: cariBidak dipakai, pointerup cepat -> padaKlik, tanpa seret dan tahan', () => {
		const klik = vi.fn();
		const tahan = vi.fn();
		seret.padaKlik(klik);
		seret.padaTahan(tahan);
		snap = snapDengan({ fase: FASE.TEMPUR });
		infoDiBawah = { entityId: 77, unitId: 'archer', nama: 'Archer', sendiri: false, bintang: 2, hp: 10, maxHp: 20 };
		const ev = pev(900, 300);
		diAtasPapan(48.5, 52.5);
		expect(seret.mulaiDariPapan(ev)).toBe(true);
		expect(cariBidak).toHaveBeenCalledWith(ev);
		expect(tunda).not.toHaveBeenCalled();
		dok.picu('pointerup', pev(900, 300));
		expect(klik).toHaveBeenCalledWith({
			sumber: 'papan', unitId: 'archer', bintang: 2, sendiri: false, entityId: 77, nama: 'Archer'
		});
		expect(tahan).not.toHaveBeenCalled();
		expect(dok.dipasang).toHaveLength(0);
	});

	it('klik-saja yang bergerak lewat ambang: bukan klik, bukan seret', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		snap = snapDengan({ fase: FASE.TEMPUR });
		infoDiBawah = { entityId: 77, unitId: 'archer', nama: 'Archer', sendiri: false, bintang: 2 };
		seret.mulaiDariPapan(pev(900, 300));
		dok.picu('pointermove', pev(920, 300));
		expect(seret.modus()).toBeNull();
		expect(dok.dipasang).toHaveLength(0);
		dok.picu('pointerup', pev(920, 300));
		expect(klik).not.toHaveBeenCalled();
		expect(dok.jumlahPendengar()).toBe(0);
	});

	it('mulaiDariPapan bidak sendiri saat TEMPUR: hanya klik (tidak ada seret, tidak ada tahan)', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		snap = snapDengan({ fase: FASE.TEMPUR });
		infoDiBawah = { entityId: 42, unitId: 'archer', nama: 'Archer', sendiri: true, bintang: 1 };
		diAtasPapan(48.5, 45.5);
		expect(seret.mulaiDariPapan(pev(760, 550))).toBe(true);
		expect(tunda).not.toHaveBeenCalled();
		dok.picu('pointermove', pev(770, 550));
		expect(dok.dipasang).toHaveLength(0);
		expect(zonaJual.tampil).not.toHaveBeenCalled();

		seret.mulaiDariPapan(pev(760, 550));
		dok.picu('pointerup', pev(760, 550));
		expect(klik).toHaveBeenCalledWith({
			sumber: 'papan', bidakId: 3, unitId: 'archer', bintang: 1, sendiri: true, entityId: 42, nama: 'Archer'
		});
	});

	it('pointerdown tombol kanan: diabaikan', () => {
		diAtasPapan(48.5, 45.5);
		infoDiBawah = { entityId: 77, unitId: 'archer', nama: 'Archer', sendiri: false, bintang: 2 };
		expect(seret.mulaiDariBangku(1, pev(600, 840, { button: 2 }))).toBe(false);
		expect(seret.mulaiDariPapan(pev(760, 550, { button: 2 }))).toBe(false);
		expect(seret.modus()).toBeNull();
		expect(tunda).not.toHaveBeenCalled();
		expect(dok.jumlahPendengar()).toBe(0);
	});

	it('padaKlik tanpa pendaftar tidak melempar; pointercancel saat diam membatalkan pewaktu', () => {
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointerup', pev(600, 840));
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointercancel', pev(600, 840));
		expect(pewaktu.size).toBe(0);
		expect(seret.modus()).toBeNull();
		expect(dok.jumlahPendengar()).toBe(0);
	});

	it('pertandingan selesai: bidak bangku hanya bisa diklik', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		snap = snapDengan({ selesai: { peringkatSaya: 2 } });
		seret.mulaiDariBangku(1, pev(600, 840));
		expect(tunda).not.toHaveBeenCalled();
		dok.picu('pointermove', pev(620, 840));
		expect(dok.dipasang).toHaveLength(0);
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointerup', pev(600, 840));
		expect(klik).toHaveBeenCalledTimes(1);
	});
});

describe('bawa (AC7 K4)', () => {
	it('mulaiBawa: hantu, zonaJual.tampil, modus bawa; pointermove menggerakkan hantu; klik kiri di petak kosong -> taruh', () => {
		snap = snapDengan({ state: { saya: { bidak: BIDAK.filter((b) => b.bidakId !== 3) } } });
		expect(seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 })).toBe(true);
		expect(seret.modus()).toBe('bawa');
		expect(seret.aktif()).toBe(true);
		expect(dok.dipasang).toHaveLength(1);
		expect(zonaJual.tampil).toHaveBeenCalledWith(BIDAK[0]);
		expect(Cursor.setType).toHaveBeenCalledWith(Cursor.ACTION.PICK);
		const hantu = dok.dipasang[0];
		const kiri = hantu.style.left;
		diAtasPapan(48.4, 45.7);
		dok.picu('pointermove', pev(760, 550));
		expect(hantu.style.left).not.toBe(kiri);
		// pointerup (sisa klik item menu) tidak memutuskan apa pun.
		dok.picu('pointerup', pev(760, 550));
		expect(seret.modus()).toBe('bawa');
		const ev = pev(760, 550);
		dok.picu('pointerdown', ev);
		expect(ev.stopPropagation).toHaveBeenCalled();
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
		dok.picu('pointerup', pev(760, 550));
		dok.picu('click', pev(760, 550));
		harusBersih();
	});

	it('klik kiri di zona jual -> jual', () => {
		seret.mulaiBawa(BIDAK[2], { x: 760, y: 550 });
		dok.picu('pointermove', pev(DI_TOKO.x, DI_TOKO.y));
		klikBawa(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 3 });
		harusBersih();
	});

	it('klik kanan -> batal tanpa kirim, tanpa penelan click yang tertinggal', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		diAtasPapan(44.5, 41.5);
		dok.picu('pointerdown', pev(500, 650, { button: 2 }));
		expect(kirim).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
		harusBersih();
		// Klik kiri biasa sesudahnya tidak ditelan.
		const klik = pev(500, 650);
		dok.picu('click', klik);
		expect(klik.preventDefault).not.toHaveBeenCalled();
	});

	it('review I1: click sesudah klik kiri penentu ditelan sekali; tombol UI di bawah pointer tidak bertindak', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		// Di atas Bangku, di bawah pointer ada tombol Beli EXP (bertindak pada click).
		dok.diBawah = { nama: 'Beli EXP' };
		dok.picu('pointermove', pev(700, 780));
		dok.picu('pointerdown', pev(700, 780));
		expect(seret.modus()).toBeNull();
		const tombol = vi.fn(() => kirim('beli-exp', {}));
		dok.addEventListener('click', tombol); // sasaran: sesudah capture dokumen
		dok.picu('pointerup', pev(700, 780));
		const klik = pev(700, 780, { target: { dataset: { aksi: 'beli-exp' } } });
		dok.picu('click', klik);
		expect(klik.preventDefault).toHaveBeenCalled();
		expect(klik.defaultPrevented).toBe(true);
		expect(klik.stopImmediatePropagation).toHaveBeenCalled();
		expect(tombol).not.toHaveBeenCalled();
		expect(kirim).not.toHaveBeenCalledWith('beli-exp', {});
		dok.removeEventListener('click', tombol);
		harusBersih();
		// Hanya sekali: click berikutnya lewat.
		const lagi = pev(700, 780);
		dok.picu('click', lagi);
		expect(lagi.preventDefault).not.toHaveBeenCalled();
	});

	it('review I1: penelan dilepas pada tick sesudah pointerup bila click tidak datang, atau oleh pointerdown berikutnya', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		diAtasPapan(44.5, 41.5);
		dok.picu('pointerdown', pev(500, 650));
		expect(kirim).toHaveBeenCalledTimes(1);
		dok.picu('pointerup', pev(500, 650));
		jalankanPewaktu(); // tick berikutnya, tanpa click
		harusBersih();
		const klik = pev(500, 650);
		dok.picu('click', klik);
		expect(klik.preventDefault).not.toHaveBeenCalled();

		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		dok.picu('pointerdown', pev(500, 650));
		dok.picu('pointerdown', pev(510, 650)); // klik baru tanpa click di antaranya
		expect(dok.jumlahPendengar()).toBe(0);
	});

	it('review I1: bereskan interaksi berikutnya juga melepas penelan', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		diAtasPapan(44.5, 41.5);
		dok.picu('pointerdown', pev(500, 650));
		expect(dok.jumlahPendengar()).toBeGreaterThan(0);
		// Pegangan baru lewat API (tanpa pointerdown dokumen), lalu dibatalkan.
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointercancel', pev(600, 840));
		expect(dok.jumlahPendengar()).toBe(0);
	});

	it('batalBawa() -> bersih; tanpa bawa tidak berbuat apa-apa', () => {
		seret.batalBawa();
		expect(potret.hentikan).not.toHaveBeenCalled();
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		seret.batalBawa();
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('batalBawa() tidak membatalkan seret biasa', () => {
		seretBangku(1);
		seret.batalBawa();
		expect(seret.modus()).toBe('seret');
	});

	it('mulaiBawa ditolak saat interaksi lain berjalan', () => {
		seretBangku(1);
		expect(seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 })).toBe(false);
		expect(dok.dipasang).toHaveLength(1);
	});

	it('bawa saat menonton kursi lain mengirim tonton kursi sendiri dulu', () => {
		snap = snapDengan({
			state: { saya: { kursi: 0, bidak: BIDAK.filter((b) => b.bidakId !== 3) }, kursi: [{ kursi: 0, hidup: true }, { kursi: 2, hidup: true }] },
			ditonton: 2
		});
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenNthCalledWith(1, 'tonton', { kursi: 0 });
		snap = { ...snap, ditonton: 0 };
		diAtasPapan(48.4, 45.7);
		dok.picu('pointerdown', pev(760, 550));
		expect(kirim).toHaveBeenNthCalledWith(2, 'taruh', { bidakId: 1, kolom: 3, baris: 2 });
	});

	it('padaFase(TEMPUR) saat bawa bidak papan -> dibatalkan, zona jual disembunyikan', () => {
		seret.mulaiBawa(BIDAK[2], { x: 760, y: 550 });
		snap = snapDengan({ fase: FASE.TEMPUR });
		seret.padaFase(FASE.TEMPUR);
		expect(zonaJual.sembunyi).toHaveBeenCalled();
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});

	it('padaFase(TEMPUR) saat seret bidak papan -> dibatalkan', () => {
		diAtasPapan(48.5, 45.5);
		seretPapan(760, 550);
		seret.padaFase(FASE.TEMPUR);
		expect(zonaJual.sembunyi).toHaveBeenCalled();
		harusBersih();
		dok.picu('pointerup', pev(760, 550));
		expect(kirim).not.toHaveBeenCalled();
	});

	it('padaFase(TEMPUR) saat seret bidak bangku -> tetap hidup, lalu masih bisa menjual', () => {
		seretBangku(1);
		snap = snapDengan({ fase: FASE.TEMPUR });
		seret.padaFase(FASE.TEMPUR);
		expect(seret.modus()).toBe('seret');
		expect(zonaJual.sembunyi).not.toHaveBeenCalled();
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
	});

	it('padaFase(TEMPUR) saat pegangan bidak papan masih diam -> pegangan dilepas', () => {
		const klik = vi.fn();
		seret.padaKlik(klik);
		diAtasPapan(48.5, 45.5);
		seret.mulaiDariPapan(pev(760, 550));
		seret.padaFase(FASE.TEMPUR);
		expect(seret.modus()).toBeNull();
		expect(pewaktu.size).toBe(0);
		dok.picu('pointermove', pev(780, 550));
		expect(dok.dipasang).toHaveLength(0);
	});

	it('padaFase(PERSIAPAN) tidak membatalkan apa pun', () => {
		seret.mulaiBawa(BIDAK[2], { x: 760, y: 550 });
		seret.padaFase(FASE.PERSIAPAN);
		expect(seret.modus()).toBe('bawa');
	});

	it('AC7 K15: bidak bangku yang dibawa sudah naik otomatis saat dilepas -> batal dengan satu log', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		snap = snapDengan({
			fase: FASE.TEMPUR,
			state: { saya: { bidak: [{ ...BIDAK[0], diPapan: true, kolom: 4, baris: 3 }, BIDAK[1], BIDAK[2]] } }
		});
		seret.padaFase(FASE.TEMPUR);
		dok.picu('pointerdown', pev(DI_TOKO.x, DI_TOKO.y));
		expect(kirim).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(expect.stringContaining('bidak sudah naik otomatis ke papan'));
	});

	it('blur jendela saat bawa -> batal', () => {
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		jen.picu('blur', { type: 'blur' });
		expect(kirim).not.toHaveBeenCalled();
		harusBersih();
	});
});

describe('Toko selama seret (AC7 K1: zona jual)', () => {
	it('seret aktif -> zonaJual.tampil(bidak); lepas -> zonaJual.sembunyi()', () => {
		seretBangku(1);
		expect(zonaJual.tampil).toHaveBeenCalledTimes(1);
		expect(zonaJual.tampil).toHaveBeenCalledWith(BIDAK[0]);
		expect(toko.terbuka()).toBe(true);
		expect(toko.zonaJualAktif()).toBe(true);
		diAtasPapan(48.5, 52.5); // separuh lawan: batal
		lepasDi(760, 300);
		expect(zonaJual.sembunyi).toHaveBeenCalledTimes(1);
		expect(toko.zonaJualAktif()).toBe(false);
	});

	it('Toko terbuka + drop di petak sendiri -> taruh, bukan jual', () => {
		toko.buka();
		snap = snapDengan({ state: { saya: { bidak: BIDAK.filter((b) => b.bidakId !== 3) } } });
		seretBangku(1);
		diAtasPapan(48.4, 45.7);
		lepasDi(760, 600);
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenCalledWith('taruh', { bidakId: 1, kolom: 3, baris: 2 });
		expect(toko.terbuka()).toBe(true);
		harusBersih();
	});

	it('drop di rect Toko -> jual, walau Toko terbuka sebelum seret; Toko tetap terbuka', () => {
		toko.buka();
		seretBangku(1);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(toko.terbuka()).toBe(true);
	});

	it('Toko yang tertutup sebelum seret dibuka sebagai zona jual, lalu tertutup lagi', () => {
		seretBangku(1);
		expect(toko.terbuka()).toBe(true);
		dok.picu('pointercancel', pev(600, 840));
		expect(toko.terbuka()).toBe(false);
		expect(zonaJual.sembunyi).toHaveBeenCalledTimes(1);
	});

	it('AC6: seret tidak punya tutupToko lagi (Toko tetap terbuka saat TEMPUR)', () => {
		expect(seret.tutupToko).toBeUndefined();
	});
});

describe('Mouse.intersect dan klik sesudah seret (M5/M6 final review)', () => {
	it('intersect dihitung sesudah zona jual disembunyikan: Toko yang tertutup lagi tidak menghalangi', () => {
		seretBangku(1);
		dok.diBawah = Renderer.canvas; // di bawah Toko ada kanvas 3D
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		expect(toko.terbuka()).toBe(false);
		expect(Mouse.intersect).toBe(true);
	});

	it('Toko tetap terbuka di bawah pointer sesudah jual: intersect false', () => {
		toko.buka();
		seretBangku(1);
		dok.diBawah = Renderer.canvas;
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(Mouse.intersect).toBe(false);
	});

	it('drop di zona jual: tidak ada listener yang tertinggal, dan kanvas memulihkan intersect', () => {
		toko.buka();
		seretBangku(1);
		lepasDi(DI_TOKO.x, DI_TOKO.y);
		expect(kirim).toHaveBeenCalledWith('jual', { bidakId: 1 });
		expect(Mouse.intersect).toBe(false); // pointer di atas Toko
		expect(dok.jumlahPendengar()).toBe(0);
		expect(jen.jumlahPendengar()).toBe(0);

		// Jendela STOP bisa saja merekam false di tengah seret dan tidak
		// pernah mengembalikannya; pointermove di kanvas yang memulihkan.
		seret.pantauKanvas({ target: Renderer.canvas });
		expect(Mouse.intersect).toBe(true);

		// Klik/seret berikutnya di papan berjalan dengan petak segar.
		diAtasPapan(52.5, 43.5); // (5,1): bidak 2
		expect(seretPapan(860, 600)).toBe(true);
		diAtasPapan(42.5, 41.5);
		lepasDi(450, 700);
		expect(kirim).toHaveBeenLastCalledWith('taruh', { bidakId: 2, kolom: 0, baris: 0 });
	});

	it('pantauKanvas diam selama seret/bawa, saat UI beku, dan untuk target selain kanvas', () => {
		Mouse.intersect = false;
		seret.pantauKanvas({ target: { nama: 'jendela' } });
		expect(Mouse.intersect).toBe(false);
		beku = true;
		seret.pantauKanvas({ target: Renderer.canvas });
		expect(Mouse.intersect).toBe(false);
		beku = false;
		seretBangku(1);
		Mouse.intersect = false;
		seret.pantauKanvas({ target: Renderer.canvas });
		expect(Mouse.intersect).toBe(false);
		dok.picu('pointercancel', pev(600, 840));
		seret.mulaiBawa(BIDAK[0], { x: 600, y: 840 });
		Mouse.intersect = false;
		seret.pantauKanvas({ target: Renderer.canvas });
		expect(Mouse.intersect).toBe(false);
	});
});

describe('petakDiBawahPointer', () => {
	const asal = { x: 42, y: 41 };
	it('petak kedua separuh papan dari Mouse.world (pecahan dibulatkan ke bawah)', () => {
		expect(petakDiBawahPointer(asal, 2, { x: 42.9, y: 41.2 })).toEqual({ kolom: 0, baris: 0 });
		expect(petakDiBawahPointer(asal, 2, { x: 57.5, y: 56.9 })).toEqual({ kolom: 7, baris: 7 });
		expect(petakDiBawahPointer(asal, 2, { x: 47, y: 52 })).toEqual({ kolom: 2, baris: 5 });
	});
	it('null bila pointer tidak menyentuh tanah atau di luar papan', () => {
		expect(petakDiBawahPointer(asal, 2, { x: -1, y: -1 })).toBeNull();
		expect(petakDiBawahPointer(asal, 2, { x: 30, y: 45 })).toBeNull();
		expect(petakDiBawahPointer(asal, 2, null)).toBeNull();
	});
});

describe('seret saat menonton kursi lain (AC6 K14)', () => {
	const KURSI_HIDUP = [
		{ kursi: 0, hidup: true }, { kursi: 2, hidup: true }
	];
	function snapMenonton(ekstra = {}, kursi = KURSI_HIDUP) {
		return snapDengan({
			state: { saya: { kursi: 0, bidak: BIDAK.filter((b) => b.bidakId !== 3) }, kursi },
			ditonton: 2,
			...ekstra
		});
	}

	it('seret dari Bangku mengirim tonton kursi sendiri DULU (saat seret dimulai), lalu taruh saat dilepas', () => {
		snap = snapMenonton();
		expect(seret.mulaiDariBangku(1, pev(600, 840))).toBe(true);
		// AC7 K2: klik saja tidak memulangkan tontonan.
		expect(kirim).not.toHaveBeenCalled();
		dok.picu('pointermove', pev(610, 830));
		expect(kirim).toHaveBeenCalledTimes(1);
		expect(kirim).toHaveBeenNthCalledWith(1, 'tonton', { kursi: 0 });
		// Server memulangkan tontonan; seret berjalan seperti biasa.
		snap = { ...snap, ditonton: 0 };
		diAtasPapan(48.4, 45.7);
		lepasDi(760, 550);
		expect(kirim).toHaveBeenNthCalledWith(2, 'taruh', { bidakId: 1, kolom: 3, baris: 2 });
		expect(kirim).toHaveBeenCalledTimes(2);
		harusBersih();
	});

	it('klik bidak bangku saat menonton: tidak ada tonton yang dikirim', () => {
		snap = snapMenonton();
		seret.mulaiDariBangku(1, pev(600, 840));
		dok.picu('pointerup', pev(600, 840));
		expect(kirim).not.toHaveBeenCalled();
	});

	it('menonton papan sendiri: tidak ada tonton yang dikirim', () => {
		snap = snapMenonton({ ditonton: 0 });
		seretBangku(1);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('di luar PERSIAPAN atau sesudah kursi sendiri tersingkir: tidak memulangkan', () => {
		snap = snapMenonton({ fase: FASE.TEMPUR });
		seretBangku(1);
		dok.picu('pointercancel', pev(600, 840));
		expect(kirim).not.toHaveBeenCalled();

		snap = snapMenonton({}, [{ kursi: 0, hidup: false }, { kursi: 2, hidup: true }]);
		seretBangku(1);
		expect(kirim).not.toHaveBeenCalled();
	});

	it('seret dari papan tidak dimulai: bidak sendiri tidak tampil', () => {
		snap = snapMenonton();
		diAtasPapan(52.5, 43.5); // petak (5,1): bidak 2 milik sendiri
		expect(seret.mulaiDariPapan(pev(700, 600))).toBe(false);
		expect(seret.aktif()).toBe(false);
		expect(kirim).not.toHaveBeenCalled();
		// Papan sendiri: bidak yang sama bisa diseret.
		snap = { ...snap, ditonton: 0 };
		expect(seretPapan(700, 600)).toBe(true);
		expect(seret.modus()).toBe('seret');
	});
});
