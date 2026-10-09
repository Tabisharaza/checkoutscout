# Contributing to CheckoutScout

Thanks for helping make the next checkout less surprising.

## Before a change

1. Read the README and `docs/rules.md`; this is a portability model with explicit
   boundaries, not a full filesystem emulator.
2. Search existing issues. For a new rule or CLI flag, discuss the user problem
   first so the project stays small and understandable.
3. Use synthetic filenames. Never include private repository contents, credentials,
   real customer identifiers, or confidential path names in issues or fixtures.

## Local workflow

Use Node 24.19.0 and Git. There are no external packages to install.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm run demo
git diff -- examples
```

Engine tests use path strings instead of attempting to create non-portable files.
Git integration tests create and remove isolated temporary repositories. A
symlink-write-refusal test is skipped on Windows because creating symlinks can
require privileges; the same refusal uses exclusive file creation on every OS.

## A useful pull request

- Explain a concrete problem and expected behavior.
- Add a small regression test that fails before the change.
- Add authoritative source links for new platform rules; avoid guessing.
- Keep diagnosis deterministic. Do not use clocks, locale-dependent sorting,
  random IDs, or filesystem reads of audited paths.
- Preserve baseline safety: changing membership must not silently reuse approval.
  Changing rule IDs or fingerprint composition needs a documented migration plan.
- Test text, JSON, and HTML when changing output. Treat path names as hostile.
- Update documentation and generated examples where behavior changed.
- Keep runtime and development dependencies at zero unless the tradeoff has first
  been discussed. CI actions are pinned to reviewed commit hashes.

Open a pull request with your test command and observed result. Do not claim
platform testing that you did not perform. The maintainer will review and run CI;
no contribution or merge is guaranteed.

## Where help is useful

- Browser accessibility checks for the offline report, including keyboard and print
- A read-only command that explains what changed between two baseline snapshots
- More carefully sourced path edge cases, with false-positive analysis

Be respectful. Disagree about behavior with reproducible examples, not personal
attacks. See `SECURITY.md` before reporting a potential security issue.
