# Plan de ejecución — Zone Zero: Last Bastion

Documento operativo para ejecutar el desarrollo con **rigor** y **eficiencia**. Complementa `PLAN_ZONE_ZERO.md` (fases) y `ZONE_ZERO_GDD.md` (visión). Integrado con el flujo PO → Dev → QA → Director (`AGENTS.md`, `_agent-memory/`).

---

## 1. Principios de ejecución

| Principio | Aplicación |
|-----------|------------|
| **Un ítem a la vez por flujo** | El Director asigna un único ítem ALTA/CRÍTICA a Dev; QA verifica ese ítem antes de pasar al siguiente. Evita entregas a medias. |
| **Criterios antes que código** | PO escribe en `requirements.md` o en `docs/` los criterios de aceptación del ítem **antes** de que Dev implemente. Si no hay criterios, el Director pide al PO que los defina. |
| **Definition of Done (DoD)** | Un ítem está "hecho" solo cuando: (1) Implementación alineada con criterios, (2) QA ha verificado y no hay bugs CRÍTICOS/ALTOS abiertos para ese ítem, (3) `architecture.md` actualizado si hubo cambios estructurales. |
| **Sin saltos de fase** | No se inicia un ítem de Fase N+1 si la Fase N no está cerrada (salvo excepción explícita del Director; p. ej. Fase 3 puede avanzar en paralelo a Fase 1). |
| **Backlog = contrato** | `_agent-memory/backlog.md` es la única lista priorizada. Todo ítem de este plan que se vaya a ejecutar debe estar reflejado allí con prioridad. |

---

## 2. Protocolo de handoff (flujo por ítem)

```
[Director] Elige siguiente ítem del backlog (prioridad CRÍTICA → ALTA → MEDIA).
           Si el ítem no tiene criterios de aceptación escritos:
              → Asigna a PO: "Redacta criterios de aceptación para [ítem]"
           Si ya tiene criterios:
              → Asigna a Dev: "Implementa [ítem] según criterios en [doc]"

[PO]       Escribe/actualiza requirements.md o docs/CRITERIOS_ACEPTACION_*.md
           con: Given/When/Then o lista de comprobación para el ítem.
           Actualiza backlog.md si cambia prioridad o se desglosa el ítem.

[Dev]      Lee requirements.md + architecture.md + criterios del ítem.
           Implementa en scripts/, scenes/, ui/.
           Al terminar: actualiza architecture.md si aplica; responde con resumen
           de cambios y qué comprobar.

[Director] Asigna a QA: "Verifica ítem [X] según criterios en [doc]"

[QA]       Ejecuta pruebas manuales/checklist; revisa linter.
           Si hay fallos: escribe en bug-reports.md (severidad, pasos, esperado/actual).
           Si todo OK: indica "Aprobado para ítem [X]".

[Director] Si QA aprueba: marca ítem como hecho en backlog, elige siguiente ítem.
           Si hay bugs CRÍTICOS/ALTOS: devuelve a Dev con bug-reports.md.
           Si hay dudas de requisitos: devuelve a PO.
```

---

## 3. Definición de Done (DoD) por tipo de ítem

| Tipo | DoD |
|------|-----|
| **Feature (nueva funcionalidad)** | Criterios de aceptación del PO cumplidos; QA ha ejecutado checklist; sin bugs CRÍTICOS/ALTOS; architecture.md actualizado si hay nuevos sistemas o archivos clave. |
| **Refactor / migración** | Comportamiento externo invariante (mismo flujo jugable); QA verifica regresión en área afectada; architecture.md refleja nueva estructura. |
| **Bugfix** | Bug reportado en bug-reports.md cerrado; pasos de reproducción ya no reproducen el fallo; QA confirma cierre. |
| **Cierre de fase** | Todos los ítems de la fase marcados hechos en backlog; criterios de cierre de fase (en PLAN_ZONE_ZERO.md) verificados por QA; Director declara la fase cerrada. |

---

## 4. Desglose ejecutable por fases

Cada ítem tiene **ID**, **Título**, **Prioridad**, **Criterios de aceptación (resumen)** y **Dependencias internas**. El PO puede copiar estos ítems al backlog y añadir los criterios completos en `requirements.md` o en `docs/`.

---

### Fase 1 — Recursos y economía alineados al GDD

| ID | Título | Prioridad | Criterios de aceptación (resumen) | Notas |
|----|--------|-----------|-------------------------------------|-------|
| F1.1 | Definir 6 recursos GDD y mapear desde los 12 actuales | ALTA | Lista de 6 recursos (Comida, Agua, Materiales, Combustible, Medicamentos, Munición); tabla de equivalencia 12→6 o reemplazo directo; documentado en requirements.md. | PO define; Dev no implementa aún. |
| F1.2 | Migrar GameManager y HUD a 6 recursos | ALTA | RESOURCE_KEYS (o equivalente) con 6 claves; HUD muestra solo 6; edificios y tropas usan solo esas claves en costes. | Tras F1.1. |
| F1.3 | Escasez por zona: celdas/edificios saqueados | ALTA | Al menos ruinas o celdas tienen estado "saqueado"; no dan recursos hasta que pase N días (configurable). Algún flujo que marque zona como saqueada (p. ej. al recolectar allí). | Tras F1.2. |
| F1.4 | Edificio de producción: huerto → Comida | ALTA | Un edificio "huerto" construible; consume Materiales y/o Agua; cada día produce Comida (cantidad fija o por fórmula). Coste y límite en BUILDING_TYPES. | Tras F1.2. |
| F1.5 | Guardar/cargar con 6 recursos y edificios de producción | MEDIA | save_game/load_game y apply_loaded_state persisten los 6 recursos y la lista de edificios (incl. huerto); sin regresión en Load. | Tras F1.2, F1.4. |

**Cierre Fase 1:** F1.1–F1.5 hechos; criterios de cierre de PLAN_ZONE_ZERO.md (HUD y construcción con 6 recursos; una fuente de producción; zona agotada) verificados.

---

### Fase 2 — Supervivientes como individuos (nivel 1)

| ID | Título | Prioridad | Criterios de aceptación (resumen) | Notas |
|----|--------|-----------|-------------------------------------|-------|
| F2.1 | Profesión pre-crisis y bonus a stats | ALTA | Cada superviviente tiene profesión (médico, soldado, ingeniero, etc.); profesión da bonus numérico a producción (Recolectar), daño (Defender) o futuro rol. Panel y datos en GameManager. | Depende Fase 1 cerrada. |
| F2.2 | Rasgos (2–3 por persona) y efecto ±% | ALTA | Cada superviviente tiene 2–3 rasgos; rasgos modifican rendimiento (p. ej. ±10 %) en trabajo o defensa. Visible en panel. | Tras F2.1. |
| F2.3 | Roles con nivel 1–3 y mejora por uso | ALTA | Recolectar y Defender tienen nivel 1–3; el uso (días trabajando o defendiendo) incrementa nivel; nivel mejora producción o daño. | Tras F2.1. |
| F2.4 | Muerte permanente y duelo | ALTA | Si un superviviente "muere" (evento simulado o por oleada futura), se elimina de la lista; otros en "relación cercana" sufren penalización temporal (duelo). | Tras F2.1; requiere definir evento de muerte. |

**Cierre Fase 2:** Panel muestra profesión, rasgos y nivel de rol; muerte tiene consecuencia (duelo).

---

### Fase 3 — Variedad de infectados y día/noche

| ID | Título | Prioridad | Criterios de aceptación (resumen) | Notas |
|----|--------|-----------|-------------------------------------|-------|
| F3.1 | Tipos Vagabundo, Corredor, Aglutinador | ALTA | Tres tipos con stats distintos (velocidad, vida); visual distinto en mapa (color/tamaño); oleada spawn mezcla según día. | Puede iniciarse en paralelo a F1. |
| F3.2 | Comportamiento día vs noche (velocidad/cantidad) | ALTA | De día: infectados más lentos o menos numerosos; de noche: más rápidos y/o más cantidad. Fórmulas en GameManager o city_game_loop. | Tras F3.1. |
| F3.3 | Gritador (opcional): llama a otros en radio | MEDIA | Un tipo que al recibir daño o ser detectado "llama" a infectados en radio; esos se dirigen hacia el Gritador o hacia el jugador. | Tras F3.1. |

**Cierre Fase 3:** Al menos 3 tipos en oleadas; oleada cambia entre día y noche.

---

### Fase 4 — Perímetro y estructuras defensivas

| ID | Título | Prioridad | Criterios de aceptación (resumen) | Notas |
|----|--------|-----------|-------------------------------------|-------|
| F4.1 | Herramienta perímetro: marcar zona segura | ALTA | El jugador puede dibujar/definir un perímetro (polígono o celdas); solo dentro se puede construir; coste de mantenimiento por longitud (materiales/día). | Depende Fase 1. |
| F4.2 | Barricada débil y muro reforzado (2 tipos) | ALTA | Al menos 2 tipos de muro con coste y resistencia distintos; infectados los atacan; uno "débil" (barato, poca vida), otro "reforzado" (actual). | Tras F4.1 opcional. |
| F4.3 | Torres: vigilancia vs nido de ametralladora | MEDIA | Diferenciar torre (visión/alcance) de nido (más daño, más coste); tropas actuales cuentan como defensa activa. | Tras F4.1. |

**Cierre Fase 4:** Perímetro jugable; al menos 2 tipos de muro; oleadas atacan/perimetran.

---

### Fases 5–13 (resumen ejecutivo)

- **Fase 5 (Moral):** Ítems F5.1 valor 0–100, F5.2 bandas y efectos, F5.3 factores (muerte, comida, noche). Depende Fase 2.
- **Fase 6 (Exploración):** F6.1 escuadrones 2–4, F6.2 misiones Saqueo/Reconocimiento automático, F6.3 riesgo/recompensa. Depende Fase 1, 2, 4.
- **Fase 7 (Investigación):** F7.1 rama Ingeniería 3–4 nodos, F7.2 puntos de investigación (científicos/laboratorio). Depende Fase 1, 2.
- **Fase 8 (Diplomacia):** F8.1 colonias IA, F8.2 comercio, F8.3 relación y eventos. Depende Fase 1, 6.
- **Fase 9 (Clima):** F9.1 estados Normal/Tormenta, F9.2 efectos en oleada/exploración. Depende Fase 3, 6.
- **Fase 10 (IA manada):** F10.1 ataque a tramos débiles, F10.2 flanqueo. Depende Fase 3, 4.
- **Fase 11 (Campaña):** F11.1 estructura campaña, F11.2 3–5 misiones con narrativa. Depende fases anteriores estables.
- **Fase 12 (Roguelite):** F12.1 modo infinito, F12.2 meta-puntos y desbloqueos. Depende Fase 11.
- **Fase 13 (Pulido):** F13.1 mapa enriquecido o OSM mínimo, F13.2 audio dinámico, F13.3 HUD/alertas, F13.4 mapa táctico. Depende resto.

---

## 5. Orden de ejecución recomendado (eficiencia)

1. **En paralelo (si hay capacidad):**
   - **Rama A:** F1.1 → F1.2 → F1.4 → F1.3 → F1.5 (Fase 1 completa).
   - **Rama B:** F3.1 → F3.2 (Fase 3 hasta cierre sin Gritador).

2. **Secuencial tras Fase 1:**
   - F2.1 → F2.2 → F2.3 → F2.4 (Fase 2).
   - Luego F4.1 → F4.2 (Fase 4 mínima).

3. **Siguientes bloques:** Fase 5 → Fase 6 → Fase 7; luego F8, F9, F10 según prioridad de producto; finalmente F11 → F12 → F13.

4. **Ítem opcional existente:** "Restaurar edificios en suelo al cargar" (BAJA) puede hacerse en cualquier momento o al cerrar F1.5.

---

## 6. Integración con _agent-memory

| Documento | Uso en la ejecución |
|-----------|----------------------|
| **backlog.md** | Contiene los ítems concretos a hacer (copiados de este plan). Prioridad CRÍTICA/ALTA/MEDIA/BAJA. El Director asigna desde aquí. |
| **requirements.md** | PO escribe aquí la visión y los criterios de aceptación por ítem o por fase. Dev y QA leen desde aquí. |
| **architecture.md** | Dev actualiza al terminar ítems que cambien estructura (recursos, edificios, nodos nuevos). |
| **bug-reports.md** | QA escribe bugs; Dev corrige; Director prioriza si bloquean cierre de ítem. |
| **PLAN_ZONE_ZERO.md** | Referencia de fases y criterios de cierre de fase. No sustituye el backlog. |
| **PLAN_EJECUCION_ZONE_ZERO.md** | Este documento: protocolo, DoD, desglose de ítems y orden de ejecución. |

---

## 7. Checklist de arranque (Director)

- [ ] Backlog actualizado con los ítems de la primera ola (F1.1–F1.5 y opcionalmente F3.1–F3.2).
- [ ] PO ha escrito criterios de aceptación para al menos F1.1 y F1.2 (o F3.1 si se inicia Fase 3).
- [ ] Se ha asignado a Dev el primer ítem (p. ej. F1.1 si es definición, o F1.2 si es implementación).
- [ ] QA conoce dónde están los criterios para verificar (requirements.md o docs/).

---

*Plan de ejecución v1.0. Fuente: PLAN_ZONE_ZERO.md, ZONE_ZERO_GDD.md, flujo AGENTS.md.*
