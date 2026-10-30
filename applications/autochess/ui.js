/**
 * UI catur sementara yang polos (AC3): satu panel HTML di kanan kanvas.
 *
 * Murni: renderUI hanya menghasilkan string HTML dan tidak menyentuh
 * document, sehingga teruji di environment node. ikatAksi menerima root
 * dari pemanggil dan hanya memakai addEventListener, closest,
 * querySelector, dan dataset -- cukup dipalsukan di test.
 *
 * Nama unit ditampilkan sebagai unitId apa adanya: TokoCatur dan
 * BidakCatur hanya membawa unit_id, dan nama dwibahasa adalah urusan AC4.
 *
 * Kosakata data-aksi dimiliki berkas ini: renderUI menuliskannya,
 * ikatAksi membacanya, dan sandikanAksi menerjemahkannya ke perintah
 * catur. Ketiganya di satu tempat supaya satu nama tidak bisa menyimpang.
 */

import {
	FASE, encodeCaturBeli, encodeCaturJual, encodeCaturRefresh, encodeCaturKunci, encodeCaturBeliExp,
	encodeCaturTaruh, encodeCaturKeBangku, encodeCaturKeluar, encodeCaturLewati
} from './pesan.js';
import { formatWaktu } from './ui/render/waktu.js';

// Dipindah ke ui/render/waktu.js (dipakai jendela Timer); diekspor ulang
// supaya pemakai lama dan ui.test.js tetap jalan.
export { formatWaktu };

/** Ukuran setengah papan milik pemain: kolom 0-7, baris 0-3. */
export const KOLOM = 8;
export const BARIS = 4;

const NAMA_FASE = {
	[FASE.PERSIAPAN]: 'PERSIAPAN',
	[FASE.TEMPUR]:    'TEMPUR',
	[FASE.HASIL]:     'HASIL'
};

/**
 * Nama fase untuk manusia. Fase 0 hanya tiba karena bug (lihat FaseCatur
 * di ro.proto) dan harus TERLIHAT sebagai bug, bukan ditebak.
 *
 * @param {number} fase
 * @returns {string}
 */
export function namaFase(fase) {
	return NAMA_FASE[fase] || `TIDAK DIKENAL (${fase})`;
}

const ENTITAS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Meloloskan teks dari server (nama kursi, unitId, id sinergi). */
function esc(teks) {
	return String(teks).replace(/[&<>"']/g, (c) => ENTITAS[c]);
}

/** Satu tombol aksi; mati bila !aktif. */
function tombol(aksi, arg, teks, aktif) {
	const a = arg === undefined ? '' : ` data-arg="${esc(arg)}"`;
	return `<button data-aksi="${aksi}"${a}${aktif ? '' : ' disabled'}>${esc(teks)}</button>`;
}

/** <select> 0..n-1 dengan nilai terpilih. */
function pilihan(atribut, n, terpilih) {
	let isi = '';
	for (let i = 0; i < n; i++) {
		isi += `<option value="${i}"${i === terpilih ? ' selected' : ''}>${i}</option>`;
	}
	return `<select ${atribut}>${isi}</select>`;
}

/**
 * Petak papan kosong pertama (baris demi baris), sebagai bawaan select
 * bangku supaya klik "taruh" tanpa memilih pun biasanya sah. Papan penuh
 * jatuh ke (0,0) dan server yang menolak.
 */
function petakKosong(bidak) {
	const terisi = new Set(bidak.filter((b) => b.diPapan).map((b) => `${b.kolom},${b.baris}`));
	for (let baris = 0; baris < BARIS; baris++) {
		for (let kolom = 0; kolom < KOLOM; kolom++) {
			if (!terisi.has(`${kolom},${baris}`)) {
				return { kolom, baris };
			}
		}
	}
	return { kolom: 0, baris: 0 };
}

/**
 * Placeholder hitung mundur. Teksnya SENGAJA tetap (bukan sisaMs): angka
 * mm:ss diisi perbaruiTimer lewat textContent, supaya keluaran renderUI
 * hanya berubah bila state server berubah dan main.js tidak mengganti
 * innerHTML (lalu membuang klik yang sedang berlangsung) tiap detik.
 */
const TIMER_KOSONG = '--:--';

function bagianStatus(state, fase, ronde) {
	const s = state.saya;
	const diPapan = s.bidak.filter((b) => b.diPapan).length;
	return `<section id="status">
<div>Ronde ${ronde} — ${esc(namaFase(fase))} — <b id="timer">${TIMER_KOSONG}</b></div>
<div>Zeny ${s.zeny} · Lv ${s.level} · EXP ${s.exp}/${s.expBerikut} · Papan ${diPapan}/${s.kapasitas}</div>
</section>`;
}

function bagianHasil(hasil) {
	if (!hasil) {
		return '';
	}
	let teks = 'KALAH';
	if (hasil.seri) {
		teks = 'SERI';
	} else if (hasil.menang) {
		teks = 'MENANG';
	}
	return `<section id="hasil">Ronde ${hasil.ronde}: <b>${teks}</b> · damage ${hasil.damageDiterima} · +${hasil.zenyMasuk} zeny</section>`;
}

function bagianSelesai(selesai, kursi) {
	if (!selesai) {
		return '';
	}
	const nama = new Map(kursi.map((k) => [k.kursi, k.nama]));
	const daftar = selesai.peringkat
		.map((no, i) => `<li>#${i + 1} ${esc(nama.get(no) ?? `kursi ${no}`)}</li>`)
		.join('');
	return `<section id="selesai"><h3>Selesai — peringkatmu #${selesai.peringkatSaya}</h3><ol>${daftar}</ol></section>`;
}

function bagianKursi(kursi, sayaKursi) {
	// Salinan: sort tidak boleh mengubah snapshot milik state.js.
	const urut = [...kursi].sort((a, b) => b.hp - a.hp || a.kursi - b.kursi);
	const baris = urut.map((k) => {
		const kelas = ['kursi'];
		if (k.kursi === sayaKursi) {
			kelas.push('saya');
		}
		if (!k.hidup) {
			kelas.push('tersingkir');
		}
		const streak = k.streak > 0 ? `+${k.streak}` : `${k.streak}`;
		return `<tr class="${kelas.join(' ')}" data-hp="${k.hp}"><td>${esc(k.nama)}${k.bot ? ' [bot]' : ''}</td>`
			+ `<td>${k.hp}</td><td>${k.level}</td><td>${streak}</td><td>${k.hidup ? '' : 'tersingkir'}</td></tr>`;
	});
	return `<section id="kursi"><table><thead><tr><th>Nama</th><th>HP</th><th>Lv</th><th>Streak</th><th></th></tr></thead>`
		+ `<tbody>${baris.join('')}</tbody></table></section>`;
}

function bagianToko(saya, aktif) {
	const kartu = saya.toko.map((t) => {
		if (!t.unitId) {
			return '<div class="kartu kosong">(kosong)</div>';
		}
		return `<div class="kartu">${esc(t.unitId)} · ${t.harga}z ${tombol('beli', t.slot, 'Beli', aktif)}</div>`;
	});
	return `<section id="toko"><h3>Toko</h3>${kartu.join('')}<div class="baris-tombol">`
		+ tombol('refresh', undefined, 'Refresh', aktif)
		+ tombol('kunci', saya.kunci ? 0 : 1, saya.kunci ? 'Buka' : 'Kunci', aktif)
		+ tombol('beli-exp', undefined, 'Beli EXP', aktif)
		+ tombol('lewati', undefined, 'Lewati', aktif)
		+ '</div></section>';
}

function bagianBangku(bidak, aktif) {
	const awal = petakKosong(bidak);
	const kartu = bidak.filter((b) => !b.diPapan).map((b) => `<div class="kartu" data-bidak="${b.bidakId}">`
		+ `${esc(b.unitId)} ★${b.bintang} `
		+ `${pilihan('data-kolom', KOLOM, awal.kolom)}${pilihan('data-baris', BARIS, awal.baris)} `
		+ `${tombol('taruh', b.bidakId, 'Taruh', aktif)}${tombol('jual', b.bidakId, 'Jual', aktif)}</div>`);
	return `<section id="bangku"><h3>Bangku</h3>${kartu.join('') || '<div>(kosong)</div>'}</section>`;
}

function bagianPapan(bidak, aktif) {
	const kartu = bidak.filter((b) => b.diPapan).map((b) => `<div class="kartu" data-bidak="${b.bidakId}">`
		+ `${esc(b.unitId)} ★${b.bintang} (${b.kolom},${b.baris}) `
		+ `${tombol('ke-bangku', b.bidakId, 'Ke bangku', aktif)}${tombol('jual', b.bidakId, 'Jual', aktif)}</div>`);
	return `<section id="papan"><h3>Papan</h3>${kartu.join('') || '<div>(kosong)</div>'}</section>`;
}

function bagianSinergi(sinergi) {
	const daftar = sinergi.map((n) => `<div>${esc(n.id)} ${n.jumlah} (tingkat ${n.tingkatAktif})${n.origin ? ' · origin' : ' · class'}</div>`);
	return `<section id="sinergi"><h3>Sinergi</h3>${daftar.join('') || '<div>(belum ada)</div>'}</section>`;
}

function bagianPeluang(peluang) {
	return `<section id="peluang"><h3>Peluang toko</h3>${peluang.map((p) => `T${p.tier} ${p.persen}%`).join(' · ')}</section>`;
}

/**
 * Menggambar seluruh panel sebagai string HTML.
 *
 * Tombol hanya aktif saat fase PERSIAPAN dan pertandingan belum selesai;
 * server tetap menolak perintah di luar itu, tetapi tombol yang mati
 * memberi tahu pemain sebelum ia mengeklik.
 *
 * Keluaran TIDAK bergantung jam: hitung mundur hanya placeholder
 * <b id="timer">, diisi perbaruiTimer. Untuk state yang sama hasilnya
 * identik byte demi byte, jadi pembanding htmlTerakhir di main.js hanya
 * membangun ulang panel saat pesan server mengubah sesuatu. sisaMs
 * tetap diterima (pemanggil lama mengopernya) tetapi tidak dibaca.
 *
 * @param {object} d
 * @param {object|null} d.state - keluaran decodeCaturState
 * @param {number} d.fase - fase terbaru (FASE)
 * @param {number} [d.ronde] - ronde terbaru; jatuh ke state.ronde
 * @param {object|null} d.hasilTerakhir - keluaran decodeCaturHasil
 * @param {object|null} d.selesai - keluaran decodeCaturSelesai
 * @returns {string}
 */
export function renderUI({ state, fase, ronde, hasilTerakhir, selesai }) {
	if (!state) {
		return '<section id="status">menunggu state pertandingan …</section>';
	}
	const aktif = fase === FASE.PERSIAPAN && !selesai;
	return bagianStatus(state, fase, ronde || state.ronde)
		+ bagianHasil(hasilTerakhir)
		+ bagianSelesai(selesai, state.kursi)
		+ bagianKursi(state.kursi, state.saya.kursi)
		+ bagianToko(state.saya, aktif)
		+ bagianBangku(state.saya.bidak, aktif)
		+ bagianPapan(state.saya.bidak, aktif)
		+ bagianSinergi(state.saya.sinergi)
		+ bagianPeluang(state.saya.peluang);
}

/**
 * Menulis sisa waktu fase ke node #timer milik renderUI lewat textContent,
 * tanpa menyentuh sisa panel. Dipanggil tiap tick dan sesudah setiap
 * pembangunan ulang. Tanpa node (state belum tiba) tidak berbuat apa-apa;
 * teks yang sama tidak ditulis ulang.
 *
 * @param {{querySelector: function(string): ?{textContent: string}}} root - elemen #ui
 * @param {number} sisaMs - sisa waktu fase menurut jam lokal
 */
export function perbaruiTimer(root, sisaMs) {
	const node = root.querySelector('#timer');
	if (!node) {
		return;
	}
	const teks = formatWaktu(sisaMs);
	if (node.textContent !== teks) {
		node.textContent = teks;
	}
}

/**
 * Argumen perintah kunci dari dataset tombol (AC6 K2): data-arg '1' kunci,
 * selain itu buka; data-slot = slot toko (gembok per kartu Toko). Tanpa
 * data-slot (tombol kunci panel #ui lama) slot = -1, yaitu semua slot.
 *
 * @param {{arg?: string, slot?: string}} dataset
 * @returns {{slot: number, kunci: boolean}}
 */
export function argKunci(dataset) {
	const slot = dataset?.slot;
	return { slot: slot === undefined || slot === '' ? -1 : Number(slot), kunci: dataset?.arg === '1' };
}

/** Argumen kirim per aksi, dari dataset tombol (dan kartunya untuk taruh). */
const BACA_ARG = {
	beli:       (arg) => ({ slot: Number(arg) }),
	jual:       (arg) => ({ bidakId: Number(arg) }),
	'ke-bangku': (arg) => ({ bidakId: Number(arg) }),
	kunci:      (arg, kartu, btn) => argKunci(btn.dataset),
	// Tanpa kartu (markup rusak) tidak ada petak tujuan: null = abaikan.
	taruh:      (arg, kartu) => (kartu ? {
		bidakId: Number(arg),
		kolom:   Number(kartu.querySelector('[data-kolom]').value),
		baris:   Number(kartu.querySelector('[data-baris]').value)
	} : null),
	refresh:    () => ({}),
	'beli-exp': () => ({}),
	lewati:     () => ({})
};

/**
 * Memasang SATU listener click terdelegasi pada root. Karena root tidak
 * pernah diganti (hanya innerHTML-nya), listener ini bertahan melewati
 * setiap renderUI.
 *
 * @param {{addEventListener: function(string, function): void}} root
 * @param {function(string, object): void} kirim - kirim(aksi, arg)
 */
export function ikatAksi(root, kirim) {
	root.addEventListener('click', (e) => {
		const target = e && e.target;
		if (!target || typeof target.closest !== 'function') {
			return;
		}
		const btn = target.closest('[data-aksi]');
		if (!btn || btn.disabled) {
			return;
		}
		const aksi = btn.dataset.aksi;
		const baca = BACA_ARG[aksi];
		if (!baca) {
			return;
		}
		const arg = baca(btn.dataset.arg, target.closest('.kartu'), btn);
		if (arg) {
			kirim(aksi, arg);
		}
	});
}

/** Kartu bangku: punya data-bidak DAN kedua select (kartu papan tidak). */
function kartuBangku(root) {
	return [...root.querySelectorAll('.kartu[data-bidak]')].filter(
		(k) => k.querySelector('[data-kolom]') && k.querySelector('[data-baris]')
	);
}

/**
 * Menyimpan pilihan kolom/baris setiap kartu bangku dan select mana yang
 * sedang difokus, SEBELUM root.innerHTML diganti (lihat gambarUI di
 * main.js). Kuncinya data-bidak, bukan urutan kartu: bangku bisa berubah
 * di antara dua redraw.
 *
 * @param {object} root - elemen #ui
 * @param {object|null} fokus - document.activeElement
 * @returns {{nilai: Map<string, {kolom: string, baris: string}>, fokus: {bidak: string, jenis: string}|null}}
 */
export function simpanPilihan(root, fokus) {
	const nilai = new Map();
	for (const kartu of kartuBangku(root)) {
		nilai.set(kartu.dataset.bidak, {
			kolom: kartu.querySelector('[data-kolom]').value,
			baris: kartu.querySelector('[data-baris]').value
		});
	}
	let f = null;
	if (fokus && fokus.tagName === 'SELECT' && typeof fokus.closest === 'function') {
		const kartu = fokus.closest('.kartu[data-bidak]');
		if (kartu && root.contains(kartu)) {
			f = { bidak: kartu.dataset.bidak, jenis: fokus.hasAttribute('data-kolom') ? 'kolom' : 'baris' };
		}
	}
	return { nilai, fokus: f };
}

/**
 * Memulihkan simpanan simpanPilihan SESUDAH innerHTML diganti: nilai
 * kedua select dikembalikan ke kartu dengan data-bidak yang sama, dan
 * fokus ke select yang sama. Kartu yang sudah hilang (bidak dijual atau
 * ditaruh) dilewati begitu saja.
 *
 * @param {object} root - elemen #ui
 * @param {ReturnType<typeof simpanPilihan>} simpanan
 */
export function pulihkanPilihan(root, simpanan) {
	for (const kartu of kartuBangku(root)) {
		const bidak = kartu.dataset.bidak;
		const v = simpanan.nilai.get(bidak);
		if (v) {
			kartu.querySelector('[data-kolom]').value = v.kolom;
			kartu.querySelector('[data-baris]').value = v.baris;
		}
		if (simpanan.fokus && simpanan.fokus.bidak === bidak) {
			// preventScroll: panel tidak boleh melompat tiap detik.
			kartu.querySelector(`[data-${simpanan.fokus.jenis}]`).focus({ preventScroll: true });
		}
	}
}

/** Penyandi perintah catur per aksi UI. */
const PENYANDI = {
	beli:        (C, a) => encodeCaturBeli(C, a.slot),
	jual:        (C, a) => encodeCaturJual(C, a.bidakId),
	refresh:     (C) => encodeCaturRefresh(C),
	kunci:       (C, a) => encodeCaturKunci(C, a.kunci, a.slot ?? -1),
	'beli-exp':  (C) => encodeCaturBeliExp(C),
	taruh:       (C, a) => encodeCaturTaruh(C, a.bidakId, a.kolom, a.baris),
	'ke-bangku': (C, a) => encodeCaturKeBangku(C, a.bidakId),
	lewati:      (C) => encodeCaturLewati(C),
	keluar:      (C) => encodeCaturKeluar(C)
};

/**
 * Menerjemahkan kirim(aksi, arg) menjadi ClientMsg siap kirim.
 *
 * @param {object} ClientMsg - tipe ClientMsg dari skema
 * @param {string} aksi - nama data-aksi, atau 'keluar'
 * @param {object} arg - keluaran ikatAksi
 * @returns {ArrayBuffer}
 * @throws {Error} bila aksi tak dikenal
 */
export function sandikanAksi(ClientMsg, aksi, arg) {
	const sandi = PENYANDI[aksi];
	if (!sandi) {
		throw new Error(`aksi tak dikenal: ${aksi}`);
	}
	return sandi(ClientMsg, arg || {});
}
