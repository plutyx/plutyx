# Production smoke gate

This branch exists to trigger the pull-request CI gate for Cozinha 360 OS.

Required before merge:
- unit tests green
- application imports with production configuration shape
- no cross-business access in tested routes
- money remains integer cents; percentages remain basis points
