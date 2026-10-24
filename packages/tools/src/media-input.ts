export function isRasterImage(bytes: Uint8Array) {
    const signature = Buffer.from(bytes).subarray(0, 32);
    const raster =
        signature.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
        signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        /^GIF8[79]a/.test(signature.toString('ascii')) ||
        (signature.toString('ascii', 0, 4) === 'RIFF' &&
            signature.toString('ascii', 8, 12) === 'WEBP') ||
        ['49492a00', '4d4d002a'].includes(signature.subarray(0, 4).toString('hex')) ||
        (signature.toString('ascii', 4, 8) === 'ftyp' &&
            /avif|avis/.test(signature.toString('ascii', 8)));
    return raster;
}
