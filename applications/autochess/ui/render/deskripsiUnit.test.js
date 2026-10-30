import { describe, it, expect } from 'vitest';
import { renderDeskripsiUnit } from './deskripsiUnit.js';
import { buatKatalog } from '../../katalog.js';
import { buatTeks } from '../../teks.js';

const STAT = (hp, atk, aspd) => ({
	hp, atk, matk: 5, def: 6, mdef: 7, aspd, jangkauan: 1, sp_awal: 10, sp_maks: 80, elemen: 'Neutral', ukuran: 'Large', ras: 'Human'
});

const SKILL = {
	id: 'KN_BOWLINGBASH', lv: 5,
	nama: { id: 'Hantaman Bowling', en: 'Bowling Bash' },
	ringkasan: {
		id: 'Serangan fisik area (splash 2 petak), 280 % ATK, 30 % peluang Pingsan 2,0 d; dirapal saat SP penuh (80)',
		en: 'Physical attack, enemy area (splash 2 cells), 280% ATK, 30% chance of Stun 2.0s; cast when SP is full (80)'
	},
	jenis: 'fisik', target: 'area_musuh', rasio: 2.8,
	status: { nama: 'pingsan', peluang: 30, durasi_ms: 2000 },
	jangkauan: 1, splash: 2, cast_ms: 700, sp_maks: 80
};

const katalog = buatKatalog({
	units: {
		ksatria: {
			nama: { id: 'Ksatria', en: 'Knight' }, tier: 3, origin: 'prontera', kelas: 'vanguard',
			stat_bintang: [STAT(1000, 80, 0.75), STAT(1800, 144, 0.8), STAT(3240, 259, 0.85)],
			skill: SKILL,
			lore: { id: '', en: 'A sworn knight of <Prontera>.' }
		},
		tanpa_stat: { nama: { id: 'Hantu', en: 'Ghost' }, tier: 1, origin: 'prontera', kelas: 'vanguard' }
	},
	sinergi: {
		prontera: { nama: { id: 'Kerajaan Prontera', en: 'Prontera Kingdom' }, origin: true, ambang: [2] },
		vanguard: { nama: { id: 'Garda', en: 'Vanguard' }, ambang: [2] }
	}
});

function deps(bahasa = 'id') {
	const teks = buatTeks({ pref: { bahasa } });
	return { t: teks.t, bahasa, katalog };
}

const INFO = { sumber: 'bangku', bidakId: 7, unitId: 'ksatria', bintang: 2, sendiri: true, nama: 'Ksatria' };

/** Isi sel-sel satu baris tabel stat (data-stat=k), sebagai teks. */
function sel(html, k) {
	const baris = html.match(new RegExp(`<tr data-stat="${k}">(.*?)</tr>`))?.[1] ?? '';
	return [...baris.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) => m[1]);
}

describe('renderDeskripsiUnit (K16)', () => {
	it('judul jendela, nama sesuai bahasa, Tier, ★', () => {
		const id = renderDeskripsiUnit(INFO, deps('id'));
		expect(id.judul).toBe('Deskripsi Unit');
		expect(id.isi).toContain('<div class="nama">Ksatria</div>');
		expect(id.isi).toContain('Tier 3');
		expect(id.isi).toContain('★2');
		const en = renderDeskripsiUnit(INFO, deps('en'));
		expect(en.judul).toBe('Unit Description');
		expect(en.isi).toContain('<div class="nama">Knight</div>');
	});

	it('tiga kolom ★1/★2/★3 dan kolom bintang info disorot (kelas \'aktif\' pada kolom ke-2 untuk bintang 2)', () => {
		const { isi } = renderDeskripsiUnit(INFO, deps());
		expect(isi).toContain('<th class="b1">★1</th><th class="b2 aktif">★2</th><th class="b3">★3</th>');
		expect(sel(isi, 'hp')).toEqual(['1000', '1800', '3240']);
		expect(sel(isi, 'atk')).toEqual(['80', '144', '259']);
		expect(sel(isi, 'aspd')).toEqual(['0.75', '0.80', '0.85']);
		expect(isi).toMatch(/<tr data-stat="hp"><th>HP<\/th><td class="b1">1000<\/td><td class="b2 aktif">1800<\/td><td class="b3">3240<\/td><\/tr>/);
		expect(isi.match(/<tr data-stat=/g)).toHaveLength(8);
		expect(isi).toContain('<div class="stat-kecil">Neutral · Large · Human</div>');
		// bintang 3: kolom ke-3 yang aktif
		const tiga = renderDeskripsiUnit({ ...INFO, bintang: 3 }, deps()).isi;
		expect(tiga).toContain('<th class="b3 aktif">★3</th>');
		expect(tiga).not.toContain('b2 aktif');
	});

	it('blok skill memuat nama (Lv), t(\'skill.jenis.fisik\'), t(\'skill.target.area_musuh\'), rasio \'280 %\', status \'Pingsan 30 % 2,0 d\', jangkauan/splash/cast, dan ringkasan bahasa aktif', () => {
		const d = deps('id');
		const { isi } = renderDeskripsiUnit(INFO, d);
		expect(isi).toContain('Hantaman Bowling (Lv 5)');
		expect(isi).toContain(d.t('skill.jenis.fisik'));
		expect(isi).toContain(d.t('skill.target.area_musuh'));
		expect(isi).toContain('<dt>Rasio</dt><dd>280 %</dd>');
		expect(isi).toContain('Pingsan 30 % 2,0 d');
		expect(isi).toContain('<dt>Jangkauan</dt><dd>1 petak</dd>');
		expect(isi).toContain('<dt>Splash</dt><dd>2 petak</dd>');
		expect(isi).toContain(`<dt>${d.t('label.cast')}</dt><dd>0,7 d</dd>`);
		expect(isi).toContain(`<dt>${d.t('label.sp_penuh')}</dt><dd>80</dd>`);
		expect(isi).toContain(`<div class="skill-ringkas">${SKILL.ringkasan.id}</div>`);

		const e = deps('en');
		const en = renderDeskripsiUnit(INFO, e).isi;
		expect(en).toContain('Bowling Bash (Lv 5)');
		expect(en).toContain(e.t('skill.jenis.fisik'));
		expect(en).toContain(e.t('skill.target.area_musuh'));
		expect(en).toContain('<dt>Ratio</dt><dd>280%</dd>');
		expect(en).toContain('Stun 30% 2.0s');
		expect(en).toContain('<dt>Range</dt><dd>1 cell</dd>');
		expect(en).toContain('<dt>Splash</dt><dd>2 cells</dd>');
		expect(en).toContain(`<dt>${e.t('label.cast')}</dt><dd>0.7s</dd>`);
		expect(en).toContain(`<div class="skill-ringkas">${SKILL.ringkasan.en}</div>`);
	});

	it('jangkauan/splash pecahan dalam petak papan: satu desimal, koma di ID; bulat tanpa desimal', () => {
		const k = buatKatalog({
			units: { pemanah: { nama: { id: 'Pemanah', en: 'Archer' }, tier: 1, skill: { ...SKILL, jangkauan: 2.5, splash: 3.5 } },
				pemburu: { nama: { id: 'Pemburu', en: 'Hunter' }, tier: 4, skill: { ...SKILL, jangkauan: 4, splash: 1 / 3 } } }
		});
		const id = renderDeskripsiUnit({ ...INFO, unitId: 'pemanah' }, { ...deps('id'), katalog: k }).isi;
		expect(id).toContain('<dt>Jangkauan</dt><dd>2,5 petak</dd>');
		expect(id).toContain('<dt>Splash</dt><dd>3,5 petak</dd>');
		const en = renderDeskripsiUnit({ ...INFO, unitId: 'pemanah' }, { ...deps('en'), katalog: k }).isi;
		expect(en).toContain('<dt>Range</dt><dd>2.5 cells</dd>');
		expect(en).toContain('<dt>Splash</dt><dd>3.5 cells</dd>');
		const bulat = renderDeskripsiUnit({ ...INFO, unitId: 'pemburu' }, { ...deps('id'), katalog: k }).isi;
		expect(bulat).toContain('<dt>Jangkauan</dt><dd>4 petak</dd>');
		expect(bulat).toContain('<dt>Splash</dt><dd>0,3 petak</dd>');
	});

	it('skill tanpa rasio/status/splash/cast: baris itu tidak ada', () => {
		const k = buatKatalog({
			units: { pendeta: { nama: { id: 'Pendeta', en: 'Priest' }, tier: 2, skill: { ...SKILL, jenis: 'dukung', target: 'musuh', rasio: 0, status: undefined, splash: 0, cast_ms: 0 } } }
		});
		const { isi } = renderDeskripsiUnit({ ...INFO, unitId: 'pendeta' }, { ...deps(), katalog: k });
		expect(isi).toContain('Dukungan');
		expect(isi).not.toContain('<dt>Rasio</dt>');
		expect(isi).not.toContain('skill-status');
		expect(isi).not.toContain('<dt>Splash</dt>');
		expect(isi).not.toContain(`<dt>${deps().t('label.cast')}</dt>`);
		expect(isi).toContain('<dt>Jangkauan</dt>');
	});

	it('lore: id kosong -> tampil EN', () => {
		const id = renderDeskripsiUnit(INFO, deps('id')).isi;
		expect(id).toContain('<div class="judul-lore">Lore</div>');
		expect(id).toContain('<p class="lore">A sworn knight of &lt;Prontera&gt;.</p>');
		const en = renderDeskripsiUnit(INFO, deps('en')).isi;
		expect(en).toContain('A sworn knight of &lt;Prontera&gt;.');
		// lore ID terisi -> dipakai pada bahasa id
		const k = buatKatalog({ units: { a: { nama: { id: 'A', en: 'A' }, lore: { id: 'kisah', en: 'story' } } } });
		expect(renderDeskripsiUnit({ ...INFO, unitId: 'a' }, { ...deps('id'), katalog: k }).isi).toContain('<p class="lore">kisah</p>');
		expect(renderDeskripsiUnit({ ...INFO, unitId: 'a' }, { ...deps('en'), katalog: k }).isi).toContain('<p class="lore">story</p>');
	});

	it('creep (statBintang null) -> tanpa tabel stat, tanpa galat', () => {
		const tanpa = renderDeskripsiUnit({ ...INFO, unitId: 'tanpa_stat', bintang: 1 }, deps()).isi;
		expect(tanpa).toContain('<div class="nama">Hantu</div>');
		expect(tanpa).not.toContain('<table');
		expect(tanpa).not.toContain('class="skill');
		expect(tanpa).not.toContain('class="lore"');
		const creep = renderDeskripsiUnit({ sumber: 'papan', entityId: 99, unitId: null, bintang: 0, sendiri: false, nama: 'Dracula' }, deps());
		expect(creep.isi).toContain('<div class="nama">Dracula</div>');
		expect(creep.isi).not.toContain('<table');
		expect(creep.isi).not.toContain('Tier');
		expect(creep.isi).not.toContain('★');
		expect(creep.isi).not.toContain('data-aksi="lore"');
		// tanpa nama sama sekali: #entityId
		expect(renderDeskripsiUnit({ entityId: 5, unitId: null }, deps()).isi).toContain('<div class="nama">#5</div>');
	});

	it('origin/kelas dirender sebagai [data-aksi="lore"][data-id]', () => {
		const { isi } = renderDeskripsiUnit(INFO, deps());
		expect(isi).toContain('<span class="sinergi" data-aksi="lore" data-id="prontera">Kerajaan Prontera</span>');
		expect(isi).toContain('<span class="sinergi" data-aksi="lore" data-id="vanguard">Garda</span>');
		expect(isi).toMatch(/data-id="prontera">Kerajaan Prontera<\/span> · <span class="sinergi" data-aksi="lore" data-id="vanguard"/);
	});
});
