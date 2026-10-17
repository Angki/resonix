# Security Policy & Hardening Standards

The Resonix project takes security, confidentiality, and data integrity seriously. This document outlines the security architecture, guarantees, and reporting protocols for the Resonix ecosystem.

---

## 1. Core Security Invariants

### 1.1 Non-Destructive Storage Protection
- **Strict Read-Only Access**: All audio collection directories are mounted and accessed strictly in read-only mode (`fs.constants.R_OK`).
- **No Tag Alteration**: Resonix never mutates, rewrites, moves, renames, or deletes original source audio files or local cover art.
- **Isolated Metadata State**: All application state, user playlists, scrobble queues, and extracted artwork thumbnails are stored exclusively in the isolated database (`data/library.db`) and cache directories (`cache/artwork`).

### 1.2 Authentication & Key Derivation
- **Argon2id Password Hashing**: Passwords are never stored in plaintext. Resonix utilizes memory-hard `argon2id` key derivation for all user credentials.
- **Salted Subsonic Token Authentication**: OpenSubsonic API authentication uses MD5/Hex salt hashing according to the official Subsonic specification (`token = md5(password + salt)`). Plaintext passwords are never returned or logged.
- **Ephemeral First-Run Bootstrap Token**: On a freshly initialized database with zero registered users, an ephemeral 256-bit cryptographically secure token (`crypto.randomBytes(32)`) is printed to the operator console with a 15-minute expiration time. Setup endpoints are completely locked without this token.
- **HttpOnly & SameSite Cookies**: Web authentication sessions use cryptographically signed JWTs placed inside `httpOnly`, `SameSite=Lax` cookies, preventing XSS-based session extraction.

### 1.3 Networking & Attack Surface
- **Default Loopback Binding**: The default listener binds to `127.0.0.1:3000` to prevent accidental exposure to untrusted local area networks until an operator explicitly configures Tailscale or a reverse proxy.
- **Tailscale Encrypted Mesh**: Resonix is designed out-of-the-box for Tailscale VPN mesh networks with wireguard-grade end-to-end encryption.
- **Strict Path Traversal Guardrails**: All file streaming, artwork retrieval, and playlist import handlers perform path canonicalization (`path.resolve`, `path.normalize`) and verify that target paths strictly reside within configured library roots.
- **Automated Rate Limiting**: Built-in sliding window rate limiter protects authentication and metadata endpoints against brute-force attacks.

---

## 2. Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability within Resonix, please do **NOT** open a public GitHub issue. Instead, report it privately:

1. **GitHub Security Advisory**: Submit a report via [Private Vulnerability Reporting](https://github.com/Angki/resonix/security/advisories/new).
2. **Direct Operator Contact**: If GitHub advisories are unavailable, reach out directly to the maintainer via GitHub profile contact.

Please include:
- A clear description of the vulnerability and attack vector.
- Step-by-step reproduction instructions or a minimal proof of concept (PoC).
- Potential impact on confidential data or host system integrity.

We commit to acknowledging your disclosure within 48 hours and providing a coordinated patch release timeline before public disclosure.
