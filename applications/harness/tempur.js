/**
 * applications/harness/tempur.js
 *
 * Dekoder pesan combat M6c.
 *
 * Pola nol-eksplisit di seluruh berkas ini disengaja: protobuf
 * menghilangkan field bernilai nol dari kawat, dan `x || 0` menelan nol
 * yang SAH. hpSisa nol berarti target mati; koordinat nol adalah petak
 * yang ada di setiap map. Jebakan yang sama menggigit objecttype 0 di
 * M6a, tempat TYPE_PC bernilai nol dan hampir jatuh ke cabang salah.
 */

// num mengubah apa pun menjadi angka, dengan absen berarti NOL dan bukan
// undefined. Ditulis sekali supaya tidak ada satu field pun yang lupa.
const num = (v) => (v === undefined || v === null ? 0 : Number(v));

// Nilai enum JenisDamage dari proto/ro.proto.
//
// Nol adalah TIDAK_DIKENAL, BUKAN normal: server selalu menyetel jenis
// secara eksplisit, jadi nol yang tiba berarti ada yang salah dan panel
// HUD menandainya alih-alih menelannya.
export const JENIS_TIDAK_DIKENAL = 0;
export const JENIS_NORMAL = 1;
export const JENIS_MISS = 2;
export const JENIS_KRITIKAL = 3;

export function decodeDamage(m) {
	return {
		src: num(m.src),
		dst: num(m.dst),
		amount: num(m.amount),
		hpSisa: num(m.hpSisa),
		jenis: num(m.jenis),
	};
}

export function decodeDeath(m) {
	return { entityId: num(m.entityId) };
}

export function decodeItemTanah(m) {
	return {
		groundId: num(m.groundId),
		namaItem: m.namaItem ?? '',
		x: num(m.x),
		y: num(m.y),
	};
}

export function decodeItemHilang(m) {
	return { groundId: num(m.groundId) };
}

/**
 * Bar darah sebagai persen bulat, dijepit ke 0..100.
 *
 * Dijepit karena server boleh mengirim hpSisa nol pada pukulan yang
 * melampaui nol, dan maxHp nol pada entity yang belum lengkap datanya --
 * keduanya menghasilkan NaN atau angka negatif tanpa penjepit ini.
 */
export function persenDarah(hp, maxHp) {
	if (!maxHp || maxHp <= 0) {
		return 0;
	}
	const p = Math.round((hp / maxHp) * 100);
	return Math.max(0, Math.min(100, p));
}

/**
 * Meng-encode ClientMsg satu-field.
 *
 * Ada DI SINI, bukan di main.js, karena main.js tidak punya satu tes pun.
 * Versi pertamanya mengembalikan hasil `.finish()` apa adanya dan server
 * menolak setiap pesan dengan "cannot parse invalid wire-format data" --
 * cacat yang satu tes round-trip akan tangkap dalam satu detik.
 *
 * `.finish()` mengembalikan Uint8Array yang menunjuk ke buffer BERSAMA
 * milik protobufjs, bukan buffer miliknya sendiri. Mengirimkannya apa
 * adanya mengirim seluruh kolam itu. encodeMove dan encodeEnterMap sudah
 * memotongnya sejak M1 dengan alasan yang sama.
 *
 * Client TIDAK pernah mengirim damage atau apa pun yang server dapat
 * tentukan sendiri: spec induk Bagian 8.3 mengunci "client tidak pernah
 * dipercaya". CmdAttack hanya membawa target; CmdPickup hanya id item.
 */
export function encodeSatuField(ClientMsg, namaField, isi) {
	const u8 = ClientMsg.encode(ClientMsg.create({ [namaField]: isi })).finish();
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/**
 * Memilih entity terdekat dari petak yang diklik.
 *
 * TIDAK memakai kecocokan petak persis, dan itu penting: mob agresif
 * MENGEJAR, jadi ia hampir selalu berada di tengah interpolasi. Posisinya
 * pecahan, sementara klik dipotong ke bilangan bulat -- mob yang tampak
 * jelas di bawah kursor bisa berada di 166,6 saat kliknya menghasilkan
 * 166 atau 167. Kecocokan persis membuat mob yang bergerak nyaris
 * mustahil diklik, dan gejalanya "kadang tidak bisa menyerang".
 *
 * daftar: [{ id, x, y }]. Mengembalikan id terdekat dalam toleransi, atau
 * null. Seri dimenangkan id TERKECIL supaya deterministik.
 */
export function pilihTerdekat(daftar, x, y, toleransi = 1) {
	let pilih = null;
	let jarakTerbaik = Infinity;
	for (const e of daftar) {
		const d = Math.max(Math.abs(e.x - x), Math.abs(e.y - y));
		if (d > toleransi) {
			continue;
		}
		if (d < jarakTerbaik || (d === jarakTerbaik && pilih !== null && e.id < pilih)) {
			pilih = e.id;
			jarakTerbaik = d;
		}
	}
	return pilih;
}

/**
 * Jalur berkas skin angka damage di dalam GRF.
 *
 * DISALIN dari Renderer/Effects/Damage.js (_damageSkins[0]), bukan
 * diimpor: ia const tingkat modul yang tidak diekspor, dan keputusan D3
 * melarang menyentuh client/src untuk mengekspornya. Pola yang sama
 * dipakai tabel ARAH di M4.
 *
 * Nama direktorinya "이펙트" dalam encoding EUC-KR.
 */
export const BERKAS_SKIN_DAMAGE = [
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/\xbc\xfd\xc0\xda.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/msg.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/bluemsg.spr',
	'data/sprite/\xc0\xcc\xc6\xd1\xc6\xae/\xbc\xfd\xc0\xda.act',
];

/**
 * Merangkum hasil probe berkas skin menjadi satu kalimat yang menyebut
 * apa yang harus dilakukan.
 *
 * hasil: [{ nama, ada }]
 */
export function ringkasProbeSkin(hasil) {
	const hilang = hasil.filter((h) => !h.ada).map((h) => h.nama);
	if (hilang.length === 0) {
		return {
			lengkap: true,
			pesan: `skin damage lengkap (${hasil.length}/${hasil.length} berkas) -- angka damage bawaan roBrowserLegacy akan tergambar`,
		};
	}
	return {
		lengkap: false,
		pesan:
			`skin damage TIDAK lengkap: ${hilang.length} dari ${hasil.length} berkas hilang di GRF-mu ` +
			`(${hilang.join(', ')}). Damage.add akan diam TANPA galat -- ` +
			`Client.getFiles tidak meneruskan onerror, jadi callback-nya tidak pernah dipanggil. ` +
			`Panel HUD harness tetap menampilkan damage.`,
	};
}

/**
 * Baris HUD untuk satu peristiwa damage.
 *
 * Dipisahkan dari DOM supaya dapat diuji: panel HUD ada justru karena
 * angka damage bawaan bisa diam, dan panel yang ikut diam tanpa
 * ketahuan akan mengulangi persoalan yang sama.
 */
export function barisHUD(d, maxHp) {
	const persen = persenDarah(d.hpSisa, maxHp);
	const mati = d.hpSisa <= 0 ? ' MATI' : '';
	const sisa = `(${d.hpSisa}${maxHp ? '/' + maxHp : ''} = ${persen}%)`;
	if (d.jenis === JENIS_MISS) {
		// MISS, bukan "-0": nol damage dan tidak kena adalah dua hal
		// berbeda, dan menampilkannya sama menghapus perbedaan yang
		// server justru repot-repot kirimkan.
		return `${d.src} → ${d.dst}  MISS  ${sisa}${mati}`;
	}
	if (d.jenis === JENIS_TIDAK_DIKENAL) {
		// Server selalu eksplisit, jadi ini seharusnya mustahil.
		// Ditandai, bukan ditelan sebagai serangan biasa.
		return `${d.src} → ${d.dst}  -${d.amount}  ?JENIS  ${sisa}${mati}`;
	}
	const label = d.jenis === JENIS_KRITIKAL ? '  KRITIKAL' : '';
	return `${d.src} → ${d.dst}  -${d.amount}${label}  ${sisa}${mati}`;
}

/**
 * Nama tampilan mob dari id job.
 *
 * Membungkus DB.getMonsterName, yang membaca MonsterNameTable --
 * TABEL YANG BERBEDA dari MonsterTable. Keduanya berkunci id yang sama
 * tetapi isinya lain: MonsterNameTable[1184] adalah 'Fabre' (nama
 * tampilan), MonsterTable[1184] adalah 'FABRE' (nama berkas sprite).
 * Memakai yang kedua menghasilkan nama huruf besar yang terlihat seperti
 * konstanta, bukan nama makhluk.
 *
 * cari dioper masuk supaya fungsi ini dapat diuji tanpa memuat seluruh
 * DBManager beserta GRF-nya.
 */
export function namaMob(job, cari) {
	const nama = cari(job);
	// getMonsterName mengembalikan 'Unknown' untuk id yang tidak ada.
	// Ditambahi idnya supaya laporan verifikasi menyebut mob MANA yang
	// tidak dikenal, alih-alih sederet 'Unknown' yang identik.
	if (!nama || nama === 'Unknown') {
		return `?${job}`;
	}
	return nama;
}

/**
 * Menyalakan bar HP sebuah entity.
 *
 * URUTANNYA WAJIB: isi hp dan hp_max DULU, update() belakangan.
 * EntityLife.update() diawali
 *
 *     if (this.hp < 0 || this.hp_max < 0) { this.remove(); return; }
 *
 * dan nilai awal keduanya -1. Memanggil update() lebih dulu MENGHAPUS
 * barnya tanpa satu pun galat: bar tak muncul, konsol bersih.
 *
 * Mengembalikan false bila datanya tidak layak, sehingga pemanggil dapat
 * melaporkannya alih-alih diam.
 */
export function hidupkanBar(life, hp, maxHp) {
	if (!life || !(maxHp > 0) || hp === undefined || hp === null) {
		return false;
	}
	life.hp = hp;
	life.hp_max = maxHp;
	life.update();
	return true;
}

// Nilai yang EntityAction pakai untuk "aksi ini tidak ada bagi
// tipe/job ini". BUKAN -2, yang merupakan sentinel ATTACK.
export const AKSI_TIDAK_ADA = -1;

// objecttype roBrowserLegacy yang harness pakai.
export const TIPE_PC = 0;
export const TIPE_MOB = 5;

/**
 * Apakah entity yang mati harus DIHAPUS dari client?
 *
 * Hanya mob. Server M6c keputusan Bagian 4.6 menyatakan entity PEMAIN
 * tidak dihapus saat mati -- ia dipindah ke titik spawn dan HP-nya diisi
 * ulang. Client yang menghapusnya melanggar keputusan itu, dan akibatnya
 * halus: Camera.setTarget memegang referensi ke objek entity, jadi
 * EvtSpawn respawn membuat objek BARU dan kamera tetap menunjuk yang
 * lama -- kamera mengikuti hantu di posisi kematian.
 *
 * Ditemukan di browser oleh manusia yang tahu RO: di permainan asli,
 * memilih respawn memuat ulang map sehingga kamera dibangun ulang. Yang
 * TIDAK memuat ulang justru Resurrection dan Yggdrasil Leaf -- dan di
 * sana entity-nya memang tidak pernah dihapus.
 */
export function perluDihapusSetelahMati(objecttype) {
	return objecttype === TIPE_MOB;
}

/**
 * Memainkan satu animasi sekali jalan, lalu kembali ke aksi berikutnya.
 *
 * Dipakai untuk DIE, HURT, dan ATTACK. Ditulis sekali supaya bentuk
 * option-nya -- yang mudah salah -- hanya ada di satu tempat.
 *
 * next: null berarti animasinya BERHENTI di frame terakhir. Itu yang
 * benar untuk DIE (mayat tetap tergeletak) dan salah untuk HURT
 * (makhluk harus kembali berdiri).
 */
export function mainkanAksi(entity, aksi, kembaliKe) {
	if (!entity || !entity.setAction || !entity.ACTION) {
		return false;
	}
	// -1 dan -2 BERBEDA, dan menyamakannya mematikan animasi serang
	// pemain.
	//
	// EntityAction menyetel nilai awal ATTACK = -2, HURT = -1, DIE = -1.
	// Yang -1 berarti "aksi ini tidak ada untuk tipe/job ini"; yang -2
	// adalah SENTINEL yang setAction terjemahkan sendiri ke ATTACK1/2/3
	// menurut senjata (EntityAction.js:88-96).
	//
	// Mob punya ACTION.ATTACK = 2, aksi sungguhan. Pemain punya -2. Jadi
	// penjaga "tolak semua negatif" akan bekerja untuk mob dan
	// diam-diam mematikan animasi serang pemain.
	if (aksi === undefined || aksi === null || aksi === AKSI_TIDAK_ADA) {
		return false;
	}
	entity.setAction({
		action: aksi,
		frame: 0,
		repeat: false,
		play: true,
		next: kembaliKe === null || kembaliKe === undefined
			? false
			: { action: kembaliKe, frame: 0, repeat: true, play: true, next: false },
	});
	return true;
}
