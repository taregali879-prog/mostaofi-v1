# Rollback Runbook
1. Stop new writes by placing API in maintenance/read-only mode.
2. Record current release SHA and migration state.
3. Roll application image back to previous known-good SHA.
4. Do not auto-down-migrate destructive schema changes. Restore database to pre-release snapshot/PITR if schema rollback is required.
5. Validate /health/ready, login, project read, inventory balance and audit read.
6. Re-enable writes only after reconciliation checks pass.
