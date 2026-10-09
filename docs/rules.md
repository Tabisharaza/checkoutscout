# Rule catalog

CheckoutScout v0.1.0 uses the model below. Errors represent likely checkout
incompatibility in the modeled case; warnings need review. This is not an exact
filesystem emulator. Each rule is evaluated without opening the named file.

## case-collision

**ASCII case collision · error**

Distinct file or directory spellings match after ASCII A–Z are lowercased.

Next step: Choose one directory spelling and give colliding files distinct names. Use an intermediate name for case-only Git renames.

## normalization-collision

**Unicode normalization collision · error**

Distinct file or directory spellings have the same Unicode NFC normalization.

Next step: Normalize names consistently and rename colliding entries so their NFC forms remain distinct.

## normalized-case-collision

**Combined normalization and ASCII case collision · error**

Distinct spellings match when Unicode NFC normalization and ASCII case folding are combined.

Next step: Choose consistent normalized directory spellings and file names that differ beyond ASCII letter case.

## file-directory-collision

**File and directory collision · error**

A tracked leaf and a directory prefix match exactly or after NFC normalization and ASCII case folding.

Next step: Rename the leaf or directory so that no normalized, ASCII-case-folded path needs to be both a file and a directory.

## unicode-case-collision

**Possible non-ASCII case collision · warning**

Additional spellings match using NFC and JavaScript Unicode lowercasing. This heuristic is not full Unicode case folding or a filesystem case table.

Next step: Review the names on your target filesystems. Prefer distinct spellings beyond case; locale and filesystem case equivalence can differ from this heuristic.

## windows-forbidden-character

**Windows filename character · error**

A component contains < > : " \ | ? * or a control character U+0001 through U+001F.

Next step: Rename the component without Windows-reserved filename characters or ASCII control characters.

## windows-reserved-name

**Windows device name · error**

A component is CON, PRN, AUX, NUL, COM1–9, or LPT1–9, optionally followed by an extension. COM/LPT superscript ¹, ², and ³ are included.

Next step: Use a name other than a Windows device name, even when the component has an extension or names a directory.

## windows-trailing-dot-space

**Trailing dot or space · error**

A component ends in an ASCII period or space, which ordinary Windows shell and filename handling do not preserve reliably.

Next step: Remove trailing ASCII periods and spaces from the component.

## component-length

**Long path component · warning**

A component exceeds 255 UTF-8 bytes or 255 UTF-16 code units. Actual limits depend on the target filesystem and API.

Next step: Shorten this individual component and verify target filesystem limits. Total checkout-path limits are outside this check.

## invisible-format-character

**Invisible or bidirectional format control · warning**

A component contains U+00AD, U+061C, U+180E, U+200B–200F, U+202A–202E, U+2060–2064, U+2066–206F, or U+FEFF.

Next step: Review the exact code points and remove accidental controls. Joiners may be intentional in text or emoji; this is a review warning, not a claim of an invalid filename.

## Grouping and identity

Every original directory prefix is inspected, not just leaf basenames. For
example, `Docs/intro.md` and `docs/api.md` share a case-folded directory even
though the filenames differ. The report groups the affected leaf paths.
Redundant descendant directory aliases are suppressed once a parent explains
them, but actual leaf and file/directory collisions remain visible. A broader
Unicode heuristic warning can coexist with an exact ASCII/NFC subgroup error.

Identical input paths are deduplicated. Paths and subjects use deterministic
Unicode code-point ordering, never locale sorting. A finding's ID is SHA-256 of
the UTF-8 serialization of `JSON.stringify([ruleId, subject, sortedPaths])`.
Messages, timestamps, runtime version, and unrelated clean paths do not enter
the fingerprint. Adding an affected leaf changes it. Baseline loading recomputes
that fingerprint and rejects mismatches or unknown rule IDs.

## Conservative component budgets

255 UTF-8 bytes and 255 UTF-16 code units are review thresholds, not a statement
that every filesystem or API has those limits. Full path length is not checked.
A normal checkout root can itself push a path over an application's limit.

## Deliberately unsupported equivalences

There is no full Unicode case-fold table, locale tailoring, NFKC folding,
homoglyph detection, Win32 trailing-dot canonical collision grouping, NTFS 8.3
alias emulation, or exact Git core.protectNTFS/core.protectHFS emulation.
Trailing-dot/space names still receive their own error. Device aliases with
spaces before an extension (for example `CON .txt`), `CONIN$`, `CONOUT$`, and
other namespace-specific Windows aliases are outside this initial device-name
rule. They must not be inferred portable from a clean result. Invisible controls can
be intentional in emoji or writing systems, so they are warnings. Ordinary
non-ASCII filenames and combining marks are not automatically rejected.

## Sources

- [Microsoft filename conventions](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Microsoft Git cross-platform compatibility](https://learn.microsoft.com/en-us/azure/devops/repos/git/os-compatibility?view=azure-devops)
- [Unicode normalization specification](https://unicode.org/reports/tr15/)

These references describe platform behavior; CheckoutScout's model is the
explicit subset above. Source links are references, not affiliations.

## Resource limits

Validation rejects inputs above 100,000 entries, 32,768 UTF-16 units or 256
components per path, 250,000 components across unique paths, or 32 MiB of
summed unique-path UTF-8 bytes. The CLI also limits each source JSON file and
Git output to 32 MiB. Audit output is capped at 10,000 findings and 8 MiB for
the compact JSON issues array, before report formatting. Limits throw a
controlled error, with no truncated finding groups or partial report. The
serialized output limit includes repeated paths, JSON escaping, and metadata;
it is separate from the input size limit.
