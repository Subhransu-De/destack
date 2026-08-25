# Git

Portable global Git configuration for Windows, copied from the authored files under `%USERPROFILE%`.

## What is included

- `.gitconfig`: identity placeholders, commit signing, Git LFS filters, compression, long-path support, the default branch, and the global excludes-file location
- `.gitignore_global`: the Windows `nul` filename and the approved `.s.de` patterns for private files and folders

## Before installation

Replace `YOUR_NAME`, `YOUR_EMAIL`, and `YOUR_GPG_SIGNING_KEY` with the values that should apply on the destination system.

## Intentionally excluded

Credential-helper configuration, credentials, key material, and machine-specific paths are excluded. The signing-key placeholder is only a key identifier; never place a private key in this repository.
