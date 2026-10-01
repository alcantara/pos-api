-- Runs once, on the first initialization of the data volume
-- (docker-entrypoint-initdb.d). Creates the databases the project uses:
--   pos      – default database created by POSTGRES_DB
--   pos_dev  – development DATABASE_URL (see .env.example)
--   pos_test – TEST_POSTGRES_URL target for integration tests
-- Databases that already exist are left untouched, so re-running the stack
-- never drops data.
SELECT 'CREATE DATABASE pos_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pos_dev')\gexec

SELECT 'CREATE DATABASE pos_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pos_test')\gexec