/**
 * Magic-byte (file signature) checks for uploaded files.
 * Catches renamed scriptable / executable content that MIME/extension filters miss.
 */
import fs from 'fs/promises';

/** @typedef {'jpeg'|'png'|'gif'|'webp'|'bmp'|'avif'|'heic'|'pdf'|'zip'|'rar'|'7z'|'ole'|'html'|'svg'|'elf'|'pe'|'unknown'} ContentKind */

const AVATAR_KINDS = new Set(['jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic']);

/**
 * @param {Buffer} buf
 * @returns {ContentKind}
 */
export function detectContentKind(buf) {
  if (!buf || buf.length < 4) return 'unknown';

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  // GIF
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') {
    return 'gif';
  }
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  // WEBP (RIFF....WEBP)
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  // PDF
  if (buf.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
  // ZIP / OOXML (docx, xlsx, pptx)
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return 'zip';
  }
  // RAR
  if (buf.slice(0, 4).toString('ascii') === 'Rar!') return 'rar';
  // 7z
  if (
    buf[0] === 0x37 &&
    buf[1] === 0x7a &&
    buf[2] === 0xbc &&
    buf[3] === 0xaf &&
    buf[4] === 0x27 &&
    buf[5] === 0x1c
  ) {
    return '7z';
  }
  // Old Office OLE
  if (
    buf.length >= 8 &&
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  ) {
    return 'ole';
  }
  // ELF / PE
  if (buf[0] === 0x7f && buf.slice(1, 4).toString('ascii') === 'ELF') return 'elf';
  if (buf[0] === 0x4d && buf[1] === 0x5a) return 'pe';

  // ISO BMFF (AVIF / HEIC): ....ftyp....
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('avif') || brand === 'avis') return 'avif';
    if (
      brand.includes('heic') ||
      brand.includes('heif') ||
      brand === 'mif1' ||
      brand === 'msf1'
    ) {
      return 'heic';
    }
  }

  // Textual HTML / SVG (after optional BOM / whitespace)
  const head = stripBom(buf).toString('utf8', 0, Math.min(buf.length, 256)).trimStart().toLowerCase();
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.startsWith('<body') ||
    head.startsWith('<?xml') && head.includes('<html')
  ) {
    return 'html';
  }
  if (
    head.startsWith('<svg') ||
    head.startsWith('<?xml') && head.includes('<svg') ||
    head.startsWith('<!doctype svg')
  ) {
    return 'svg';
  }

  return 'unknown';
}

function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3);
  }
  return buf;
}

/**
 * @param {string} mime
 * @returns {ContentKind[]}
 */
function expectedKindsForMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase();
  switch (m) {
    case 'image/jpeg':
    case 'image/jpg':
      return ['jpeg'];
    case 'image/png':
      return ['png'];
    case 'image/gif':
      return ['gif'];
    case 'image/webp':
      return ['webp'];
    case 'image/bmp':
    case 'image/x-ms-bmp':
      return ['bmp'];
    case 'image/avif':
      return ['avif'];
    case 'image/heic':
    case 'image/heif':
      return ['heic'];
    case 'application/pdf':
      return ['pdf'];
    case 'application/zip':
    case 'application/x-zip-compressed':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return ['zip'];
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return ['ole', 'zip']; // legacy OLE or sometimes zip-wrapped
    case 'application/x-rar-compressed':
    case 'application/vnd.rar':
      return ['rar'];
    case 'application/x-7z-compressed':
      return ['7z'];
    case 'text/html':
    case 'application/xhtml+xml':
      return ['html'];
    case 'image/svg+xml':
      return ['svg'];
    default:
      return [];
  }
}

/** Native executables — always rejected regardless of admin allowlist. */
const ALWAYS_REJECT = new Set(['elf', 'pe']);

const SCRIPTABLE_KIND_MIMES = {
  html: ['text/html', 'application/xhtml+xml'],
  svg: ['image/svg+xml']
};

function isMimeAllowed(allowedTypes, mime) {
  if (!allowedTypes || typeof allowedTypes !== 'object') return false;
  return allowedTypes[mime] === true;
}

function isScriptableKindAllowed(kind, allowedTypes) {
  const mimes = SCRIPTABLE_KIND_MIMES[kind];
  if (!mimes) return false;
  return mimes.some((m) => isMimeAllowed(allowedTypes, m));
}

/**
 * Read leading bytes from a multer disk file (or buffer).
 * @param {{ path?: string, buffer?: Buffer }} file
 * @param {number} [length=64]
 * @returns {Promise<Buffer>}
 */
export async function readFileMagic(file, length = 64) {
  if (file?.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer.subarray(0, Math.min(length, file.buffer.length));
  }
  if (!file?.path) {
    throw new Error('Uploaded file path is missing');
  }
  const fh = await fs.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // best-effort cleanup
  }
}

/**
 * Validate multer file content against claimed MIME / avatar rules.
 * Deletes the temp file on failure.
 *
 * @param {Express.Multer.File} file
 * @param {{
 *   mode?: 'avatar'|'attachment',
 *   limitsEnforced?: boolean,
 *   allowedTypes?: Record<string, boolean>
 * }} [options]
 * @returns {Promise<{ valid: boolean, error?: string, kind?: ContentKind }>}
 */
export async function validateUploadedFileMagic(file, options = {}) {
  const mode = options.mode || 'attachment';
  const limitsEnforced = options.limitsEnforced !== false;
  const allowedTypes = options.allowedTypes || {};

  if (!file) {
    return { valid: false, error: 'No file uploaded' };
  }

  let buf;
  try {
    buf = await readFileMagic(file, 64);
  } catch (err) {
    await safeUnlink(file.path);
    return { valid: false, error: 'Could not read uploaded file for validation' };
  }

  const kind = detectContentKind(buf);

  // PE / ELF always blocked
  if (ALWAYS_REJECT.has(kind)) {
    await safeUnlink(file.path);
    return {
      valid: false,
      error: `File content looks like ${kind.toUpperCase()}, which is not allowed`,
      kind
    };
  }

  // Avatars / logos: raster only (never HTML/SVG even if attachment allowlist enables them)
  if (mode === 'avatar') {
    if (!AVATAR_KINDS.has(kind)) {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: 'Avatar must be a real raster image (JPEG, PNG, GIF, WebP, BMP, AVIF, or HEIC)',
        kind
      };
    }
    const expected = expectedKindsForMime(file.mimetype);
    if (expected.length > 0 && !expected.includes(kind)) {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `Avatar content does not match declared type (${file.mimetype})`,
        kind
      };
    }
    return { valid: true, kind };
  }

  // Attachments: when limits are off ("all types"), only PE/ELF were blocked above
  if (!limitsEnforced) {
    return { valid: true, kind };
  }

  // HTML / SVG content allowed only if admin enabled those MIME types
  if (kind === 'html' || kind === 'svg') {
    if (!isScriptableKindAllowed(kind, allowedTypes)) {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `File content looks like ${kind.toUpperCase()}, which is not enabled for uploads`,
        kind
      };
    }
    const expected = expectedKindsForMime(file.mimetype);
    // Declared as svg/html → OK; declared as something else (e.g. png) while content is svg → reject
    if (expected.length > 0 && !expected.includes(kind)) {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `File content (${kind}) does not match declared type (${file.mimetype})`,
        kind
      };
    }
    if (expected.length === 0) {
      const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
      if (mime && !SCRIPTABLE_KIND_MIMES[kind].includes(mime)) {
        await safeUnlink(file.path);
        return {
          valid: false,
          error: `File content (${kind}) does not match declared type (${file.mimetype})`,
          kind
        };
      }
    }
    return { valid: true, kind };
  }

  // When we know both claimed MIME and detected kind, require agreement.
  const expected = expectedKindsForMime(file.mimetype);
  if (expected.length > 0) {
    if (kind === 'unknown') {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `File content does not match declared type (${file.mimetype})`,
        kind
      };
    }
    if (!expected.includes(kind)) {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `File content (${kind}) does not match declared type (${file.mimetype})`,
        kind
      };
    }
  }

  // Claimed as raster image/* but magic is non-image (except svg handled above)
  const mime = String(file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
    if (!AVATAR_KINDS.has(kind) && kind !== 'unknown') {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: `File content (${kind}) is not a valid image`,
        kind
      };
    }
    if (kind === 'unknown') {
      await safeUnlink(file.path);
      return {
        valid: false,
        error: 'File content does not look like a valid image',
        kind
      };
    }
  }

  return { valid: true, kind };
}
