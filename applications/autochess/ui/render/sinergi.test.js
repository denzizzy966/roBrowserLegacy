import { describe, it, expect } from 'vitest';
import { renderSinergi, renderLore, inisial, ambangBerikut, petaInisial } from './sinergi.js';
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

describe('inisial unik (verifikasi isu 3)', () => {
	// Nama sungguhan katalog server: EN "Sanctuary Abbey" dan "Saint"
	// sama-sama "SA" (ditambah "Shadow Assassin").
	const KAT_SA = {
		sinergi: {
			st_capitolina: { origin: true, nama: { id: 'Kuil St. Capitolina', en: 'Sanctuary Abbey' }, ambang: [2] },
			saint: { origin: false, nama: { id: 'Orang Suci', en: 'Saint' }, ambang: [2] },
			assassin: { origin: false, nama: { id: 'Pembunuh Bayangan', en: 'Shadow Assassin' }, ambang: [2] },
			martial_artist: { origin: false, nama: { id: 'Pendekar Beladiri', en: 'Martial Artist' }, ambang: [2] }
		},
		lore: { origin: { st_capitolina: { color: '#fff3bf' } } }
	};
	function lencana(h) {
		return [...h.matchAll(/data-sinergi="([^"]+)" title="([^"]*)"[^>]*>([^<]*)</g)]
			.map(([, id, title, teks]) => ({ id, title, teks }));
	}

	it.each(['en', 'id'])('st_capitolina vs saint (%s): inisial berbeda, title nama lengkap', (bahasa) => {
		const teks = buatTeks({ pref: { bahasa } });
		const d = { t: teks.t, bahasa, katalog: buatKatalog(KAT_SA) };
		const h = renderSinergi(snap([
			{ id: 'st_capitolina', jumlah: 1, tingkatAktif: 0, origin: true },
			{ id: 'saint', jumlah: 1, tingkatAktif: 0, origin: false }
		]), d);
		const [abbey, saint] = lencana(h);
		expect(abbey.teks).not.toBe(saint.teks);
		expect(abbey.teks).toHaveLength(2);
		expect(saint.teks).toHaveLength(2);
		expect(abbey.title).toBe(KAT_SA.sinergi.st_capitolina.nama[bahasa]);
		expect(saint.title).toBe(KAT_SA.sinergi.saint.nama[bahasa]);
	});

	it('inisial stabil: tidak bergantung pada sinergi lain di papan', () => {
		const d = { t: buatTeks({ pref: { bahasa: 'en' } }).t, bahasa: 'en', katalog: buatKatalog(KAT_SA) };
		const sendiri = lencana(renderSinergi(snap([{ id: 'saint', jumlah: 1, tingkatAktif: 0 }]), d))[0].teks;
		const bersama = lencana(renderSinergi(snap([
			{ id: 'assassin', jumlah: 1, tingkatAktif: 0 },
			{ id: 'saint', jumlah: 1, tingkatAktif: 0 }
		]), d))[1].teks;
		expect(sendiri).toBe(bersama);
	});

	it('petaInisial: semua unik, yang tak bertabrakan memakai inisial biasa', () => {
		const peta = petaInisial([
			['saint', 'Saint'], ['st_capitolina', 'Sanctuary Abbey'], ['assassin', 'Shadow Assassin'],
			['prontera', 'Prontera Kingdom'], ['x', 'A'], ['y', 'A']
		]);
		expect(new Set(peta.values()).size).toBe(peta.size);
		expect(peta.get('prontera')).toBe('PK');
		expect(peta.get('assassin')).toBe('SA'); // id pertama menurut urutan
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
