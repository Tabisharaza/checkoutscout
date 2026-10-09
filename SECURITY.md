# Security and privacy boundaries

CheckoutScout treats audited names as untrusted input. It calls Git directly
without a shell, disables fsmonitor and optional index locks, strips inherited
`GIT_*` variables, and does not fetch remote objects. It reads index names, never
source blobs, symlink targets, or untracked files. Repository-local Git config is
still read by Git, but audited paths are never executed or changed.

The CLI reads only the requested path-list and baseline files in addition to Git
metadata. It writes only explicitly requested output files, using exclusive
creation to refuse overwrites and existing symlinks. Development commands write
build/example artifacts in this repository as documented.

HTML output has no scripts, network assets, links derived from filenames, or
forms. A restrictive Content Security Policy is included. Markup is escaped;
terminal and selected invisible/bidirectional controls are displayed visibly.
Reports and baselines contain filenames. They are not anonymizers. Review any
artifact before sharing it publicly.

A clean report is not a security verdict. This is not a scanner for secrets,
malware, symlink escapes, submodule content, or all filesystem attack surfaces.

For a suspected vulnerability, do not publish working exploits against real
systems, secrets, or private data in a public issue. Use GitHub's private
vulnerability reporting option if it is available. If it is unavailable, open an
issue containing only a request for a private reporting channel, without details.
No response-time or security-support SLA is promised.
