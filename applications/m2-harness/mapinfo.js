/**
 * Logika murni untuk pesan map. Dipisahkan dari main.js supaya dapat diuji
 * tanpa WebGL, tanpa GRF, dan tanpa server yang berjalan.
 */

/**
 * MapRenderer.setMap menuntut nama berkas .rsw, sedangkan server mengirim
 * nama map polos ("geffen").
 */
export function rswFileName(mapName) {
	if (!mapName) {
		throw new Error('nama map kosong');
	}
	return mapName.endsWith('.rsw') ? mapName : `${mapName}.rsw`;
}

function toArrayBuffer(u8) {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

export function encodeEnterMap(ClientMsg, mapName) {
	const msg = ClientMsg.create({ enterMap: { mapName } });
	return toArrayBuffer(ClientMsg.encode(msg).finish());
}

export function decodeMapInfo(ServerMsg, arrayBuffer) {
	const msg = ServerMsg.decode(new Uint8Array(arrayBuffer));
	if (!msg.mapInfo) {
		return null;
	}
	return {
		mapName: msg.mapInfo.mapName,
		xs:      Number(msg.mapInfo.xs),
		ys:      Number(msg.mapInfo.ys),
		spawnX:  Number(msg.mapInfo.spawnX),
		spawnY:  Number(msg.mapInfo.spawnY)
	};
}

export function decodeServerError(ServerMsg, arrayBuffer) {
	const msg = ServerMsg.decode(new Uint8Array(arrayBuffer));
	return msg.error ? msg.error.reason : null;
}
