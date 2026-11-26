#!/usr/bin/env python3
"""Rasterize real Ink PTY output using a fictitious account and synthetic data."""

import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import sys
import termios
import time

import pyte
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'assets/screenshots'
ACCOUNT = 'simon.delcourt@example.com'
CELL_WIDTH, CELL_HEIGHT, PADDING = 9, 21, 12
BACKGROUND = '#101827'


def fonts():
    menlo = Path('/System/Library/Fonts/Menlo.ttc')
    if menlo.exists():
        return (ImageFont.truetype(str(menlo), 15),
                ImageFont.truetype(str(menlo), 15, index=1))
    return (ImageFont.truetype('DejaVuSansMono.ttf', 15),
            ImageFont.truetype('DejaVuSansMono-Bold.ttf', 15))


FONT, BOLD = fonts()
COLORS = {
    'black': '#101827', 'red': '#cc6666', 'green': '#a6dba8',
    'brown': '#f0cb82', 'blue': '#3154ae', 'magenta': '#b294bb',
    'cyan': '#8abeb7', 'white': '#e8edf5', 'brightblack': '#576b86',
    'brightred': '#ffabab', 'brightgreen': '#a6dba8',
    'brightyellow': '#f0cb82', 'brightblue': '#8cacff',
    'brightmagenta': '#b294bb', 'brightcyan': '#8abeb7',
    'brightwhite': '#ffffff',
}


def color(value, background=False):
    fallback = BACKGROUND if background else '#e8edf5'
    if value == 'default':
        return fallback
    if len(value) == 6 and all(c in '0123456789abcdefABCDEF' for c in value):
        return '#' + value
    return COLORS.get(value, fallback)


def capture(name, columns, rows, steps=(), light=False, review=False):
    pid, descriptor = pty.fork()
    if pid == 0:
        os.chdir(ROOT)
        fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
        os.environ.pop('NO_COLOR', None)
        os.environ.update(TERM='xterm-256color', COLORTERM='truecolor',
                          FORCE_COLOR='3', TZ='Europe/Paris', LANG='en_US.UTF-8')
        args = ['node', 'scripts/screenshot-preview.mjs']
        if light:
            args.append('--light')
        if review:
            args.append('--review')
        os.execvp('node', args)

    screen = pyte.Screen(columns, rows)
    stream = pyte.Stream(screen)
    decoder = codecs.getincrementaldecoder('utf-8')()

    def drain(duration):
        deadline = time.monotonic() + duration
        while time.monotonic() < deadline:
            ready, _, _ = select.select([descriptor], [], [], .05)
            if ready:
                try:
                    data = os.read(descriptor, 65536)
                except OSError:
                    return
                if not data:
                    return
                stream.feed(decoder.decode(data))

    def wait_for(expected):
        for _ in range(100):
            drain(.1)
            if expected in '\n'.join(screen.display):
                drain(.15)
                return
        raise RuntimeError(f'{name}: did not render {expected!r}')

    try:
        wait_for(ACCOUNT)
        for key, expected in steps:
            os.write(descriptor, key.encode())
            wait_for(expected)
        text = '\n'.join(screen.display)
        if (not review and 'SAMPLE DATA / FICTIONAL ACCOUNT' not in text) or ACCOUNT not in text:
            raise RuntimeError(f'{name}: missing fictitious account or sample-data label')
        if any(value in text for value in ('Loading…', 'Loading saved', 'Error:')):
            raise RuntimeError(f'{name}: screen not ready')

        image = Image.new('RGB', (columns * CELL_WIDTH + PADDING * 2,
                                 rows * CELL_HEIGHT + PADDING * 2), BACKGROUND)
        draw = ImageDraw.Draw(image)
        for y in range(rows):
            for x in range(columns):
                cell = screen.buffer[y][x]
                foreground, background = color(cell.fg), color(cell.bg, True)
                if cell.reverse:
                    foreground, background = background, foreground
                left, top = PADDING + x * CELL_WIDTH, PADDING + y * CELL_HEIGHT
                draw.rectangle((left, top, left + CELL_WIDTH - 1,
                                top + CELL_HEIGHT - 1), fill=background)
                if cell.data.strip():
                    draw.text((left, top), cell.data,
                              font=BOLD if cell.bold else FONT, fill=foreground)
        origin = (f'Actual Xoog React/Ink output captured in a {columns}x{rows} '
                  f'pseudoterminal. Fictitious Google account {ACCOUNT}. '
                  'All content is synthetic. Source: scripts/screenshot-preview.mjs '
                  'and scripts/capture-screenshots.py. Not an imagegen mockup.')
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('Description', origin)
        metadata.add_text('impeccable:prompt', 'Source: ' + origin)
        image.save(OUTPUT / f'{name}.png', pnginfo=metadata)
        print(f'{name}: {columns}x{rows}', flush=True)
        return {'file': f'{name}.png', 'columns': columns, 'rows': rows,
                'theme': 'light' if light else 'dark', 'source': origin}
    finally:
        try:
            os.write(descriptor, b'q')
            drain(.2)
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
        # A path editor consumes q as text. Bound shutdown even in that state.
        for _ in range(20):
            ended, _ = os.waitpid(pid, os.WNOHANG)
            if ended:
                break
            time.sleep(.05)
        else:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        os.close(descriptor)


if __name__ == '__main__':
    if not (ROOT / 'dist/account-screen.js').exists():
        raise SystemExit('Build Xoog first with npm run build.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    mail = [('\r', 'Saturday at ours?')]
    invoice = mail + [('j', 'Your car is ready'), ('j', 'Re: the train on Saturday'),
                      ('j', 'Your table for Friday'), ('j', 'Invoice 114')]
    attachment_list = invoice + [('v', 'Attachments · 2')]
    save_path = [('d', 'Save file to'), ('\x15', 'Enter saves'),
                 ('~/Downloads/invoice-114.pdf', '~/Downloads/invoice-114.pdf')]
    review = '--review' in sys.argv
    if review:
        OUTPUT = ROOT / '.impeccable/review'
        OUTPUT.mkdir(parents=True, exist_ok=True)
    captures = [
        capture('people-minimum', 52, 18, mail + [('4', 'Jeanne Fleury'), ('\r', 'Contact details')], review=True),
        capture('drive-minimum', 52, 18, mail + [('5', 'Receipts'), ('\r', 'My Drive / Receipts')], review=True),
        capture('drive-download-minimum', 52, 18, mail + [('5', 'Receipts'), ('\r', 'Invoice 114.pdf'), ('d', 'Download ·'), ('\x15', 'Enter save'), ('~/Downloads/invoice-114.pdf', '~/Downloads/invoice-114.pdf')], review=True),
        capture('drive-light', 120, 30, mail + [('5', 'Receipts'), ('j', 'Holiday photos'), ('j', 'Household expenses')], light=True, review=True),
        capture('attachments-minimum', 52, 18, attachment_list, review=True),
        capture('attachment-text-minimum', 52, 18, attachment_list + [('j', 'hours-november.csv'), ('\r', '2026-11-24,6')], review=True),
        capture('attachment-save-minimum', 52, 18, attachment_list + save_path, review=True),
        capture('attachments-light', 120, 30, attachment_list, light=True, review=True),
        capture('attachment-external', 120, 30, attachment_list + [('\r', 'Press o to open')], review=True),
    ] if review else [
        capture('accounts', 120, 30),
        capture('mail', 140, 36, mail),
        capture('calendar', 140, 36, mail + [('2', 'Pick up the car')]),
        capture('date-picker', 140, 36, mail + [('2', 'Pick up the car'), ('d', 'Choose date')]),
        capture('people', 140, 36, mail + [('4', 'Contact details')]),
        capture('drive', 140, 36, mail + [('5', 'Receipts'), ('j', 'Holiday photos'), ('j', 'Household expenses')]),
        capture('tasks', 140, 36, mail + [('3', 'Find the car collection slip')]),
        capture('mail-light', 140, 36, mail, light=True),
        capture('mail-narrow', 70, 24, [('\r', 'Jeanne Fleury')]),
        capture('attachments', 120, 30, attachment_list),
        capture('attachment-text', 120, 30, attachment_list + [('j', 'hours-november.csv'), ('\r', '2026-11-24,6')]),
        capture('attachment-save', 70, 24, attachment_list + save_path),
    ]
    (OUTPUT / 'manifest.json').write_text(json.dumps({
        'account': ACCOUNT, 'fictitious': True, 'content': 'synthetic',
        'snapshotTime': '2026-11-26T11:00:00Z', 'captures': captures,
    }, indent=2) + '\n')
