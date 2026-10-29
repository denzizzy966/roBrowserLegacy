import { describe, it, expect } from 'vitest';
import { renderSinergi, renderLore, inisial, ambangBerikut } from './sinergi.js';
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
		expect(h).toContain('>KP<');
	});
	it('semua ambang tercapai: pakai ambang terakhir; tanpa sinergi: kosong', () => {
		expect(renderSinergi(snap([{ id: 'prontera', jumlah: 5, tingkatAktif: 2, origin: true }]), deps())).toContain('5/4');
		expect(renderSinergi(snap([]), deps())).toBe('');
		expect(ambangBerikut([2, 4, 6], 4)).toBe(4);
		expect(inisial('Garda')).toBe('GA');
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
