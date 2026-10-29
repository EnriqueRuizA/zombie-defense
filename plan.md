# Plan de recuperación: modo local-only

Estado: plan de trabajo activo. Rama: `casual-no-persistence`.
Último commit: `726ab04` (`test: remove lobby/replay/steam tests`).
Fecha: 2026-10-29.

## 1. Objetivo

Terminar el build local-only descrito en `docs/LocalMode.md`, preservando el
trabajo ya realizado y evitando perder cambios. El resultado debe:

1. Arrancar sin cuentas ni servicios externos.
2. Permitir Solo, Tutorial, crear lobby y ver/unirse a cualquier lobby abierto
   del mismo servidor local (incluidos los de otros workers).
3. No mostrar ranking, clanes, tienda, cosméticos, progresión, replays,
   espectador, noticias, ads, Steam, desktop ni multi-servidor.
4. Pasar `typecheck`, tests, lint y build de producción.

## 2. Estado actual

- El árbol de trabajo contiene una eliminación masiva de cliente/servidor/tests
  (~200 archivos) y varias modificaciones incompletas.
- No existe un commit checkpoint único. El progreso está en el working tree.
- Se hicieron 9 commits pequeños eliminando tests meta:
  `AdGatekeeper`, `Api`, `ApiUserMeLogout`, `ConfigLoader`, cosméticos,
  `DesktopDisplay`, shell de escritorio, gating/ranking y lobby/replay/Steam.
- El índice está limpio; las eliminaciones y modificaciones restantes están
  **sin stage**. Hay archivos nuevos sin trackear:
  `docs/LocalMode.md`, `docs/CasualMode.md`, `src/client/LobbyApi.ts`,
  `src/server/Leaderboard*.ts` y tests asociados.
- `typecheck`, `lint`, `build-prod` y la suite completa de tests están **verdes**:
  `npm test` → 405 archivos / 4953 tests pasados, 1 skipped.
- `resources/lang/en.json`: 1196 claves no usadas eliminadas.
- `tests/NationGoldPerMinute.test.ts`: snapshot actualizado y verificado determinista.
- `tests/MapConsistency.test.ts`: nombres de Luna sincronizados con el manifiesto.
- Todos los agentes de OpenCode usan modelos gratuitos sin límite:
  - `coordinator.md`: `opencode/beam-free`
  - `developer-muse.md`: `opencode/beam-free` (reemplazó `opencode/muse-spark-1.3-contributor-free`, inválido)
  - `developer-mimo.md`: `opencode/beam-free` (reemplazó `opencode/mimo-v2.6-flash-free`)
  - `designer.md`: `opencode/beam-free` (añadido)
  - `qa.md`: `opencode/beam-free` (añadido)
- Archivo de memoria creado: `.opencode/memory.md`.
- `docs/LocalMode.md` es la especificación aprobada; `docs/CasualMode.md` queda
  como contexto histórico hasta la limpieza final.

## 3. Reglas de recuperación

1. **No** ejecutar `git reset`, `git clean`, `git checkout -- .` ni revertir el
   working tree. El trabajo existente se conserva.
2. No usar `git add -A` ni `git add .`. Preparar rutas explícitas por lote.
3. Cada commit debe ser pequeño, con prefijo (`test:`, `refactor:`, `feat:`,
   `docs:`, `chore:`) y un cuerpo que explique qué se elimina o implementa.
4. Antes de cada commit: `git diff --cached --stat` y `git diff --cached`.
5. No commitear archivos generados, logs, `.env`, `node_modules`, `dist` ni
   binarios.
6. Un commit puede dejar el build intermedio roto durante la eliminación, pero
   no debe mezclar eliminación con implementación nueva no relacionada.
7. Tras cada lote relevante: `npx tsc --noEmit` y corregir lo introducido antes
   de seguir.
8. No borrar archivos untracked sin leerlos; pueden contener trabajo útil.
9. La autorización del usuario para commits pequeños prevalece sobre la regla
   R17 de `docs/LocalMode.md`; aun así no se reescribirá historia.
10. `docs/LocalMode.md` es la fuente de verdad funcional; ante ambigüedad,
    preguntar antes de inventar comportamiento.

## 4. Inventario del working tree

| Grupo | Ejemplos | Acción prevista |
|---|---|---|
| Documentación | `docs/LocalMode.md`, `docs/CasualMode.md`, `plan.md` | Commit de plan/spec; retirar CasualMode al final |
| Identidad/cuentas | `Account*`, `Api*`, `Auth.ts`, `LoginResult`, `TokenLoginModal`, `TurnstileToken`, `UserMeBroadcast` | Eliminar restos meta; reescribir identidad local UUID |
| Desktop/Steam/portales | `Desktop*`, `Steam*`, `GamePortal`, `PokiSDK`, `CrazyGamesSDK` | Eliminar |
| Tienda/cosméticos/pagos | `Store`, `Cosmetics`, `Inventory*`, `Payments`, `Stripe*`, `Subscription*`, `Reward*` | Eliminar |
| Clanes/social/ranking/stats | `Clan*`, `Friends*`, `Leaderboard*`, `PlayerProfile*`, `Progression*`, componentes `stats/`, `ranking/` | Eliminar |
| Replays/espectador | `src/client/replay/**`, `VersionedReplay`, tests de replay | Eliminar |
| HUD/UI meta | `components/*`, `Nav*`, `Main.ts`, `LazyModals`, `ModalRouter`, `Navigation` | Limpiar imports/rutas |
| Servidor meta | `jwt.ts`, `Master*`, `Worker*`, `GameServer`, `ServerEnv`, `RenderHtml` | Loopback, UUID local, sin meta |
| Assets/build | `index.html`, `vite.config.ts`, `package.json`, `resources/lang/en.json` | Quitar scripts/CDN/claves meta |
| Tests | `tests/client/**`, `tests/server/**`, raíz | Eliminar/actualizar por funcionalidad |

## 5. Fases y commits

### Fase 0 — Congelar plan y estado

- Añadir `plan.md` y `docs/LocalMode.md`.
- No tocar todavía `docs/CasualMode.md`; se retira cuando el código ya no
  dependa de sus nombres.
- Commit sugerido: `docs: add local-only recovery plan`.
- Verificación: `git show --stat HEAD`.

### Fase 1 — Eliminar restos meta del cliente en lotes

Cada lote: preparar rutas explícitas, revisar diff, ejecutar `npx tsc --noEmit`
y commitear.

1. **Cuentas/API/login**: `src/client/Account*`, `Api*`, `BootInterrupts`,
   `LoginResult`, `TokenLoginModal`, `TurnstileToken`, `UserMeBroadcast`,
   `NavAccount*`, `NavNotifications*`.
   Commit: `refactor(client): remove account and login surfaces`.
2. **Desktop/Steam/portales**: `Desktop*`, `Steam*`, `GamePortal`, `PokiSDK`,
   `CrazyGamesSDK`, `components/Desktop*`, `components/Steam*`.
   Commit: `refactor(client): remove desktop, Steam and portal shells`.
3. **Tienda/cosméticos/pagos**: `Store`, `Cosmetics`, `EquippedCosmetics`,
   `Inventory*`, `Payments`, `Stripe*`, `Subscription*`, `Reward*`, `Rewards*`,
   `components/Cosmetic*`, `components/*Currency*`, `components/*Purchase*`.
   Commit: `refactor(client): remove store, cosmetics and payments`.
4. **Clanes/social/ranking/stats**: `Clan*`, `Friends*`, `Leaderboard*`,
   `PlayerProfile*`, `PlayerProgress*`, `Progression*`, `ProvisionalXp*`,
   `components/clan/**`, `components/leaderboard/**`, `components/stats/**`,
   `components/ranking/**`.
   Commit: `refactor(client): remove clans, social and rankings`.
5. **Replays/espectador**: `src/client/replay/**`, `VersionedReplay.ts`,
   utilidades de replay que solo use esa ruta.
   Commit: `refactor(client): remove replay and spectator client`.
6. **Tests correspondientes**: eliminar/actualizar `tests/client/**` que
   importen módulos de los lotes 1-5. No debilitar tests que sigan siendo
   válidos para Solo/Tutorial/lobby.
   Commit: `test(client): remove tests for deleted meta features`.

### Fase 2 — Limpiar el shell del cliente

Archivos: `Main.ts`, `ClientEnv.ts`, `Auth.ts`, `ServerList.ts`,
`GameModeSelector.ts`, `LobbySocket.ts`, `HostLobbyModal.ts`,
`JoinLobbyModal.ts`, `LazyModals.ts`, `Navigation.ts`, `ModalRouter.ts`,
`components/PlayPage.ts`, `components/Footer.ts`, `components/*NavBar.ts`,
`LocalServer.ts`, `Transport.ts`, `UserSettings.ts`, `resources/lang/en.json`.

Objetivo:

- `ClientEnv` solo con configuración local/same-origin.
- `Auth` con UUID local, nick y settings; sin JWT, refresh, logout, trust,
  clan tag, nivel ni badge.
- `ServerList` eliminado del flujo; sin multi-servidor ni reachability.
- Home con Solo, Tutorial, Crear, Unirse, lista local, ajustes, idioma y ayuda.
- Un solo feed de lobbies locales; sin filtros public/listed/featured/queue.
- Modales y navegación solo para rutas locales.

Commits sugeridos, uno por archivo o grupo coherente:

- `feat(client): add local UUID identity`
- `refactor(client): simplify ClientEnv to local values`
- `refactor(client): remove multi-server and reachability`
- `feat(client): show all local lobbies`
- `refactor(client): simplify home and navigation`
- `chore(i18n): remove unused meta strings`

Verificación tras cada commit: `npx tsc --noEmit`; al cerrar la fase,
`npm test` de los tests de cliente que sigan existiendo.

### Fase 3 — Servidor local-only

Archivos: `src/server/Master.ts`, `MasterLobbyService.ts`,
`WorkerLobbyService.ts`, `Worker.ts`, `GameServer.ts`, `ServerEnv.ts`,
`Server.ts`, `RenderHtml.ts`, `jwt.ts`, `IPCBridgeSchema.ts`, `package.json`,
`vite.config.ts`, `index.html`.

Objetivo:

- Bind exclusivo a `127.0.0.1`; sin `0.0.0.0`/`::`.
- Sin check-in, coordinator, JWT, Turnstile, CDN, Stripe, Steam, admin bot,
  winner replay ni leaderboard.
- Aceptar UUID local como token; derivar client id.
- Publicar **todos** los lobbies en fase lobby de **todos** los workers, con
  orden determinista; sin scheduler ni lobbies automáticos.
- Join por ID/link en el origen local; rechazo local si está lleno/iniciado.
- Mantener `NUM_WORKERS` para probar agregación cross-worker.

Commits sugeridos:

- `refactor(server): bind to loopback only`
- `feat(server): accept local UUID identity`
- `refactor(server): remove external meta services`
- `feat(server): publish all local lobbies`
- `refactor(server): remove scheduler and auto lobbies`
- `chore(build): remove external scripts and CDN`

### Fase 4 — Tests, documentación y QA

1. Actualizar `tests/util/Setup.ts` y tests de servidor para el nuevo contrato.
2. Añadir/ajustar tests de:
   - UUID local y persistencia en `localStorage`.
   - URLs solo loopback.
   - agregación de lobbies de varios workers.
   - desaparición al iniciar/llenarse y rechazo de late join.
   - join por ID/link inválido/full/started.
   - ausencia de endpoints/constantes externas.
3. Reemplazar `docs/CasualMode.md` por documentación local-only.
4. Ejecutar la matriz de validación.
5. Delegar QA independiente con `docs/LocalMode.md` y los informes de
   implementación; no declarar aprobado sin evidencia.

## 6. Matriz de validación

| Comando / prueba | Criterio |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npm test` | suite completa en verde |
| `npm run lint` | sin errores |
| `npm run build-prod` | build correcto |
| `Get-NetTCPConnection -State Listen` | solo loopback |
| DevTools Network, perfil limpio | cero requests externos |
| Dos pestañas + dos workers | lobby visible/joinable en <1 s |
| Inicio de partida | lobby desaparece; late join rechazado |
| `localStorage` | UUID/nick/idioma/settings/tutorial únicamente |
| Sin red | build, server, client y Solo funcionan |

Cada criterio de `docs/LocalMode.md` (AC1-AC15) debe quedar marcado como
`VALIDADO`, `FALLIDO`, `NO VALIDADO` o `NO EJECUTABLE` con evidencia.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Perder trabajo por limpieza agresiva | No reset/clean; commits por lotes; revisar diff antes de stage |
| Commits gigantes | Un grupo funcional por commit; no mezclar source y tests |
| Typecheck roto durante días | Re-medir tras cada lote; priorizar errores de imports |
| Borrar un test que aún cubre Solo/Tutorial | Revisar el test antes de borrar; conservar los de gameplay |
| Dejar restos meta | Búsqueda final de `Api`, `JWT`, `Steam`, `Cosmetic`, `Replay`, `Leaderboard`, `CASUAL_MODE` |
| Servidor escucha en `0.0.0.0` | Revisar `listen(...)` y validar con `Get-NetTCPConnection` |
| Agregación cross-worker incompleta | Test con `NUM_WORKERS=2` y dos pestañas |
| `developer-muse` no disponible | Usar `developer-mimo` para cliente; el coordinador hace servidor o espera disponibilidad |

## 8. Próximos pasos inmediatos

1. Validar configuración de agentes: `opencode agent list` (hecho: todos registrados con `opencode/beam-free`).
2. Ejecutar smoke test local de dos workers (`NUM_WORKERS=2`): health, lobby creación, visibilidad cruzada, inicio de partida.
3. Commitear `plan.md` + `docs/LocalMode.md` + `.opencode/memory.md` + cambios de agentes (autorización requerida para commits).
4. Re-ejecutar `npx tsc --noEmit`, `npm run lint`, `npm test` tras cada lote relevante.
5. Ejecutar el lote 1 de la Fase 1 (cuentas/API/login) con stage explícito.
6. Repetir por lotes hasta que el cliente no importe módulos eliminados.
7. Pasar a Fase 2 (identidad local y home) y después Fase 3 (servidor).
8. No abrir QA hasta que `typecheck` y el build local estén estables.
