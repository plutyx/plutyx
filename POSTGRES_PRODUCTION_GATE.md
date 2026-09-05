# PostgreSQL production gate

This pull request exists to execute the full cloud test matrix, including the new PostgreSQL 16 production-mode job. It must apply the Supabase-compatible migration, verify schema invariants, run the API tests against PostgreSQL, and import the application with production guards enabled.
