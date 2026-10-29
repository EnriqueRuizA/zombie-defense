# Memoria del proyecto — Zombie Defense (local-only)

## Estado actual
- Repo local-only completo: typecheck, lint, build-prod y suite de tests verdes.
- `npm test`: 405 archivos / 4953 tests pasados, 1 skipped.
- `npm run test:legacy` (suite `net` migrada a `tests/net.legacy.cjs`): verde.
- `resources/lang/en.json`: 1196 claves no usadas eliminadas.
- `tests/NationGoldPerMinute.test.ts`: snapshot actualizado y verificado determinista.
- `tests/MapConsistency.test.ts`: nombres de Luna sincronizados con el manifiesto.

## Configuración de agentes (OpenCode, modelos gratuitos sin límite)
- `coordinator.md`: `opencode/beam-free` (ya aplicado).
- `developer-muse.md`: `opencode/beam-free` (reemplazó `opencode/muse-spark-1.3-contributor-free`, inválido).
- `developer-mimo.md`: `opencode/beam-free` (reemplazó `opencode/mimo-v2.6-flash-free`).
- `designer.md`: `opencode/beam-free` (añadido).
- `qa.md`: `opencode/beam-free` (añadido).

## Archivos de configuración globales a revisar
- `~/.config/opencode/opencod.jsonc` (typo, no se carga como `opencode.jsonc`).
- `~/.config/opencode/opencode.jsonc_o` (backup, no se carga).

## Próximos pasos
1. Validar configuración con `opencode agent list`.
2. Ejecutar `npm run typecheck`, `npm run lint`, `npm test`.
3. Smoke test local de dos workers (`NUM_WORKERS=2`): health, lobby, visibilidad cruzada, inicio de partida.
4. Actualizar `plan.md` y commitear en lotes coherentes.
5. Limpiar cliente pendiente (hosted-lobby, ranked/trust).

## Reglas del ciclo
- Un ciclo = una funcionalidad o incidencia. No mezclar varias.
- El implementador nunca aprueba su propio trabajo; QA es independiente.
- Los dos developers pueden trabajar en paralelo solo en tareas y archivos disjuntos.
- Sin commits, pushes, releases ni borrados sin autorización explícita.
