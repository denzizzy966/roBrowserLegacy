import { describe, it, expect, vi } from 'vitest';

import StatusState from 'DB/Status/StatusState.js';
import EffectConst from 'DB/Effects/EffectConst.js';
import { EFEK_BADAN_STATUS, gambarBarSP, buatManajerEfek } from './efek.js';
import { EFEK_STATUS, JENIS_DAMAGE_HEAL, buatPenerima, amankan } from './pesan.js';

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
