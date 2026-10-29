// Potret unit: sprite RO sungguhan dirender ke kanvas 2D (keputusan Q2
// rencana AC4, pola B rekon §2 -- sama dengan CharSelect/Equipment).
//
// Setiap kanvas punya Entity sendiri yang TIDAK pernah masuk EntityManager;
// satu loop requestAnimationFrame bersama menggambar semua kanvas yang
// terdaftar paling banyak FPS_MAKS kali per detik. Dua mode:
// - hidup:  digambar terus (animasi idle, mis. bangku).
// - statis: digambar ulang hanya sampai frame pertama yang tidak kosong
//   SESUDAH sprite badan terpasang (sprite dimuat asinkron oleh Entity.set,
//   jadi frame awal bisa kosong atau hanya kepala), lalu dibekukan;
//   menyerah sesudah BATAS_STATIS_MS.
//
// Semua modul client/src/ disuntikkan (Entity, SpriteRenderer, Camera) agar
// modul ini teruji di Node dengan barang palsu; pengkabelannya di main.js.

/** Batas laju gambar loop bersama. */
export const FPS_MAKS = 15;

/** Potret statis yang tetap kosong selama ini dianggap gagal. */
export const BATAS_STATIS_MS = 5000;

/** Titik kaki bawaan sebagai pecahan tinggi kanvas. */
const KAKI_BAWAAN = 0.87;

const JEDA_MS = 1000 / FPS_MAKS;
// Kelonggaran jeda: jam frame bergetar beberapa ratus mikrodetik, dan
// tanpa kelonggaran 60 Hz kadang melewatkan satu slot (4 frame = 66,4 ms).
const TOLERANSI_MS = 1;

// Arah hadap potret: (Camera.direction 4 + entity.direction 4) % 8 = 0,
// menghadap penonton. Sama dengan CharSelect.
const ARAH = 4;

/**
 * Memeriksa apakah kanvas sudah memuat gambar: blok 4x4 di tengah, ada
 * piksel beralfa > 0. Tengah dipilih karena badan sprite selalu menutupnya
 * (kaki di 0.87 tinggi, badan di atasnya).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} lebar
 * @param {number} tinggi
 * @returns {boolean}
 */
export function adaPiksel(ctx, lebar, tinggi) {
	const x = Math.max(0, Math.floor(lebar / 2) - 2);
	const y = Math.max(0, Math.floor(tinggi / 2) - 2);
	const { data } = ctx.getImageData(x, y, 4, 4);
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] > 0) {
			return true;
		}
	}
	return false;
}

/** Nama pendek sprite untuk baris log. */
function namaSprite(sprite) {
	if (sprite?.tipe === 'pc') {
		return `pc job ${sprite.job}`;
	}
	if (sprite?.tipe === 'mob') {
		return `mob ${sprite.id}`;
	}
	return JSON.stringify(sprite);
}

/**
 * Membuat pengelola potret.
 *
 * @param {object} dep
 * @param {Function} dep.Entity kelas Entity (Renderer/Entity/Entity.js)
 * @param {{bind2DContext: function}} dep.SpriteRenderer
 * @param {{direction: number}} dep.Camera
 * @param {(fn: function) => *} [dep.raf] requestAnimationFrame
 * @param {() => number} [dep.sekarang] jam ms (Date.now; animasi entity juga memakai Date.now)
 * @param {(pesan: string) => void} [dep.log]
 * @returns {{hidup: function, statis: function, hentikan: function, hentikanSemua: function}}
 */
export function buatPotret({
	Entity,
	SpriteRenderer,
	Camera,
	raf = (fn) => requestAnimationFrame(fn),
	sekarang = Date.now,
	log = () => {}
}) {
	/** kanvas -> {entity, ctx, nama, kaki, skala, statis, mulai, sudahGagal} */
	const daftar = new Map();
	let gidBerikut = -1000;
	let menunggu = false;
	let terakhir = -Infinity;

	/**
	 * Entity untuk satu potret, dengan resep spawnkan (applications/shared/
	 * entitas.js) agar potret sama dengan bidak di arena: PC memakai head
	 * >= 1 (head 0 jatuh ke 1) dan weapon sesudah set(); mob hanya job =
	 * id mob, TANPA head/sex (head pada mob membuat UpdateHead mencari
	 * sprite kepala yang tidak ada).
	 */
	function buatEntity(sprite) {
		const e = new Entity();
		const GID = gidBerikut--;
		if (sprite.tipe === 'pc') {
			e.set({
				objecttype: Entity.TYPE_PC, GID, job: sprite.job, sex: sprite.sex ?? 1,
				head: 1, name: '', hideShadow: true
			});
			// Setter EntityView: penugasan memuat sprite senjatanya.
			e.weapon = sprite.senjata ?? 0;
		} else {
			e.set({ objecttype: Entity.TYPE_MOB, GID, job: sprite.id, hideShadow: true });
		}
		e.hideShadow = true;
		e.direction = ARAH;
		e.headDir = 0;
		e.action = e.ACTION.IDLE;
		e.animation = { tick: sekarang(), frame: 0, repeat: true, play: true, next: false, delay: 0, save: false };
		return e;
	}

	function jadwalkan() {
		if (!menunggu) {
			menunggu = true;
			raf(putar);
		}
	}

	/** Menggambar satu potret; galat dicatat sekali per kanvas. */
	function gambar(kanvas, p) {
		const { ctx, kaki, skala } = p;
		try {
			ctx.clearRect(0, 0, kanvas.width, kanvas.height);
			Camera.direction = ARAH;
			if (skala !== 1) {
				ctx.save();
				ctx.scale(skala, skala);
			}
			try {
				SpriteRenderer.bind2DContext(ctx, kanvas.width / 2 / skala, (kanvas.height * kaki) / skala);
				p.entity.renderEntity();
			} finally {
				if (skala !== 1) {
					ctx.restore();
				}
			}
		} catch (err) {
			if (!p.sudahGagal) {
				p.sudahGagal = true;
				log(`! potret ${p.nama}: render gagal: ${err?.message ?? err}`);
			}
		}
	}

	/** Satu putaran loop bersama. */
	function putar() {
		menunggu = false;
		if (daftar.size === 0) {
			return;
		}
		const t = sekarang();
		if (t - terakhir >= JEDA_MS - TOLERANSI_MS) {
			terakhir = t;
			// Camera.direction global milik peta (dihitung ulang tiap
			// Camera.update); dipulihkan agar potret tidak menggeser arah
			// NPC di arena di antara dua frame.
			const arahKamera = Camera.direction;
			try {
				for (const [kanvas, p] of [...daftar]) {
					gambar(kanvas, p);
					if (!p.statis) {
						continue;
					}
					if (badanSiap(p.entity) && adaPikselAman(kanvas, p)) {
						daftar.delete(kanvas);
					} else if (t - p.mulai >= BATAS_STATIS_MS) {
						daftar.delete(kanvas);
						log(`! potret ${p.nama}: masih kosong sesudah ${BATAS_STATIS_MS} ms, menyerah`);
					}
				}
			} finally {
				Camera.direction = arahKamera;
			}
		}
		if (daftar.size > 0) {
			jadwalkan();
		}
	}

	/**
	 * Sprite badan sudah terpasang? Kepala PC bisa termuat lebih dulu dan
	 * tergambar sendirian di titik tumpu badan, tepat di tengah kanvas
	 * kecil (96x110 kartu Toko) -- adaPiksel lalu membekukan kepala tanpa
	 * badan. Entity tanpa files (barang palsu uji) dianggap siap.
	 */
	function badanSiap(entity) {
		return !entity.files || !!entity.files.body?.spr;
	}

	function adaPikselAman(kanvas, p) {
		try {
			return adaPiksel(p.ctx, kanvas.width, kanvas.height);
		} catch {
			// Kanvas tercemar/tak terbaca: anggap kosong; batas waktu yang
			// akhirnya melepasnya.
			return false;
		}
	}

	function daftarkan(sprite, kanvas, { kaki = KAKI_BAWAAN, skala = 1 } = {}, statis) {
		if (!sprite || (sprite.tipe !== 'pc' && sprite.tipe !== 'mob')) {
			log(`! potret: sprite tidak dikenal ${JSON.stringify(sprite)}`);
			return false;
		}
		daftar.delete(kanvas);
		daftar.set(kanvas, {
			entity: buatEntity(sprite),
			// willReadFrequently: adaPiksel membaca piksel (getImageData)
			// tiap frame potret statis; tanpa ini Chrome memperingatkan
			// readback dari kanvas berakselerasi GPU.
			ctx: kanvas.getContext('2d', { willReadFrequently: true }),
			nama: namaSprite(sprite),
			kaki,
			skala,
			statis,
			mulai: sekarang(),
			sudahGagal: false
		});
		jadwalkan();
		return true;
	}

	return {
		/**
		 * Potret beranimasi terus sampai dihentikan.
		 * @param {{tipe:'pc', job, sex, senjata}|{tipe:'mob', id}} sprite dari katalog.spriteUnit
		 * @param {HTMLCanvasElement} kanvas
		 * @param {{kaki?: number, skala?: number}} [opsi] kaki = pecahan tinggi titik kaki
		 * @returns {boolean} false bila sprite tidak dikenal
		 */
		hidup: (sprite, kanvas, opsi) => daftarkan(sprite, kanvas, opsi, false),
		/** Seperti hidup, tetapi dibekukan begitu frame pertama tidak kosong. */
		statis: (sprite, kanvas, opsi) => daftarkan(sprite, kanvas, opsi, true),
		/** @returns {boolean} true bila kanvas tadinya terdaftar */
		hentikan: (kanvas) => daftar.delete(kanvas),
		hentikanSemua: () => daftar.clear()
	};
}
