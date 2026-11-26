# Security policy

## Reporting a vulnerability

Please report security issues privately, not in public issues. Use GitHub's "Report a
vulnerability" (private security advisory) on this repository. Include what you found, how to
reproduce it and the impact you expect. We aim to acknowledge reports within a week.

Please do not test against someone else's live deployment.

## Scope

In scope: the server (`src/`), the web client (`public/`), the restream and helper scripts, the
macOS isolation kit (`deploy/macos/`) and the chiaki-ng patches (`chiaki/`).

Out of scope: vulnerabilities in chiaki-ng, MediaMTX, ffmpeg, cloudflared or Bun themselves
(report them upstream), and issues that need an admin account or physical access to the host.

## Hardening guidance

See [docs/security.md](docs/security.md) for the threat model and how to run PlayGTA isolated on
a dedicated macOS user with Seatbelt sandboxes and a pf firewall anchor. In short: keep the server
on loopback behind a tunnel, set a long `ADMIN_TOKEN`, keep secrets out of the repository, and
never run the services from your personal account.
