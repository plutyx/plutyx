# Cloud production gate

Validates the current Cozinha 360 OS cloud stack after adding: member preferences, purchases with price alerts, customers with consent, finance endpoint, security headers, production config enforcement, Docker packaging, and mobile frontend.

Required before public deployment:
- backend CI green
- frontend typecheck/build green
- tenant isolation still green
- production config rejects SQLite and weak secrets
