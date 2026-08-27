import protobuf from 'protobufjs';

/**
 * Memuat skema protokol dari server saat runtime.
 *
 * Skema hanya ada di satu tempat: proto/ro.proto di repo server. Server
 * menyajikannya lewat /proto/ro.proto, sehingga client dan server
 * mustahil memakai versi berbeda.
 */
export async function loadSchema(url) {
	const root = await protobuf.load(url);
	return {
		ClientMsg: root.lookupType('ro.v1.ClientMsg'),
		ServerMsg: root.lookupType('ro.v1.ServerMsg'),
	};
}

export function encodePing(ClientMsg, text, clientTimeMs) {
	const msg = ClientMsg.create({ ping: { text, clientTimeMs } });
	const bytes = ClientMsg.encode(msg).finish();
	// protobufjs mengembalikan Uint8Array yang mungkin berbagi buffer
	// lebih besar; potong agar ArrayBuffer-nya tepat sebesar isinya.
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function decodePong(ServerMsg, arrayBuffer) {
	const msg = ServerMsg.decode(new Uint8Array(arrayBuffer));
	if (!msg.pong) {
		return null;
	}
	return {
		text:         msg.pong.text,
		clientTimeMs: Number(msg.pong.clientTimeMs),
		serverTimeMs: Number(msg.pong.serverTimeMs),
	};
}
