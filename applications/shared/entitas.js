// Pembantu entity bersama: spawn, jalan, damage, dan mati.
//
// Dipindah dari applications/harness/main.js apa adanya supaya harness
// dan klien autochess menggerakkan sprite roBrowserLegacy dengan kode
// yang SAMA -- termasuk seluruh jebakan yang ditemukan di M4-M6e, yang
// komentarnya ikut pindah bersama kodenya.
//
// Yang berbeda antarpemakai masuk lewat opsi buatPenggerak, bukan lewat
// cabang di sini: log dan catatHUD milik pemakai, dan hapusPCSetelahMati
// membedakan harness (PC dipertahankan untuk kamera) dari autochess (PC
// adalah bidak yang mati sungguhan).
//
// Nol berkas client/src/ berubah: semuanya lewat API publik.

import Entity        from 'Renderer/Entity/Entity.js';
import EntityManager from 'Renderer/EntityManager.js';
import Altitude      from 'Renderer/Map/Altitude.js';
import Damage        from 'Renderer/Effects/Damage.js';
import Renderer      from 'Renderer/Renderer.js';
import DB            from 'DB/DBManager.js';

import { hidupkanBar, mainkanAksi, namaMob, perluDihapusSetelahMati, persenDarah, barisHUD, JENIS_MISS, JENIS_KRITIKAL } from '../harness/tempur.js';
import { objecttypeDari, pathKeInt16, arahLangkah } from '../harness/mapinfo.js';

// Berapa lama mayat mob tergeletak sebelum dihapus. Cukup untuk animasi
// matinya terlihat; lebih lama akan bertabrakan dengan respawn 10 detik.
export const JEDA_HAPUS_MAYAT = 1200;

/**
 * Membuat penggerak entity yang terikat ke log milik pemakainya.
 *
 * @param {object} opsi
 * @param {function(string): void} opsi.log  penulis baris log pemakai.
 * @param {function(string): void} [opsi.catatHUD]  penulis panel damage; bawaan no-op.
 * @param {boolean} [opsi.hapusPCSetelahMati]  true: mayat PC ikut dihapus
 *   setelah JEDA_HAPUS_MAYAT seperti mob. Bawaan false (perilaku harness:
 *   PC dipertahankan untuk kamera).
 * @returns {{periksaPendaftaran: function, spawnkan: function, jalankanSepanjang: function, tampilkanDamage: function, matikanSprite: function}}
 */
export function buatPenggerak({ log, catatHUD = () => {}, hapusPCSetelahMati = false }) {
	/**
	 * Membuktikan sebuah entity benar-benar akan dirender DAN benar-benar
	 * bisa berjalan, lalu mencetak diagnostik keras ke log bila tidak.
	 *
	 * Diangkat jadi pembantu bersama, bukan disalin: daftarkanEntity (sprite
	 * kita, di harness) dan spawnkan (pemain lain) memanggil set() dengan
	 * payload yang SAMA, jadi bila payload itu kelak rusak keduanya rusak
	 * berbarengan -- tapi sampai review akhir M5 hanya sisi kita yang
	 * memeriksanya. Pemain lain akan diam-diam berhenti beranimasi sementara
	 * sprite kita berteriak, dan pemeriksaan inilah yang membuat kegagalan
	 * render senyap di M4 dapat ditemukan sama sekali.
	 */
	function periksaPendaftaran(entity) {
		// Diperiksa lewat _list yang sesungguhnya, BUKAN EntityManager.get():
		// get() memotong jalan lewat `Session.Entity.GID === gid` dan akan
		// mengembalikan spot walau ia tidak pernah masuk render list --
		// pemeriksaan yang selalu lulus dan karenanya tidak memeriksa apa pun.
		let diRenderList = false;
		EntityManager.forEach((e) => {
			if (e === entity) {
				diRenderList = true;
				return false;
			}
			return true;
		});

		const walkSah = entity.ACTION.WALK >= 0;
		log(diRenderList && walkSah
			? `entity terdaftar: GID ${entity.GID}, objecttype ${entity.objecttype}, ACTION.WALK ${entity.ACTION.WALK} — walkProcess akan berjalan tiap frame.`
			: `! PENDAFTARAN GAGAL: diRenderList=${diRenderList}, ACTION.WALK=${entity.ACTION.WALK} — sprite tidak akan berjalan.`);
		if (diRenderList && !walkSah) {
			log('! ACTION.WALK masih -1 sementara entity SUDAH dirender: konsol akan dibanjiri CHARACTER STUCK IN WALKING ANIMATION tiap frame.');
		}
	}

	/**
	 * Membuat entity untuk pemain LAIN maupun monster dari satu EvtSpawn
	 * (atau memindahkannya, bila GID-nya sudah ada).
	 *
	 * Sama persis dengan daftarkanEntity di harness, minus dua hal: ia tidak
	 * pernah menjadi Session.Entity, dan kamera tidak pernah menargetnya.
	 * objecttype tidak lagi ditulis tetap ke TYPE_PC -- ia ditentukan dari
	 * sp.type lewat objecttypeDari, dan head/sex hanya diberikan untuk PC
	 * (lihat komentar di dalam fungsi ini).
	 *
	 * sp boleh hasil decodeSpawn (harness) ATAU decodeSpawnLengkap
	 * (autochess), yang menambah tiga field opsional: tampilan, nama, dan
	 * tim. Setiap tambahan hanya aktif bila field-nya ada, jadi masukan
	 * harness menempuh jalur yang sama persis seperti sebelum dipindah.
	 *
	 * @returns {Entity|null} entity-nya, atau null bila sp.type tak dikenal.
	 */
	function spawnkan(sp) {
		if (EntityManager.get(sp.entityId)) {
			// Sudah ada. Bisa terjadi bila server mengirim spawn dua kali;
			// perbarui posisi alih-alih membuat entity kedua di GID yang sama.
			const ada = EntityManager.get(sp.entityId);
			ada.position[0] = sp.x;
			ada.position[1] = sp.y;
			ada.position[2] = Altitude.getCellHeight(sp.x, sp.y);
			// HP ikut diperbarui. EvtSpawn dikirim ulang saat mob bangkit
			// dari respawn dan saat ia masuk kembali ke radius pandang --
			// membiarkan HP lama membuat bar mob yang baru hidup tetap
			// menampilkan darah terakhirnya sebelum mati.
			ada.__m2MaxHP = sp.maxHp;
			// Bidak bertim (autochess) memakai bar juga, PC sekalipun.
			if (ada.objecttype === 5 || sp.tim) {
				hidupkanBar(ada.life, sp.hp, sp.maxHp);
			}
			log(`< spawn ulang entity ${sp.entityId} di (${sp.x},${sp.y})`);
			return ada;
		}

		const objecttype = objecttypeDari(sp.type);
		if (objecttype === null) {
			// Menggambar tebakan lebih buruk daripada tidak menggambar.
			log(`! spawn entity ${sp.entityId} bertipe ${sp.type} yang tak dikenal — dilewati`);
			return null;
		}

		const lain = new Entity();
		const unit = { objecttype, GID: sp.entityId, job: sp.job };
		const tampilan = sp.tampilan || null;
		// head dan sex khusus PC. getBodyPath untuk id non-pemain (mob,
		// 1001-3999) jatuh ke cabang terakhirnya, 'data/sprite/몬스터/' +
		// MonsterTable[id] -- bukan data/sprite/npc/, itu cabang isNPC (id
		// 46-129, 401-999) yang tidak pernah disentuh mob. Memberi head pada
		// mob membuat UpdateHead mencari sprite kepala untuk id 1002 (keputusan
		// A10). Ini kesalahan M4 yang DIBALIK: bukan field yang hilang,
		// melainkan field yang tidak semestinya ada.
		if (objecttype === Entity.TYPE_PC) {
			// head WAJIB >= 0 untuk PC: Entity.prototype._head bernilai -1
			// dan UpdateHead keluar lebih awal saat head < 0, sehingga sprite
			// kepala tidak pernah dimuat. Karena itu kepala 0 dari tampilan
			// jatuh ke 1, gaya rambut pertama.
			unit.sex = tampilan ? tampilan.sex : 1;
			unit.head = tampilan ? (tampilan.kepala || 1) : 1;
		}
		lain.set(unit);
		if (objecttype === Entity.TYPE_PC && tampilan) {
			// weapon dan shield adalah setter EntityView, bukan field data:
			// menugaskannya memuat sprite-nya. 0 berarti tangan kosong.
			lain.weapon = tampilan.senjata;
			lain.shield = tampilan.perisai;
		}
		lain.position[0] = sp.x;
		lain.position[1] = sp.y;
		lain.position[2] = Altitude.getCellHeight(sp.x, sp.y);
		// __m2MaxHP disimpan di entity supaya EvtDamage -- yang hanya membawa
		// hp_sisa -- dapat dihitung jadi persen. Prefiks __m2 menandai ia
		// milik harness, bukan field roBrowserLegacy.
		lain.__m2MaxHP = sp.maxHp;
		EntityManager.add(lain);

		// M6e -- nama dan bar HP, untuk MOB saja.
		//
		// Keduanya milik roBrowserLegacy dan sudah dirender tiap frame oleh
		// EntityRender (baris 152 dan 158), yang dijalankan
		// EntityManager.render(). Harness sudah masuk rantai itu sejak
		// perbaikan M5 -- jebakan walkProcess M4 tidak berlaku di sini.
		//
		// Pemain sengaja tidak diberi keduanya: bar HP pemain milik
		// UI/Components/BasicInfo, dan HP-nya sudah terlihat di panel HUD.
		//
		// Kecuali bila spawn membawa nama (nama untuk semua jenis) atau tim
		// bukan 0 (bar juga untuk PC): itu bidak autochess, yang tidak punya
		// BasicInfo dan harus terbaca langsung di papan.
		if (sp.nama) {
			lain.display.name = sp.nama;
			lain.display.add();
		} else if (objecttype === 5) {
			lain.display.name = namaMob(sp.job, (j) => DB.getMonsterName(j));
			lain.display.add();
		}
		if (objecttype === 5 || sp.tim) {
			if (!hidupkanBar(lain.life, sp.hp, sp.maxHp)) {
				// TIDAK diabaikan diam-diam: bar yang tidak menyala adalah
				// gejala satu-satunya bila EvtSpawn tiba tanpa hp/max_hp.
				log(`! bar HP entity ${sp.entityId} tidak menyala (hp ${sp.hp}/${sp.maxHp})`);
			}
		}
		log(`< spawn entity ${sp.entityId} di (${sp.x},${sp.y})`);
		periksaPendaftaran(lain);
		return lain;
	}

	/**
	 * Menyuntikkan jalur dari server ({x,y}[], termasuk asal) ke struktur
	 * walk milik roBrowserLegacy.
	 *
	 * Ini padanan walkTo() yang melakukan semuanya KECUALI memanggil A*
	 * client: keputusan D8 menyerahkan pathfinding sepenuhnya ke server,
	 * sehingga dua implementasi tidak perlu sepakat sampai ke urutan
	 * tie-break.
	 *
	 * Jalur kosong diabaikan. Jalur SATU langkah adalah perintah berhenti di
	 * cell itu (lihat komentar EvtMove di proto/ro.proto).
	 *
	 * Hanya menyentuh field publik. Nol berkas client/src/ berubah.
	 */
	function jalankanSepanjang(entity, jalur, speedMs) {
		if (jalur.length === 0) {
			return;
		}

		if (jalur.length === 1) {
			// PERINTAH BERHENTI: posisi awal tanpa langkah berikutnya. Sisa
			// jalur dibuang dan sprite berdiri di cell itu -- tanpa ini
			// walkProcess terus menjalani jalur lama sementara server sudah
			// menghentikannya. resetRoute(false) mengosongkan walk.total,
			// jadi walkProcess tidak lagi memajukan posisi. arahLangkah
			// TIDAK dipanggil: tidak ada langkah untuk dihitung arahnya.
			const { x, y } = jalur[0];
			entity.resetRoute(false);
			entity.position[0] = x;
			entity.position[1] = y;
			entity.position[2] = Altitude.getCellHeight(x, y);
			// Hanya bila sedang WALK: setAction tanpa syarat akan memotong
			// animasi lain (serang, terluka) yang sedang dimainkan.
			if (entity.action === entity.ACTION.WALK) {
				entity.setAction({
					action: entity.ACTION.IDLE,
					frame: 0,
					repeat: true,
					play: true
				});
			}
			return;
		}

		const adaRute = entity.walk && entity.walk.total > 0;
		// Dibaca SEBELUM resetRoute, sama seperti walkTo asli (EntityWalk.js:335):
		// resetRoute tidak menyentuh entity.action, tapi urutan ini menjaga
		// niatnya tetap jelas bagi pembaca berikutnya.
		const sudahBerjalan = entity.action === entity.ACTION.WALK;
		entity.resetRoute(adaRute);

		entity.walk.path  = pathKeInt16(jalur);
		entity.walk.index = 2;              // lewati asal, sama seperti walkTo
		entity.walk.total = jalur.length * 2;
		entity.walk.speed = speedMs;
		entity.walk.pos.set(entity.position);
		entity.walk.lastPos.set(entity.position);
		entity.walk.tick = entity.walk.prevTick = Date.now();

		// Langkah dari A* server selalu satu petak, jadi dx/dy selalu di
		// {-1,0,1} dan tabel arahLangkah cukup -- tidak perlu trigonometri.
		const dx = jalur[1].x - jalur[0].x;
		const dy = jalur[1].y - jalur[0].y;
		entity.direction = arahLangkah(dx, dy);
		entity.headDir = 0;

		// Klik ulang saat sprite SEDANG berjalan adalah kejadian normal;
		// setAction tanpa syarat akan menyentak animasi balik ke frame 0
		// tiap klik. walkTo asli membungkusnya sama persis (EntityWalk.js:374).
		if (!sudahBerjalan) {
			entity.setAction({
				action: entity.ACTION.WALK,
				frame: 0,
				repeat: true,
				play: true
			});
		}
	}

	/**
	 * Menampilkan satu angka damage di atas korban, dan memainkan animasi
	 * serang pada penyerang.
	 *
	 * Damage.add TERJANGKAU tanpa menyentuh client/src: ia statis pada
	 * default export Renderer/Effects/Damage.js, dan seluruh siklus hidupnya
	 * digerakkan MapRenderer -- Damage.init di onMapComplete (jalur setMap
	 * yang harness pakai) dan Damage.render di loop render tiap frame.
	 * Karena itu Damage.add akan benar-benar tergambar; tidak seperti
	 * entity.walk di M4, yang diisi dengan benar dan tak pernah dibaca.
	 */
	function tampilkanDamage(d) {
		const korban = EntityManager.get(d.dst);
		if (!korban) {
			// BUKAN diabaikan diam-diam: ini gejala yang terlihat bila urutan
			// EvtSpawn dan EvtDamage kacau.
			log(`! damage untuk entity ${d.dst} yang tak dikenal -- abaikan`);
			return;
		}
		log(`< damage ${d.src} -> ${d.dst}: ${d.amount} (sisa ${d.hpSisa} = ${persenDarah(d.hpSisa, korban.__m2MaxHP)}%)`);

		// Panel HUD SELALU dicatat, bahkan bila Damage.add berhasil: ia yang
		// menjamin milestone dapat diamati, dan angka bawaan adalah bonus.
		catatHUD(barisHUD(d, korban.__m2MaxHP));

		// Bar HP korban ikut turun. hpSisa dipakai apa adanya -- server yang
		// menghitungnya, dan client tidak pernah mengurangi sendiri (spec
		// induk Bagian 8.3).
		hidupkanBar(korban.life, d.hpSisa, korban.__m2MaxHP);

		// Animasi terluka. Hanya untuk pukulan yang MENDARAT: makhluk yang
		// serangan lawannya meleset tidak tersentak.
		if (d.jenis !== JENIS_MISS) {
			mainkanAksi(korban, korban.ACTION.HURT, korban.ACTION.IDLE);
		}

		// Jenis diteruskan ke tampilan bawaan roBrowserLegacy juga.
		// Damage.TYPE punya MISS dan CRIT sejak lama (Damage.js:680).
		//
		// Ini BONUS, bukan tumpuan: skinnya bisa diam tanpa galat, dan panel
		// HUD di atas yang menjamin milestone dapat diamati.
		let tipe = Damage.TYPE.DAMAGE | Damage.TYPE.ENEMY;
		if (d.jenis === JENIS_MISS) {
			tipe = Damage.TYPE.MISS;
		} else if (d.jenis === JENIS_KRITIKAL) {
			tipe |= Damage.TYPE.CRIT;
		}
		Damage.add(d.amount, korban, Renderer.tick, null, tipe);

		// Animasi serang pada PENYERANG. setAction dipasang ke tiap instance
		// Entity (EntityAction.js), jadi terjangkau dari luar. ACTION.ATTACK
		// bernilai -2 dan diterjemahkan sendiri ke ATTACK1/2/3 menurut senjata.
		const penyerang = EntityManager.get(d.src);
		mainkanAksi(penyerang, penyerang && penyerang.ACTION.ATTACK, penyerang && penyerang.ACTION.IDLE);
	}

	/**
	 * Menjalankan kematian sebuah sprite.
	 *
	 * Mob dihapus SETELAH animasi matinya sempat terlihat; pemain TIDAK
	 * dihapus sama sekali -- kecuali hapusPCSetelahMati, maka pemain
	 * diperlakukan persis seperti mob.
	 *
	 * Versi pertama menghapus keduanya seketika, dengan komentar yang
	 * berbunyi "menghapusnya di sini pun aman: spawn berikutnya membuatnya
	 * lagi". Penalaran itu salah: spawn berikutnya membuat objek Entity
	 * BARU, sementara Camera.setTarget masih memegang objek lama -- kamera
	 * lalu mengikuti hantu di posisi kematian, dan karakter yang hidup
	 * kembali tak pernah diikuti. Karena itu hapusPCSetelahMati hanya untuk
	 * pemakai yang kameranya TIDAK menempel ke PC yang bisa mati.
	 */
	function matikanSprite(entityId) {
		const e = EntityManager.get(entityId);
		if (!e) {
			log(`! mati untuk entity ${entityId} yang tak dikenal -- abaikan`);
			return;
		}
		log(`< mati: entity ${entityId}`);

		// next null: mayat BERHENTI di frame terakhir alih-alih berdiri lagi.
		mainkanAksi(e, e.ACTION.DIE, null);

		const hapus = perluDihapusSetelahMati(e.objecttype) ||
			(hapusPCSetelahMati && e.objecttype === Entity.TYPE_PC);
		if (!hapus) {
			// Pemain. Entity dipertahankan supaya Camera tetap menempel;
			// EvtSpawn respawn hanya memindahkannya.
			return;
		}
		// Mob (atau PC bila hapusPCSetelahMati). Dihapus setelah animasi
		// sempat terlihat -- menghapusnya seketika membuat mob lenyap tanpa
		// mati.
		//
		// EntityManager.remove adalah removeEntity, BUKAN removeGID.
		// removeGID hanya menghapus entri peta dan MEMBIARKAN entity tetap di
		// _list, sehingga ia terus dirender selamanya.
		setTimeout(() => {
			if (EntityManager.get(entityId)) {
				EntityManager.remove(entityId);
			}
		}, JEDA_HAPUS_MAYAT);
	}

	return { periksaPendaftaran, spawnkan, jalankanSepanjang, tampilkanDamage, matikanSprite };
}
