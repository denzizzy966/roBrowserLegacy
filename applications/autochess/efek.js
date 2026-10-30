// Rendering skill, status, dan SP autochess AC2: EvtSkillMulai,
// EvtSkillKena, EvtStatus, dan EvtSP diterjemahkan ke API publik
// roBrowserLegacy -- EffectManager, Damage, EntityCast, EntityLife, dan
// setter bodyState/healthState milik EntityState.
//
// Setiap modul client/src/ yang butuh WebGL atau DOM DISUNTIKKAN lewat
// buatManajerEfek, supaya berkas ini teruji di vitest node tanpa GRF.
// Yang diimpor langsung hanya tabel data murni (StatusState, EffectConst).
//
// Spike AC2 (cobaEfek di main.js, Task 1) membuktikan EffectManager
// bekerja di luar MapEngine apa adanya: Preferences.effect bernilai true
// sejak awal, EffectManager.init dipanggil MapRenderer, dan culling
// render memakai Session.Entity -- spot di pusat papan -- dengan radius 20
// cell, lebih lebar dari papan 16x16. Tidak ada fallback yang dibutuhkan.
//
// Nol berkas client/src/ berubah: semuanya lewat API publik.

import StatusState from 'DB/Status/StatusState.js';
import EffectConst from 'DB/Effects/EffectConst.js';

import { EFEK_STATUS, JENIS_DAMAGE_HEAL } from './pesan.js';
import { JENIS_MISS, JENIS_KRITIKAL, TIPE_PC } from '../harness/tempur.js';

/**
 * Efek SEKALI-PUTAR saat sebuah status MULAI, per EFEK_STATUS. Semua id
 * ini berjenis attachedEntity: true di DB/Effects/EffectTable.js.
 *
 * Ini kilatan "terkena", bukan tampilan yang menetap. Tampilan yang
 * menetap (balok es, bintang pingsan, Zzz, warna racun, "..." bisu)
 * dipasang lewat bodyState/healthState -- jalur yang SAMA dengan yang
 * MapEngine pakai untuk entity lain (onEntityOptionChange ->
 * EntityState.updateBodyState/updateHealthState). Memutar efek-efek
 * di bawah ini dengan persistent: true membuatnya berkedip ulang tiap
 * ~1 detik, yang terbaca sebagai pukulan beruntun (teramati di spike).
 *
 * Buta tidak punya tampilan menetap untuk entity lain di RO (hanya
 * suara; layar gelap khusus Session.Entity), jadi EF_DARKBREATH di sini
 * satu-satunya tanda visualnya.
 */
export const EFEK_BADAN_STATUS = {
	[EFEK_STATUS.BEKU]:    134, // EF_FREEZED
	[EFEK_STATUS.PINGSAN]: 194, // EF_STUNATTACK
	[EFEK_STATUS.TIDUR]:   197, // EF_SLEEPATTACK
	[EFEK_STATUS.RACUN]:   192, // EF_POISONATTACK
	[EFEK_STATUS.BUTA]:    212, // EF_DARKBREATH
	[EFEK_STATUS.BISU]:    193  // EF_SILENCEATTACK
};

// Status yang membuat server membatalkan cast (arena/status.go,
// terapkanStatus: cast = nil). Server tidak mengirim pesan batal, jadi
// client menirunya sendiri saat status ini mulai.
const STATUS_BATAL_CAST = new Set([
	EFEK_STATUS.BEKU,
	EFEK_STATUS.PINGSAN,
	EFEK_STATUS.TIDUR,
	EFEK_STATUS.BISU
]);

// Aura cast yang dicabut saat cast batal; daftar yang sama dengan
// onEntityCastCancel (src/Engine/MapEngine/Entity.js): EF_BEGINSPELL
// sampai EF_BEGINSPELL7 dan varian elemennya.
const EFEK_AURA_CAST = [12, 54, 55, 56, 57, 58, 59, 454, 60, 513];

// Berapa lama sesudah waktu cast habis sebuah cast tanpa EvtSkillKena
// dianggap batal. Lebih dari satu tick server (TickMs) dan sedikit sisa.
const JEDA_CAST_BASI = 1500;

// bodyState hanya memuat SATU nilai; bila beberapa status badan aktif
// sekaligus, yang paling membatasi yang tampil.
const PRIORITAS_BADAN = [
	[EFEK_STATUS.BEKU,    StatusState.BodyState.FREEZE],
	[EFEK_STATUS.PINGSAN, StatusState.BodyState.STUN],
	[EFEK_STATUS.TIDUR,   StatusState.BodyState.SLEEP]
];

// healthState adalah bitmask; status ini boleh bertumpuk.
const BIT_KESEHATAN = [
	[EFEK_STATUS.RACUN, StatusState.HealthState.POISON],
	[EFEK_STATUS.BISU,  StatusState.HealthState.SILENCE],
	[EFEK_STATUS.BUTA,  StatusState.HealthState.BLIND]
];

/**
 * Menyalakan baris SP di bawah bar HP sebuah entity.
 *
 * TIDAK menggambar sendiri: EntityLife.update() roBrowserLegacy sudah
 * menggambar baris SP (bingkai #10189c, isi biru #1863de di y 5-7,
 * kanvas 60x9) bila life.sp dan life.sp_max >= 0 -- baris yang sama yang
 * RO tampilkan untuk anggota party. Karena update() mengukur ulang
 * kanvasnya sendiri tiap panggilan, menggambar di kanvas yang sama dari
 * luar akan terhapus oleh hidupkanBar berikutnya; mengisi field-nya
 * justru membuat SETIAP update() -- termasuk dari hidupkanBar -- ikut
 * menggambar SP.
 *
 * @param {object|null} life  entity.life (EntityLife)
 * @param {number} sp
 * @param {number} maxSp  0 atau kurang: entity tanpa SP (mob), tidak disentuh
 * @returns {boolean} false bila tidak ada yang digambar
 */
export function gambarBarSP(life, sp, maxSp) {
	if (!life || !(maxSp > 0)) {
		return false;
	}
	life.sp = Math.max(0, Math.min(maxSp, sp));
	life.sp_max = maxSp;
	// HP belum dikenal: update() akan MENGHAPUS bar (lihat hidupkanBar di
	// harness/tempur.js). SP sudah tersimpan dan ikut tergambar begitu
	// hidupkanBar pertama berjalan.
	if (life.hp >= 0 && life.hp_max >= 0) {
		life.update();
	}
	return true;
}

// AC8 K14: jarak (px) dari puncak bilah cast ke puncak label nama skill.
const TINGGI_NAMA_SKILL = 14;

/**
 * Menaruh label nama skill (cast.__acNamaSkill) tepat di atas kanvas bilah
 * cast, dipusatkan pada bilah, di lapisan overlay yang sama. Dipanggil
 * sesudah EntityCast.render menempatkan kanvasnya; tidak berbuat apa pun
 * bila bilah sudah lepas (render melepasnya saat waktu habis) atau belum
 * pernah ditempatkan.
 * @param {object} cast entity.cast (EntityCast)
 */
function letakkanNamaSkill(cast) {
	const el = cast.__acNamaSkill;
	const kanvas = cast.canvas;
	if (!el || !cast.display || !kanvas || !kanvas.parentNode) {
		return;
	}
	const atas = parseInt(kanvas.style.top, 10);
	const kiri = parseInt(kanvas.style.left, 10);
	if (!Number.isFinite(atas) || !Number.isFinite(kiri)) {
		return;
	}
	el.style.top = `${atas - TINGGI_NAMA_SKILL}px`;
	el.style.left = `${kiri + Math.round(kanvas.width / 2)}px`;
	if (el.parentNode !== kanvas.parentNode) {
		kanvas.parentNode.appendChild(el);
	}
}

/** Mencabut dan melupakan label nama skill sebuah bilah cast (bila ada). */
function lepasNamaSkill(cast) {
	const el = cast && cast.__acNamaSkill;
	if (!el) {
		return;
	}
	cast.__acNamaSkill = null;
	if (typeof el.remove === 'function') {
		el.remove();
	}
}

/**
 * Mengaitkan label nama skill ke SATU instance EntityCast (sekali per
 * instance, tanpa mengubah client/src): render() asli lalu letakkan label;
 * remove() asli lalu cabut label. Semua jalur pembersihan bilah lewat
 * remove(): clean() (kenaSkill, cast batal, bersihkanStatus, dan
 * Entity.clean saat despawn) dan render() saat waktu cast habis -- jadi
 * label tidak pernah tertinggal tanpa bilahnya.
 * @param {object} cast entity.cast (EntityCast)
 */
function kaitkanBilahCast(cast) {
	if (cast.__acNamaKait) {
		return;
	}
	cast.__acNamaKait = true;
	const renderAsli = cast.render;
	const removeAsli = cast.remove;
	cast.render = function (...arg) {
		const hasil = renderAsli.apply(this, arg);
		letakkanNamaSkill(this);
		return hasil;
	};
	cast.remove = function (...arg) {
		const hasil = removeAsli.apply(this, arg);
		lepasNamaSkill(this);
		return hasil;
	};
}

/**
 * Membuat penerjemah event skill/status/SP ke renderer roBrowserLegacy.
 *
 * @param {object} d
 * @param {{get: function(number): object}} d.EntityManager
 * @param {object} d.EffectManager  Renderer/EffectManager.js (statis)
 * @param {object} d.Damage  Renderer/Effects/Damage.js (add, TYPE)
 * @param {{tick: number}} d.Renderer
 * @param {{getCellHeight: function(number, number): number}} d.Altitude
 * @param {object} [d.SkillEffect]  DB/Skills/SkillEffect.js; dibaca untuk
 *   hideCastBar/hideCastAura seperti onEntityCastSkill
 * @param {object} [d.skillInfo]  DB/Skills/SkillInfo.js; SkillName per skid
 *   untuk label nama di atas bilah cast (AC8 K14). Disuntikkan agar uji
 *   node tidak memuat client/src; tanpa entri = bilah tanpa label.
 * @param {{createElement: function(string): object}} [d.dokumen]  document
 *   (disuntikkan untuk test); tanpa dokumen tidak ada label.
 * @param {function} d.hidupkanBar  harness/tempur.js
 * @param {function} d.mainkanAksi  harness/tempur.js
 * @param {function(string): void} d.log
 * @param {function(function, number): any} [d.tunda]  setTimeout; disuntikkan untuk test
 * @returns {{mulaiSkill: function, kenaSkill: function, ubahStatus: function, ubahSP: function, bersihkanStatus: function}}
 */
export function buatManajerEfek({
	EntityManager, EffectManager, Damage, Renderer, Altitude, SkillEffect = {}, skillInfo = {},
	dokumen = globalThis.document, hidupkanBar, mainkanAksi, log, tunda = (fn, ms) => setTimeout(fn, ms)
}) {
	// Skill yang efek tabelnya pernah melempar; dilaporkan sekali saja.
	const skidGagal = new Set();

	/**
	 * Memutar efek dari tabel efek roBrowserLegacy tanpa membiarkan galat
	 * di dalamnya membatalkan sisa handler. Contoh nyata (soak AC6):
	 * ef_rush_windmill (MI_RUSH_WINDMILL, skill 2381) di
	 * src/DB/Effects/EffectTable.js membaca Params.Init.animations alih-alih
	 * Params.Init.ownerEntity dan melempar TypeError dari EffectBodyColor.
	 * Tanpa jaga ini, setiap korban skill itu kehilangan efek kena, bar HP,
	 * angka damage, dan sentakan HURT. Galat dicatat SEKALI per id skill
	 * (bukan per kena); client/src tidak disentuh (D3).
	 *
	 * @param {number} skid
	 * @param {function(): void} fn
	 */
	function efekAman(skid, fn) {
		try {
			fn();
		} catch (err) {
			if (!skidGagal.has(skid)) {
				skidGagal.add(skid);
				log(`! efek skill ${skid} gagal (src): ${err && err.message}`);
			}
		}
	}

	/**
	 * AC8 K14: label nama skill (SkillInfo[skid].SkillName) untuk bilah
	 * cast yang baru dipasang -- paling banyak SATU elemen per entity
	 * (disimpan di entity.cast; rapal yang menimpa bilah yang masih tampil
	 * mengganti teksnya), dibuat saat rapal dan dicabut bersama bilahnya.
	 * Skid tanpa nama, tanpa dokumen, atau cast tanpa render/remove: label
	 * lama dicabut, bilah tampil polos.
	 * @param {object} cast entity.cast
	 * @param {number} skid
	 */
	function pasangNamaSkill(cast, skid) {
		if (!cast) {
			return;
		}
		const nama = skillInfo && skillInfo[skid] && skillInfo[skid].SkillName;
		const bisa = dokumen && typeof dokumen.createElement === 'function'
			&& typeof cast.render === 'function' && typeof cast.remove === 'function';
		if (!nama || !bisa) {
			lepasNamaSkill(cast);
			return;
		}
		kaitkanBilahCast(cast);
		if (!cast.__acNamaSkill) {
			const el = dokumen.createElement('div');
			el.className = 'nama-skill';
			Object.assign(el.style, {
				position: 'absolute',
				zIndex: '1',
				transform: 'translateX(-50%)',
				whiteSpace: 'nowrap',
				pointerEvents: 'none',
				font: 'bold 11px Arial, sans-serif',
				color: '#fff',
				textShadow: '-1px 0 #000, 1px 0 #000, 0 -1px #000, 0 1px #000'
			});
			cast.__acNamaSkill = el;
		}
		cast.__acNamaSkill.textContent = nama;
	}

	/**
	 * EvtSkillMulai. Meniru onEntityCastSkill (MapEngine/Entity.js):
	 * pose skill DITAHAN di frame pertama selama cast dan baru diputar saat
	 * skill lepas (kenaSkill); cast bar, aura cast kuning, dan penanda
	 * sasaran (EF_LOCKON pada unit, EF_GROUNDSAMPLE pada tanah) hanya bila
	 * ada waktu cast. Elemen aura tidak dikirim server, jadi selalu
	 * EF_BEGINSPELL bawaan.
	 */
	function mulaiSkill(ev) {
		const src = EntityManager.get(ev.src);
		if (!src) {
			log(`! skill ${ev.skid} dari entity ${ev.src} yang tak dikenal — abaikan`);
			return;
		}
		const adaCast = ev.castMs > 0;
		const info = SkillEffect[ev.skid] || {};

		// Diingat untuk kenaSkill: EvtSkillKena tidak membawa dst.
		const cast = { skid: ev.skid, dst: ev.dst, castMs: ev.castMs };
		src.__acSkill = cast;

		// Server tidak mengirim pembatalan cast. Bila EvtSkillKena tak
		// pernah tiba (perapal mati, ronde berakhir di tengah cast), pose
		// yang ditahan di frame pertama akan membeku selamanya; dilepas ke
		// IDLE sesudah waktu cast plus jeda. Dibandingkan IDENTITAS cast,
		// supaya cast berikutnya tidak ikut dilepas.
		if (adaCast) {
			tunda(() => {
				if (src.__acSkill !== cast) {
					return;
				}
				src.__acSkill = null;
				if (src.objecttype === TIPE_PC && src.action === src.ACTION.SKILL) {
					src.setAction({ action: src.ACTION.IDLE, frame: 0, repeat: true, play: true });
				}
			}, ev.castMs + JEDA_CAST_BASI);
		}

		// Server mengunci aksi selama cast; sisa jalur lama dibuang.
		src.resetRoute(false);

		// RO: "monsters don't use ACTION.SKILL animation".
		if (src.objecttype === TIPE_PC) {
			src.setAction({
				action: src.ACTION.SKILL,
				frame:  0,
				repeat: false,
				play:   !adaCast,
				next:   adaCast ? false : { action: src.ACTION.IDLE, frame: 0, repeat: true, play: true }
			});
		}

		if (adaCast && !info.hideCastBar) {
			src.cast.set(ev.castMs);
			pasangNamaSkill(src.cast, ev.skid);
		} else {
			lepasNamaSkill(src.cast);
		}

		efekAman(ev.skid, () => EffectManager.spamSkillCast(ev.skid, ev.src, Renderer.tick, ev.src));

		const dst = ev.dst ? EntityManager.get(ev.dst) : null;
		if (dst && dst !== src) {
			src.lookTo(dst.position[0], dst.position[1]);
			if (adaCast) {
				EffectManager.spam({
					effectId: EffectConst.EF_LOCKON,
					ownerAID: ev.dst,
					position: dst.position,
					duration: ev.castMs
				});
			}
		} else if (!ev.dst) {
			src.lookTo(ev.x, ev.y);
			if (adaCast) {
				EffectManager.spam({
					effectId: EffectConst.EF_GROUNDSAMPLE,
					skillId:  ev.skid,
					position: [ev.x, ev.y, Altitude.getCellHeight(ev.x, ev.y)],
					duration: ev.castMs,
					otherAID: ev.src
				});
			}
		}

		if (adaCast && !info.hideCastAura) {
			EffectManager.spam({
				effectId: EffectConst.EF_BEGINSPELL,
				ownerAID: ev.src,
				position: src.position,
				duration: ev.castMs
			});
		}
	}

	/**
	 * EvtSkillKena: efek utama sekali, lalu efek kena, bar HP, dan angka
	 * per korban. hpSisa dipakai apa adanya (server yang menghitung).
	 */
	function kenaSkill(ev) {
		const src = EntityManager.get(ev.src);
		const terakhir = src && src.__acSkill && src.__acSkill.skid === ev.skid ? src.__acSkill : null;
		if (src) {
			src.cast.clean();
			// Pose skill yang ditahan selama cast kini diputar.
			if (terakhir && terakhir.castMs > 0 && src.objecttype === TIPE_PC) {
				mainkanAksi(src, src.ACTION.SKILL, src.ACTION.IDLE);
			}
			src.__acSkill = null;
		}

		// Skill unit (dst bukan 0): efek menempel ke sasarannya (posisi
		// null), seperti onEntityUseSkillToAttack. Skill tanah, atau kena
		// tanpa EvtSkillMulai yang diingat: efek di pusat sel yang server
		// laporkan. Posisi yang diberikan membuat efek attachedEntity
		// (mis. Storm Gust) TETAP di tanah, tidak ikut korban pertama.
		const keUnit = terakhir && terakhir.dst;
		const pemilik = keUnit ? terakhir.dst : (ev.kena[0] ? ev.kena[0].dst : ev.src);
		const pos = keUnit ? null : [ev.x, ev.y, Altitude.getCellHeight(ev.x, ev.y)];
		efekAman(ev.skid, () => EffectManager.spamSkill(ev.skid, pemilik, pos, Renderer.tick, ev.src));

		for (const k of ev.kena) {
			efekAman(ev.skid, () => EffectManager.spamSkillBeforeHit(ev.skid, k.dst, Renderer.tick, ev.src));
			efekAman(ev.skid, () => EffectManager.spamSkillHit(ev.skid, k.dst, Renderer.tick, ev.src));

			const korban = EntityManager.get(k.dst);
			if (!korban) {
				log(`! skill ${ev.skid} mengenai entity ${k.dst} yang tak dikenal — abaikan`);
				continue;
			}
			hidupkanBar(korban.life, k.hpSisa, korban.__m2MaxHP);

			if (k.jenis === JENIS_DAMAGE_HEAL) {
				Damage.add(Math.abs(k.amount), korban, Renderer.tick, null, Damage.TYPE.HEAL);
				continue;
			}

			// Skill dukung (Blessing, Increase AGI, ...) tiba per korban
			// sebagai amount 0 berjenis NORMAL. Damage.add memperlakukan 0
			// sebagai meleset (cabang `if (!damage)` di Damage.js) dan
			// menggambar MISS, jadi angka dan sentakan dilewati; efek kena
			// dan bar di atas tetap jalan. MISS sungguhan tetap ditampilkan.
			if (k.amount === 0 && k.jenis !== JENIS_MISS) {
				continue;
			}

			let tipe = Damage.TYPE.DAMAGE | Damage.TYPE.ENEMY;
			if (k.jenis === JENIS_MISS) {
				tipe = Damage.TYPE.MISS;
			} else if (k.jenis === JENIS_KRITIKAL) {
				tipe |= Damage.TYPE.CRIT;
			}
			Damage.add(k.amount, korban, Renderer.tick, null, tipe);

			// Bidak beku tidak tersentak: HURT akan merusak pose FREEZE2
			// yang updateBodyState pasang (balok es tetap, sprite bergerak).
			if (k.amount > 0 && k.jenis !== JENIS_MISS && korban.bodyState !== StatusState.BodyState.FREEZE) {
				mainkanAksi(korban, korban.ACTION.HURT, korban.ACTION.IDLE);
			}
		}
	}

	/**
	 * EvtStatus. Tampilan menetap lewat bodyState/healthState (cara RO
	 * untuk entity lain, C24); kilatan EFEK_BADAN_STATUS sekali saat mulai.
	 * Tanpa ikon di atas kepala: ikon status RO milik kartu detail bidak.
	 *
	 * Warna racun TIDAK disetel langsung ke effectColor: EntityState
	 * menghitung ulang effectColor dari _bodyStateColor x _healthStateColor
	 * setiap setter berjalan, jadi nilai tulisan tangan akan tertimpa.
	 * Mencabut bit POISON dari healthState yang memulihkannya.
	 */
	function ubahStatus(ev) {
		const entity = EntityManager.get(ev.entityId);
		const effectId = EFEK_BADAN_STATUS[ev.efst];
		if (!entity) {
			log(`! status ${ev.efst} untuk entity ${ev.entityId} yang tak dikenal — abaikan`);
			return;
		}
		if (effectId === undefined) {
			// Efst 0 hanya tiba karena bug (lihat EfekStatus di ro.proto).
			log(`! status tak dikenal (efst ${ev.efst}) untuk entity ${ev.entityId} — abaikan`);
			return;
		}

		entity.__acStatus = entity.__acStatus || new Set();
		const batalCast = ev.aktif && STATUS_BATAL_CAST.has(ev.efst);
		if (ev.aktif) {
			entity.__acStatus.add(ev.efst);
			// Kilatan lama (refresh durasi) dibuang dulu agar tidak menumpuk.
			EffectManager.remove(null, ev.entityId, effectId);
			EffectManager.spam({
				effectId,
				ownerAID:  ev.entityId,
				position:  entity.position,
				startTick: Renderer.tick
			});
		} else {
			entity.__acStatus.delete(ev.efst);
			EffectManager.endRepeat(null, ev.entityId, effectId);
			EffectManager.remove(null, ev.entityId, effectId);
		}

		// Setter EntityState hanya bekerja bila nilainya BERUBAH; saat
		// beku dicabut ia sendiri memutar pecahan balok es, suara, dan
		// pose READYFIGHT (updateBodyState), jadi EF_ICECRASH tidak
		// ditambahkan di sini.
		let badan = 0;
		for (const [efst, nilai] of PRIORITAS_BADAN) {
			if (entity.__acStatus.has(efst)) {
				badan = nilai;
				break;
			}
		}
		let kesehatan = 0;
		for (const [efst, bit] of BIT_KESEHATAN) {
			if (entity.__acStatus.has(efst)) {
				kesehatan |= bit;
			}
		}
		if (batalCast) {
			batalkanCast(entity, badan);
		}
		entity.bodyState = badan;
		entity.healthState = kesehatan;
	}

	/**
	 * Meniru pembatalan cast di server (beku, pingsan, tidur, bisu
	 * mengosongkan cast) seperti onEntityCastCancel: cast bar dan aura
	 * dicabut, cast yang diingat dilupakan -- sehingga EvtSkillKena yang
	 * tak akan datang tidak ditunggu dan timer cast basi (yang memeriksa
	 * identitas __acSkill) menjadi no-op -- dan pose skill yang ditahan
	 * dilepas ke IDLE. Pengecualian: beku yang BARU dipasang, karena
	 * setter bodyState sendiri memasang pose FREEZE2; pingsan dan tidur
	 * tidak menyentuh aksi (EntityState.updateBodyState).
	 *
	 * @param {object} entity
	 * @param {number} badan  bodyState yang akan dipasang sesudah ini
	 */
	function batalkanCast(entity, badan) {
		// Hanya cast yang masih berjalan yang posenya dilepas. Skill yang
		// baru saja dilepas sudah dilupakan oleh kenaSkill (__acSkill null)
		// dan sedang memutar pose pelepasannya; status yang skill itu
		// pasang pada perapalnya sendiri di tick yang sama (Asura Strike
		// -> bisu_diri) tidak boleh memotong animasi tersebut.
		const castBerjalan = !!(entity.__acSkill && entity.__acSkill.castMs > 0);
		if (entity.cast && typeof entity.cast.clean === 'function') {
			entity.cast.clean();
		}
		EffectManager.remove(null, entity.GID, EFEK_AURA_CAST);
		entity.__acSkill = null;

		const beriPoseBeku = badan === StatusState.BodyState.FREEZE && entity.bodyState !== badan;
		if (castBerjalan && entity.objecttype === TIPE_PC && entity.action === entity.ACTION.SKILL && !beriPoseBeku) {
			entity.setAction({ action: entity.ACTION.IDLE, frame: 0, repeat: true, play: true });
		}
	}

	/** EvtSP: simpan, lalu gambar ulang baris SP di bawah bar HP. */
	function ubahSP(ev) {
		const entity = EntityManager.get(ev.entityId);
		if (!entity) {
			log(`! SP untuk entity ${ev.entityId} yang tak dikenal — abaikan`);
			return;
		}
		entity.__acSP = ev.sp;
		entity.__acMaxSP = ev.maxSp;
		gambarBarSP(entity.life, ev.sp, ev.maxSp);
	}

	/**
	 * EvtCaturTonton (AC6 K3): tontonan berganti, jadi status, SP, dan cast
	 * yang diingat client untuk entity yang tampil tidak lagi berlaku.
	 * Server sudah mengirim EvtDespawn lebih dulu dan akan mengirim ulang
	 * EvtSpawn (HP/SP saat ini) dan EvtStatus (durasi sisa) sesudahnya.
	 *
	 * Menyapu SEMUA entity di EntityManager, termasuk yang sedang memudar
	 * sesudah mati. Satu entity yang setengah dibongkar (life/cast sudah
	 * dibuang EntityManager.remove) tidak boleh menghentikan sapuan: tiap
	 * entity dibungkus sendiri (Review Focus 2).
	 *
	 * @returns {number} jumlah entity yang dibersihkan
	 */
	function bersihkanStatus() {
		if (typeof EntityManager.forEach !== 'function') {
			return 0;
		}
		let n = 0;
		EntityManager.forEach((entity) => {
			if (!entity) {
				return true;
			}
			const punya = entity.__acStatus?.size > 0 || entity.__acSP !== undefined || !!entity.__acSkill;
			if (!punya) {
				return true;
			}
			try {
				for (const efst of entity.__acStatus ?? []) {
					const effectId = EFEK_BADAN_STATUS[efst];
					if (effectId !== undefined) {
						EffectManager.endRepeat(null, entity.GID, effectId);
						EffectManager.remove(null, entity.GID, effectId);
					}
				}
				if (entity.__acSkill) {
					entity.cast?.clean?.();
					EffectManager.remove(null, entity.GID, EFEK_AURA_CAST);
				}
			} catch (err) {
				log(`! bersihkan status entity ${entity.GID}: ${err.message}`);
			}
			entity.__acStatus = new Set();
			entity.__acSkill = null;
			delete entity.__acSP;
			delete entity.__acMaxSP;
			try {
				if (entity.bodyState) {
					entity.bodyState = 0;
				}
				if (entity.healthState) {
					entity.healthState = 0;
				}
				if (entity.life) {
					entity.life.sp = -1;
					entity.life.sp_max = -1;
					if (entity.life.hp >= 0 && entity.life.hp_max >= 0) {
						entity.life.update?.();
					}
				}
			} catch (err) {
				log(`! bersihkan bar entity ${entity.GID}: ${err.message}`);
			}
			n++;
			return true;
		});
		return n;
	}

	return { mulaiSkill, kenaSkill, ubahStatus, ubahSP, bersihkanStatus };
}
