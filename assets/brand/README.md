# Xoog brand assets

Xoog uses the approved linked wordmark for images and the cell wordmark for
terminal output. Both keep the connected double-loop motif from Joog.

| Asset | Use |
| --- | --- |
| [logo.png](logo.png) | Linked wordmark, cobalt on a transparent background. Preserve its aspect ratio. |
| [wordmark.ascii.txt](wordmark.ascii.txt) | Cell wordmark, 29 columns by 7 rows, plain 7-bit ASCII. |

The TUI renders the cell wordmark from `src/brand.ts` in the account screen's
Authentication pane when it fits. Small terminals retain the one-line Xoog name
and all authentication actions. Use the current theme's accent for terminal
output. The terminal controls the font and cell proportions.

The user selected the linked picture and cell ASCII on 2026-11-26. The proposal
sources remain in `.impeccable/mocks/logos/`. The final picture was produced with
the built-in imagegen tool from the approved linked proposal. Its exact prompt is
in `logo.prompt.txt` and embedded in the PNG metadata.
