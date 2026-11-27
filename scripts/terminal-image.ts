import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {type Terminal} from '@xterm/headless';

const cellWidth = 9, cellHeight = 21, padding = 12;
const fonts = [
  {path: '/System/Library/Fonts/Menlo.ttc', family: 'Menlo'},
  {path: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', family: 'DejaVu Sans Mono'},
  {path: '/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf', family: 'Liberation Mono'},
  {path: join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'consola.ttf'), family: 'Consolas'},
];
const font = fonts.find(candidate => existsSync(candidate.path));
if (!font || !GlobalFonts.registerFromPath(font.path)) throw new Error('Install a monospace font: Menlo, DejaVu Sans Mono, Liberation Mono, or Consolas.');
const fontFamily = font.family;

const ansi16 = ['#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5', '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff'];
function color(value: number, rgb: boolean, indexed: boolean, fallback: string): string {
  if (rgb) return '#' + value.toString(16).padStart(6, '0');
  if (!indexed) return fallback;
  if (value < 16) return ansi16[value]!;
  if (value >= 232) {const n = 8 + (value - 232) * 10; return `rgb(${n},${n},${n})`;}
  const n = value - 16, level = (v: number) => v ? 55 + v * 40 : 0;
  return `rgb(${level(Math.floor(n / 36))},${level(Math.floor(n / 6) % 6)},${level(n % 6)})`;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);}
  return (crc ^ 0xffff_ffff) >>> 0;
}
function textChunk(key: string, value: string): Buffer {
  const data = Buffer.from(`tEXt${key}\0${value}`, 'latin1');
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length - 4); checksum.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, checksum]);
}
export async function terminalImage(terminal: Terminal, palette: {background: string; text: string}, source: string): Promise<Buffer> {
  const canvas = createCanvas(terminal.cols * cellWidth + padding * 2, terminal.rows * cellHeight + padding * 2);
  const context = canvas.getContext('2d');
  context.fillStyle = palette.background; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < terminal.rows; y++) {
    const line = terminal.buffer.active.getLine(y);
    if (!line) continue;
    for (let x = 0; x < terminal.cols; x++) {
      const cell = line.getCell(x)!;
      const foreground = color(cell.getFgColor(), cell.isFgRGB(), cell.isFgPalette(), palette.text);
      const background = color(cell.getBgColor(), cell.isBgRGB(), cell.isBgPalette(), palette.background);
      context.fillStyle = cell.isInverse() ? foreground : background;
      context.fillRect(padding + x * cellWidth, padding + y * cellHeight, cellWidth, cellHeight);
    }
    for (let x = 0; x < terminal.cols; x++) {
      const cell = line.getCell(x)!;
      if (!cell.getWidth() || !cell.getChars().trim()) continue;
      context.fillStyle = cell.isInverse() ? color(cell.getBgColor(), cell.isBgRGB(), cell.isBgPalette(), palette.background)
        : color(cell.getFgColor(), cell.isFgRGB(), cell.isFgPalette(), palette.text);
      context.font = `${cell.isBold() ? 'bold' : 'normal'} 15px "${fontFamily}"`;
      context.fillText(cell.getChars(), padding + x * cellWidth, padding + y * cellHeight + 16);
    }
  }
  const png = await canvas.encode('png');
  return Buffer.concat([png.subarray(0, -12), textChunk('Description', source), textChunk('impeccable:prompt', `Source: ${source}`), png.subarray(-12)]);
}
