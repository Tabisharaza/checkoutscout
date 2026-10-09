# Third-party notices and sources

CheckoutScout's implementation, tests, synthetic examples, report design, and
project artwork are original to this repository and are MIT licensed. There are
no bundled runtime or development dependencies, remote fonts, icon packages,
analytics, or copied third-party source files.

Node.js and Git are prerequisites, installed separately under their respective
licenses. GitHub Actions uses commit-pinned `actions/checkout` and
`actions/setup-node`, both MIT licensed by GitHub. Their source is not bundled.

Behavioral references consulted on 2026-10-09:

- [Microsoft: Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Microsoft: Cross-platform compatibility in Git](https://learn.microsoft.com/en-us/azure/devops/repos/git/os-compatibility?view=azure-devops)
- [Git: git-ls-files](https://git-scm.com/docs/git-ls-files)
- [Unicode: Normalization Forms, UAX #15](https://unicode.org/reports/tr15/)

Related projects evaluated for product scope, without copying code:

- [pre-commit-hooks](https://github.com/pre-commit/pre-commit-hooks), MIT
- [git-path-audit](https://github.com/bunta-expert/git-path-audit), MIT
- [pathvalidate](https://github.com/thombashi/pathvalidate), MIT

References inform the rules; they do not imply endorsement, affiliation, or an
exact implementation of a filesystem. See the README's limitations.
