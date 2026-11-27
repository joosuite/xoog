# Xoog's binary adapters

Xoog is a Node.js application. React and Ink render its terminal output.
`src/joog.ts` implements the `Workspace` interface by spawning a Joog executable.
Google and Microsoft adapters are available at runtime. In-memory substitutes live in
`test/support/` for regression tests. Documentation screenshots use their own
read-only fixtures in `scripts/`. Both are excluded from the distributable.

Xoog has no runtime dependency on the Joog source tree. Executable discovery
checks the explicit option, the environment variable, `PATH`, and an optional
sibling development binary in that order. This avoids silently replacing an
installed executable with a rebuilt binary that may have a different macOS
Keychain authorization.

## Requests

Every workspace invocation passes `--json`, an explicit account, a service, a command, and
`--file PATH`. Optional `--home` selects Joog's state directory. Request files
have mode `0600` inside a temporary directory. A `finally` block removes the
directory after success, failure, or cancellation.

Xoog uses `execFile`, which passes arguments without a shell. Message bodies and
other request data stay in the request file. Each subprocess has a 40-second
timeout and a 16 MiB output limit. Joog's HTTP timeout is 30 seconds.

The CLI accepts `--ttl MINUTES`, defaulting to `5`. It validates a nonnegative
integer within Joog's unsigned 32-bit range and passes it into each account's
workspace adapter. `src/joog.ts` adds `ttl` to the private request file for its
known cacheable read commands. This includes mail lists, metadata, and full
message bodies, plus calendar, task, People, and Drive collections. `--ttl 0`
disables response caching. Writes, authentication, and file downloads receive
no TTL parameter. Joog stores and invalidates its own encrypted response cache.
`g` reloads with the configured TTL. `f` requests one forced refresh via
`ReadOptions.fresh`, which makes the adapter send `ttl: 0` for the collection,
its calendar or task-list navigation, and the visible mail body. Each loader
consumes the forced revision once. Subsequent reads keep the configured TTL.
Joog's zero-TTL requests bypass its response cache without replacing old entries.

Joog emits one JSON object per line for paginated commands. Xoog accepts both
this stream format and a single pretty-printed JSON response. It concatenates
collection arrays across pages and uses the final page's metadata. Empty pages
can omit their collection. A malformed page rejects the whole result, so the UI
does not display incomplete data as a successful request. Parse errors identify
the operation without echoing private output or prescribing a binary update.

Mail listings fetch up to 40 message IDs, then retrieve metadata in batches of
four subprocesses. The reader requests the full selected message separately.
Requests for a previous selection or collection receive an abort signal when
the selection changes.

## Commands

| Workflow | Joog command |
| --- | --- |
| List accounts | `auth list` |
| Enroll OAuth client | `auth enroll --stdin` |
| Check OAuth connectivity | `auth test` |
| Login and logout | `auth ACCOUNT login mail,calendar,tasks,contacts,drive`, `auth ACCOUNT logout` |
| Mail list and reader | `mail messages.list`, `mail messages.get` |
| Download attachment content | `mail messages.attachments.get` with `output` |
| Read, star, archive | `mail messages.modify` |
| Compose and reply | `mail messages.send` |
| Calendar selection | `calendar calendars.list` |
| Seven-day agenda | `calendar events` |
| Create an event | `calendar events.insert` |
| Task list selection | `tasks tasklists.list` |
| Load tasks | `tasks tasks.list` |
| Complete or reopen | `tasks tasks.patch` |
| Create a task | `tasks tasks.insert` |
| Contacts and starred contacts | `contacts people.connections.list` |
| Other contacts | `contacts other-contacts.list` |
| Drive collections and folders | `drive files.list` |
| Download Drive files | `drive files.get` with `output` |
| Export Google documents | `drive files.export` with `output` and `mimeType` |

Replies use a MIME message with `In-Reply-To` and `References`, plus the original
Gmail thread ID. Reopening a task clears its completion timestamp. Archiving
removes only the `INBOX` label.

## Rendering and state

`src/account-screen.tsx` is the entry screen. It lists saved Joog accounts and
offers login, logout, and authentication setup. The Xoog CLI accepts no account
argument or account environment variable. Selecting an account constructs its
workspace adapter. Returning with `A` unmounts the workspace and aborts its reads
before another account can open.

`src/account-hub.tsx` renders the approved account hub. At 90 columns or more,
Authentication occupies 36% of the width on the left. The right pane contains
only saved accounts, followed by Account actions. At smaller widths, the two
authentication shortcuts sit in a compact row above the accounts and actions.
There is no setup submenu or repeated selected-account summary.

The controller keeps independent cursors for Authentication, accounts, and
Account actions. Tab changes focus and Enter activates the focused choice.
Direct E/T/L/X shortcuts work from the hub. Global authentication actions and
refresh preserve the selected account. Login selects its returned account;
logout chooses an adjacent remaining account. Account rows and their scrollbars
use the available height after reserving the always-visible action controls.

`src/accounts.ts` discovers accounts by running the selected backend with
`--json auth list`.
It validates Joog's JSON array, sanitizes account names, removes duplicates,
and preserves their order. The first account is initially selected. Login and
logout refresh the list through the same command. `--home PATH` is forwarded
to Joog. Xoog does not read Joog's configuration files or search state directories.
Account discovery shares authentication subprocess error handling and cancellation.
OAuth enrollment and connectivity checks also use the binary. Joog and Joom
initialize their credential storage automatically during enrollment; Xoog has
no separate initialization action. Client credentials travel over stdin and are
excluded from process arguments and temporary files. Credential enrollment errors use a generic
message to avoid echoing input. The UI masks and clears the client secret.

Authentication subprocesses time out after 40 seconds, except login, which gets
240 seconds to cover Joog's three-minute browser callback window and token
requests. An abort signal cancels a subprocess on Escape or component unmount.
Cancellation does not roll back authentication changes already completed by Joog.

Login starts with a pending state. Its stderr listener recognizes Joog's browser
launch confirmation before switching to the browser-wait state. Keychain failures
are classified separately from missing enrollment. Errors wrap in a scrollable
panel so their root cause stays readable at the minimum terminal size.

`src/model.ts` normalizes Google responses and strips terminal escape sequences
before display. It reads nested plain-text MIME parts and falls back to HTML
conversion. Task due dates retain their calendar date without a timezone shift.

Mail normalization walks nested MIME parts and retains attachment names, MIME
types, sizes, part IDs, remote attachment IDs, and inline base64url data. Named
files and attachment parts are excluded from the message-body decoder.
`src/attachment-screen.tsx` loads the full message when needed and owns attachment
selection, scrolling, preview, save-path editing, cancellation, and errors.

`Joog.downloadAttachment` calls the binary with `messages.attachments.get` and
an `output` path in a private staging directory. It copies the decoded bytes to
a new destination opened with `wx` and mode `0600`, then removes staging files.
Inline MIME data is decoded and saved directly. Existing files are never replaced.
Request files and remote content stay outside process arguments.

`src/attachment-files.ts` sanitizes default names and manages local file handling.
Text previews read up to 256 KiB as UTF-8, strip terminal controls, and remain
inside Xoog. PDF and supported image previews require an explicit `o` action.
Their private temporary paths use extensions derived from MIME type, regardless
of the received filename. macOS uses Preview, Linux uses `xdg-open`, and Windows
uses its file association handler. HTML, SVG, and XML are shown as source text.
Other file types are downloadable without being launched. Preview directories
are removed on attachment-screen unmount.

`src/app.tsx` tracks the service, collection, selection, pane, query, and draft.
`src/date-picker.tsx` lets Calendar users choose an individual date with `d`.
The picker keeps a separate day cursor until Enter commits it. Arrow keys browse
days and weeks, Page Up/Down changes month with end-of-month clamping, and a
typed `YYYY-MM-DD` is validated before selection. Escape cancels without a new
agenda request. The committed date starts the seven-day agenda and seeds new
event drafts. The picker replaces the workspace body and its two footer lines
so a six-row month fits at the 52-column by 18-row minimum.

Collection responses carry their service identity so a late render cannot
treat mail rows as calendar events. Refresh retains the row position, while
changing collections resets it. A synchronous lock prevents duplicate writes.

Drafts stay in component state. Validation precedes review, and saving requires
an explicit action on the review screen. The `Input` component handles terminal
editing and reserves control shortcuts for the form.

## Verification

`npm test` exercises UI behavior with Ink's test renderer, response normalization,
and subprocess behavior with an executable fixture. The fixture records the
actual argument array, request file permissions, and request JSON. These tests
cover the binary boundary without importing Joog's sources or accessing Google.

## People and Drive

People reads the selected contacts collection through Joog's paginated output.
Contact fields include names, emails, phones, addresses, organizations, birthdays,
websites, biographies, and memberships. Starred filters the contacts' membership
in `contactGroups/starred`. Other contacts use their supported read mask of names,
emails, and phone numbers. Search filters the loaded contact fields locally.

Drive lists up to 200 files in My Drive, Recent, Starred, Shared with me, or the
current folder. Request fields include pagination, metadata, download permissions,
and shortcut targets. Search escapes backslashes and quotes before constructing
Google's `fullText contains` expression. Every listing excludes trash and allows
shared-drive items. Folder navigation keeps a path stack, and Backspace pops it.
Switching collections clears the path and search.

Downloads resolve shortcuts to their target IDs. Joog writes into a private
staging directory, then Xoog streams the file into an exclusive `0600` destination.
Existing files survive, cancellation removes partial files, and staging is removed
in `finally`. Google Docs, Slides, and Drawings export to PDF, and Sheets export to
Excel. Folders, blocked downloads, and unsupported Google types have no download
action. `DriveDownload` owns cancellation while its path form is open. Other
workspace shortcuts remain inactive until it closes.

## Microsoft through Joom

The account screen offers Google and Microsoft with keys 1 and 2. Each connection
owns its account manager and workspace factory. Switching remounts the account
screen and aborts pending reads. Identical emails never identify the provider.
The workspace header names the active provider. Returning with A preserves the
provider for account management and switching.

CliAccounts runs authentication commands through either binary. Joom enrollment
sends only client_id over stdin. Microsoft connectivity test text reports only
endpoint reachability. Authentication and workspace errors name the selected
backend and provider. No backend source tree is imported at runtime.

Joom reuses compatible JSON normalization and calendar/task writes. Its adapter
removes unsupported mail format, task showHidden, and Drive supportsAllDrives
parameters. It sends MIME reply headers without Google's threadId. All-mail
listing omits Gmail's negative trash/spam query. Contacts requests omit Google
field masks and memberships. OneDrive lists use parent queries and name ordering,
and normalize inode/directory into the internal folder type. Original Office
files download through files.get. Private request files, pagination, TTL, forced
reads, cancellation, and exclusive downloads apply to both backends.

Microsoft exposes only Contacts and OneDrive folder collections. Archive is
blocked before an operation is sent. Google-only collections stay out of the
Microsoft navigation. Outlook's search limitations are documented in the
workspace guide. Local fixtures do not exercise live Microsoft authorization,
mail delivery, or file mutations.
