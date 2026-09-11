# GCL Production Proof Policy v68

A release is considered published only when `gcl-production-proof` validates the exact `source_sha` served by `https://plutyx.com/ranking-site/gcl-build.json` and the public browser canary succeeds.

## Superseded releases

Only the newest release on `convrank-hostinger-front` is operationally meaningful. A proof for an older SHA is cancelled when a newer release starts, preventing a superseded SHA from later surfacing as a false deployment incident.

## Cache safety

Every provenance poll uses a unique nonce and explicit no-cache request headers. The final Playwright provenance assertion does the same.

## Publication rule

A successful build or artifact publication alone is not a production claim. Publication requires the exact Hostinger SHA plus the public-route and real AI-canary browser proof.
