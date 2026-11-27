# Install a binary release

Download an archive from [Xoog releases](https://github.com/joosuite/xoog/releases).
Each archive contains a standalone executable. You do not need an npm account,
npm, or a separate Node.js installation.

Both editions are available for macOS Intel and Apple Silicon, Linux x64 and
ARM64 with glibc, and Windows x64. Each release page links to the downloads and
their checksums.

Choose the archive for your computer:

| Computer | Filename ending |
| --- | --- |
| macOS, Apple Silicon | `darwin-arm64.tar.gz` |
| macOS, Intel | `darwin-x64.tar.gz` |
| Linux, ARM64 with glibc | `linux-arm64.tar.gz` |
| Linux, x64 with glibc | `linux-x64.tar.gz` |
| Windows, x64 | `win32-x64.zip` |

The `with-backends` edition includes Joog and Joom binaries. The other edition
requires you to install the backend you use. Both editions let you choose a
different binary with `--joog`, `--joom`, `JOOG_BIN`, or `JOOM_BIN`.
An installed backend on `PATH` takes priority over a bundled one.

## Verify the download

Download the matching `.sha256` file into the same directory as the archive.
On Linux, run:

```sh
sha256sum -c xoog-v0.1.2-with-backends-linux-x64.tar.gz.sha256
```

On macOS, run:

```sh
shasum -a 256 -c xoog-v0.1.2-with-backends-darwin-arm64.tar.gz.sha256
```

On Windows, compare the hash printed by PowerShell with the first value in the
`.sha256` file:

```powershell
Get-FileHash .\xoog-v0.1.2-with-backends-win32-x64.zip -Algorithm SHA256
```

Substitute the version and architecture you downloaded.

## Extract and run

Extract the entire archive. On macOS or Linux, enter the extracted directory
and run:

```sh
./xoog
```

On Windows, enter the extracted directory and run:

```powershell
.\xoog.exe
```

You can move `xoog` or `xoog.exe` into a directory on `PATH`. It needs no
adjacent JavaScript files, runtime directory, or npm packages. To use the included
backends, keep `joog` and `joom` beside Xoog, or install them on `PATH`. Keep the
license files when redistributing the executables.

The first screen lets you select Google or Microsoft and manage accounts.
Follow the [sign-in guide](authentication.md) to enroll your OAuth client and
log in. Releases contain no accounts or credentials.

To update, extract the new version into a new directory and update your `PATH`.
Your backend account data stays in its existing state directory.

macOS executables have an ad hoc signature and are not notarized. Windows
executables are unsigned. Linux builds
target glibc systems, not Alpine's musl runtime. Windows ARM64 is not included.
