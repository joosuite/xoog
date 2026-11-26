import {execFile} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {open, rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {basename, extname, join, resolve} from 'node:path';
import {clean, type Attachment} from './model.js';

export function safeAttachmentName(name: string): string {
  let value = basename(clean(name).replace(/\\/g, '/')).replace(/[<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/, '');
  if (!value || /^\.+$/.test(value)) value = 'attachment';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = `_${value}`;
  if (Buffer.byteLength(value) > 200) {
    const extension = extname(value).slice(0, 20);
    value = Buffer.from(value.slice(0, value.length - extname(value).length)).subarray(0, 180).toString('utf8').replace(/\ufffd+$/, '') + extension;
  }
  return value;
}
export function attachmentPath(value: string): string {
  const path = value.trim();
  if (!path) throw new Error('Enter a destination path.');
  return /^~[\\/]/.test(path) ? join(homedir(), path.slice(2)) : resolve(path);
}
export function attachmentSize(size?: number): string {
  if (size === undefined) return 'Size unknown';
  return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / (1024 * 1024)).toFixed(1)} MiB`;
}
export function decodeAttachmentData(data: string): Buffer {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(data)) throw new Error('The attachment has invalid base64url data.');
  const decoded = Buffer.from(data, 'base64url');
  if (decoded.toString('base64url') !== data.replace(/=+$/, '')) throw new Error('The attachment has invalid base64url data.');
  return decoded;
}
export async function writeNewAttachment(destination: string, data: Uint8Array, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const file = await open(destination, 'wx', 0o600);
  try {await file.writeFile(data, {signal});}
  catch (cause) {await file.close(); await rm(destination, {force: true}); throw cause;}
  await file.close();
}
export async function copyNewFile(source: string, destination: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const file = await open(destination, 'wx', 0o600);
  try {await pipeline(createReadStream(source), file.createWriteStream(), {signal});}
  catch (cause) {await file.close().catch(() => {}); await rm(destination, {force: true}); throw cause;}
}

const externalTypes: Record<string, string> = {
  'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/tiff': '.tiff', 'image/bmp': '.bmp', 'image/heic': '.heic', 'image/avif': '.avif',
};
export function attachmentPreview(attachment: Attachment): {kind: 'text' | 'external'; extension: string} | undefined {
  const mime = attachment.mimeType.toLowerCase().split(';')[0]!.trim();
  if (externalTypes[mime]) return {kind: 'external', extension: externalTypes[mime]!};
  if (mime.startsWith('text/') || ['application/json', 'application/xml', 'image/svg+xml'].includes(mime)) return {kind: 'text', extension: '.txt'};
  if (mime === 'application/octet-stream' && /\.(txt|csv|log|md|json|xml|yaml|yml)$/i.test(attachment.name)) return {kind: 'text', extension: '.txt'};
}
export async function readAttachmentPreview(path: string, signal?: AbortSignal): Promise<string> {
  const limit = 256 * 1024, file = await open(path, 'r');
  try {
    signal?.throwIfAborted();
    const {size} = await file.stat(), bytes = Buffer.alloc(Math.min(size, limit));
    const {bytesRead} = await file.read(bytes, 0, bytes.length, 0);
    signal?.throwIfAborted();
    let text: string;
    try {text = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, bytesRead), {stream: size > limit});}
    catch {throw new Error('This file is not UTF-8 text. Download it to view its contents.');}
    return clean(text) + (size > limit ? '\n\n[Preview limited to 256 KiB. Download the full file.]' : '') || '(Empty file)';
  } finally {await file.close();}
}
export async function openAttachmentPreview(path: string, attachment: Attachment, signal?: AbortSignal): Promise<void> {
  const preview = attachmentPreview(attachment);
  if (preview?.kind !== 'external' || extname(path) !== preview.extension) throw new Error('System preview is available for PDFs and supported images.');
  const [binary, args] = process.platform === 'darwin' ? ['/usr/bin/open', ['-a', 'Preview', path]] as const
    : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', path]] as const : ['xdg-open', [path]] as const;
  await new Promise<void>((accept, reject) => execFile(binary, [...args], {signal, timeout: 10_000, windowsHide: true}, error => error ? reject(new Error('Could not open the system viewer. Download the file to open it manually.')) : accept()));
}
