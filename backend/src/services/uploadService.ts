import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// Root uploads directory.
// On Azure App Service, set UPLOADS_DIR=/home/data/uploads — that path lives
// outside wwwroot so it survives every deploy. Locally it defaults to
// backend/uploads/ (one level above src/).
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// ── File validation constants (exported for reuse in multer config) ──────────
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_REQUEST = 5;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

// ── Custom validation error ───────────────────────────────────────────────────
export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ── Magic-bytes validator (prevents MIME spoofing) ────────────────────────────
function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 8) return false;
  if (mimetype === 'image/jpeg')
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png')
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (mimetype === 'image/webp')
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  if (mimetype === 'image/gif')
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  return false;
}

// ── Sanitize filename to prevent directory traversal ─────────────────────────
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .substring(0, 100);
}

// ── Ensure upload subdirectory exists ────────────────────────────────────────
function ensureDir(folder: string): string {
  const dir = path.join(UPLOADS_ROOT, folder);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Per-file validation (disk-based) ─────────────────────────────────────────
interface UploadFile {
  path: string;
  mimetype: string;
  size: number;
  originalname?: string;
}

function validateFile(file: UploadFile): void {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new ValidationError('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError('File too large. Max 10 MB allowed.');
  }
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(file.path, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);
  if (!validateMagicBytes(buffer, file.mimetype)) {
    throw new ValidationError('File content does not match declared MIME type.');
  }
}

// ── Simple semaphore for concurrency limiting ─────────────────────────────────
function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (active < limit) { active++; resolve(); }
    else queue.push(() => { active++; resolve(); });
  });
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };
  return { acquire, release };
}

// ── Server base URL (for building absolute URLs to uploaded files) ────────────
export function getServerBaseUrl(): string {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 4000}`;
}

/** Build a full URL from a relative upload path like /uploads/kyc/file.jpg */
export function getUploadUrl(relativePath: string): string {
  return `${getServerBaseUrl()}${relativePath}`;
}

// ── uploadImage — save a multer disk-storage file to uploads/{folder}/ ────────
export async function uploadImage(file: UploadFile, folder: string): Promise<string> {
  validateFile(file);
  const safeName = sanitizeFilename(file.originalname || 'upload');
  const ext = MIME_TO_EXT[file.mimetype] || path.extname(safeName) || '.jpg';
  const filename = `${Date.now()}_${safeName.split('.')[0]}${ext}`;
  const dir = ensureDir(folder);
  fs.copyFileSync(file.path, path.join(dir, filename));
  logger.info('Image saved locally', { folder, filename });
  return getUploadUrl(`/uploads/${folder}/${filename}`);
}

// ── saveBuffer — save an in-memory Buffer to uploads/{folder}/ ───────────────
export async function saveBuffer(
  buffer: Buffer,
  mimetype: string,
  folder: string,
  basename?: string,
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    throw new ValidationError('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError('File too large. Max 10 MB allowed.');
  }
  if (!validateMagicBytes(buffer, mimetype)) {
    throw new ValidationError('File content does not match declared MIME type.');
  }
  const ext = MIME_TO_EXT[mimetype] || '.jpg';
  const safe = basename ? sanitizeFilename(basename).split('.')[0] : 'file';
  const filename = `${Date.now()}_${safe}${ext}`;
  const dir = ensureDir(folder);
  fs.writeFileSync(path.join(dir, filename), buffer);
  logger.info('Buffer saved locally', { folder, filename });
  return getUploadUrl(`/uploads/${folder}/${filename}`);
}

// ── uploadMultipleImages ──────────────────────────────────────────────────────
export async function uploadMultipleImages(
  files: UploadFile[],
  folder: string,
): Promise<string[]> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new ValidationError('No files provided');
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    throw new ValidationError(`Max ${MAX_FILES_PER_REQUEST} files per request`);
  }
  for (const file of files) {
    validateFile(file);
  }
  const sem = createSemaphore(3);
  return Promise.all(
    files.map(async (file) => {
      await sem.acquire();
      try {
        return await uploadImage(file, folder);
      } finally {
        sem.release();
      }
    })
  );
}

// ── deleteImage — remove a local upload file ──────────────────────────────────
export async function deleteImage(relativePath: string): Promise<void> {
  try {
    const fullPath = path.join(UPLOADS_ROOT, relativePath.replace(/^\/uploads\//, ''));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    logger.error('Local delete error', { error: String(error) });
    throw new Error('Failed to delete image');
  }
}

// ── saveRawBuffer — save any file type without image validation ───────────────
// Used for PDFs and other non-image files (e.g. KYC PDF documents).
export async function saveRawBuffer(
  buffer: Buffer,
  folder: string,
  filename: string,
): Promise<string> {
  const dir = ensureDir(folder);
  fs.writeFileSync(path.join(dir, filename), buffer);
  logger.info('Raw buffer saved locally', { folder, filename });
  return getUploadUrl(`/uploads/${folder}/${filename}`);
}

// ── getPublicIdFromUrl — extract relative path from a full upload URL ─────────
export function getPublicIdFromUrl(url: string): string {
  const base = getServerBaseUrl();
  if (url.startsWith(base)) {
    return url.slice(base.length);
  }
  return url;
}
