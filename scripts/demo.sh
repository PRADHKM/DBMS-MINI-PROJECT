#!/usr/bin/env bash
# Workload Management System - demo driver.
#
#   scripts/demo.sh setup    start Docker DBs, create app/.env.local, install, build, start app
#   scripts/demo.sh sql      MySQL views/functions/procedures/DML/advanced queries + pgvector CRUD
#   scripts/demo.sh api      live API walk-through (auth, summary, search, vector RUD, handover)
#   scripts/demo.sh rbac     database-level role checks (wms_admin_role / wms_employee_role)
#   scripts/demo.sh test     npm test, DB tests, HTTP tests (needs app running)
#   scripts/demo.sh all      setup + sql + rbac + api   (default)
#   scripts/demo.sh status   show containers and app state
#   scripts/demo.sh stop     stop app and containers (data kept)
#   scripts/demo.sh reset    stop and DELETE database volumes (asks first)
#
# Needs: Docker + Compose, Node >= 22, curl. Browser demo: http://localhost:3000
#   admin    ravi.shankar / Passw0rd!      employee ananya.rao / Passw0rd!
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
STATE="$ROOT/.demo"
URL="${WMS_URL:-http://localhost:3000}"
MYSQL_APP_PW="${WMS_MYSQL_PASSWORD:-wms_mysql_demo_password}"
PG_PW="${WMS_PG_PASSWORD:-wms_pg_demo_password}"
cd "$ROOT"
mkdir -p "$STATE"

say()  { printf '\n\033[1;33m######## %s\033[0m\n' "$*"; }
note() { printf '\033[2m-- %s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

mysql_run() {  # mysql_run [user] [password]  (SQL on stdin)
  docker compose exec -T -e MYSQL_PWD="${2:-$MYSQL_APP_PW}" mysql \
    mysql -t -u"${1:-wms_app}" workload_management_system
}
pg_run() {
  docker compose exec -T -e PGPASSWORD="$PG_PW" pgvector \
    psql -v ON_ERROR_STOP=1 -U wms_app -d workload_management_vectors "$@"
}
app_up() { curl -fs -o /dev/null "$URL/login"; }

cmd_setup() {
  say "1/4 Databases (Docker Compose)"
  command -v docker >/dev/null || die "docker not found"
  docker compose up -d --wait

  say "2/4 Application config"
  if [ ! -f "$APP/.env.local" ]; then
    cp "$APP/.env.example" "$APP/.env.local"
    secret="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
    sed -i "s/^NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$secret/" "$APP/.env.local"
    note "created app/.env.local with a fresh NEXTAUTH_SECRET"
  else
    note "app/.env.local already exists - kept"
  fi

  say "3/4 Dependencies and production build"
  (cd "$APP" && { [ -d node_modules ] || npm ci; } && npm run build >"$STATE/build.log" 2>&1) \
    || { tail -30 "$STATE/build.log"; die "build failed"; }
  note "build ok"

  say "4/4 Start application on $URL"
  if app_up; then
    note "already running"
  else
    (cd "$APP" && nohup npm start >"$STATE/app.log" 2>&1 & echo $! >"$STATE/app.pid")
    for _ in $(seq 1 60); do app_up && break; sleep 1; done
    app_up || { tail -20 "$STATE/app.log"; die "app did not start (see .demo/app.log)"; }
  fi
  echo "Open $URL   admin: ravi.shankar / Passw0rd!   employee: ananya.rao / Passw0rd!"
}

cmd_sql() {
  say "MySQL: tables and row counts"
  mysql_run <<'SQL'
SELECT 'EMPLOYEE' tbl, COUNT(*) n FROM EMPLOYEE UNION ALL SELECT 'DEPARTMENT', COUNT(*) FROM DEPARTMENT
UNION ALL SELECT 'PROJECT', COUNT(*) FROM PROJECT UNION ALL SELECT 'TASK', COUNT(*) FROM TASK
UNION ALL SELECT 'WORK_LOG', COUNT(*) FROM WORK_LOG UNION ALL SELECT 'RESIGNATION', COUNT(*) FROM RESIGNATION;
SQL

  say "MySQL: views"
  mysql_run <<'SQL'
SELECT * FROM v_active_employee_workload LIMIT 6;
SELECT * FROM v_project_progress;
SELECT * FROM v_resignation_handover LIMIT 5;
SQL

  say "MySQL: function and stored procedure"
  mysql_run <<'SQL'
SELECT fn_employee_total_hours(2, '2026-01-01', CURDATE()) AS ananya_total_hours;
CALL sp_get_employee_worklog_summary(2);
SQL

  say "MySQL: constraint rejects invalid data (25 hours in a day; error expected)"
  mysql_run <<'SQL' 2>&1 | sed 's/^/   /' || true
SET @t = (SELECT MIN(task_id) FROM TASK WHERE assigned_to = 2 AND status <> 'completed');
INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes)
VALUES (@t, 2, CURDATE(), 25, 'demo: should be rejected');
SQL

  say "MySQL: DML demo (INSERT/UPDATE/DELETE/joins/HAVING; all rolled back)"
  mysql_run <"$ROOT/database/mysql/03_dml_demo.sql"

  say "MySQL: advanced queries (correlated/nested subqueries, recursive CTE, full-text)"
  mysql_run <"$ROOT/database/mysql/07_advanced_queries.sql"

  say "pgvector: extension, schema, HNSW index"
  pg_run -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';" \
         -c "\\d ai_work_summaries"

  say "pgvector: CRUD + cosine similarity demo (rolled back)"
  pg_run <"$ROOT/database/pgvector/02_crud_examples.sql"
}

cmd_rbac() {
  say "Database-level roles: automated proof (npm run test:rbac)"
  (cd "$APP" && npm run -s test:rbac)

  say "Database-level roles: live statements as wms_employee_db"
  for q in "SELECT COUNT(*) AS employees_visible FROM EMPLOYEE" \
           "SELECT username FROM USER_ACCOUNT" \
           "DELETE FROM EMPLOYEE WHERE emp_id = 1"; do
    printf '\n\033[1m[employee role]\033[0m %s\n' "$q"
    echo "$q;" | mysql_run wms_employee_db wms_employee_db_demo_password 2>&1 | sed 's/^/   /' || true
  done
}

cmd_api() {
  app_up || die "app not running at $URL - run: scripts/demo.sh setup"
  say "Live API walk-through against $URL"
  WMS_URL="$URL" node "$ROOT/scripts/demo-api.mjs"
}

cmd_test() {
  say "Unit/vector tests"; (cd "$APP" && npm test)
  say "MySQL integration"; (cd "$APP" && WMS_DB_TESTS=1 npm run test:db)
  if app_up; then
    say "HTTP integration (creates retained fixtures)"; (cd "$APP" && npm run test:http)
    say "Concurrency"; (cd "$APP" && node --env-file=.env.local --test tests/concurrency.integration.mjs)
    note "browser tests: cd app && CHROME_PATH=\$(which google-chrome) npm run test:browser"
  else
    note "app not running - skipped HTTP/concurrency tests"
  fi
}

cmd_status() {
  docker compose ps
  if app_up; then echo "app: UP at $URL"; else echo "app: down"; fi
}

cmd_stop() {
  if [ -f "$STATE/app.pid" ]; then
    pid="$(cat "$STATE/app.pid")"
    pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; rm -f "$STATE/app.pid"
  fi
  # app started outside this script (e.g. by hand) is left alone
  docker compose stop
  note "stopped; data kept. Restart with: scripts/demo.sh setup"
}

cmd_reset() {
  read -r -p "This DELETES the MySQL and pgvector volumes (all demo data). Type 'yes': " ans
  [ "$ans" = "yes" ] || die "aborted"
  cmd_stop
  docker compose down -v
  note "volumes removed; next setup re-seeds from database/*.sql"
}

case "${1:-all}" in
  setup)  cmd_setup ;;
  sql)    cmd_sql ;;
  api)    cmd_api ;;
  rbac)   cmd_rbac ;;
  test)   cmd_test ;;
  status) cmd_status ;;
  stop)   cmd_stop ;;
  reset)  cmd_reset ;;
  all)    cmd_setup; cmd_sql; cmd_rbac; cmd_api ;;
  *)      sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
