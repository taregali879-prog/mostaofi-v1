# Registration and persistence verification — 9 October 2026

API source: `bd2bd27a84681f86defe2824d1a1dc9925ec0761` on official main.
Railway deployment: `ef385415-7546-4d6b-a51c-fb47df9b9a33`, observed SUCCESS.
Site source: `f8ed78d048d1a517598e24e7117c9a2dd940cb12`, version 8, deployment `appgdep_6ac9007ef1e8819183e149df4acc8459`, observed succeeded.

Actual API verification created two explicitly marked technical organizations, checked duplicate and unauthorized registration, saved a project, reread it after independent authentication, uploaded a real object, reread document metadata and SHA-256, and verified cross-organization access returns 404. The first run uncovered BigInt JSON serialization failures in document reads; PR #3 fixed them and the repeat passed. Fixtures remain isolated technical records, not customer business records.

Registration requires a server-only secret and an explicit email allowlist. The Site supports HMAC invitations scoped to one email and expiry of at most 48 hours. Owner invitation issued for 24 hours; its token and all passwords/server secrets are excluded from source and evidence. The owner chooses their own password. Public self-registration for arbitrary emails is not enabled.

Verification: API build and test:local passed; 9 focused Jest tests passed; Site TypeScript/build and 52 tests passed. Full PostgreSQL test-suite execution was unavailable locally because DATABASE_URL/test database was absent. Browser visual QA was not available; live Site API verification is distinct from a full browser test.

Remaining release limits: dependency audit found High/Critical advisories requiring remediation before unrestricted commercial launch; backup/restore and complete workflows have not been revalidated by this change. This evidence supports the listed account/persistence operations, not complete platform release readiness.

Live Site API repeat also passed: owner invitation verification, authenticated D1 command persistence, R2 image upload and identical byte retrieval, D1 state reread after logout/new login, and rejection of another organization's access to both data and file. Native D1 reads separately confirmed feature_projects and feature_files now contain saved records. The public Site status returned 200 with ready=true and database=connected.
