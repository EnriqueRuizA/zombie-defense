# Especificación: clon-openfront-sc-prototipo

## Objetivo de usuario
Jugar en navegador (sin backend) un clon simplificado de OPENFRONT.io con mapa territorial en tiempo real, eligiendo una de 3 facciones StarCraft (Terran / Zerg / Protoss), expandiéndose contra 3 bots, usando 1 unidad aérea por facción y 1 defensa antiaérea barata de corto alcance por facción.

## Alcance
- Incluye:
  - Mapa 2D canvas con rejilla de territorio, 4 jugadores (humano + 3 bots), capitales, niebla no.
  - Expansión/conquista terrestre estilo OpenFront (tropas como recurso único generado por territorio).
  - 3 facciones asimétricas con bonus/malus explícitos.
  - 1 unidad aérea por facción (Wraith / Mutalisco / Scout) con regla: solo puede ser dañada por otras unidades aéreas y por defensas AA; solo puede dañar tropas enemigas / conquistar bombardeando, no captura territorio al volar.
  - 1 defensa AA por facción (Turret / Spore Colony / Photon Cannon-versión-AA) barata y de corto alcance: solo ataca aire, vida baja, no ataca tierra.
  - UI mínima: selector de facción, HUD (tropas, territorio %, kills), botones Enviar caza / Construir AA / selector % ataque, click-to-attack, victoria/derrota, reinicio.
  - Bots simples que expanden, atacan, usan aire y construyen AA.
  - Balance expuesto en datos (config.js), sin hardcodeo en lógica.
- No incluye:
  - Multijugador online / servidor / matchmaking / cuentas.
  - Niebla de guerra, alianzas, chat, skins, móvil táctil avanzado, sonido, persistencia / ranking.
  - Árbol tecnológico completo SC, unidades terrestres distintas (marines/hidraliscos/zealots), edificios productores, gas/mineral.
  - Aire que capture territorio solo por sobrevolar; AA de largo alcance o cara; AA que ataque tierra.

## Reglas / Comportamiento
- R1 — Tick de simulación cada 100 ms; render a requestAnimationFrame. Cuando tick conquista → actualiza dueño de celda y tropas.
- R2 — Tropas: cada jugador tiene `troops` (0..10000, inicio 600). Generación por tick = `territorio * GEN_BASE * genMult(facción)`. `GEN_BASE = 0.02`.
- R3 — Expansión terrestre: el jugador elige % de envío (10/25/50%). Click en celda objetivo válida (neutral o enemiga) → se busca la celda propia más cercana al objetivo; coste = `10 + distManhattan * 2 * costMult`. Si `troops < coste`, se rechaza con mensaje. Si acepta, se descuenta y se resuelve asalto: poderAtaque = coste * atkMult; defensa = (neutral ? 12 : troopsEnemigoProporcional + bonusDef) ; si poder > defensa, la celda objetivo + hasta 2 vecinas del mismo dueño cambian de dueño; si no, el defensor pierde tropas equivalentes y el atacante pierde el coste.
- R4 — Capital: cada jugador tiene 1 capital (3x3 celdas indestructibles salvo que se pierda todo el territorio alrededor; si un enemigo conquista la celda capital, el jugador es eliminado y su territorio pasa a neutral-en-ruinas, sus tropas a 0).
- R5 — Facciones:
  - Terran: `atkMult 1.0, defMult 1.15, genMult 1.0, airCostMult 1.1, aaDmgMult 1.2, aaCostMult 1.0`. Bono turtle.
  - Zerg: `atkMult 0.85, defMult 0.85, genMult 1.25, airCostMult 0.75, aaCostMult 0.7, aaDmgMult 0.9`. Bono enjambre barato/rápido, frágil.
  - Protoss: `atkMult 1.3, defMult 1.0, genMult 0.78, airCostMult 1.4, aaCostMult 1.1, aaDmgMult 1.1, escudo: absorbe 25% del primer daño recibido en cada asalto terrestre defensivo`.
- R6 — Unidad aérea (una por facción, comportamiento común, stats por facción):
  - Terran Wraith: coste 150, HP 100, vel 9 celdas/s, daño bomba 40 (radio 2), dps aire-aire 15.
  - Zerg Mutalisco: coste 110, HP 70, vel 12 celdas/s, daño bomba 28, dps aire-aire 12.
  - Protoss Scout: coste 210, HP 160 + escudo 40, vel 7 celdas/s, daño bomba 60, dps aire-aire 20.
  - Regla aire: vuela en línea recta al punto objetivo, luego patrulla/orbita 12 s y regresa/desaparece. Al llegar, bombardea cada 1 s (daño a tropas del dueño de las celdas en radio + conquista la celda central si el daño acumulado supera defensa). Solo recibe daño de AA enemigas en rango y de cazas enemigos en rango 4. Inmune a combate terrestre. Máx 5 cazas simultáneos por jugador.
- R7 — Defensa AA barata corto alcance (una por facción, mismo rol):
  - Terran Missile Turret: coste 60, HP 50, rango 5, dps 25 solo-aire.
  - Zerg Spore Colony: coste 40, HP 40, rango 5, dps 20 solo-aire.
  - Protoss Photon Cannon [AA]: coste 55 (60 con bonus 1.1x), HP 55, rango 5, dps 27 solo-aire.
  - Reglas: solo se coloca en territorio propio, 1 por celda, máx 30 por jugador. No ataca tierra (dps tierra = 0). Solo puede ser destruida por asalto terrestre enemigo (usa su HP como defensa extra de la celda) o bombardeo aéreo. Rango 5 es corto frente a rango típico RTS (10-12): exige red de torres, no una sola que cubra la base.
- R8 — Bots: cada 800 ms deciden: si % territorio < 25 → expandir a neutral adyacente más débil; si vecino enemigo con defensa < propio poder → atacar; si enemigo tiene cazas activos y AA propias < 3 cerca → construir AA; cada 20-35 s enviar 1 caza a capital enemiga si troops > 400. Dificultad única media.
- R9 — Victoria/derrota: victoria cuando un jugador controla >= 60% de celdas jugables o es el único vivo. Derrota cuando territorio = 0 o capital perdida. Pantalla fin con stats y botón Reiniciar.
- R10 — Input: click izquierdo = atacar / confirmar colocación según modo activo; botones o teclas 1/2/3 cambian modo (1 Ataque, 2 Caza, 3 AA); slider % tropas; hover muestra coste estimado. Mensajes de error visibles 2 s ante acción inválida.

## Parámetros iniciales
| Parámetro | Valor | Justificación |
|---|---:|---|
| Mapa | 80 x 50 = 4000 celdas, celda 12 px, canvas 960x600 | Cabe en pantalla, 4000 celdas fluidas en canvas sin perf issue |
| Jugadores | 4 (humano + 3 bots) | Partida rápida 5-10 min como OpenFront |
| Tropas inicio / máx | 600 / 10000 | Permite ~20 ataques iniciales, evita snowball infinito |
| GEN_BASE | 0.02 tropas/celda/tick (100 ms) | 100 celdas → 20 tropas/s; partida escala con territorio como OpenFront |
| Coste ataque terrestre | 10 + dist*2*costMult (costMult: Zerg 0.8, Terran 1.0, Protoss 1.15) | Zerg expande barato, Protoss caro pero pega fuerte |
| Defensa neutral | 12 | 1-2 ataques iniciales conquistan neutrales, no gratis |
| Capital | 3x3, defensa x3 | Evita rush minuto 1 |
| Aire (coste/HP/vel/daño/dps) | Ver R6 | Jerarquía barato-rápido-frágil (Zerg) vs caro-lento-fuerte (Protoss) |
| AA (coste/HP/rango/dps) | Ver R7, rango 5 | Barata (<50% coste caza) + corto alcance (<mitad mapa) = red, no super-arma |
| Cap cazas / AA | 5 / 30 | Evita spam que rompa perf y balance |
| Tick sim | 100 ms | Tiempo real suave, bots computables |

## Interacciones
- Entrada del usuario: elige facción → Iniciar; click en mapa; botones modo + % ataque; teclas 1/2/3; Reiniciar.
- Respuesta del sistema: pinta territorio por color facción, capitales con icono, cazas como triángulos con estela, AA como círculos con anillo de rango al pasar hover, HUD numérico, mensajes, pantalla fin.
- Efecto en otros módulos: config.js alimenta a game.js (sim+render+IA); game.js no hace fetch ni backend; tests leen config.js para validar balance.

## Criterios de aceptación
- [ ] CA1 — Dado selector de facción, cuando elijo Terran/Zerg/Protoss y pulso Iniciar, entonces la partida arranca con mi color/capital/bonus y 3 bots con las otras facciones, sin errores en consola.
- [ ] CA2 — Dada partida iniciada, cuando espero 10 s sin actuar, entonces mis tropas y territorio aumentan solo por generación pasiva y los bots también expanden (territorio total no-neutral crece).
- [ ] CA3 — Dado que tengo >= coste, cuando hago click en celda neutral adyacente con modo Ataque, entonces descuento tropas, la celda cambia a mi color en <1 s y el HUD se actualiza.
- [ ] CA4 — Dada facción Zerg vs Protoss, cuando comparo generación con mismo territorio durante 20 s, entonces Zerg genera ~60% más (1.25/0.78) con tolerancia ±15%; y un ataque Protoss conquista una defensa que un ataque Zerg igual no conquista.
- [ ] CA5 — Dado modo Caza con tropas suficientes, cuando compro y envío 1 caza sobre enemigo, entonces el caza vuela recto ignorando territorio, bombardea (reduce tropas enemigas / conquista centro si supera defensa) y es inmune a ataque terrestre (su HP no baja si no hay AA ni cazas enemigos cerca).
- [ ] CA6 — Dada 1 AA propia colocada y 1 caza enemigo orbitando dentro de rango 5, cuando pasan 5 s, entonces el HP del caza baja por dps de la AA y la AA no daña unidades terrestres (tropas enemigas terrestres intactas salvo combate terrestre).
- [ ] CA7 — Dada AA de cualquier facción, cuando verifico coste y rango, entonces coste <= 65 (barata: <60% del caza más barato 110) y rango == 5 (corto: << mapa 80x50).
- [ ] CA8 — Dados 2 cazas enemigos enfrentados en rango 4, cuando pasan 5 s, entonces ambos pierden HP (combate aire-aire) aunque no haya AA cerca.
- [ ] CA9 — Dada partida, cuando un jugador llega a 60% del mapa o quedan 0 rivales, entonces aparece pantalla Victoria/Derrota con stats y Reiniciar funciona sin recargar manualmente.
- [ ] CA10 — Dado el repo, cuando abro index.html por doble-click (file://) sin servidor y juego 2 min, entonces no hay pantalla en blanco, ni CORS, ni dependencias externas; y `node tests/balance.test.js` pasa.

## Riesgos
- Riesgo: snowball de Protoss o swarm imparable Zerg rompe balance.
- Señal a observar: en 3 partidas auto de 3 min un bot gana siempre con >70%.
- Mitigación / ajuste previsto: tocar solo config.js (genMult/atkMult/costes), sin cambiar lógica.
- Riesgo: perf canvas con 4000 celdas + 20 cazas + 120 AA.
- Señal a observar: fps < 30 en portátil medio.
- Mitigación / ajuste previsto: repintar territorio solo en dirty-rect, limitar estelas.
- Riesgo: bots tontos (no expanden / no usan aire) hacen demo aburrida.
- Señal a observar: tras 60 s bots con <5% territorio o 0 cazas/AA.
- Mitigación / ajuste previsto: subir frecuencia decisión bot, bajar umbral de construcción AA.

## Entregables técnicos esperados
- Módulos: index.html (layout+HUD), styles.css, config.js (FACTIONS/AIR/AA/balance), game.js (simulación+render+IA+input, sin dependencias).
- Datos/configuración: todos los números de R5-R7 en config.js exportados a window.SC_CONFIG.
- Tests: tests/balance.test.js (node --test nativo, valida costes AA barata, rango corto, inmunidad aire-tierra, jerarquía facciones).
- Documentación: este spec.md + README mínimo de cómo jugar.

---
# ADDENDUM v2 — Refinamiento fiel a OpenFront.io (ciclo 2)

## Objetivo del refinamiento
Que el prototipo se sienta como OpenFront.io: mapa con agua y terreno, ataques terrestres **sostenidos y progresivos** desde la frontera (no instantáneos por click), ciudades que suben cap y generación, slider de % de ataque, leaderboard en vivo, bordes brillantes, fase de inmunidad inicial. Manteniendo facciones SC + aire + AA barata corto alcance.

## Delta de alcance (solo este ciclo)
- Incluye: terreno (llanura/tierras altas/montaña/agua), 6 ciudades neutrales capturables, ataques sostenidos con avance por ticks y retirada, cap de tropas logístico estilo OpenFront, inmunidad spawn 5 s, leaderboard derecha + barra inferior (slider + menú construir), bordes de territorio iluminados, nombres SC (Command Center/Hatchery/Nexus).
- No incluye (siguen fuera): multijugador, almirantes/barcos, nukes, alianzas, niebla, móvil avanzado, sonido.

## Nuevas reglas / cambios
- R2' — Tropas con cap: `maxTroops = 800 + territory*8 + cities*400` (×mult facción 1.0/0.9/1.1). Crecimiento por tick: `(0.8 + troops^0.73/40) * (1 - troops/max) * genMult`. Lleno frena (no farmear a cap).
- R3' — Ataque sostenido: click en frontera enemiga/neutral lanza un ataque que compromete `troops*ratio` y avanza 1 celda cada 2-5 ticks según terreno (llanura 2, altas 3, montaña 5) y defensa (post/capital ralentizan). Ambos bandos pierden tropas por celda (defensor pierde escudo/10, atacante pierde proporcional + extra en montaña). Click sobre ataque propio + tecla X = retirada (devuelve 75% supervivientes tras 2 s). Agua intransitable para tierra (hay que rodear o bombardear).
- R4' — Ciudades: 6 neutrales (def 25). Capturar ciudad da +400 cap y +2 tropas/tick. Se dibujan como icono ⬢ con nombre SC según dueño.
- R8' — Bots usan ataques sostenidos, priorizan llanuras y ciudades, retirada si pierden >60% comprometido.
- R10' — UI OpenFront: arriba tropas/escudo del humano; derecha leaderboard (% + tropas + estado); abajo slider 10-100% (teclas T/Y y 1/2/3 modos); click izq ataca, click dcho/X retira; mensajes de eventos.

## Criterios nuevos (se suman a CA1-CA10)
- [ ] CA11 — Terreno/agua: el mapa muestra agua oscura intransitable y 3 tonos de terreno; un ataque por montaña avanza más lento que por llanura.
- [ ] CA12 — Ataque sostenido: al atacar, las tropas se descuentan al lanzar, el frente avanza celda a celda varios segundos y puedo retirarme recuperando parte.
- [ ] CA13 — Ciudades: capturar una ciudad sube mi cap y mi generación; aparece en el mapa con icono.
- [ ] CA14 — Leaderboard: panel derecho con % y tropas de los 4 jugadores actualizado en vivo; fin a 80% o último vivo.
- [ ] CA15 — Inmunidad: 5 s iniciales sin daño entre jugadores (sí se puede expandir a neutral).
