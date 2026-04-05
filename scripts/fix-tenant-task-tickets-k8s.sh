#!/usr/bin/env bash
# Apply known-good task ticket values in PostgreSQL (multi-tenant schema) by task id.
# Default mapping: Drenlia PG tenant — same id → ticket list as provided for SQLite verification.
#
# Usage:
#   ./scripts/fix-tenant-task-tickets-k8s.sh              # run update
#   ./scripts/fix-tenant-task-tickets-k8s.sh --dry-run    # show planned changes only
#
# Environment overrides:
#   NAMESPACE=easy-kanban-pg     (default: easy-kanban-pg)
#   TENANT_ID=drenlia-pg         (default: drenlia-pg) → schema tenant_<TENANT_ID>
#   POSTGRES_DEPLOYMENT=postgres (default: postgres)
#   DB_NAME=easykanban           (default: easykanban)
#   DB_USER=kanban               (default: kanban)
#
# Note: If you added test tasks that reuse ticket numbers (e.g. TASK-00052), after this fix
# you may have duplicate ticket strings until you renumber or delete those rows — the app
# does not enforce UNIQUE(ticket).

set -euo pipefail

NAMESPACE="${NAMESPACE:-easy-kanban-pg}"
TENANT_ID="${TENANT_ID:-drenlia-pg}"
POSTGRES_DEPLOYMENT="${POSTGRES_DEPLOYMENT:-postgres}"
DB_NAME="${DB_NAME:-easykanban}"
DB_USER="${DB_USER:-kanban}"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

SCHEMA="tenant_${TENANT_ID}"
# Quote for SQL identifiers (hyphen in tenant id)
Q_SCHEMA="\"${SCHEMA}\""

# ticket|task_id — titles omitted; matches your SQLite export (83 rows).
MAP_TSV="$(cat <<'MAP_EOF'
TASK-00002|a0d5603d-126f-4cb3-8119-3d88da1f9bbd
TASK-00003|be6b3676-cde3-4c6c-afb9-51a4affcc157
TASK-00005|cb4f35dd-bbad-40d6-800c-b7ef36453b80
TASK-00006|10a05824-e719-44a6-b146-8a609c6c697b
TASK-00007|c9594c23-5c4d-4c7c-b77b-7a83c2d32524
TASK-00009|72b34a6a-9e2c-45e1-8d24-881303ae9213
TASK-00010|6c99715f-6f84-4aef-813c-3e9917f90847
TASK-00012|65aa6c0a-7d06-4eff-8ef7-5dbc391704fa
TASK-00013|b53b6205-ddc9-49bb-b4d0-b4366f3b6084
TASK-00014|24fdb421-7502-484a-abca-71afb0a22b98
TASK-00015|18edb809-4700-4de1-a6d1-f60c2b945e48
TASK-00016|7139bd52-d2f1-4ab2-9ce8-a66b4227b841
TASK-00017|1c828544-89c7-4f0e-adbe-5b341478c500
TASK-00018|f4fb309c-ae10-497b-ab13-9a59e1a90410
TASK-00019|38f8c3d4-0d10-4c0f-a9f2-347d20e064e3
TASK-00020|3083641f-6102-49d2-bdbb-86d88cdfd899
TASK-00021|a9db0380-5926-4b5b-b204-4063dad4d8f3
TASK-00022|c01ae17d-02c8-45fa-b31b-5fc6ee81a06b
TASK-00023|5b6e98a3-42de-4be1-8cbb-1b20a572336a
TASK-00024|a520173e-f634-45d9-811e-3edaa41dfa47
TASK-00025|1354dff9-4f55-4516-a48f-52556b024be3
TASK-00029|f8f1e579-d42a-4a97-87e3-9460a96ebffd
TASK-00030|70c45ac1-ada4-4f2b-b590-d942b30710dd
TASK-00031|51b9b6ab-efbc-4aba-a034-af3be040ef73
TASK-00032|33520837-77e4-4412-ab0e-12e7cbc3420f
TASK-00034|5d03cbcc-4785-47ea-aae0-05d782c6e319
TASK-00035|036ac2cc-9d33-48ca-a59d-400b782d5830
TASK-00036|328feabc-ce0d-4362-a136-bb5ee68a4986
TASK-00037|f1463b2b-e9f7-4eb2-822e-7213c6b8db1e
TASK-00038|79a6cd9f-37d9-430d-8a1d-76b64b316404
TASK-00040|fd3c69d6-fd4a-4ddf-aee0-c4b1b9d4b9da
TASK-00041|e64a6928-3728-4b42-a2b6-3c920e9846c8
TASK-00042|7e144358-f030-40c0-a1a3-abccadc68279
TASK-00043|67bed297-1aea-4945-a1cd-a47ac3ffe430
TASK-00045|dd4f533d-e247-4c57-9d1b-5c2cb08af6f3
TASK-00047|02e6d221-6173-40c3-9627-4d8a1ea253fb
TASK-00048|e0fa8b90-8263-4f84-9825-2dd0c0c05353
TASK-00049|3ad934dd-7ca4-43b5-be26-f402c87a0c33
TASK-00050|28455c58-c1c0-4624-96ce-6bdb4aa206c4
TASK-00001|69312544-4899-456f-b466-b173affaded8
TASK-00051|06829b45-6a0f-4a2b-b48b-3c4d7d8e1a95
TASK-00052|c00b339c-b58f-4a5b-bf8f-0ceba1851aee
TASK-00053|d0fd259d-ef9f-453e-9b36-878c58b7c2a7
TASK-00054|4ee95542-3189-487f-8e97-b40f2d4c6f00
TASK-00055|646e3926-39b0-4f07-915d-7be31bc4d866
TASK-00056|3e52894f-de64-4722-ac80-504d8555723a
TASK-00057|a5bfe8fe-7ee5-4358-bfb1-d20f30a3d295
TASK-00058|d2c7af3b-b261-4dee-b1f8-35621a0beecb
TASK-00059|8d9b4773-903a-47ad-a252-4d35059324be
TASK-00060|c4f034d4-b3b8-449b-acfc-520ca3739f04
TASK-00061|9113ea19-2edb-475f-af0d-822b6ccf6578
TASK-00062|588e3a43-d8c5-4764-986d-96adb564f8be
TASK-00063|c8364433-9776-427e-a0e6-078d1d83639b
TASK-00064|f8f5608b-e781-42e7-b294-0348a33553fc
TASK-00065|3691c832-6f7c-42f6-85d6-dfffc28cd434
TASK-00066|87ed3833-7b2c-4e2f-9eb1-d6abc357ef09
TASK-00067|38e3256e-1433-48fa-93f3-658ef6d99ca1
TASK-00068|72151b29-3b65-49ab-a997-7bdc2a28d0ba
TASK-00069|3f516752-aede-4136-bfcc-fa57c1b19025
TASK-00070|6c884196-b692-4a35-a140-9ed0b4dd5e7d
TASK-00071|15a39826-a6d5-4bee-a0d5-5df606cdd2bb
TASK-00072|28f81ee1-4004-4fbf-b54c-f1bccceed953
TASK-00073|587486fa-fb6e-4af9-ae03-7ae06223e171
TASK-00074|e1a12bbd-ca90-4b63-a8e8-f74f792ad7d3
TASK-00075|8426bcc4-8077-40c5-8603-69469daf89c2
TASK-00076|96b4a2dc-6c2d-444f-a7ee-562f75db9252
TASK-00077|f2705c95-8e3e-4fb5-b82e-e6dd1b9ab2d3
TASK-00078|3fc06b39-4aac-4b67-8050-1ecf3b66391d
TASK-00079|37882eb2-bc4d-4c81-9b2c-61422be9353c
TASK-00080|f2de602b-08f1-483f-abcf-0e31cc19cec2
TASK-00081|a9f15374-f122-4920-950a-5fd31f39206c
TASK-00082|508124ab-3536-4c1e-8f20-8fa645ad991f
TASK-00083|58b95fc3-4ccc-41da-af8c-a12862ac723b
TASK-00084|dc463f97-9965-4a08-8f02-8ee36f0cb33c
TASK-00085|048b4a67-56de-4a3a-8f4f-aa252cdbe02b
TASK-00086|afb9d0b8-ad0d-40b8-a2bc-60ef10cb3c94
TASK-00087|8dc7b4a4-124b-436f-b844-5f3ec1e35dca
TASK-00088|8687a2d9-f8fc-48b1-9edb-2c8ab9aa4662
TASK-00089|f1fbf2a0-69c2-4d63-a542-39f2e14354ef
TASK-00090|8006baf2-ab34-4518-a929-2ce091069714
TASK-00091|beff2957-eaa3-497e-906e-25b3bada7d34
TASK-00092|908f7411-3c8f-46ae-89d6-3f54b4bc84b5
TASK-00093|5c39c898-a680-4ed2-a84f-f0415e278b50
MAP_EOF
)"

VALUES_SQL=""
while IFS='|' read -r ticket task_id; do
  [[ -z "${task_id:-}" ]] && continue
  # Escape single quotes for SQL string literals
  ticket_esc="${ticket//\'/\'\'}"
  task_id_esc="${task_id//\'/\'\'}"
  if [[ -n "$VALUES_SQL" ]]; then
    VALUES_SQL+=","
  fi
  VALUES_SQL+=$'\n'"  ('${task_id_esc}', '${ticket_esc}')"
done <<< "$MAP_TSV"

PSQL_BASE=(kubectl exec -n "$NAMESPACE" "deployment/${POSTGRES_DEPLOYMENT}" -- \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1)

echo "Namespace:     $NAMESPACE"
echo "Schema:        $SCHEMA"
echo "Postgres:      deployment/${POSTGRES_DEPLOYMENT}"
echo "Rows in map:   $(grep -cE '^TASK-[0-9]+\\|' <<< "$MAP_TSV" || true)"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "=== DRY RUN: rows that would change (current ticket → new ticket) ==="
  "${PSQL_BASE[@]}" -c "
SELECT t.id, t.ticket AS current_ticket, m.new_ticket AS new_ticket, left(t.title, 50) AS title
FROM ${Q_SCHEMA}.tasks t
JOIN (
  VALUES ${VALUES_SQL}
) AS m(task_id, new_ticket) ON t.id = m.task_id
WHERE t.ticket IS DISTINCT FROM m.new_ticket
ORDER BY m.new_ticket;
"
  echo ""
  echo "=== DRY RUN: mapped ids not present in ${SCHEMA}.tasks ==="
  "${PSQL_BASE[@]}" -c "
SELECT m.task_id
FROM (
  VALUES ${VALUES_SQL}
) AS m(task_id, new_ticket)
LEFT JOIN ${Q_SCHEMA}.tasks t ON t.id = m.task_id
WHERE t.id IS NULL;
"
  exit 0
fi

echo "Running UPDATE in a transaction..."
"${PSQL_BASE[@]}" -c "
BEGIN;

UPDATE ${Q_SCHEMA}.tasks AS t
SET
  ticket = m.new_ticket,
  updated_at = CURRENT_TIMESTAMP
FROM (
  VALUES ${VALUES_SQL}
) AS m(task_id, new_ticket)
WHERE t.id = m.task_id;

COMMIT;
"

echo ""
echo "=== Duplicate ticket values (if any — e.g. test tasks colliding) ==="
"${PSQL_BASE[@]}" -c "
SELECT ticket, count(*) AS cnt
FROM ${Q_SCHEMA}.tasks
WHERE ticket IS NOT NULL
GROUP BY ticket
HAVING count(*) > 1
ORDER BY cnt DESC, ticket;
"

echo ""
echo "Done."
