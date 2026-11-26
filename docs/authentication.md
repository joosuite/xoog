# Sign in to Google

Install the [Joog executable](https://github.com/joko76ers/joog), then start Xoog.
The first screen lists saved accounts and the Authentication and Account actions.
You select accounts inside the app.

## Prepare the Google client

In Google Cloud Console, create or select a project, enable the Gmail API,
Google Calendar API, and Google Tasks API, and configure its OAuth consent
details. If the app's audience is external and in testing, add your Google
account as a test user. Create OAuth credentials for a **Desktop app** and keep
the client ID and client secret available for enrollment.

See [Joog's sign-in guide](https://github.com/joko76ers/joog/blob/main/docs/authentication.md)
for Google setup and platform credential-store requirements.

## Set up authentication in Xoog

1. Press `I` for **auth init** to initialize the local credential vault.
2. Press `E` for **auth enroll**. Enter the client ID, press `Tab`, enter the
   client secret, then press `Enter` to save. The secret is masked.
3. Press `T` for **auth test** to check the enrolled OAuth client.
4. Press `L` for **Login / add account**, enter your Google account email, and
   press `Enter`.
5. Complete sign-in in the browser and approve the requested permissions for
   mail, calendar, tasks, contacts, and Drive. Return to Xoog and press `Enter` to open the account.

If Joog already has an enrolled client and saved accounts, select an account and
press `Enter`. Initialization and enrollment are setup actions, not requirements
on every launch. Xoog obtains the accounts by running `joog --json auth list`.
`--home PATH` is forwarded to that command when you use a custom state directory.

`Tab` moves between Authentication, All accounts, and Account actions. Use `j/k`
or the arrow keys to move and `Enter` to activate the selection. The direct
shortcuts accept either letter case. Press `Esc` to return from a form or cancel
an operation. Press `G` to refresh account changes.

## Switch or log out

Press `A` from the workspace to return to account management. Select another
account and press `Enter` to open it.

To remove an account's local tokens, select it, press `X`, and confirm with
`Enter`. Use `Esc` to cancel. Google permissions remain until you revoke the
app's access in your Google Account settings.

## Use a specific Joog installation

```sh
npm start -- --joog /path/to/joog
```

Xoog checks `--joog`, then `JOOG_BIN`, then `joog` on `PATH`, and finally the
optional sibling development executable at `../joog/bin/joog`. It uses binaries,
not Joog source files. `--home PATH` selects Joog's state under `PATH/joog`.

## Recover from a failed login

If no browser opens, read the complete error in Xoog's scrollable error panel.
An OS keychain failure occurs before browser launch and does not imply that an
existing OAuth client must be enrolled again. Unlock the keychain or resolve its
access prompt, then retry. The browser-wait message appears after Joog confirms
that it opened the browser.

After cancellation or a login completed outside Xoog, press `G` to refresh the
saved accounts. For a missing executable, install Joog or select it with `--joog`.

For accounts authorized before People and Drive were added, use Login again
to grant the new permissions. Reuse the existing OAuth client enrollment.
The Google Cloud project must have the People API and Drive API enabled.
