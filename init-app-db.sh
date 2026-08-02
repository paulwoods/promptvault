#!/bin/bash
# Create each application's database role and database (idempotent).
#
# Runs automatically on a FRESH postgres volume via /docker-entrypoint-initdb.d.
# For an EXISTING volume, run it manually inside the container:
#   docker compose exec postgres bash /docker-entrypoint-initdb.d/init-app-db.sh
#
# Reads from the environment (provided by postgres.env via docker compose):
#   EQUIPMENT_DB_USERNAME  equipment role; also used as its database name
#   EQUIPMENT_DB_PASSWORD  equipment role password
#   PROMPTVAULT_DB_USERNAME     promptvault role (default: promptvault); also its database name
#   PROMPTVAULT_DB_PASSWORD     promptvault role password
set -euo pipefail

create_app_db() {

  echo "create_app_db starting"

  local app_user="$1"
  local app_password="$2"
  local app_db="$app_user"

  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d postgres <<EOSQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${app_user}') THEN
        CREATE ROLE "${app_user}" LOGIN PASSWORD '${app_password}';
    ELSE
        ALTER ROLE "${app_user}" LOGIN PASSWORD '${app_password}';
    END IF;
END
\$\$;

SELECT 'CREATE DATABASE "${app_db}" OWNER "${app_user}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${app_db}')\gexec
EOSQL

  echo "Role '${app_user}' and database '${app_db}' are ready."
}

# promptvault
create_app_db \
  "${PROMPTVAULT_DB_USERNAME:-promptvault}" \
  "${PROMPTVAULT_DB_PASSWORD:?PROMPTVAULT_DB_PASSWORD is not set}"
