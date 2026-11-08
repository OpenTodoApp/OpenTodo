---
title: Security
summary: OpenTodo's threat model, how its security is verified, the scope for an independent review, and where review reports are published.
audience: developer
section: Internals
specs: []
screens: []
order: 39
---
# Security

These pages are for anyone who wants to check OpenTodo's security before trusting it with their data: self-hosters, organisations, reviewers and contributors.

| Page | What it covers |
|---|---|
| [Threat model](threat-model.md) | The assets, trust boundaries and attacker profiles. For each profile: what is defended, by which mechanism and test, and what is not. One section per review scope item, and the accepted risks |
| [Security limits](limits.md) | What is not protected, in one place: what the operator sees with and without end-to-end encryption, what is unencrypted at rest, what backups contain, host mode and demo isolation, scale |
| [How we verify security](how-we-verify.md) | A retrospective of the methods behind those claims: the op-log sync and its convergence tests, the encryption design and its shared vectors, the route policy test, token scopes, the SSRF policy, importer limits, upgrade tests, static analysis and fuzzing. Also the issues found so far and the gaps still open |
| [Independent review scope](review-scope.md) | The brief for an external reviewer: the pinned commit, the method, the 17 scope items, and how findings are recorded and gated before a release |
| [SECURITY.md](../../SECURITY.md) | How to report a vulnerability, response times and fix targets, safe harbour, supported versions and the security model in brief |

## Review reports

No independent review has taken place yet. One is sought ([Independent review](how-we-verify.md#independent-review)). When one has been delivered, its record and findings will be in `docs/security/reviews/<yyyy-mm>-<reviewer>.md`, in the format the [review scope](review-scope.md#deliverables-and-how-findings-are-recorded) describes. The full report and a plain summary will be published here when the fixes ship.

## Scope items

The review scope has 17 items:

1. authentication and sessions;
2. token scopes;
3. the route policy wrapper;
4. sync scopes and membership;
5. end-to-end encryption (client cryptography and the device relay);
6. CalDAV;
7. MCP and the agent write gate;
8. the assistant's tool loop;
9. the outbound request policy;
10. the importers' parsers;
11. attachments;
12. public links and task pages;
13. host mode isolation;
14. demo mode;
15. the web client;
16. the Android and iOS bridges;
17. the container image.

Each item maps to a section of the [threat model](threat-model.md#components-in-the-review-scope). `scripts/security-review.test.mjs` fails when one doesn't.
