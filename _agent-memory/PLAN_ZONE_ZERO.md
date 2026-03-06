# Plan de desarrollo — Zone Zero: Last Bastion

Plan por fases para acercar el proyecto actual (clon Infection Free Zone en Godot 4) al diseño descrito en **ZONE_ZERO_GDD.md**. Cada fase tiene alcance acotado, criterios de cierre y dependencias claras.

---

## Estado actual del proyecto (línea base)

- **Mapa:** Ciudad 128×128 tiles (hierba/carretera), ruinas, sin datos reales OSM.
- **Base:** HQ, Almacén, Torre, Muro; construcción en ruinas y en suelo con fantasma.
- **Recursos:** 12 tipos (madera, metal, ladrillos, raciones, etc.); consumo por supervivientes y costes de edificios/tropas.
- **Supervivientes:** Lista con nombre, salud, trabajo (Sin asignar / Recolectar / Defender); panel derecho con selector de trabajo.
- **Infectados:** Un solo tipo; vida (20 HP); oleada nocturna (2 + día − defensores); avanzan al HQ; tropas les disparan; muros los bloquean y reciben daño.
- **Defensa:** Tropas colocables (coste munición + raciones), muros con vida, día/noche con transición suave.
- **Sistema:** Guardar/cargar partida, menú, HUD, feedback visual, sonido opcional.

---

## Principios del plan

1. **Incremental:** Cada fase entrega algo jugable y verificable.
2. **Prioridad:** Primero profundizar lo que ya existe (más tipos de infectados, más roles, perímetro), luego sistemas nuevos (exploración, diplomacia, narrativa).
3. **Alcance realista:** El GDD es la visión; el plan recorta por fases (p. ej. “varios tipos de infectados” antes que “evolución mutacional completa”).
4. **Fuente de verdad:** El backlog priorizado sigue en `_agent-memory/backlog.md`; este plan sirve para generar y ordenar ítems de backlog.

---

## Fase 1 — Recursos y economía alineados al GDD

**Objetivo:** Unificar recursos y economía con el GDD (sección 4.3) sin romper el bucle actual.

| Entregable | Descripción |
|------------|-------------|
| 6 recursos principales | Reducir/mapear a: **Comida**, **Agua**, **Materiales**, **Combustible**, **Medicamentos**, **Munición**. Migrar edificios y tropas a estos costes. |
| Escasez por zona | Marcar celdas/edificios como “saqueados”; no regeneran recursos hasta pasado un tiempo (días). |
| Producción básica | Al menos un edificio que produzca un recurso (p. ej. huerto → Comida) con coste de materiales/agua. |

**Criterios de cierre:** HUD y construcción usan los 6 recursos; hay al menos una fuente de producción y una mecánica de “zona agotada”.

**Dependencias:** Ninguna (parte del estado actual).

---

## Fase 2 — Supervivientes como individuos (nivel 1)

**Objetivo:** Acercar el modelo de supervivientes al GDD 5.1–5.2 (personas con rasgos y roles).

| Entregable | Descripción |
|------------|-------------|
| Datos por persona | Nombre, profesión pre-crisis (médico, soldado, ingeniero, etc.) con impacto en stats base (bonus a curación, daño, construcción). |
| Rasgos | 2–3 rasgos por superviviente (valiente, cobarde, ingenioso…) que afecten rendimiento en trabajo o en combate (por ejemplo ±10 %). |
| Roles con nivel | Los trabajos actuales (Recolectar, Defender) pasan a ser “roles”; cada rol tiene nivel 1–3 y mejora con el uso (más producción, más daño). |
| Muerte permanente | Si un superviviente muere (evento futuro: combate/oleada), desaparece; otros pueden entrar en “duelo” (penalización temporal). |

**Criterios de cierre:** Panel de supervivientes muestra profesión, rasgos y nivel de rol; muerte de un superviviente tiene consecuencia (duelo o similar).

**Dependencias:** Fase 1 (recursos estables).

---

## Fase 3 — Variedad de infectados y comportamiento día/noche

**Objetivo:** Varios tipos de infectados y comportamiento diferenciado día/noche (GDD 6.1 y 6.4).

| Entregable | Descripción |
|------------|-------------|
| Tipos base | Al menos 3: **Vagabundo** (lento, vida media), **Corredor** (rápido, poca vida), **Aglutinador** (lento, mucha vida). Diferentes stats y visual en mapa. |
| Spawn por tipo | La oleada nocturna incluye mezcla de tipos según el día (más corredores al principio, más aglutinadores después). |
| Día vs noche | De día: infectados más lentos o menos numerosos; de noche: más rápidos y/o más cantidad. Ajustar fórmulas de oleada y velocidad. |
| Gritador (opcional) | Un tipo que, al recibir daño o al verse, “llama” a otros en un radio; aumenta presión en un punto. |

**Criterios de cierre:** Se ven al menos 3 tipos en oleadas; el comportamiento de oleada cambia entre día y noche.

**Dependencias:** Ninguna crítica (mejora sobre infectados actuales).

---

## Fase 4 — Perímetro y estructuras defensivas

**Objetivo:** Perímetro jugable y más opciones defensivas (GDD 4.1–4.2).

| Entregable | Descripción |
|------------|-------------|
| Perímetro dibujable | Herramienta para marcar una zona “segura” (polígono o celdas); solo dentro se puede construir; coste de “mantenimiento” por longitud (materiales/día). |
| Tipos de barricada | Al menos 2–3: barricada débil (bajo coste), muro reforzado (actual), opcional valla electrificada (daño a infectados que la tocan). |
| Torres defensivas mejoradas | Diferenciar torre de vigilancia (visión) de nido de ametralladora (más daño, más coste). Tropas actuales cuentan como “defensa activa”. |

**Criterios de cierre:** El jugador puede definir un perímetro; hay al menos 2 tipos de muro/barricada con coste y resistencia distintos; las oleadas respetan o atacan el perímetro.

**Dependencias:** Fase 1 (recursos); Fase 3 recomendable (más tensión en defensa).

---

## Fase 5 — Moral de la colonia (simplificada)

**Objetivo:** Introducir moral colectiva con consecuencias jugables (GDD 5.3).

| Entregable | Descripción |
|------------|-------------|
| Valor de moral | Número 0–100 visible en HUD o panel; se actualiza según eventos (muertes, victorias, derrotas, hambre, comida abundante). |
| Efectos | 2–3 bandas: alta moral → bonus a producción o a defensores; moral baja → penalización a producción o riesgo de “conflicto” (evento que resta recursos o un superviviente temporalmente inactivo). |
| Factores | Muerte de superviviente (-moral), noche superada sin pérdidas (+moral), raciones por debajo de necesidad (-moral). |

**Criterios de cierre:** La moral existe, se muestra y cambia con al menos 2 eventos; hay al menos un efecto positivo y uno negativo según banda.

**Dependencias:** Fase 2 (supervivientes con identidad y muerte permanente).

---

## Fase 6 — Exploración y escuadrones (modo automático)

**Objetivo:** Escuadrones que realizan misiones fuera de la base (GDD 7.1–7.2).

| Entregable | Descripción |
|------------|-------------|
| Escuadrones | Formar grupos de 2–4 supervivientes asignados a “Explorar”; consumen tiempo (días) y recursos (raciones, munición opcional). |
| Misiones automáticas | Tipos: **Saqueo** (ir a edificio/ruina, traer recursos), **Reconocimiento** (explorar zona, revelar mapa y actividad de infectados). El jugador elige destino y tipo; el resultado se resuelve por simulación (éxito/fallo, bajas, botín). |
| Riesgo y recompensa | Según distancia, tipo de zona y número de infectados simulado: más riesgo → más botín posible pero posibilidad de heridos o muertos. |

**Criterios de cierre:** El jugador puede crear un escuadrón, enviarlo a saqueo o reconocimiento, y recibir resultado (recursos, heridos, muerte) sin control táctico en tiempo real.

**Dependencias:** Fase 1 (recursos), Fase 2 (supervivientes con roles y muerte), Fase 4 (perímetro para definir “dentro/fuera”).

---

## Fase 7 — Árbol de investigación (una rama)

**Objetivo:** Primera rama tecnológica jugable (GDD 8.1).

| Entregable | Descripción |
|------------|-------------|
| Rama única | Por ejemplo **Ingeniería**: 3–4 mejoras en cadena (barricadas mejoradas → torres mejoradas → armas automáticas básicas). |
| Recursos de investigación | “Puntos de investigación” generados por científicos (supervivientes con rol Científico) y/o por edificio (laboratorio). |
| Desbloqueos | Cada nodo del árbol desbloquea un edificio, una mejora de defensa o un tipo de recurso producible. |

**Criterios de cierre:** Existe un laboratorio o rol que genera investigación; el jugador puede desbloquear al menos 2 mejoras en secuencia.

**Dependencias:** Fase 1 (recursos), Fase 2 (roles: Científico).

---

## Fase 8 — Otras colonias y diplomacia básica

**Objetivo:** Otras facciones en el mapa con comercio y relaciones (GDD 9).

| Entregable | Descripción |
|------------|-------------|
| Colonias IA | 2–3 facciones fijas en el mapa (p. ej. La Fortaleza, Los Comunitarios) con inventario y comportamiento simple. |
| Comercio | Intercambio de recursos con una colonia (tasas fijas o por oferta/demanda simple). |
| Relación | Valor de relación -100 a 100; el comercio y las misiones conjuntas lo modifican; bajo umbral puede negar comercio o generar evento hostil. |
| Eventos simples | Un evento tipo “colonia aliada pide ayuda” → elegir ayudar (coste recursos) o no (baja relación). |

**Criterios de cierre:** Hay al menos 2 colonias con las que se puede comerciar; la relación existe y cambia con al menos una acción.

**Dependencias:** Fase 1, Fase 6 (exploración para “visitar” colonia).

---

## Fase 9 — Clima y eventos ambientales

**Objetivo:** Clima que afecta jugabilidad (GDD 10 y 6.4).

| Entregable | Descripción |
|------------|-------------|
| Estados de clima | Al menos 2: **Normal**, **Tormenta** (o lluvia fuerte). Duración en días; probabilidad por día o por semana. |
| Efectos | Tormenta: reduce visibilidad, puede aumentar actividad de infectados de noche o dificultar exploración (más riesgo en misiones). |
| UI | Indicador de clima en HUD; mensaje al cambiar de clima. |

**Criterios de cierre:** El clima cambia durante la partida y tiene al menos un efecto medible (oleada, exploración o producción).

**Dependencias:** Fase 3 (oleadas), Fase 6 (exploración) para que el clima tenga impacto en ambos.

---

## Fase 10 — IA de manada y oleadas inteligentes

**Objetivo:** Infectados que coordinan y atacan puntos débiles (GDD 6.3).

| Entregable | Descripción |
|------------|-------------|
| Puntos débiles | La IA conoce el perímetro y la resistencia por tramo (muros dañados, tramos sin torres); prioriza atacar tramos más débiles. |
| Flanqueo simple | Parte de la oleada intenta dirigirse a un flanco (otro punto del perímetro) en lugar de todo al centro. |
| Sincronización | Cuando varios infectados están cerca, un “líder” (o el Gritador) puede hacer que el grupo avance junto hacia el mismo tramo. |

**Criterios de cierre:** Las oleadas no atacan solo el centro; al menos un comportamiento de “elegir tramo más débil” o “dividir ataque”.

**Dependencias:** Fase 3 (tipos de infectados), Fase 4 (perímetro y tramos).

---

## Fase 11 — Campaña narrativa (una campaña piloto)

**Objetivo:** Una campaña con misión y narrativa mínima (GDD 2.3).

| Entregable | Descripción |
|------------|-------------|
| Estructura de campaña | Menú “Campaña” con una campaña desbloqueada (p. ej. “La Caída de Madrid” o nombre genérico); 3–5 misiones en secuencia. |
| Misiones | Cada misión tiene objetivo (sobrevivir X días, defender el HQ, rescatar un NPC) y texto intro/outro. |
| Progreso | Al completar una misión se desbloquea la siguiente; guardado de progreso de campaña. |

**Criterios de cierre:** El jugador puede jugar una campaña de principio a fin con al menos 3 misiones y texto narrativo mínimo.

**Dependencias:** Todas las fases anteriores en estado estable (recursos, supervivientes, infectados, defensa, exploración, moral, clima).

---

## Fase 12 — Roguelite y meta-progresión

**Objetivo:** Modo “infinito” y mejoras entre partidas (GDD 11).

| Entregable | Descripción |
|------------|-------------|
| Modo sandbox infinito | Sin condición de victoria; oleadas y clima se endurecen con el tiempo (más infectados, más tipos, eventos más duros). |
| Puntos de meta | Al sobrevivir días/semanas o completar hitos se ganan “puntos de meta” que persisten entre partidas. |
| Desbloqueos meta | Planos de edificios especiales, rasgos iniciales para nuevos supervivientes o bonificación de recursos de inicio; tienda o árbol de meta. |

**Criterios de cierre:** Existe un modo sin victoria fija; hay al menos 2 desbloqueos que se compran o desbloquean con meta-puntos.

**Dependencias:** Fase 11 recomendable (para diferenciar “campaña” de “sandbox roguelite”).

---

## Fase 13 — Pulido: mapa real, audio y UX (GDD 3, 12, 13)

**Objetivo:** Acercar presentación y UX al GDD; mapa “real” opcional.

| Entregable | Descripción |
|------------|-------------|
| Mapa enriquecido | Opción A: mejorar generación procedural (más tipos de edificios, calles más creíbles). Opción B: integración OSM mínima (cargar un .osm pequeño, pintar edificios/calles). |
| Audio dinámico | Música o capas de ambiente que cambien con amenaza (noche, oleada); sonidos posicionales para infectados y disparos. |
| HUD y alertas | HUD mínimalista; alertas solo cuando requieren acción (invasión, moral crítica, colonia pide ayuda). |
| Mapa táctico | Vista de mapa que muestre perímetro, torres, zonas de riesgo o rutas de patrulla. |

**Criterios de cierre:** Al menos 2 de: mapa más rico, audio adaptativo, alertas inteligentes, mapa táctico usable.

**Dependencias:** Resto de fases en estado estable.

---

## Resumen de dependencias entre fases

```
Fase 1 (Recursos) ──────────────────────────────────────────────────────────┐
       │                                                                     │
       ├──► Fase 2 (Supervivientes) ──► Fase 5 (Moral)                      │
       │           │                                                         │
       ├──► Fase 4 (Perímetro) ◄──────────────┐                             │
       │           │                           │                             │
       ├──► Fase 6 (Exploración) ◄────────────┘                             │
       │           │                                                         │
       ├──► Fase 7 (Investigación)                                            │
       │                                                                     │
Fase 3 (Infectados) ──► Fase 9 (Clima) ──► Fase 10 (IA manada)               │
       │                       │                                              │
       └───────────────────────┴──► Fase 8 (Diplomacia)                       │
                                         │                                    │
                                         ▼                                    │
                              Fase 11 (Campaña) ──► Fase 12 (Roguelite)      │
                                         │                                    │
                                         ▼                                    │
                              Fase 13 (Pulido: mapa, audio, UX) ◄────────────┘
```

---

## Uso de este plan con el backlog

- **Director / PO:** Cada fase se puede descomponer en ítems concretos en `_agent-memory/backlog.md` (p. ej. “Fase 1: unificar recursos a 6 tipos”, “Fase 1: edificio huerto que produce comida”).
- **Developer:** Implementa en el orden indicado; al cerrar una fase, se revisan criterios de cierre y se pasa a la siguiente.
- **QA:** Verifica los criterios de cierre de cada fase antes de dar por cerrada.

**Documento de referencia:** `_agent-memory/ZONE_ZERO_GDD.md`  
**Versión del plan:** 1.0
