import { describe, it, expect, vi } from 'vitest';

import StatusState from 'DB/Status/StatusState.js';
import EffectConst from 'DB/Effects/EffectConst.js';
import { EFEK_BADAN_STATUS, gambarBarSP, buatManajerEfek } from './efek.js';
import { EFEK_STATUS, JENIS_DAMAGE_HEAL, buatPenerima, amankan } from './pesan.js';
import { JENIS_MISS } from '../harness/tempur.js';

const TICK = 5000;

// Entity palsu secukupnya: hanya field yang efek.js sentuh.
function entityPalsu(gid, x = 10, y = 20) {
	return {
		GID: gid,
		objecttype: 0,
		position: [x, y, 0],
		ACTION: { IDLE: 0, READYFIGHT: 4, HURT: 6, SKILL: 12, ATTACK: -2 },
		setAction: vi.fn(),
		resetRoute: vi.fn(),
		lookTo: vi.fn(),
		cast: { set: vi.fn(), clean: vi.fn() },
		life: { hp: 100, hp_max: 100, sp: -1, sp_max: -1, update: vi.fn() },
		bodyState: 0,
		healthState: 0,
		__m2MaxHP: 100
	};
}

function siapkan(entities) {
	const peta = new Map(entities.map((e) => [e.GID, e]));
	const deps = {
		EntityManager: { get: (gid) => peta.get(gid) || null },
		EffectManager: {
			spam: vi.fn(),
			remove: vi.fn(),
			endRepeat: vi.fn(),
			spamSkill: vi.fn(),
			spamSkillCast: vi.fn(),
			spamSkillBeforeHit: vi.fn(),
			spamSkillHit: vi.fn()
		},
		Damage: { add: vi.fn(), TYPE: { HEAL: 1, MISS: 2, DAMAGE: 4, ENEMY: 8, CRIT: 16 } },
		Renderer: { tick: TICK },
		Altitude: { getCellHeight: vi.fn(() => 3) },
		SkillEffect: {},
		hidupkanBar: vi.fn(() => true),
		mainkanAksi: vi.fn(() => true),
		log: vi.fn()
	};
	return { deps, efek: buatManajerEfek(deps) };
}

describe('efek.js', () => {
	it('mulaiSkill memutar ACTION.SKILL, cast.set, dan spamSkillCast', () => {
		const wiz = entityPalsu(1);
		const sasaran = entityPalsu(4, 15, 25);
		const { deps, efek } = siapkan([wiz, sasaran]);

		efek.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 1200 });

		expect(wiz.resetRoute).toHaveBeenCalledWith(false);
		const aksi = wiz.setAction.mock.calls[0][0];
		expect(aksi.action).toBe(12);
		// Seperti RO: selama cast pose skill ditahan di frame pertama.
		expect(aksi.play).toBe(false);
		expect(wiz.cast.set).toHaveBeenCalledWith(1200);
		expect(wiz.lookTo).toHaveBeenCalledWith(15, 25);
		expect(deps.EffectManager.spamSkillCast).toHaveBeenCalledWith(89, 1, TICK, 1);
		const efekDiSpam = deps.EffectManager.spam.mock.calls.map((c) => c[0].effectId);
		// Aura cast di perapal dan penanda area di tanah (skill tanah, dst 0).
		expect(efekDiSpam).toContain(EffectConst.EF_BEGINSPELL);
		expect(efekDiSpam).toContain(EffectConst.EF_GROUNDSAMPLE);

		// Cast instan pada unit: tanpa cast bar, tanpa aura, pose langsung main.
		const ds = entityPalsu(2);
		const s2 = siapkan([ds, sasaran]);
		s2.efek.mulaiSkill({ src: 2, skid: 46, lv: 1, dst: 4, x: 15, y: 25, castMs: 0 });
		expect(ds.cast.set).not.toHaveBeenCalled();
		expect(ds.setAction.mock.calls[0][0].play).toBe(true);
		expect(s2.deps.EffectManager.spamSkillCast).toHaveBeenCalledWith(46, 2, TICK, 2);
		expect(s2.deps.EffectManager.spam).not.toHaveBeenCalled();

		// Cast yang tak pernah kena (ronde berakhir) melepas pose ke IDLE.
		const tertunda = [];
		const s3 = siapkan([entityPalsu(1)]);
		const wiz3 = s3.deps.EntityManager.get(1);
		const efek3 = buatManajerEfek({ ...s3.deps, tunda: (fn, ms) => tertunda.push({ fn, ms }) });
		efek3.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 1000 });
		wiz3.action = 12;
		expect(tertunda[0].ms).toBeGreaterThan(1000);
		tertunda[0].fn();
		expect(wiz3.setAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: 0, play: true }));
		// ...tetapi cast yang sudah kena tidak disentuh lagi.
		efek3.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 1000 });
		efek3.kenaSkill({ src: 1, skid: 89, lv: 5, x: 15, y: 25, kena: [] });
		const jumlah = wiz3.setAction.mock.calls.length;
		tertunda[1].fn();
		expect(wiz3.setAction.mock.calls.length).toBe(jumlah);

		// Perapal yang tak dikenal dilaporkan, bukan dilempar.
		expect(() => efek.mulaiSkill({ src: 99, skid: 5, dst: 4, castMs: 0 })).not.toThrow();
		expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('99'));
	});

	it('kenaSkill memanggil spamSkill, spamSkillHit, Damage.TYPE.HEAL untuk heal, dan HURT untuk damage', () => {
		const wiz = entityPalsu(1);
		const kawan = entityPalsu(2);
		const poring = entityPalsu(4, 15, 25);
		poring.objecttype = 5;
		const { deps, efek } = siapkan([wiz, kawan, poring]);

		// Skill tanah: efek utama di pusat sel, tidak menempel ke korban.
		efek.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 1000 });
		efek.kenaSkill({
			src: 1, skid: 89, lv: 5, x: 15, y: 25,
			kena: [
				{ dst: 4, amount: 300, hpSisa: 200, jenis: 0 },
				{ dst: 2, amount: 50, hpSisa: 90, jenis: JENIS_DAMAGE_HEAL }
			]
		});

		expect(wiz.cast.clean).toHaveBeenCalled();
		expect(deps.EffectManager.spamSkill).toHaveBeenCalledWith(89, 4, [15, 25, 3], TICK, 1);
		expect(deps.EffectManager.spamSkillBeforeHit).toHaveBeenCalledWith(89, 4, TICK, 1);
		expect(deps.EffectManager.spamSkillHit).toHaveBeenCalledWith(89, 4, TICK, 1);
		expect(deps.EffectManager.spamSkillHit).toHaveBeenCalledWith(89, 2, TICK, 1);

		expect(deps.hidupkanBar).toHaveBeenCalledWith(poring.life, 200, 100);
		expect(deps.hidupkanBar).toHaveBeenCalledWith(kawan.life, 90, 100);

		const D = deps.Damage.TYPE;
		expect(deps.Damage.add).toHaveBeenCalledWith(300, poring, TICK, null, D.DAMAGE | D.ENEMY);
		expect(deps.Damage.add).toHaveBeenCalledWith(50, kawan, TICK, null, D.HEAL);
		expect(deps.mainkanAksi).toHaveBeenCalledWith(poring, poring.ACTION.HURT, poring.ACTION.IDLE);
		// Yang dipulihkan tidak tersentak.
		expect(deps.mainkanAksi).not.toHaveBeenCalledWith(kawan, expect.anything(), expect.anything());

		// Skill unit (dst bukan 0): efek menempel ke korban (posisi null),
		// seperti onEntityUseSkillToAttack di MapEngine.
		const s2 = siapkan([entityPalsu(3), entityPalsu(4, 15, 25)]);
		s2.efek.mulaiSkill({ src: 3, skid: 5, lv: 1, dst: 4, x: 15, y: 25, castMs: 0 });
		s2.efek.kenaSkill({ src: 3, skid: 5, lv: 1, x: 15, y: 25, kena: [{ dst: 4, amount: 10, hpSisa: 90, jenis: 0 }] });
		expect(s2.deps.EffectManager.spamSkill).toHaveBeenCalledWith(5, 4, null, TICK, 3);

		// Korban beku tidak memutar HURT: pose bekunya akan rusak.
		const beku = entityPalsu(4, 15, 25);
		beku.bodyState = StatusState.BodyState.FREEZE;
		const s3 = siapkan([entityPalsu(1), beku]);
		s3.efek.kenaSkill({ src: 1, skid: 89, lv: 5, x: 15, y: 25, kena: [{ dst: 4, amount: 10, hpSisa: 90, jenis: 0 }] });
		expect(s3.deps.mainkanAksi).not.toHaveBeenCalled();
	});

	it('kenaSkill tidak menggambar MISS untuk skill dukung (amount 0, jenis NORMAL)', () => {
		const pendeta = entityPalsu(1);
		const kawan = entityPalsu(2);
		const poring = entityPalsu(4, 15, 25);
		const { deps, efek } = siapkan([pendeta, kawan, poring]);

		// Blessing: server mengirim amount 0 berjenis NORMAL per korban.
		efek.kenaSkill({ src: 1, skid: 34, lv: 5, x: 10, y: 20, kena: [{ dst: 2, amount: 0, hpSisa: 100, jenis: 0 }] });
		expect(deps.Damage.add).not.toHaveBeenCalled();
		expect(deps.mainkanAksi).not.toHaveBeenCalled();
		// Efek kena dan bar tetap jalan.
		expect(deps.EffectManager.spamSkillBeforeHit).toHaveBeenCalledWith(34, 2, TICK, 1);
		expect(deps.EffectManager.spamSkillHit).toHaveBeenCalledWith(34, 2, TICK, 1);
		expect(deps.hidupkanBar).toHaveBeenCalledWith(kawan.life, 100, 100);

		// MISS sungguhan (amount 0, jenis MISS) tetap tampil sebagai MISS.
		efek.kenaSkill({ src: 1, skid: 5, lv: 1, x: 15, y: 25, kena: [{ dst: 4, amount: 0, hpSisa: 100, jenis: JENIS_MISS }] });
		expect(deps.Damage.add).toHaveBeenCalledTimes(1);
		expect(deps.Damage.add).toHaveBeenCalledWith(0, poring, TICK, null, deps.Damage.TYPE.MISS);
		expect(deps.mainkanAksi).not.toHaveBeenCalled();
	});

	it('efekAman: efek tabel yang melempar (EffectBodyColor, skill 2381) tidak membatalkan bar dan angka; dicatat sekali per skill', () => {
		const wanderer = entityPalsu(1);
		const a = entityPalsu(4, 15, 25);
		const b = entityPalsu(5, 16, 25);
		const { deps, efek } = siapkan([wanderer, a, b]);
		// Meniru ef_rush_windmill di EffectTable.js: Params.Init.animations undefined.
		const lempar = () => { throw new TypeError("Cannot read properties of undefined (reading 'add')"); };
		deps.EffectManager.spamSkill.mockImplementation(lempar);
		deps.EffectManager.spamSkillHit.mockImplementation(lempar);
		deps.EffectManager.spamSkillCast.mockImplementation(lempar);

		const ev = {
			src: 1, skid: 2381, lv: 1, x: 15, y: 25,
			kena: [
				{ dst: 4, amount: 120, hpSisa: 80, jenis: 0 },
				{ dst: 5, amount: 90, hpSisa: 10, jenis: 0 }
			]
		};
		expect(() => efek.mulaiSkill({ src: 1, skid: 2381, lv: 1, dst: 0, x: 15, y: 25, castMs: 0 })).not.toThrow();
		expect(() => efek.kenaSkill(ev)).not.toThrow();
		expect(() => efek.kenaSkill(ev)).not.toThrow();

		// Setiap korban tetap mendapat bar HP, angka damage, dan HURT, di kedua event.
		expect(deps.hidupkanBar).toHaveBeenCalledWith(a.life, 80, 100);
		expect(deps.hidupkanBar).toHaveBeenCalledWith(b.life, 10, 100);
		expect(deps.hidupkanBar).toHaveBeenCalledTimes(4);
		const D = deps.Damage.TYPE;
		expect(deps.Damage.add).toHaveBeenCalledWith(120, a, TICK, null, D.DAMAGE | D.ENEMY);
		expect(deps.Damage.add).toHaveBeenCalledWith(90, b, TICK, null, D.DAMAGE | D.ENEMY);
		expect(deps.Damage.add).toHaveBeenCalledTimes(4);
		expect(deps.mainkanAksi).toHaveBeenCalledWith(a, a.ACTION.HURT, a.ACTION.IDLE);
		// Efek sebelum-kena tetap diputar walau spamSkillHit melempar.
		expect(deps.EffectManager.spamSkillBeforeHit).toHaveBeenCalledTimes(4);

		// Satu baris log untuk skill 2381, bukan per kena atau per event.
		const baris = deps.log.mock.calls.map((c) => c[0]).filter((t) => t.includes('efek skill 2381 gagal'));
		expect(baris).toHaveLength(1);
		expect(baris[0]).toContain("reading 'add'");

		// Skill lain yang gagal mendapat barisnya sendiri.
		efek.kenaSkill({ src: 1, skid: 89, lv: 1, x: 15, y: 25, kena: [] });
		expect(deps.log.mock.calls.filter((c) => c[0].includes('efek skill 89 gagal'))).toHaveLength(1);
	});

	it('ubahStatus beku/pingsan/tidur/bisu membatalkan cast seperti server', () => {
		const { BodyState } = StatusState;
		const kasus = [
			{ nama: 'bisu', efst: EFEK_STATUS.BISU, badan: 0, keIdle: true },
			{ nama: 'pingsan', efst: EFEK_STATUS.PINGSAN, badan: BodyState.STUN, keIdle: true },
			{ nama: 'tidur', efst: EFEK_STATUS.TIDUR, badan: BodyState.SLEEP, keIdle: true },
			// Setter bodyState FREEZE sendiri memasang pose FREEZE2.
			{ nama: 'beku', efst: EFEK_STATUS.BEKU, badan: BodyState.FREEZE, keIdle: false }
		];
		for (const c of kasus) {
			const tertunda = [];
			const wiz = entityPalsu(1);
			const s = siapkan([wiz]);
			const efek = buatManajerEfek({ ...s.deps, tunda: (fn, ms) => tertunda.push({ fn, ms }) });

			efek.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 3000 });
			wiz.action = wiz.ACTION.SKILL;
			wiz.setAction.mockClear();

			efek.ubahStatus({ entityId: 1, efst: c.efst, aktif: true, durasiMs: 2000 });
			expect(wiz.cast.clean, c.nama).toHaveBeenCalled();
			expect(wiz.__acSkill, c.nama).toBe(null);
			expect(s.deps.EffectManager.remove, c.nama).toHaveBeenCalledWith(null, 1, expect.arrayContaining([EffectConst.EF_BEGINSPELL]));
			expect(wiz.bodyState, c.nama).toBe(c.badan);
			if (c.keIdle) {
				expect(wiz.setAction, c.nama).toHaveBeenCalledWith(expect.objectContaining({ action: wiz.ACTION.IDLE, play: true }));
			} else {
				expect(wiz.setAction, c.nama).not.toHaveBeenCalled();
			}

			// Timer cast basi kini no-op (identitas cast sudah dilupakan).
			wiz.setAction.mockClear();
			tertunda[0].fn();
			expect(wiz.setAction, c.nama).not.toHaveBeenCalled();
		}

		// Racun tidak membatalkan cast; pelepasan status juga tidak.
		const wiz = entityPalsu(1);
		const { efek } = siapkan([wiz]);
		efek.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 3000 });
		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.RACUN, aktif: true, durasiMs: 2000 });
		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.BISU, aktif: false, durasiMs: 0 });
		expect(wiz.cast.clean).not.toHaveBeenCalled();
		expect(wiz.__acSkill).not.toBe(null);
	});

	it('status yang dipasang skill pada perapalnya sendiri tidak memotong pose pelepasan', () => {
		// Asura Strike: EvtSkillKena lalu EvtStatus bisu_diri di tick yang
		// sama. kenaSkill sudah melupakan cast dan memutar pose SKILL->IDLE;
		// bisu tidak boleh memaksa IDLE di tengah animasi itu.
		const champ = entityPalsu(1);
		const { deps, efek } = siapkan([champ]);
		efek.mulaiSkill({ src: 1, skid: 271, lv: 5, dst: 4, x: 15, y: 25, castMs: 2000 });
		efek.kenaSkill({ src: 1, skid: 271, lv: 5, x: 15, y: 25, kena: [{ dst: 4, amount: 999, hpSisa: 0, jenis: 0 }] });
		expect(deps.mainkanAksi).toHaveBeenCalledWith(champ, champ.ACTION.SKILL, champ.ACTION.IDLE);
		champ.action = champ.ACTION.SKILL;
		champ.setAction.mockClear();

		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.BISU, aktif: true, durasiMs: 5000 });
		expect(champ.setAction).not.toHaveBeenCalled();
		expect(champ.healthState & StatusState.HealthState.SILENCE).toBeTruthy();
		expect(champ.__acSkill).toBe(null);
	});

	it('ubahStatus memasang dan melepas efek badan via EffectManager serta mereset effectColor racun', () => {
		const poring = entityPalsu(4);
		const { deps, efek } = siapkan([poring]);
		const { BodyState, HealthState } = StatusState;

		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.BEKU, aktif: true, durasiMs: 3000 });
		expect(poring.bodyState).toBe(BodyState.FREEZE);
		expect(deps.EffectManager.remove).toHaveBeenCalledWith(null, 4, EFEK_BADAN_STATUS[EFEK_STATUS.BEKU]);
		expect(deps.EffectManager.spam).toHaveBeenCalledWith(expect.objectContaining({
			effectId: EFEK_BADAN_STATUS[EFEK_STATUS.BEKU], ownerAID: 4, startTick: TICK
		}));

		// Racun dan bisu bertumpuk di healthState (bitmask), beku tetap.
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.RACUN, aktif: true, durasiMs: 5000 });
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.BISU, aktif: true, durasiMs: 5000 });
		expect(poring.healthState).toBe(HealthState.POISON | HealthState.SILENCE);
		expect(poring.bodyState).toBe(BodyState.FREEZE);

		// Racun dicabut: bit-nya hilang, sehingga EntityState menghitung
		// ulang effectColor tanpa warna racun.
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.RACUN, aktif: false, durasiMs: 0 });
		expect(poring.healthState).toBe(HealthState.SILENCE);

		deps.EffectManager.remove.mockClear();
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.BEKU, aktif: false, durasiMs: 0 });
		expect(poring.bodyState).toBe(0);
		expect(deps.EffectManager.endRepeat).toHaveBeenCalledWith(null, 4, EFEK_BADAN_STATUS[EFEK_STATUS.BEKU]);
		expect(deps.EffectManager.remove).toHaveBeenCalledWith(null, 4, EFEK_BADAN_STATUS[EFEK_STATUS.BEKU]);

		// Prioritas bodyState: beku > pingsan > tidur.
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.TIDUR, aktif: true, durasiMs: 5000 });
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.PINGSAN, aktif: true, durasiMs: 2000 });
		expect(poring.bodyState).toBe(BodyState.STUN);
		efek.ubahStatus({ entityId: 4, efst: EFEK_STATUS.PINGSAN, aktif: false, durasiMs: 0 });
		expect(poring.bodyState).toBe(BodyState.SLEEP);

		// Efst tak dikenal dan entity tak dikenal dilaporkan, bukan dilempar.
		expect(() => efek.ubahStatus({ entityId: 4, efst: 0, aktif: true, durasiMs: 1 })).not.toThrow();
		expect(() => efek.ubahStatus({ entityId: 77, efst: 1, aktif: true, durasiMs: 1 })).not.toThrow();
		expect(deps.log).toHaveBeenCalledTimes(2);
	});

	it('gambarBarSP menggambar bar biru di bawah bar HP pada kanvas life', () => {
		// EntityLife.update() milik roBrowserLegacy SUDAH menggambar baris SP
		// (biru #1863de, y 5-7, kanvas 60x9) bila life.sp dan life.sp_max
		// >= 0 -- dipakai RO untuk anggota party. Kanvas palsu ini meniru
		// bagian update() itu supaya test memeriksa piksel yang benar.
		const isi = [];
		const ctx = { fillStyle: '', fillRect: (x, y, w, h) => isi.push({ warna: ctx.fillStyle, x, y, w, h }) };
		const life = {
			hp: 50, hp_max: 100, sp: -1, sp_max: -1, ctx, canvas: { width: 60, height: 5 },
			update() {
				isi.length = 0;
				this.canvas.height = this.sp > -1 && this.sp_max > -1 ? 9 : 5;
				ctx.fillStyle = '#10ef21';
				ctx.fillRect(1, 1, Math.round(58 * this.hp / this.hp_max), 3);
				if (this.canvas.height === 9) {
					ctx.fillStyle = '#1863de';
					ctx.fillRect(1, 5, Math.round(58 * this.sp / this.sp_max), 3);
				}
			}
		};

		expect(gambarBarSP(life, 45, 90)).toBe(true);
		expect(life.canvas.height).toBe(9);
		expect(isi).toContainEqual({ warna: '#1863de', x: 1, y: 5, w: 29, h: 3 });
		// Bar HP tetap di atas, tidak terhapus.
		expect(isi).toContainEqual({ warna: '#10ef21', x: 1, y: 1, w: 29, h: 3 });

		// SP di luar rentang dijepit; bar tidak pernah melampaui bingkai.
		gambarBarSP(life, 200, 90);
		expect(isi).toContainEqual({ warna: '#1863de', x: 1, y: 5, w: 58, h: 3 });

		// maxSp 0 (Poring): tidak ada bar SP, life tidak disentuh.
		const lifeMob = { hp: 10, hp_max: 10, sp: -1, sp_max: -1, update: vi.fn() };
		expect(gambarBarSP(lifeMob, 0, 0)).toBe(false);
		expect(lifeMob.sp).toBe(-1);
		expect(lifeMob.update).not.toHaveBeenCalled();

		// HP belum dikenal: update() akan MENGHAPUS bar (lihat hidupkanBar),
		// jadi SP disimpan tanpa memanggil update.
		const lifeBaru = { hp: -1, hp_max: -1, sp: -1, sp_max: -1, update: vi.fn() };
		expect(gambarBarSP(lifeBaru, 10, 90)).toBe(true);
		expect(lifeBaru.sp_max).toBe(90);
		expect(lifeBaru.update).not.toHaveBeenCalled();

		expect(gambarBarSP(null, 10, 90)).toBe(false);
	});

	it('terimaPesan memisahkan galat decode dari galat handler', () => {
		const log = vi.fn();
		const data = new ArrayBuffer(7);

		// Galat decode: menyalahkan skema.
		const rusak = buatPenerima({
			dekode: () => { throw new Error('index out of range'); },
			tangani: vi.fn(),
			log
		});
		rusak(data);
		const barisDecode = log.mock.calls.map((c) => c[0]).join('\n');
		expect(barisDecode).toContain('frame tidak dapat didekode (7 byte): index out of range');
		expect(barisDecode).toContain('skema');

		// Galat handler: TIDAK menyalahkan skema.
		log.mockClear();
		const tangani = vi.fn(() => { throw new Error('entity.cast is undefined'); });
		const sehat = buatPenerima({ dekode: () => ({ ok: 1 }), tangani, log });
		sehat(data);
		expect(tangani).toHaveBeenCalledWith({ ok: 1 }, data);
		const barisHandler = log.mock.calls.map((c) => c[0]).join('\n');
		expect(barisHandler).toContain('! galat saat menjalankan pesan: entity.cast is undefined');
		expect(barisHandler).not.toContain('skema');
		expect(barisHandler).not.toContain('didekode');

		// amankan: badan callback antrean dibungkus sendiri, sehingga satu
		// pesan tertahan yang gagal tidak menghentikan sisanya.
		log.mockClear();
		const urutan = [];
		const antre = [
			amankan(() => { urutan.push(1); }, log),
			amankan(() => { throw new Error('boom'); }, log),
			amankan(() => { urutan.push(3); }, log)
		];
		for (const fn of antre) { fn(); }
		expect(urutan).toEqual([1, 3]);
		expect(log).toHaveBeenCalledWith('! galat saat menjalankan pesan: boom');
	});
});

describe('bersihkanStatus (AC6 K3, Review Focus 2)', () => {
	function siapkanDenganDaftar(entities) {
		const r = siapkan(entities);
		r.deps.EntityManager.forEach = (fn) => {
			for (const e of [...entities]) {
				if (fn(e) === false) {
					return;
				}
			}
		};
		return r;
	}

	it('mengosongkan __acStatus, SP, cast, dan bar setiap entity', () => {
		const a = entityPalsu(1);
		const b = entityPalsu(2);
		const polos = entityPalsu(3);
		const { deps, efek } = siapkanDenganDaftar([a, b, polos]);
		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.RACUN, aktif: true, durasiMs: 3000 });
		efek.ubahStatus({ entityId: 2, efst: EFEK_STATUS.BEKU, aktif: true, durasiMs: 3000 });
		efek.ubahSP({ entityId: 1, sp: 20, maxSp: 50 });
		efek.mulaiSkill({ src: 2, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 1200 });
		expect(a.healthState).not.toBe(0);
		expect(b.bodyState).not.toBe(0);
		deps.EffectManager.remove.mockClear();

		expect(efek.bersihkanStatus()).toBe(2);

		expect(a.__acStatus.size).toBe(0);
		expect(b.__acStatus.size).toBe(0);
		expect(a.__acSP).toBeUndefined();
		expect(a.__acMaxSP).toBeUndefined();
		expect(a.life.sp).toBe(-1);
		expect(a.life.sp_max).toBe(-1);
		expect(a.healthState).toBe(0);
		expect(b.bodyState).toBe(0);
		expect(b.__acSkill).toBeNull();
		expect(b.cast.clean).toHaveBeenCalled();
		expect(deps.EffectManager.remove).toHaveBeenCalledWith(null, 1, EFEK_BADAN_STATUS[EFEK_STATUS.RACUN]);
		expect(deps.EffectManager.remove).toHaveBeenCalledWith(null, 2, EFEK_BADAN_STATUS[EFEK_STATUS.BEKU]);
		// Entity tanpa status tidak disentuh.
		expect(polos.__acStatus).toBeUndefined();
		// Status yang dikirim ulang sesudahnya berlaku seperti biasa.
		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.BISU, aktif: true, durasiMs: 1000 });
		expect([...a.__acStatus]).toEqual([EFEK_STATUS.BISU]);
	});

	it('tidak melempar untuk entity yang sudah dibongkar (life/cast hilang) atau EffectManager yang melempar', () => {
		const hilang = entityPalsu(5);
		const sehat = entityPalsu(6);
		const { deps, efek } = siapkanDenganDaftar([hilang, sehat]);
		efek.ubahStatus({ entityId: 5, efst: EFEK_STATUS.TIDUR, aktif: true, durasiMs: 3000 });
		efek.ubahStatus({ entityId: 6, efst: EFEK_STATUS.BUTA, aktif: true, durasiMs: 3000 });
		efek.ubahSP({ entityId: 6, sp: 5, maxSp: 10 });
		// Seperti sesudah EntityManager.remove -> entity.clean().
		hilang.life = null;
		hilang.cast = null;
		hilang.__acSkill = { castMs: 500 };
		deps.EffectManager.endRepeat.mockImplementationOnce(() => {
			throw new Error('efek sudah dibuang');
		});

		expect(() => efek.bersihkanStatus()).not.toThrow();
		expect(hilang.__acStatus.size).toBe(0);
		expect(sehat.__acStatus.size).toBe(0);
		expect(sehat.__acSP).toBeUndefined();
		expect(sehat.life.sp).toBe(-1);
	});

	it('EntityManager tanpa forEach: tidak melakukan apa pun', () => {
		const { efek } = siapkan([entityPalsu(1)]);
		expect(efek.bersihkanStatus()).toBe(0);
	});
});


// AC8 K14: nama skill di atas bilah cast. Cast palsu meniru
// Renderer/Entity/EntityCast.js secukupnya: set/remove/clean, render yang
// menaruh kanvas di lapisan overlay dan melepas diri saat waktu habis, dan
// clean() yang memanggil this.remove() -- jalur yang sama dengan
// Entity.clean() saat despawn.
describe('nama skill di bilah cast (AC8 K14)', () => {
	function elemenPalsu(tag) {
		return {
			tag,
			className: '',
			textContent: '',
			style: {},
			parentNode: null,
			remove() {
				if (this.parentNode) {
					this.parentNode.anak = this.parentNode.anak.filter((x) => x !== this);
					this.parentNode = null;
				}
			}
		};
	}
	function lapisanPalsu() {
		return {
			anak: [],
			appendChild(el) {
				el.remove();
				el.parentNode = this;
				this.anak.push(el);
				return el;
			}
		};
	}
	class CastPalsu {
		constructor(lapisan) {
			this.lapisan = lapisan;
			this.display = false;
			this.selesai = false;
			this.canvas = elemenPalsu('canvas');
			this.canvas.width = 60;
			this.canvas.height = 6;
		}
		set(delay) {
			this.display = true;
			this.delay = delay;
		}
		remove() {
			this.display = false;
			this.canvas.remove();
		}
		clean() {
			this.remove();
		}
		render() {
			if (this.selesai) {
				this.remove();
				return;
			}
			this.canvas.style.top = '200px';
			this.canvas.style.left = '370px';
			if (this.canvas.parentNode !== this.lapisan) {
				this.lapisan.appendChild(this.canvas);
			}
		}
	}
	const SKILL_INFO = { 5: { SkillName: 'Bash' }, 89: { SkillName: 'Storm Gust' } };

	function siapkanNama(entities, extra = {}) {
		const lapisan = lapisanPalsu();
		for (const e of entities) {
			e.cast = new CastPalsu(lapisan);
		}
		const r = siapkan(entities);
		r.deps.EntityManager.forEach = (fn) => entities.forEach(fn);
		const dokumen = { createElement: vi.fn((tag) => elemenPalsu(tag)) };
		const efek = buatManajerEfek({ ...r.deps, skillInfo: SKILL_INFO, dokumen, tunda: () => {}, ...extra });
		const label = () => lapisan.anak.filter((x) => x.className === 'nama-skill');
		return { ...r, efek, lapisan, dokumen, label };
	}

	it('EvtSkillMulai ber-cast: label .nama-skill berisi SkillName menempel di atas bilah cast entity', () => {
		const ksatria = entityPalsu(1);
		const { efek, label } = siapkanNama([ksatria]);

		efek.mulaiSkill({ src: 1, skid: 5, lv: 5, dst: 0, x: 15, y: 25, castMs: 800 });
		ksatria.cast.render();

		expect(label()).toHaveLength(1);
		const el = label()[0];
		expect(el.textContent).toBe('Bash');
		// di atas kanvas bilah, dipusatkan pada bilah (kiri + lebar/2)
		expect(parseInt(el.style.top, 10)).toBeLessThan(200);
		expect(el.style.left).toBe('400px');

		// rapal berikutnya: label lama ikut lepas bersama bilah, yang baru memuat nama baru (satu label per entity)
		efek.kenaSkill({ src: 1, skid: 5, lv: 5, x: 15, y: 25, kena: [] });
		expect(label()).toHaveLength(0);
		efek.mulaiSkill({ src: 1, skid: 89, lv: 5, dst: 0, x: 15, y: 25, castMs: 800 });
		ksatria.cast.render();
		expect(label()).toHaveLength(1);
		expect(label()[0].textContent).toBe('Storm Gust');

		// rapal baru menimpa bilah yang masih tampil: tetap satu elemen, teks berganti
		efek.mulaiSkill({ src: 1, skid: 5, lv: 5, dst: 0, x: 15, y: 25, castMs: 800 });
		ksatria.cast.render();
		expect(label()).toHaveLength(1);
		expect(label()[0].textContent).toBe('Bash');
	});

	it('skid tanpa entri SkillInfo, cast instan, atau tanpa skillInfo: tanpa label dan tanpa galat', () => {
		const a = entityPalsu(1);
		const { deps, efek, label, dokumen } = siapkanNama([a]);
		expect(() => {
			efek.mulaiSkill({ src: 1, skid: 4242, lv: 1, dst: 0, x: 15, y: 25, castMs: 800 });
			a.cast.render();
		}).not.toThrow();
		expect(label()).toHaveLength(0);
		expect(dokumen.createElement).not.toHaveBeenCalled();
		expect(deps.log).not.toHaveBeenCalled();

		// cast instan (tanpa bilah) juga tanpa label
		a.cast.remove();
		efek.mulaiSkill({ src: 1, skid: 5, lv: 5, dst: 4, x: 15, y: 25, castMs: 0 });
		a.cast.render();
		expect(label()).toHaveLength(0);

		// skillInfo tidak disuntikkan: tetap jalan
		const b = entityPalsu(2);
		const s2 = siapkanNama([b], { skillInfo: undefined });
		expect(() => {
			s2.efek.mulaiSkill({ src: 2, skid: 5, lv: 5, dst: 0, x: 15, y: 25, castMs: 800 });
			b.cast.render();
		}).not.toThrow();
		expect(s2.label()).toHaveLength(0);
	});

	it('label hilang bersama bilah: bersihkanStatus, despawn (Entity.clean -> cast.clean), cast batal, waktu habis', () => {
		const a = entityPalsu(1);
		const { efek, label } = siapkanNama([a]);
		const mulai = () => {
			efek.mulaiSkill({ src: 1, skid: 5, lv: 5, dst: 0, x: 15, y: 25, castMs: 800 });
			a.cast.render();
			expect(label()).toHaveLength(1);
		};

		mulai();
		efek.bersihkanStatus();
		expect(label()).toHaveLength(0);
		// render sesudah dibersihkan tidak memasang label lama lagi
		a.cast.render();
		expect(label()).toHaveLength(0);

		mulai();
		a.cast.clean(); // Entity.clean() saat EvtDespawn
		expect(label()).toHaveLength(0);

		mulai();
		efek.ubahStatus({ entityId: 1, efst: EFEK_STATUS.PINGSAN, aktif: true, durasiMs: 1000 });
		expect(label()).toHaveLength(0);

		mulai();
		a.cast.selesai = true; // EntityCast.render melepas diri saat persen >= 1
		a.cast.render();
		expect(label()).toHaveLength(0);
	});
});
