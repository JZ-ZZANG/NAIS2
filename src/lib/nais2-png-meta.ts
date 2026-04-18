/**
 * Inject/read NAIS2-specific metadata into PNG tEXt chunks.
 *
 * NAI does not echo qualityToggle/ucPreset into the image Comment JSON,
 * so we embed them ourselves (keyword: "nais2-params", value: base64 of JSON)
 * to guarantee round-trip when re-importing our own images.
 *
 * Format matches the approach used by SDStudio.
 */

export interface Nais2PromptParts {
    base: string
    additional: string
    detail: string
    negative?: string
    inpainting?: string
}

export interface Nais2Params {
    qualityToggle?: boolean
    ucPreset?: number
    promptParts?: Nais2PromptParts
    version?: number
    [k: string]: unknown
}

const NAIS2_KEYWORD = 'nais2-params'
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

// CRC32 (IEEE polynomial) — same table PNG spec uses.
const CRC_TABLE = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
        t[n] = c >>> 0
    }
    return t
})()

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

function bytesToBase64(bytes: Uint8Array): string {
    let s = ''
    const chunk = 32768
    for (let i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))))
    }
    return btoa(s)
}

function isPng(bytes: Uint8Array): boolean {
    if (bytes.length < 8) return false
    for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false
    return true
}

function buildTextChunk(keyword: string, value: string): Uint8Array {
    // tEXt data = keyword (Latin-1) + \0 + value (Latin-1).
    // We wrap value in base64 so non-ASCII JSON stays Latin-1 safe.
    const keywordBytes = new TextEncoder().encode(keyword)
    const valueBytes = new TextEncoder().encode(value)
    const data = new Uint8Array(keywordBytes.length + 1 + valueBytes.length)
    data.set(keywordBytes, 0)
    data[keywordBytes.length] = 0
    data.set(valueBytes, keywordBytes.length + 1)

    const chunk = new Uint8Array(4 + 4 + data.length + 4)
    const dv = new DataView(chunk.buffer)
    dv.setUint32(0, data.length, false)
    chunk[4] = 0x74; chunk[5] = 0x45; chunk[6] = 0x58; chunk[7] = 0x74  // "tEXt"
    chunk.set(data, 8)
    // CRC covers type + data.
    const crc = crc32(chunk.subarray(4, 8 + data.length))
    dv.setUint32(8 + data.length, crc, false)
    return chunk
}

/**
 * Embed NAIS2-specific params into a PNG (base64 in, base64 out).
 * Inserts a "nais2-params" tEXt chunk immediately after IHDR. If the input is
 * not a valid PNG the original base64 is returned unchanged.
 */
export function embedNais2Params(pngBase64: string, params: Nais2Params): string {
    const bytes = base64ToBytes(pngBase64)
    if (!isPng(bytes)) return pngBase64

    // Find end of IHDR to know where to splice. IHDR always follows the 8-byte
    // signature: [len(4) "IHDR"(4) data(13) crc(4)] = 25 bytes → ends at 33.
    const ihdrEnd = 8 + 4 + 4 + 13 + 4
    if (bytes.length < ihdrEnd) return pngBase64

    // If an existing nais2-params chunk is present (rare but possible on
    // re-save), strip it before inserting the new one.
    const stripped = stripNais2Chunk(bytes)

    const value = bytesToBase64(new TextEncoder().encode(JSON.stringify({ version: 1, ...params })))
    const newChunk = buildTextChunk(NAIS2_KEYWORD, value)

    const out = new Uint8Array(stripped.length + newChunk.length)
    out.set(stripped.subarray(0, ihdrEnd), 0)
    out.set(newChunk, ihdrEnd)
    out.set(stripped.subarray(ihdrEnd), ihdrEnd + newChunk.length)
    return bytesToBase64(out)
}

/**
 * Read NAIS2 params (returns null if no nais2-params chunk or decode fails).
 * Accepts PNG bytes (not base64).
 */
export function readNais2Params(bytes: Uint8Array): Nais2Params | null {
    if (!isPng(bytes)) return null

    let off = 8
    while (off + 12 <= bytes.length) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const len = dv.getUint32(off, false)
        const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7])

        if (type === 'tEXt') {
            const data = bytes.subarray(off + 8, off + 8 + len)
            const nullIdx = data.indexOf(0)
            if (nullIdx > 0) {
                const keyword = new TextDecoder('latin1').decode(data.subarray(0, nullIdx))
                if (keyword === NAIS2_KEYWORD) {
                    try {
                        const b64 = new TextDecoder('latin1').decode(data.subarray(nullIdx + 1))
                        const jsonStr = new TextDecoder('utf-8').decode(base64ToBytes(b64))
                        return JSON.parse(jsonStr) as Nais2Params
                    } catch { return null }
                }
            }
        }

        if (type === 'IEND') break
        off += 12 + len
    }
    return null
}

// Strip any existing nais2-params tEXt chunk so callers can cleanly re-embed.
function stripNais2Chunk(bytes: Uint8Array): Uint8Array {
    if (!isPng(bytes)) return bytes
    const keep: Array<Uint8Array> = [bytes.subarray(0, 8)]
    let off = 8
    while (off + 12 <= bytes.length) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const len = dv.getUint32(off, false)
        const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7])
        const total = 12 + len
        let drop = false
        if (type === 'tEXt') {
            const data = bytes.subarray(off + 8, off + 8 + len)
            const nullIdx = data.indexOf(0)
            if (nullIdx > 0) {
                const keyword = new TextDecoder('latin1').decode(data.subarray(0, nullIdx))
                if (keyword === NAIS2_KEYWORD) drop = true
            }
        }
        if (!drop) keep.push(bytes.subarray(off, off + total))
        if (type === 'IEND') { off += total; break }
        off += total
    }
    if (off < bytes.length) keep.push(bytes.subarray(off))  // trailer safety
    const total = keep.reduce((n, a) => n + a.length, 0)
    const out = new Uint8Array(total)
    let p = 0
    for (const part of keep) { out.set(part, p); p += part.length }
    return out
}
