# Security policy

## Report a vulnerability

Do not put exploit details, credentials, or private account data in a public
issue or pull request.

Use **Security → Advisories → Report a vulnerability** on this repository when
GitHub private vulnerability reporting is available. If that option is absent,
use a private contact method published on the
[repository owner's profile](https://github.com/joko76ers). If no private
channel is listed, open an issue requesting one without disclosing the
vulnerability itself.

Include the Xoog version or commit, Node.js and Joog versions, operating system,
terminal, reproduction steps using test data, expected and actual behavior, and
the potential impact. Remove tokens, client secrets, account content, and
unrelated personal information.

## Fixes and disclosure

Security fixes target the current code on `main`. Older revisions do not have
a separate security maintenance commitment. Maintainers may ask for additional
reproduction details and coordinate disclosure with the reporter.

## Authentication and exposed credentials

Xoog passes authentication operations to the Joog executable. Joog owns the
encrypted credential store and OS keychain access. Xoog reads account names from
Joog's non-secret configuration and passes enrolled client credentials over
stdin. Report defects in Xoog's handling here. Report Joog storage or OAuth
defects through [Joog's security policy](https://github.com/joko76ers/joog/blob/main/SECURITY.md).

If a token or credential has already been exposed, revoke the affected Google
permissions or replace the credential through Google before sharing diagnostic
information. Logging out through Xoog deletes local Joog tokens. It does not
revoke Google's authorization.

See [sign-in setup](docs/authentication.md) for account management and sign-out
behavior.
