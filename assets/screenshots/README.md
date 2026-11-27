# Xoog screenshots

These images show actual React and Ink output captured in a virtual terminal.
The Google account, Simon Delcourt at `simon.delcourt@example.com`, is fictitious.
Every message, event, task, contact, and file is synthetic. The account uses the
reserved `example.com` domain. No Google account is signed in for capture.

| Image | Terminal | Theme |
| --- | --- | --- |
| [Microsoft accounts](microsoft-accounts.png) | 120 columns by 30 rows | Dark |
| [Outlook mail](microsoft-mail.png) | 140 columns by 36 rows | Dark |
| [OneDrive](microsoft-drive.png) | 140 columns by 36 rows | Dark |
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

Capture uses the TypeScript tools included in Xoog's development dependencies.
From a source checkout:

```sh
npm ci
npm run screenshots
```

Use `npm run screenshots:review` to check People, Drive, attachment lists,
previews, and download forms at the 52-by-18 minimum and in light theme. These captures go
to `.impeccable/review/`. They omit the extra documentation banner so the actual
minimum viewport is tested. Capture never confirms a download or opens a viewer.

The renderer uses Menlo on macOS, DejaVu Sans Mono or Liberation Mono on Linux,
and Consolas on Windows. Install one of those fonts if capture reports it missing.
Terminal fonts differ, so the PNG font is a capture choice rather than an
application dependency.

`scripts/screenshot-preview.tsx` renders the actual application with read-only
fixtures, a fixed date of November 26, 2026, and a fictitious account. It never
invokes Joog or reads saved credentials. The capture wrapper adds a
**SAMPLE DATA / FICTIONAL ACCOUNT** banner. The production app has no fixture mode.
The correspondence, appointments, and errands are in `scripts/screenshot-content.ts`.

`scripts/capture-screenshots.tsx` drives keyboard input through Ink's terminal
streams. `@xterm/headless` interprets the ANSI output, and `scripts/terminal-image.ts`
uses `@napi-rs/canvas` to write PNGs with their provenance. Both libraries are
development dependencies. `npm run check` typechecks the scripts as well as the app.

`manifest.json` records the dimensions, themes, identity, date, and source of each
image. The same origin information is embedded in the PNG metadata. Inspect all
fifteen images after capture before committing them.
