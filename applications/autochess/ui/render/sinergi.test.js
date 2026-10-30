import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSinergi, renderLore, kodeLencana, ambangBerikut } from './sinergi.js';
import { buatTeks } from '../../teks.js';
import { buatKatalog } from '../../katalog.js';

const EFEK = [[
	{ stat: 'hp_max', tambah: 150, persen: 0, sasaran: 'semua' },
	{ stat: 'def', tambah: 10, persen: 0, sasaran: 'semua' }
], [
	{ stat: 'atk', tambah: 0, persen: 15, sasaran: 'anggota' },
	{ stat: 'aspd_persen', tambah: 8, persen: 0, sasaran: 'anggota' }
]];
const JSON_KAT = {
	sinergi: {
		prontera: { origin: true, nama: { id: 'Kerajaan Prontera', en: 'Prontera Kingdom' }, ambang: [2, 4], efek: EFEK },
		vanguard: { origin: false, nama: { id: 'Garda', en: 'Vanguard' }, ambang: [2, 4] }
	},
	lore: {
		origin: { prontera: { nama: { id: 'Kerajaan Prontera', en: 'Prontera Kingdom' }, lore: { id: 'ibu kota', en: 'capital' }, icon: 'x', color: '#4dabf7' } },
		kelas: { vanguard: { nama: { id: 'Garda', en: 'Vanguard' }, deskripsi: { id: 'garda depan', en: 'front line' } } }
	}
};

function snap(sinergi) {
	return { state: { saya: { sinergi } } };
}
function deps(bahasa = 'id') {
	const teks = buatTeks({ pref: { bahasa } });
	return { t: teks.t, bahasa, katalog: buatKatalog(JSON_KAT) };
}

describe('renderSinergi', () => {
	it('ikon per sinergi dengan jumlah/ambang berikut dan kelas aktif', () => {
		const h = renderSinergi(snap([
			{ id: 'prontera', jumlah: 3, tingkatAktif: 1, origin: true },
			{ id: 'vanguard', jumlah: 1, tingkatAktif: 0, origin: false }
		]), deps());
		expect(h).toContain('class="ikon aktif" data-sinergi="prontera"');
		expect(h).toContain('class="ikon" data-sinergi="vanguard"');
		expect(h).toContain('3/4');
		expect(h).toContain('1/2');
		expect(h).toContain('background:#4dabf7');
		expect(h).toContain('title="Kerajaan Prontera"');
		expect(h).toContain('>PR<');
		expect(h).toContain('>VA<');
	});
	it('semua ambang tercapai: pakai ambang terakhir; tanpa sinergi: kosong', () => {
		expect(renderSinergi(snap([{ id: 'prontera', jumlah: 5, tingkatAktif: 2, origin: true }]), deps())).toContain('5/4');
		expect(renderSinergi(snap([]), deps())).toBe('');
		expect(ambangBerikut([2, 4, 6], 4)).toBe(4);
	});
});

describe('kodeLencana (R7): dua huruf tetap dari id, bukan dari nama', () => {
	it('satu kata: dua huruf pertama; dua kata atau lebih: huruf pertama dua kata pertama', () => {
		expect(kodeLencana('prontera')).toBe('PR');
		expect(kodeLencana('vanguard')).toBe('VA');
		expect(kodeLencana('st_capitolina')).toBe('SC');
		expect(kodeLencana('martial_artist')).toBe('MA');
		expect(kodeLencana('a_b_c')).toBe('AB');
		expect(kodeLencana('saint')).toBe('SA');
		expect(kodeLencana('PRONTERA')).toBe('PR');
		expect(kodeLencana('x')).toBe('X');
		expect(kodeLencana('')).toBe('?');
	});

	it('pengecualian tabrakan: performer -> PF, peco tetap PE', () => {
		expect(kodeLencana('performer')).toBe('PF');
		expect(kodeLencana('peco')).toBe('PE');
	});

	const BERKAS = fileURLToPath(new URL('../../../../../server/data/catur/sinergi.yml', import.meta.url));
	/** Semua id origin dan kelas produksi: kunci tingkat-2 di bawah origin:/kelas:. */
	function idProduksi() {
		const hasil = [];
		let bagian = null;
		for (const baris of readFileSync(BERKAS, 'utf8').split(/\r?\n/)) {
			const b = /^([a-z]+):\s*$/.exec(baris);
			if (b) {
				bagian = b[1];
				continue;
			}
			const k = /^ {2}([a-z0-9_]+):\s*$/.exec(baris);
			if (k && (bagian === 'origin' || bagian === 'kelas')) {
				hasil.push(k[1]);
			}
		}
		return hasil;
	}

	it.skipIf(!existsSync(BERKAS))('SEMUA id produksi sinergi.yml berkode unik dan dua huruf kapital', () => {
		const ids = idProduksi();
		expect(ids.length).toBeGreaterThanOrEqual(26);
		const kode = ids.map(kodeLencana);
		for (const k of kode) {
			expect(k).toMatch(/^[A-Z]{2}$/);
		}
		const kembar = ids.filter((id, i) => kode.indexOf(kode[i]) !== i);
		expect(kembar).toEqual([]);
	});

	it.each(['en', 'id'])('lencana sama di bahasa %s; title memuat nama lengkap menurut bahasa', (bahasa) => {
		const kat = buatKatalog({
			sinergi: {
				st_capitolina: { origin: true, nama: { id: 'Kuil St. Capitolina', en: 'Sanctuary Abbey' }, ambang: [2] },
				saint: { origin: false, nama: { id: 'Orang Suci', en: 'Saint' }, ambang: [2] }
			},
			lore: { origin: { st_capitolina: { color: '#fff3bf' } } }
		});
		const teks = buatTeks({ pref: { bahasa } });
		const h = renderSinergi(snap([
			{ id: 'st_capitolina', jumlah: 1, tingkatAktif: 0, origin: true },
			{ id: 'saint', jumlah: 1, tingkatAktif: 0, origin: false }
		]), { t: teks.t, bahasa, katalog: kat });
		const lencana = [...h.matchAll(/data-sinergi="([^"]+)" title="([^"]*)"[^>]*>([^<]*)</g)].map(([, id, title, kode]) => ({ id, title, kode }));
		expect(lencana.map((l) => l.kode)).toEqual(['SC', 'SA']);
		expect(lencana[0].title).toBe(bahasa === 'en' ? 'Sanctuary Abbey' : 'Kuil St. Capitolina');
	});

	it('warna lore bukan #hex jatuh ke cadangan (tidak bisa menyisipkan CSS)', () => {
		const kat = buatKatalog({
			sinergi: { jahat: { origin: true, nama: { id: 'Jahat', en: 'Evil' }, ambang: [2] } },
			lore: { origin: { jahat: { color: 'red;background-image:url(x)' } } }
		});
		const h = renderSinergi(snap([{ id: 'jahat', jumlah: 1, tingkatAktif: 0, origin: true }]), { bahasa: 'id', katalog: kat });
		expect(h).toContain('style="background:#556"');
	});
});

describe('renderLore', () => {
	it('origin ID vs EN', () => {
		const id = renderLore('prontera', deps('id'));
		const en = renderLore('prontera', deps('en'));
		expect(id.judul).toBe('Kerajaan Prontera');
		expect(id.isi).toContain('ibu kota');
		expect(id.isi).toContain('data-aksi="tutup"');
		expect(en.judul).toBe('Prontera Kingdom');
		expect(en.isi).toContain('capital');
	});
	it('ambang dengan efek: satu baris per ambang', () => {
		const h = renderLore('prontera', deps('id')).isi;
		expect(h).toContain('<b>2</b>: +150 HP maks (semua), +10 DEF (semua)');
		expect(h).toContain('<b>4</b>: +15% ATK (anggota), +8% kecepatan serang (anggota)');
		expect(renderLore('prontera', deps('en')).isi).toContain('+150 Max HP (all)');
	});
	it('tanpa efek: hanya jumlah; kelas memakai deskripsi', () => {
		const r = renderLore('vanguard', deps('en'));
		expect(r.isi).toContain('<li><b>2</b></li><li><b>4</b></li>');
		expect(r.isi).toContain('front line');
	});
});
