# Especificación: clon-perfecto-openfront-sc

Versión: 1.1 (decisiones del usuario fijadas el 2026-10-14: **1B + 2A + 3A**).
Estado: `APROBADO PARA IMPLEMENTACIÓN POR OLEADAS` — ver roadmap al final. Un ciclo = una oleada.

## Veredicto
`APROBADO PARA IMPLEMENTACIÓN` (por oleadas con puertas CA; la oleada 0 no requiere decisión adicional).

## Resumen
El prototipo actual es una arena abstracta con conquista instantánea por click y no reproduce ningún pilar real de OpenFront.io. Esta spec define el clon perfecto: geografía con agua y terreno, frente de conquista continuo, economía doble (tropas + oro), ciudades y edificios, guerra naval, nukes con SAM, alianzas y traidores, modos y victoria por % de tierra viva — más la capa StarCraft (Terran/Zerg/Protoss, caza inmune a tierra por facción, AA barata de corto alcance y solo-aire). Todo con fórmulas y umbrales copiados del juego real.

## Especificación

# Especificación: clon-perfecto-openfront-sc

## Objetivo de usuario
Jugar en el navegador una réplica fiel de OpenFront.io (expandir territorio en un mapa con agua y terreno, gestionar tropas y oro, construir, combatir por tierra/mar/aire, usar y parar nukes, aliarse o traicionar, ganar por % de tierra) con la capa StarCraft: elegir Terran, Zerg o Protoss con bonus asimétricos, usar un caza propio inmune al combate terrestre y defenderse con AA barata de corto alcance.

## Alcance
- Incluye:
  - Mapa de geografía real simplificada (costas, mares interiores, penínsulas, cuellos) con agua intransitable para tierra; 2 mapas (arena de entrenamiento + mapa estilo real).
  - Terreno por celda: llanura / tierras altas / montaña (+ infranqueable en el mapa real): llanura rápida y barata, montaña lenta y cara; vista de terreno separada.
  - Fase de spawn (elegir/cambiar punto hasta el inicio) + inmunidad spawn 50 ticks (5 s) contra todo daño de jugadores.
  - Economía doble: tropas (cap por territorio+ciudades, crecimiento logístico con pico ~42% del cap, reparto tropas vs trabajadores) + oro (trabajadores, ciudades, barcos mercantes; todo edificio cuesta oro).
  - Combate terrestre continuo: click en frontera lanza un frente que avanza celda a celda cada N ticks; slider de % de ataque (10–100%); re-click añade tropas; tecla X retira (tarda 20 ticks, penalización 25% vs jugadores); anexión por cerco o partición; recompensa de oro por eliminar.
  - Edificios: Ciudad (+cap/+oro), Puerto (barcos), Puesto de Defensa (rango 40, x6 pérdidas al atacante, −66% velocidad), SAM (intercepta nukes), Silo (lanza nukes), cada uno mejorable y destructible.
  - Guerra naval: hasta 3 transportes con tropas a bordo (vulnerables a buques; si se hunden se pierden las tropas), cabezas de playa, buques de guerra que patrullan y bombardean costa, retirada naval sin pérdidas.
  - Nukes y fallout: bomba atómica / hidrógeno / MIRV desde silos; el SAM las intercepta; el fallout quita tierra del cómputo de victoria y destruye edificios y barcos.
  - Alianzas y traición: no se puede conquistar a un aliado; atacar a un aliado con nuke (+100 celdas) o invadirlo marca Traidor 30 s (los atacantes pierden 50% menos contra el traidor); donaciones de tropas/oro; modos FFA, dúos/tríos y todos-contra-bots.
  - Bots y naciones con dificultades (Fácil x0.5, Media x0.75, Difícil x1.0, Imposible x1.25, Bot ÷3 de cap) y modo práctica un jugador.
  - Capa StarCraft: 3 facciones con los bonus actuales como punto de partida; 1 caza por facción (Wraith/Mutalisco/Scout) con regla dura de inmunidad terrestre; 1 AA por facción (Turret/Spore/Cannon) barata (<=60% del caza más barato), rango corto (<=6 celdas) y solo-aire; nombres y colores SC.
  - UI OpenFront: slider de ataque abajo-izquierda (teclas T/Y, Shift+rueda), menú de construcción unificado, menú radial con click derecho, panel de eventos/ataques con X de retirada, leaderboard en vivo (% tierra, tropas, oro), icono de escudo (densidad defensiva), vista de terreno, pantalla de fin con stats y reinicio.
  - Victoria por ~80% de tierra viva (agua y fallout excluidos), prórroga que baja el listón desde el minuto 30, último vivo también gana; alternativa modo Doomsday por oleadas de % mínimo.
- No incluye:
  - Multijugador online real con servidor (ver Decisión 1: fuera salvo que el usuario lo exija; la arquitectura se deja preparada con sim determinista).
  - Cuentas, ranking persistente, chat, clanes, torneos, anti-cheat de servidor.
  - Trenes/fábricas (modo experimental del original): `Propuesta`, no criterio.
  - Campaña, tutorial interactivo, localizaciones extra, skins de pago.
  - Aire que capture por sobrevolar; AA que dañe tierra; AA de largo alcance o cara; 4.ª facción.

## Reglas / Comportamiento
- R-SPAWN — La partida empieza en fase de spawn (mínimo 100 ticks): cada jugador elige punto costero o interior y puede cambiarlo hasta el cierre. Al cerrar, 50 ticks de inmunidad: ningún daño entre jugadores (sí expansión a neutral y sí construcción).
- R-MAPA — Toda celda es agua o tierra (llanura/altas/montaña/infranqueable). El agua no cuenta para la victoria, no se conquista por tierra y solo la cruzan transportes, buques, cazas y nukes. El terreno infranqueable tampoco se pisa (solo nukes lo afectan).
- R-ECON-TROPAS — `maxPop = capBase(facción) + territorio^0.6 * 1000 + nivelesCiudad * 25000` (×mult de dificultad). Crecimiento por tick: `(10 + pop^0.73 / 4) * (1 - pop/max)`. La población se reparte en tropas (luchan y ocupan) y trabajadores (crecen ~30% más rápido y dan oro pero no defienden). Las tropas comprometidas en ataques/barcos no defienden ni crecen.
- R-ECON-ORO — El oro se genera por trabajadores y ciudades (y mercantes si hay puerto). Todo edificio y barco cuesta oro; las tropas solo cuestan población. Eliminar a un jugador entrega su oro como recompensa.
- R-ATAQUE — Click izquierdo en frontera lanza un frente con `pop * ratio` (ratio del slider). El frente avanza 1 celda cada S ticks (S depende de terreno, densidad de escudo del defensor, puestos de defensa y ratio). El defensor pierde `escudo/10` por celda; el atacante pierde en proporción (llanura −10%, altas +10%, montaña +30%, puesto x6, traidor −50%). Re-click suma tropas al mismo frente. Sin tropas o sin frente válido, el ataque muere y no hay conquista fantasma.
- R-RETIRADA — X o panel retira: el frente deja de avanzar al instante pero las tropas vuelven tras 20 ticks con penalización del 25% si el objetivo era jugador (0% vs neutral, 0% en barcos).
- R-ANEXIÓN — Rodear totalmente un bolsón o partir un territorio en dos deja el bolsón sin costa en manos del atacante al instante y sin pérdidas del defensor.
- R-EDIFICIOS — Solo en territorio propio (puerto solo en costa). 1 edificio por celda. Puesto: rango 40 euclídeo, no acumula (1 por celda computa). SAM: intercepta nukes en su radio con probabilidad por nivel. Silo: 1 nuke lista por nivel, apuntado libre. Todo edificio se destruye conquistando su celda o con nuke/bombardeo.
- R-NAVAL — Puerto construye transportes (máx 3, con tropas a bordo que no cuentan para el cap). El transporte navega solo al punto marcado, desembarca y conquista; si un buque lo hunde, se pierden las tropas. Buques: patrulla costera asignada + bombardeo de celdas en alcance. Nuke hunde barcos en su área.
- R-NUKE — Solo desde silo con carga y oro. Tipos: atómica (área media), hidrógeno (área grande), MIRV (varias cabezas). El SAM enemigo en radio puede interceptarla. El impacto crea fallout: esa tierra sale del cómputo de victoria y quema edificios/barcos/unidades.
- R-ALIANZA — Aliados no se conquistan entre sí (el ataque se bloquea). Nuke a aliado con >=100 celdas destruidas o invasión terrestre = Traidor 30 s. Donar tropas/oro permitido. En equipos, compañero AFK sí puede ser conquistado.
- R-SC-FACCIÓN — Cada jugador elige 1 facción toda la partida: Terran (+defensa terrestre, AA +daño, aire +coste), Zerg (+generación, expansión barata, frágil, aire y AA baratos), Protoss (+ataque, escudo que absorbe el primer golpe defensivo, −generación). Los números exactos viven en `config.js`; ningún bonus se hardcodea en la lógica.
- R-SC-AIRE — Cada facción tiene 1 caza con stats propios y comportamiento común: vuela recto al objetivo (sobre agua y tierra), orbita/bombardea un tiempo fijo y vuelve; bombardea tropas y puede conquistar la celda central si supera su defensa. REGLA DURA: el caza solo pierde HP por AA enemiga en rango y por cazas enemigos en rango aire-aire; el combate terrestre, puestos, buques y nukes NO le hacen daño. Máx 5 por jugador.
- R-SC-AA — Cada facción tiene 1 AA con rol idéntico: coste <= 60% del caza más barato, rango <= 6 (corto: no cubre una base con una sola pieza), dps solo-aire > 0 y dps terrestre = 0, vida baja (cae ante asalto terrestre o bombardeo). Solo en territorio propio, 1 por celda, máx 30. Exige red de piezas, no super-arma.
- R-BOTS — Dificultad elegible; usan las mismas reglas (frentes, barcos, AA, cazas, nukes en Difícil+). En práctica, 3 bots de facciones distintas a la del humano.
- R-FIN — Gana quien controle >=80% de tierra viva (o el listón de prórroga vigente desde el minuto 30) o quede último vivo. Pantalla de fin con % tierra, tropas, oro, ciudades, edificios, cazas, nukes y botón de reinicio sin recarga manual.
- R-INPUT — Izquierdo: atacar / embarcar si hay agua en medio / confirmar construcción según modo. Derecho (en propio): menú radial (construir / ratio / retirar). T/Y o Shift+rueda: ratio. G: ataque terrestre al objetivo, B: ataque naval, X: retirar, Espacio: vista de terreno. Hover muestra coste en oro/tropas y tiempo estimado.

## Parámetros iniciales
| Parámetro | Valor | Justificación |
|---|---:|---|
| Escala de población | `maxPop = base + tiles^0.6*1000 + niveles*25000` | Fórmula del original; partidas de cientos de miles |
| Crecimiento | `(10 + pop^0.73/4)*(1-pop/max)`, pico ~42% del cap | Idem; castiga farmear a cap lleno |
| Terreno (mag/velocidad) | Llanura 80/16.5, altas 100/20, montaña 120/25 | Referencia comunitaria del original |
| Puesto defensa | Rango 40, x6 pérdidas, −66% velocidad, no acumula | Idem |
| Inmunidad spawn | 50 ticks (5 s) + fase previa 100 ticks | Idem |
| Retirada | 20 ticks de demora, −25% vs jugador | Idem |
| Transportes | Máx 3, tropas a bordo fuera del cap | Idem |
| Traidor | 30 s, −50% pérdidas de sus atacantes | Idem |
| Victoria | 80% tierra viva; prórroga desde min 30 | Idem |
| Dificultades | Fácil x0.5, Media x0.75, Difícil x1.0, Imposible x1.25, Bot ÷3 cap | Idem |
| Caza (base) | Wraith 150/100HP/9vel/40dmg, Mutalisco 110/70/12/28, Scout 210/160+40esc/7/60, dps 15/12/20 | Jerarquía barato-rápido-frágil vs caro-fuerte, heredada del prototipo |
| AA (base) | Turret 60/50HP/r5/25dps, Spore 40/40/r5/20, Cannon 55/55/r5/27 | Barata (<=60% del caza más barato) y corta (r<=6), heredado y verificado en tests |
| Caps aire/AA/frentes | 5 / 30 / 3 por jugador | Anti-spam y perf, heredado |

## Interacciones
- Entrada del usuario: elige facción y mapa → fase spawn (click para punto) → juego (clicks, slider, teclas T/Y/G/B/X/Espacio, menús, panel de eventos) → fin/reinicio.
- Respuesta del sistema: pinta tierra por color de facción con bordes iluminados, agua oscura, terreno sombreado, ciudades/iconos de edificios, frentes con línea y cifra de tropas, barcos y estelas, cazas con barra HP, anillos AA en hover, nukes con alerta y hongo, fallout persistente, HUD (tropas/cap, escudo, oro, ratio), leaderboard (% tierra viva, tropas, estado), eventos (ataques, nukes, traidores, eliminaciones) y mensajes de error de 2–3 s ante acción inválida.
- Efecto en otros módulos: `config.js` concentra TODO número (facciones, aire, AA, terreno, economía, edificios, nukes, dificultades) en `window.SC_CONFIG`; `game.js` solo lógica+render+IA sin red; `tests/` validan balance y reglas duras SC sin DOM.

## Criterios de aceptación
- [ ] CA-P1 — Dado el mapa real, cuando cuento celdas, entonces >=15% es agua conectada (mares/costas) y hay penínsulas y al menos 2 cuellos de <=6 celdas; el agua no puntúa victoria.
- [ ] CA-P2 — Dado inicio, cuando estoy en fase spawn, entonces puedo cambiar mi punto hasta el cierre y tras él tengo 50 ticks sin recibir daño de jugadores (sí puedo tomar neutral).
- [ ] CA-P3 — Dada economía, cuando estoy al 40–45% del cap, entonces mi crecimiento/tick es mayor que al 95% (al menos x3); a cap lleno el crecimiento es 0.
- [ ] CA-P4 — Dado slider al 30%, cuando ataco una frontera de llanura neutral, entonces se descuenta el 30% al lanzar, el frente avanza ~1 celda cada 2 ticks de terreno base y ambos bandos pierden tropas.
- [ ] CA-P5 — Dado un frente activo, cuando pulso X, entonces deja de avanzar al instante y las tropas vuelven tras 20 ticks con −25% si el objetivo era jugador.
- [ ] CA-P6 — Dado cerco total de un bolsón, cuando se cierra, entonces el bolsón cambia de dueño al instante sin pérdidas del defensor.
- [ ] CA-P7 — Dada ciudad neutral (def 25), cuando la conquisto, entonces mi cap sube +25000 por nivel y mi oro/tick sube; el icono cambia a mi color.
- [ ] CA-P8 — Dado puerto propio en costa con oro, cuando lanzo transporte a costa enemiga lejana, entonces cruza el agua, desembarca y conquista; si un buque lo intercepta, pierdo las tropas embarcadas.
- [ ] CA-P9 — Dado puesto de defensa enemigo en rango 40 de la celda, cuando ataco esa celda, entonces mis pérdidas son ~x6 y el avance ~3x más lento que sin puesto.
- [ ] CA-P10 — Dado silo con carga y SAM enemigo en radio, cuando lanzo nuke, entonces el SAM puede interceptarla; si impacta, crea fallout que sale del cómputo de victoria y destruye edificios/barcos.
- [ ] CA-P11 — Dado aliado, cuando intento conquistarlo, entonces el ataque se bloquea; si le lanzo nuke con >=100 celdas destruidas, entonces quedo Traidor 30 s y sus atacantes pierden 50% menos contra mí.
- [ ] CA-P12 — Dado caza propio sobre enemigo sin AA ni cazas cerca durante 10 s, entonces su HP no baja (inmunidad terrestre) mientras bombardea y puede conquistar la celda central.
- [ ] CA-P13 — Dada AA propia y caza enemigo orbitando en rango <=6 durante 5 s, entonces el caza pierde HP por el dps de la AA y las tropas terrestres enemigas no pierden nada por la AA.
- [ ] CA-P14 — Dadas las 3 AA, cuando leo `config.js`, entonces coste <= 60% del caza más barato, rango <= 6, dps terrestre = 0 y HP <= 60.
- [ ] CA-P15 — Dados 2 cazas enemigos en rango aire-aire 5 s sin AA, entonces ambos pierden HP.
- [ ] CA-P16 — Dada partida FFA, cuando alguien llega al 80% de tierra viva (o queda último), entonces hay pantalla de fin con stats completos y reinicio sin recarga; desde el minuto 30 el listón puede bajar por prórroga.
- [ ] CA-P17 — Dado doble-click en `index.html` (file://), cuando juego 5 min, entonces no hay pantalla en blanco, ni CORS, ni dependencias de red; y `node tests/balance.test.js` pasa.
- [ ] CA-P18 — Dado Terran vs Zerg a igual territorio 30 s, entonces Zerg genera más (ratio 1.5–1.8) y Terran defiende mejor (a igualdad de ataque, Terran conserva más tropas); Protoss ataca más fuerte que ambos a igual compromiso.

## Riesgos
- Riesgo: alcance “perfecto” inabarcable en un ciclo (multijugador, mapas reales, naval, nukes, alianzas a la vez).
- Señal a observar: la spec se implementa a medias y el gameplay sigue sin parecerse.
- Mitigación / ajuste previsto: implementar por oleadas (1=tierra+economía+ciudades, 2=edificios+naval, 3=nukes+alianzas) con criterios CA-P1–P18 como puerta de cada oleada.
- Riesgo: reescalar la economía a cientos de miles rompe el balance SC actual (costes de caza/AA).
- Señal a observar: `tests/balance.test.js` falla o el caza cuesta <1% del cap (spam) o >50% (inútil).
- Mitigación / ajuste previsto: reexpresar costes SC como % del cap base y re-correr tests; solo tocar `config.js`.
- Riesgo: perf con mapa grande + frentes + barcos + partículas.
- Señal a observar: <30 fps en portátil medio o ticks que se alargan >120 ms.
- Mitigación / ajuste previsto: dirty-rect, tope de entidades, LOD de estelas; medir antes de optimizar.
- Riesgo: bots que no usan barcos/nukes/AA y partida vacía.
- Señal a observar: a los 5 min ningún bot tiene puerto/silo o 0 cazas con oro de sobra.
- Mitigación / ajuste previsto: submetas por rol (expansor, naval, nuker) y umbrales de construcción reactiva.

## Entregables técnicos esperados
- Módulos: `index.html` (topbar+HUD+menús+panel+leaderboard), `styles.css`, `config.js` (TODO número), `game.js` (sim determinista por ticks + render + IA, sin red), `maps/` (2 mapas en formato propio), `tests/balance.test.js` + `tests/rules.test.js` (node nativo).
- Datos/configuración: fórmulas y tablas de este spec en `SC_CONFIG` (terreno, economía, edificios, naval, nukes, alianzas, dificultades, SC).
- Tests: balance (costes/ratios) + reglas (inmunidad, retirada, anexión, traidor, inmunidad aérea, AA solo-aire) sin DOM.
- Documentación: este fichero + README de controles + decisión final de las 3 preguntas.

## Registro de decisiones
- Decisión: fórmulas económicas y de combate copiadas del original (no inventadas). Motivo: es lo que hace que “se parezca”. Alternativa descartada: mantener números del prototipo (eso es justo lo que no se parece).
- Decisión: escala real de población (cientos de miles) como objetivo. Motivo: con cientos de tropas no hay slider, frentes ni escudo creíbles. Alternativa descartada: reescalar todo a pequeño (rompe la fidelidad).
- Decisión del usuario 2026-10-14: **1B multijugador online real**. Motivo del usuario: clon perfecto. Implicación: servidor autoritativo + salas + sincronización; el alcance se parte en oleadas y la oleada 0 deja la sim determinista y el protocolo listos. Alternativa descartada: solo-bots (1A).
- Decisión del usuario 2026-10-14: **2A mapa estilo-real + arena**. Motivo: parecerse al original. Implicación: formato propio de mapas en `maps/` + 1 mapa estilo-real dibujado (oleada 2); la arena actual queda como tutorial. Alternativa descartada: solo procedural (2B).
- Decisión del usuario 2026-10-14: **3A completo por oleadas**. Motivo: clon perfecto. Implicación: roadmap 0→3 con puertas CA; ninguna oleada avanza sin pasar la suya. Alternativa descartada: solo núcleo (3B).
- Decisión: coste SC expresado también como % del cap base. Motivo: que caza y AA sigan teniendo sentido al cambiar de escala. Alternativa descartada: costes absolutos fijos.
- [SUPUESTO] Stack online: Node.js ≥18 sin dependencias (servidor WebSocket a mano sobre `net`/`http`), protocolo JSON v0, salas por código de 4, tick de red 10 Hz, sim local a 10 ticks/s ya existente. Motivo: cero dependencias = `node server/server.js` y a jugar en LAN; sin npm ni build. Si el usuario exige otro stack, se revisa.
- [SUPUESTO] Modelo de red v0: servidor **retransmisor autoritativo de sala** (valida unión, ordena inputs por tick, difunde snapshots; la sim autoritativa completa en servidor llega en oleada 1 con la sim determinista). Motivo: jugar online cuanto antes sin reescribir el juego dos veces. Alternativa descartada: lockstep P2P (NAT/traición) y servidor-autoritativo-total ya (bloquearía oleadas de gameplay).
- [SUPUESTO] Sin cuentas ni persistencia en oleada 0: nick libre + código de sala. Cuentas/ranking/matchmaking van en oleada 3. Motivo: puerta de entrada mínima al online.

## Roadmap por oleadas (puertas CA)
- Oleada 0 (este ciclo): sim determinista (RNG con semilla, cero `Math.random` en sim, formato de mapa versionado) + `server/` (sala por código, join/leave, relay de inputs por tick, snapshots) + `tests/net.test.js` + `tests/determinism.test.js`. Puerta: tests verdes + 2 clientes en LAN ven la misma sala. El local sigue jugable offline.
- Oleada 1: economía completa (oro, trabajadores, spawn con punto, anexión, escudo real) + determinismo total + sim autoritativa en servidor. Puerta: CA-P1–P7.
- Oleada 2: mapa estilo-real en `maps/` + edificios + naval. Puerta: CA-P8–P9 + CA-P1.
- Oleada 3: nukes + alianzas/traidor + modos + matchmaking/cuentas. Puerta: CA-P10–P11, P16–P18.

## Próximo agente
- Oleada 0: `developer-muse` o `developer-mimo` (skill `implement-feature`).
- Tras implementar: `qa` (skill `qa-validation`) contra la puerta de la oleada 0.

---

# ✅ DECISIONES CERRADAS 2026-10-14 — 1B / 2A / 3A (ver Registro de decisiones y Roadmap)

---
# ADDENDUM 2026-10-15 — decisiones del diseñador-reconciliación + 3 cambios mayores del usuario
Estado: `APROBADO PARA IMPLEMENTACIÓN` (lote Oleada 1a ampliado, abajo).

## Decisiones cerradas (reconciliación §1-19)
- D1: capa StarCraft **intacta** (Terran/Zerg/Protoss + caza inmune + AA barata/rango≤6/solo-aire).
- D2: opción **A** (tropas+anexión+panel-región primero, oro justo después dentro de Oleada 1).
- D3: opción **A** (rejilla actual = grafo hasta el mapa estilo-real de Oleada 2).

## R-EXP — expansión exponencial, no lineal (cambio grave exigido por el usuario)
La expansión actual es lineal (coste fijo por celda, frentes de tamaño fijo). Nueva regla: el poder expansivo crece de forma **superlineal** con el imperio: el ataque comprometido rinde más por tropa cuanto mayor es el territorio (economía de escala militar), y el techo de frentes simultáneos crece con el territorio. Implementación a criterio del developer con números en `config.js` (p.ej. potencia = k·comprometidas^1.15 y/o cooldown × f(territorio)), pero con propiedad verificable: **duplicar tropas comprometidas más que duplica las celdas conquistadas en ventana fija** (test de superlinealidad en `tests/pacing.test.js` o `rules.test.js`). Puerta: CA-EXP.

## R-RES — alta resolución y velocidad (cambio exigido: no más píxeles gigantes)
Mapa 80×50 celda 12px → **120×75 celda 8px** (9000 celdas, mismo canvas 960×600). Más velocidad de frentes (revisar `ticksPerTile` y cadencia de bots al alza). Riesgo perf asumido: render por capa estática offscreen + overlay solo dinámico; objetivo 60fps en escritorio (verificación visual por el usuario, headless NO EJECUTABLE). Los umbrales absolutos de pacing se reescalan proporcionalmente al mapa (p.ej. T1abs 120→270) y se documentan; los relativos (%/tasas) no cambian. Puerta: CA-RES.

## R-BUNKER — búnkers con niveles estilo SAM que repelen tierra en autónomo (nuevo edificio)
Búnker por facción (nombres SC: Terran Bunker / Zerg Sunken Colony / Protoss Shield Battery [cañón]): **3 niveles** (1 base + 2 mejoras pagadas en tropas —el oro llega después—). Solo ataca TIERRA enemiga en su rango (corto-medio, rango 4/5/6 por nivel): daño automático por tick a las tropas comprometidas de frentes enemigos con cursor en rango + ralentiza su avance (repelencia) + suma defensa a su celda. NO ataca aire (rol inverso a la AA). 1 por celda, solo en territorio propio, HP por nivel, destructible por asalto/bombardeo. Los bots construyen y mejoran. Números en `config.js` (`BUNKERS:{coste base, mejora L2/L3, dps, rango, hp, slow}`). Puerta: CA-BUNKER (L3 > L1 medido; un frente enemigo en rango pierde tropas sin órdenes del dueño del búnker).

## Criterios nuevos del lote
- [ ] CA-EXP — Dada ventana fija de 300 ticks con doble de tropas comprometidas, entonces celdas conquistadas >2× (superlineal), en 2 semillas.
- [ ] CA-RES — Mapa 120×75 celda 8px, canvas 960×600; suite verde; sin regresión de determinismo; fps solo validable por usuario.
- [ ] CA-BUNKER — Búnker L1–L3 comprable/mejorable con tropas; frente enemigo en rango pierde tropas comprometidas sin intervención; L3 dps > L1; bots con ≥1 búnker a los 3 min si reciben presión.
- [ ] CA-P2/P5/P6/P11-lote: spawn elegible + inmunidad 50 ticks solo-jugadores; re-click suma al frente; anexión cerco/partición; panel de región + lista de frentes con ID/retirada; dificultades base en `config.js`; `tests/rules.test.js`; `prompt-maestro.md` (borrador).
