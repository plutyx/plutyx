# Data policy — operational baseline

- Authentication data is separated from business data.
- Business access is membership-scoped and checked server-side.
- Member UI preferences are stored per membership and cannot grant permissions.
- Customer marketing consent is explicit and stored independently of order history.
- Money is stored as integer cents.
- Operational writes that may be retried use idempotency where applicable.
- Audit logs record material business mutations without storing passwords or tokens.
- Production databases must use PostgreSQL with backup/restore tested before public launch.
