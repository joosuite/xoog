# Xoog screenshots

These images show actual React and Ink output captured from a pseudoterminal.
The Google account, Simon Delcourt at `simon.delcourt@example.com`, is fictitious.
Every message, event, task, contact, and file is synthetic. The account uses the
reserved `example.com` domain. No Google account is signed in for capture.

| Image | Terminal | Theme |
| --- | --- | --- |
| [Accounts](accounts.png) | 120 columns by 30 rows | Dark |
| [Mail](mail.png) | 140 columns by 36 rows | Dark |
| [Calendar](calendar.png) | 140 columns by 36 rows | Dark |
| [Date picker](date-picker.png) | 140 columns by 36 rows | Dark |
| [People](people.png) | 140 columns by 36 rows | Dark |
| [Drive](drive.png) | 140 columns by 36 rows | Dark |
| [Tasks](tasks.png) | 140 columns by 36 rows | Dark |
| [Mail in light theme](mail-light.png) | 140 columns by 36 rows | Light |
| [Mail in a narrow terminal](mail-narrow.png) | 70 columns by 24 rows | Dark |
| [Attachment list](attachments.png) | 120 columns by 30 rows | Dark |
| [Text attachment preview](attachment-text.png) | 120 columns by 30 rows | Dark |
| [Attachment download path](attachment-save.png) | 70 columns by 24 rows | Dark |

## Regenerate the images

Capture requires macOS or Linux, Python 3, Pillow, and pyte in addition to
Xoog's normal development dependencies. These are documentation tools, not
runtime requirements. From a source checkout of Xoog:

```sh
npm ci
npm run build
python3 -m venv .venv-screenshots
.venv-screenshots/bin/python -m pip install Pillow pyte
.venv-screenshots/bin/python scripts/capture-screenshots.py
```

Use `scripts/capture-screenshots.py --review` to check People, Drive, attachment
lists, previews, and download forms at the 52-by-18 minimum and in light theme. These captures go
to `.impeccable/review/`. They omit the extra documentation banner so the actual
minimum viewport is tested. Capture never confirms a download or opens a viewer.

The script uses Menlo on macOS and DejaVu Sans Mono on Linux. Install the DejaVu
font package if your Linux system does not have it. Terminal fonts differ, so
the PNG font is a capture choice rather than an application dependency.

`scripts/screenshot-preview.mjs` renders the actual application with read-only
fixtures, a fixed date of November 26, 2026, and a fictitious account. It never
invokes Joog or reads saved credentials. The capture wrapper adds a
**SAMPLE DATA / FICTIONAL ACCOUNT** banner. The production app has no fixture mode.
The correspondence, appointments, and errands are in `scripts/screenshot-content.mjs`.

`manifest.json` records the dimensions, themes, identity, date, and source of each
image. The same origin information is embedded in the PNG metadata. Inspect all
twelve images after capture before committing them.
