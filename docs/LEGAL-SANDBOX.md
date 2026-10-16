# Sandbox legal — retirada temporal de marcas (O4)

Estado: **sign-off D2 + D3** (propietario, sandbox no comercial).
Rama: `o4-legales` (base: merge O3, commit `7160185`). Sin push.

## Sign-off

- **D2 — sign-off propietario sandbox no comercial:** autoriza retirar
  temporalmente la marca legal OpenFront (notices de copyright, nombres de
  entidad, emails y dominios legales) mientras el proyecto corre como sandbox
  no comercial, siempre que la retirada quede documentada y sea reversible por
  branch de miembro.
- **D3 — alcance de la retirada:** autoriza retirar temporalmente la lista
  completa de `CREDITS.md` (código, datos de mapas ODbL/CC-BY, iconos y banderas)
  y sustituir las atribuciones OpenFront por Zombie Defense en
  `LICENSE-ASSETS`, `LICENSING.md` y `proprietary/LICENSE`. **No** se tocan los
  binarios de mapas: solo la lista de `docs/CREDITS` (`CREDITS.md`).

Ambos sign-off los cita el coordinador en la asignación O4 D2+D3.

## Lista de retiradas temporales

Contenido previo (base `7160185`) recuperable con `git show 7160185:<ruta>`.

| Archivo                                       | Qué se retiró / sustituyó                                                                                             | Valor actual (placeholder)                                                                                                            | Re-add                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `LICENSE:663-678`                             | notice `© OpenFront and Contributors`, "OpenFront project" en los términos adicionales AGPL §7                        | `© Zombie Defense` / "Zombie Defense project" + marcador `MARKER (O4/D2)` al final del bloque                                         | `git show 7160185:LICENSE` (cuerpo AGPL §1-§13 sin tocar)                                   |
| `README.md` (sección License: footer/loading) | bullets de notices de footer y loading `© OpenFront and Contributors` y la línea "must preserve these notices"        | "Notices retiradas temporalmente…" + comentario `Propuesta (O4/D2)`                                                                   | `git show 7160185:README.md`                                                                |
| `CREDITS.md`                                  | **lista completa** (código + Contributors, mapas ODbL/CC-BY/public domain, iconos, banderas)                          | stub con comentario `MARKER (O4/D2)`                                                                                                  | `git show 7160185:CREDITS.md`                                                               |
| `LICENSE-ASSETS`                              | atribución `OpenFront`/`OpenFront Inc.` → `Zombie Defense`; copyright de `/proprietary`; propiedad de assets externos | `Zombie Defense` / `Zombie Defense Inc.` + marcador `MARKER (O4/D2)`                                                                  | `git show 7160185:LICENSE-ASSETS`                                                           |
| `LICENSING.md`                                | `OpenFront.io Project`, `OpenFront Inc.` (holders, contacto, copyright histórico MIT)                                 | `Zombie Defense` / `Zombie Defense Inc.`; las líneas de copyright histórico quedan como "[notice retirada temporalmente…]" + marcador | `git show 7160185:LICENSING.md`                                                             |
| `src/client/components/Footer.ts`             | `<span data-i18n="main.copyright">` del footer                                                                        | comentario HTML `MARKER (O4/D2)` (span retirado)                                                                                      | `git show 7160185:src/client/components/Footer.ts`                                          |
| `resources/lang/en.json` (**solo `en.json`**) | `main.copyright` (`© OpenFront™ and Contributors`) y `delete_account_failed` (`support@openfront.io`)                 | `© Zombie Defense and Contributors`; `support@zombie-defense.example`                                                                 | `git show 7160185:resources/lang/en.json` (otros idiomas intactos, gestionados por Crowdin) |
| `resources/public/terms-of-service.html`      | `support@`/`appeals@openfront.io` y `https://openfront.io`                                                            | `*@zombie-defense.example`, `https://zombie-defense.example` + comentario `Propuesta (O4/D2)`                                         | `git show 7160185:resources/public/terms-of-service.html`                                   |
| `resources/public/privacy-policy.html`        | `support@`/`legal@openfront.io` y `https://openfront.io`                                                              | igual que arriba + comentario `Propuesta (O4/D2)`                                                                                     | `git show 7160185:resources/public/privacy-policy.html`                                     |
| `proprietary/LICENSE`                         | `OpenFront Inc.` (copyright, permisos, contribuciones) y `legal@openfront.io`                                         | `Zombie Defense` / `Zombie Defense Inc.`, `legal@zombie-defense.example` + marcador                                                   | `git show 7160185:proprietary/LICENSE`                                                      |
| `package.json` (`dev:prod`)                   | runtime `API_DOMAIN=api.openfront.io`                                                                                 | `API_DOMAIN=api.zombie-defense.example` (placeholder, sin dominio real inventado) — **Propuesta**                                     | `git show 7160185:package.json`                                                             |

### Verificado sin cambios (no había marca que retirar)

- `index.html`: sin notice de copyright, sin pantalla de carga con `data-i18n`
  de copyright y sin footer con texto legal (el `<footer>` solo aloja el script
  de anuncios; `main.copyright` solo se referencia desde `Footer.ts` y
  `GameStartingModal.ts`). El aviso de loading se neutraliza vía `en.json`.
- Binarios de mapas (`resources/maps/**`, capas, thumbnails): **no tocados**
  (D3: solo la lista de `CREDITS.md`).

## Procedimiento de re-add por branch de miembro

Cualquier miembro puede restaurar la marca legal en su branch:

1. Localizar la retirada en el historial:
   `git log --oneline -- <ruta>` (la retirada vive en la rama `o4-legales`).
2. Restaurar el contenido previo completo:
   `git checkout 7160185 -- <ruta>` (o `git show 7160185:<ruta> > <ruta>`).
3. Para `CREDITS.md` y las líneas de copyright histórico de `LICENSING.md`,
   restaurar es **todo o nada**: no dejar la lista a medias (D3 retiró la lista
   entera).
4. Para los placeholders de email/dominio, sustituir
   `*.zombie-defense.example` por el dominio/correo definitivos cuando existan
   (**no inventar dominios reales**; mientras tanto el placeholder es el estado
   correcto).
5. Quitar el comentario `MARKER (O4/D2)` / `Propuesta (O4/D2)` del fichero
   restaurado y actualizar la tabla de arriba.
6. Ejecutar `npm test` + `npm run lint` + `npm run typecheck` en la branch.

## Fuera de alcance (Propuesta, no tocado en O4 D2+D3)

- `package.json` `dev:staging` → `API_DOMAIN=api.openfront.dev` (mismo runtime,
  fuera del alcance literal `api.openfront.io`).
- `docs/API.md`, `docs/MultiServer.md`, `docs/Replays.md`: ejemplos con
  `api.openfront.io` / `openfront.io` (documentación, no runtime).
- `resources/public/press/index.html`, `resources/manifest.json`
  (`"name": "OpenFront.io"`), `resources/public/ads.txt` (`OWNERDOMAIN`).
- `CONTRIBUTING.md` (links Crowdin/GitHub upstream), badges y logo de `README.md`,
  `CREDITS.md` enlazado desde `GameStartingModal.ts` (URL upstream).
- `deploy.sh` `REMOTE_USER="openfront"` / nombres de script remoto, `Dockerfile`
  `DOMAIN = openfront.dev`, `nginx.conf` `openfront_workers`, `update.sh`
  (funcional, solo comentario en `deploy.sh`).
- Tests con fixtures `openfront.io` (`tests/**`), comentarios de código
  (`src/**`, `packages/**`), `spec.md` / `spec-clon-perfecto.md`,
  `map-generator/`, `resources/lang/*.json` distintos de `en.json`.

## Riesgos legales asumidos por el sign-off (para revisión de QA/legal)

- `CREDITS.md` retira atribuciones ODbL/CC-BY de datos de mapas: ODbL exige
  atribución en distribution (también no comercial). Re-add obligatorio antes de
  cualquier distribución real.
- `LICENSE-ASSETS` reemplaza la atribución CC BY-SA requerida ("OpenFront") y
  `LICENSING.md` altera notices históricos MIT: la condición MIT de conservar
  notices queda temporalmente incumplida hasta el re-add.
- Los términos legales apuntan a un dominio/correos placeholder
  (`*.zombie-defense.example`): no válidos para producción.
