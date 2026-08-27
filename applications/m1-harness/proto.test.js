import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { encodePing, decodePong } from './proto.js';

// Membaca skema yang SAMA dengan yang dipakai server. Menyalin isi
// ro.proto ke dalam test akan membuat test tetap lulus walaupun skema
// aslinya berubah — persis bug yang paling ingin dicegah di sini.
const HERE        = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, '../../../proto/ro.proto');

function types() {
	const root = protobuf.parse(readFileSync(SCHEMA_PATH, 'utf8')).root;
	return {
		ClientMsg: root.lookupType('ro.v1.ClientMsg'),
		ServerMsg: root.lookupType('ro.v1.ServerMsg'),
	};
}

describe('codec protobuf client', () => {
	it('encodePing menghasilkan ArrayBuffer yang dapat didekode kembali', () => {
		const { ClientMsg } = types();

		const buf = encodePing(ClientMsg, 'halo', 1234);
		expect(buf).toBeInstanceOf(ArrayBuffer);

		const decoded = ClientMsg.decode(new Uint8Array(buf));
		expect(decoded.ping.text).toBe('halo');
		expect(Number(decoded.ping.clientTimeMs)).toBe(1234);
	});

	it('decodePong membaca EvtPong menjadi objek biasa', () => {
		const { ServerMsg } = types();

		const raw = ServerMsg.encode(ServerMsg.create({
			pong: { text: 'halo', clientTimeMs: 1234, serverTimeMs: 5678 },
		})).finish();

		const out = decodePong(ServerMsg, raw.buffer.slice(
			raw.byteOffset, raw.byteOffset + raw.byteLength));

		expect(out).toEqual({ text: 'halo', clientTimeMs: 1234, serverTimeMs: 5678 });
	});

	it('decodePong mengembalikan null bila body bukan pong', () => {
		const { ServerMsg } = types();

		const raw = ServerMsg.encode(ServerMsg.create({})).finish();
		const out = decodePong(ServerMsg, raw.buffer.slice(
			raw.byteOffset, raw.byteOffset + raw.byteLength));

		expect(out).toBeNull();
	});
});
