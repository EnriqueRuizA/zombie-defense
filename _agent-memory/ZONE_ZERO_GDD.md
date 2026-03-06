# ZONE ZERO: LAST BASTION
## Game Design Document — Descripción Completa y Detallada

---

> **Género:** Estrategia de supervivencia en tiempo real con gestión de ciudad, roguelite y simulación de crisis
> **Plataformas:** PC (principal), consola
> **Inspiración base:** Infection Free Zone — mejorado en cada dimensión

---

## 1. CONCEPTO CENTRAL

**Zone Zero: Last Bastion** es un juego de estrategia de supervivencia donde el jugador toma el control de un grupo de sobrevivientes humanos en un mundo devastado por una pandemia de origen desconocido que convirtió a la mayoría de la población en entidades hostiles denominadas **Infectados**. A diferencia de otros juegos del género, *Zone Zero* usa **datos cartográficos reales del mundo** (OpenStreetMap + datos de edificios reales) para generar el mapa de juego, lo que significa que el jugador puede elegir defender su propia ciudad, barrio o cualquier lugar del planeta.

El núcleo del juego gira en torno a tres pilares:

- **Construir y gestionar una base segura** en entornos urbanos reales
- **Explorar, saquear y expandirse** en un mundo que evoluciona con el tiempo
- **Sobrevivir oleadas de infectados** que aprenden, mutan y adaptan comportamientos

---

## 2. AMBIENTACIÓN Y NARRATIVA

### 2.1 El Mundo

El año es 2031. Un patógeno sintético denominado **Cepas-Ω** fue liberado accidentalmente desde un laboratorio de investigación genética en múltiples continentes de forma simultánea. En 72 horas, el 78% de la población mundial presentaba síntomas. En 15 días, el colapso de los gobiernos era total.

Los infectados no son muertos vivientes clásicos. Son seres humanos con el sistema nervioso reprogramado por el patógeno: conservan capacidad motriz avanzada, instinto de grupo y, en etapas avanzadas, inteligencia táctica rudimentaria. El patógeno evoluciona, y con él, sus portadores.

### 2.2 El Jugador

El jugador interpreta a un **Coordinador de Zona**, el líder de un grupo de sobrevivientes que ha logrado establecer un perímetro provisional en un sector urbano. No es un soldado ni un científico: es alguien que tomó decisiones en el momento justo y ganó la confianza del grupo.

### 2.3 Arco Narrativo por Campañas

El juego incluye 4 campañas principales con narrativa propia, además del modo sandbox:

| Campaña | Localización real | Escenario |
|---|---|---|
| **La Caída de Madrid** | Madrid, España | Primeras semanas del brote |
| **El Río Negro** | Buenos Aires, Argentina | 6 meses después del colapso |
| **Glaciar** | Anchorage, Alaska | Invierno nuclear + infectados adaptados al frío |
| **El Último Puerto** | Singapur | Intento de evacuación marítima |

Cada campaña tiene misiones, personajes únicos con voces y diálogos, y múltiples finales según decisiones del jugador.

---

## 3. SISTEMA DE MAPA REAL (OpenStreetMap Integration)

### 3.1 Generación Procedural sobre Cartografía Real

Al iniciar una partida en modo libre, el jugador selecciona cualquier localización del mundo usando un globo terráqueo interactivo. El sistema:

1. **Descarga datos OSM** de la zona seleccionada (edificios, calles, parques, ríos, zonas industriales)
2. **Clasifica los edificios** automáticamente por tipo: residencial, comercial, industrial, sanitario, gubernamental, educativo
3. **Genera el mapa jugable** con geometría real de las manzanas y estructuras
4. **Puebla el mundo** con recursos, supervivientes NPC e infectados según la densidad poblacional histórica de la zona

### 3.2 Propiedades de los Edificios Reales

Cada tipo de edificio tiene atributos funcionales:

- **Hospitales:** Alto potencial de suministros médicos, alto riesgo de infectados concentrados
- **Supermercados:** Comida abundante pero expuestos, con accesos múltiples difíciles de defender
- **Comisarías / cuarteles:** Armamento, vehículos policiales, estructuras reforzadas
- **Colegios / universidades:** Grandes espacios abiertos, posibles supervivientes refugiados
- **Plantas eléctricas / subestaciones:** Desbloquean electricidad para la base
- **Fábricas:** Materiales de construcción, maquinaria recuperable

### 3.3 Sistema de Tiempo Real Geográfico

El juego usa la latitud real de la zona seleccionada para calcular:

- Duración del día y la noche según la época del año
- Clima estacional (nieve en invierno en latitudes altas, lluvias tropicales, etc.)
- Velocidad de crecimiento de recursos naturales

---

## 4. GESTIÓN DE LA BASE

### 4.1 El Perímetro

El jugador define manualmente el **perímetro de su zona segura** usando herramientas de dibujo sobre el mapa real. Puede elegir un solo edificio, una manzana entera o varias cuadras. Cada metro de perímetro tiene un costo de mantenimiento en materiales y guardias.

El perímetro se construye con distintos tipos de barricadas y estructuras defensivas:

| Estructura | Resistencia | Costo | Ventaja |
|---|---|---|---|
| Barricada de madera | Baja | Muy bajo | Rápida de construir |
| Muro de metal | Media | Medio | Resistente al fuego |
| Muro de hormigón | Alta | Alto | Permanente |
| Valla electrificada | Media + daño | Alto | Ralentiza y daña infectados |
| Muro reforzado con púas | Media + trampa | Medio | Reduce velocidad de escalada |
| Barrera antivehículo | Muy alta | Muy alto | Bloquea infectados voluminosos |

### 4.2 Edificios y Construcciones Internas

Dentro del perímetro, el jugador puede:

- **Rehabilitar edificios existentes** del mapa real (más barato, usa estructura ya existente)
- **Construir estructuras nuevas** desde cero en espacios libres

**Categorías de construcciones:**

**Producción de recursos:**
- Huertos urbanos (en patios, azoteas o parques)
- Captadores de agua de lluvia y purificadores
- Generadores de energía solar, eólica o de combustible
- Talleres de fabricación de herramientas
- Laboratorios de investigación médica

**Vivienda y bienestar:**
- Dormitorios (afectan el descanso y la moral)
- Comedores comunitarios
- Enfermería y quirófano
- Sala de entretenimiento / biblioteca (moral)
- Guardería (aumenta natalidad de la colonia a largo plazo)

**Defensa activa:**
- Torres de vigilancia con francotiradores NPC
- Nidos de ametralladora
- Cañones de sonido (dispersa grupos)
- Trampas explosivas de proximidad
- Sirenas de alerta temprana
- Reflectores y sistemas de iluminación perimetral

**Logística:**
- Almacenes clasificados por tipo de recurso
- Talleres de vehículos (reparación y modificación)
- Helipuerto (endgame)
- Radio de comunicaciones (contacto con otras colonias)

### 4.3 Recursos y Economía Interna

**6 tipos de recursos principales:**

| Recurso | Fuente | Uso |
|---|---|---|
| **Comida** | Saqueo, huertos, caza | Alimentar supervivientes diariamente |
| **Agua** | Captadores, ríos cercanos, saqueo | Consumo + algunos procesos |
| **Materiales** | Demolición, saqueo, fabricación | Construcción y reparaciones |
| **Combustible** | Estaciones de servicio, refinerías | Vehículos, generadores |
| **Medicamentos** | Hospitales, laboratorio propio | Salud + investigación |
| **Munición** | Fabricación, saqueo de armería | Defensa y exploración |

**Sistema de escasez dinámica:** Los recursos no se regeneran infinitamente. Una zona completamente saqueada no vuelve a tener recursos hasta que pase tiempo suficiente (simulación de abandono). Esto obliga al jugador a **expandirse o racionarse**.

---

## 5. GESTIÓN DE SUPERVIVIENTES

### 5.1 Sistema de Personas, No Números

Cada superviviente es un **individuo único** con:

- **Nombre, edad, apariencia visual generada proceduralmente**
- **Historial de vida pre-apocalipsis** (ex-médico, ex-militar, ex-cocinero, estudiante, etc.) que afecta sus stats base
- **Tres rasgos de personalidad** (valiente, cobarde, altruista, desconfiado, liderazgo, ingenioso, etc.)
- **Estado emocional:** esperanza, miedo, duelo, rabia, tranquilidad
- **Relaciones interpersonales** con otros supervivientes (amigos, parejas, enemistades)

### 5.2 Sistema de Roles y Especialización

Los supervivientes se pueden asignar a roles y ganar experiencia en ellos:

| Rol | Habilidad principal | Beneficios al subir nivel |
|---|---|---|
| **Soldado** | Combate, vigilancia | +daño, +precisión, nuevas tácticas |
| **Explorador** | Reconocimiento, saqueo | +velocidad, +carga, -ruido |
| **Médico** | Curación, investigación | -tiempo de curación, cura enfermedades raras |
| **Ingeniero** | Construcción, reparación | -tiempo de construcción, +durabilidad |
| **Cocinero** | Gestión de comida | +eficiencia nutricional, recetas especiales |
| **Científico** | Investigación | Árbol tecnológico exclusivo |
| **Negociador** | Diplomacia con otras colonias | Mejores tratos, menos conflictos |
| **Mecánico** | Vehículos | Vehículos más rápidos, más durables, modificaciones |

### 5.3 Moraleja de la Colonia

La **moral colectiva** es un sistema numérico visible (0-100) con consecuencias graves:

- **80-100:** Supervivientes trabajan más rápido, voluntarios para misiones peligrosas, eventos positivos
- **50-79:** Estado normal, rendimiento estándar
- **30-49:** Conflictos internos, menor productividad, deserción ocasional
- **10-29:** Amotinamientos, robos internos, abandono masivo
- **0-9:** Colapso total de la colonia, posible golpe de autoridad por un NPC

**Factores que afectan la moral:**
- Muertes de compañeros (especialmente de figuras queridas)
- Calidad y abundancia de la comida
- Temperatura y condiciones de vivienda
- Victorias y derrotas en combate
- Eventos narrativos especiales
- Enfermedades dentro del perímetro
- Noticias del exterior (otras colonias sobreviviendo o cayendo)

### 5.4 Muerte Permanente y Consecuencias

Cuando un superviviente muere, **desaparece para siempre**. Sus compañeros cercanos entran en duelo, lo cual reduce temporalmente su rendimiento. Si el fallecido tenía un conocimiento único (el único médico, el único piloto), la colonia pierde esa capacidad hasta entrenar a otro o encontrar a alguien con esa habilidad.

---

## 6. SISTEMA DE INFECTADOS

### 6.1 Tipos Base de Infectados

| Tipo | Descripción | Comportamiento |
|---|---|---|
| **Vagabundo** | Infectado común, lento | Deambula sin dirección fija, ataca por ruido o visión |
| **Corredor** | Infectado joven, ágil | Alta velocidad, ataca en solitario o pequeños grupos |
| **Aglutinador** | Gordo, resistente | Absorbe daño, moviliza manadas grandes hacia su posición |
| **Escalador** | Extremidades deformadas | Escala muros y edificios, ignora barreras verticales |
| **Gritador** | Sin ojos, hipersensible al sonido | Llama a otros infectados en radio enorme si escucha ruido |
| **Acorazado** | Infectado con armadura quitinosa de mutación | Inmune a munición pequeña, muy lento |
| **Incendiario** | Produce gases biológicos inflamables | Explota si se le dispara, prende fuego a estructuras |
| **Depredador** | Fase terminal de mutación | Caza activamente humanos, emboscadas, sigilo |

### 6.2 Sistema de Evolución de Infectados

Los infectados **evolucionan con el tiempo** basándose en la presión selectiva del jugador:

- Si el jugador usa mucho fuego → Aparecen mutaciones resistentes al calor
- Si el jugador usa electrificación → Aparecen infectados con piel conductora reducida
- Si el jugador mata silenciosamente → El patógeno presiona hacia infectados con mejor oído
- Las mutaciones son visibles: cambios físicos en los modelos 3D de los infectados

Este sistema garantiza que **no existe una estrategia dominante permanente**. El jugador debe adaptarse constantemente.

### 6.3 Comportamiento de Manadas (Horda AI)

Los infectados no atacan aleatoriamente. Tienen un sistema de IA en capas:

**Nivel 1 - Individual:** Cada infectado evalúa su entorno inmediato: fuentes de ruido, luz, movimiento, calor.

**Nivel 2 - Grupo:** Los infectados cercanos se sincronizan en un comportamiento colectivo: flanqueo, presión sobre puntos débiles del perímetro, distracción coordinada.

**Nivel 3 - Oleada Inteligente:** En eventos de horda masiva, la IA evalúa el **plano real del perímetro del jugador** y genera ataques multi-punto simultáneos dirigidos a las secciones más débiles detectadas en oleadas anteriores.

### 6.4 Ciclo Día/Noche y Comportamiento

- **Día:** Los infectados son más lentos, se agrupan en zonas de sombra, baja actividad
- **Noche:** Hiperactivos, velocidad aumentada, hordas más numerosas, usan el sonido activamente
- **Tormenta:** Reducción de visibilidad, el ruido de la lluvia enmascara sonidos → Explorer missions más seguras, oleadas nocturnas más impredecibles

---

## 7. EXPLORACIÓN Y SAQUEO

### 7.1 Sistema de Escuadrones

El jugador forma **escuadrones de 2 a 6 personas** y los envía a explorar el mapa. Dos modos de control:

**Modo Automático:** Seleccionas destino y tipo de misión, el escuadrón va solo. Ves el resultado cuando regresan (con posibles bajas, heridos o botín). Apto para misiones de bajo riesgo.

**Modo Directo:** Controlas manualmente al escuadrón en vista isométrica de acción táctica. Mueves personaje a personaje, usas coberturas, decides cuándo disparar y cuándo huir. Alto control, alta tensión.

### 7.2 Tipos de Misiones de Exploración

- **Saqueo estándar:** Ir a un edificio marcado, recoger recursos, volver
- **Reconocimiento:** Explorar zona desconocida y reportar actividad de infectados
- **Rescate:** Señal de supervivientes detectada por radio → ir a buscarlos antes de que mueran
- **Sabotaje:** Destruir un nido de infectados o una fuente de amplificación de horda
- **Diplomacia:** Visitar otra colonia para negociar, comerciar o establecer alianza
- **Extracción VIP:** Recuperar a un especialista (científico, médico, piloto) de una zona peligrosa
- **Emboscada:** Destruir un convoy de infectados que se acerca a la base

### 7.3 El Factor Ruido

Todo en el mundo genera **ruido simulado** que los infectados detectan:

- Disparos: Muy alto ruido, atrae infectados en radio enorme
- Vehículos: Ruido continuo, hordas pueden seguirlos
- Explosiones: Ruido máximo, alerta regional
- Pasos en superficie irregular: Ruido bajo
- Viento y lluvia: Enmascaran otros ruidos

El jugador debe decidir entre **armas de fuego** (efectivas pero ruidosas) vs **armas de cuerpo a cuerpo / silenciadas** (lentas pero discretas).

### 7.4 Vehículos

| Vehículo | Capacidad | Velocidad | Ruido | Uso |
|---|---|---|---|---|
| Bicicleta | 1 persona + carga mínima | Alta | Muy bajo | Reconocimiento rápido |
| Quad / moto | 2 personas | Muy alta | Medio | Extracción rápida |
| SUV civil | 5 personas + carga media | Media | Medio | Saqueo estándar |
| Camión de carga | 2 personas + carga enorme | Baja | Alto | Transporte masivo de recursos |
| Blindado policial | 6 personas | Baja | Alto | Asalto a zonas hostiles |
| Helicóptero | 4 personas | Muy alta | Muy alto | Misiones de larga distancia (endgame) |

---

## 8. INVESTIGACIÓN Y TECNOLOGÍA

### 8.1 Árbol Tecnológico

Dividido en **cinco ramas** que pueden desarrollarse en paralelo, limitadas por los científicos disponibles y los recursos de investigación:

**Medicina:**
Curas básicas → Vacunas parciales → Tratamiento de infección temprana → Análisis del patógeno → Prototipo de vacuna completa

**Ingeniería:**
Barricadas mejoradas → Sistemas eléctricos → Armas automáticas defensivas → Vehículos blindados artesanales → Drones de vigilancia

**Agricultura:**
Huertos básicos → Invernaderos → Hidroponía → Cultivos modificados → Auto-suficiencia alimentaria total

**Comunicaciones:**
Radio de corto alcance → Radio de largo alcance → Intercepción de señales → Red inter-colonial → Satélite recuperado

**Inteligencia sobre el patógeno:**
Análisis de comportamiento → Predicción de mutaciones → Vulnerabilidades químicas → Sistema de alerta de evolución

### 8.2 Investigación de Campo

Además del laboratorio, los científicos pueden hacer **investigación de campo**: analizar cadáveres de infectados, estudiar mutaciones in situ, recuperar muestras. Esto desbloquea tecnologías únicas no disponibles desde el laboratorio.

---

## 9. SISTEMA DE COLONIAS Y DIPLOMACIA

### 9.1 Otras Colonias en el Mapa

El mapa generado incluye otras **colonias de supervivientes controladas por la IA**, cada una con su propia ideología, recursos y problemas:

- **La Fortaleza:** Colonia militar, bien armada, desconfiada, comercia armas
- **Los Comunitarios:** Colonia civil, gran producción de comida, pacifistas
- **Los Científicos:** Pequeña pero con laboratorio avanzado, busca protección
- **Los Mercaderes:** No tienen base fija, comercian con todos, no son aliados fieles
- **Los Hostiles:** Colonias que atacan activamente a otras para robar recursos

### 9.2 Relaciones Diplomáticas

Con cada colonia se puede:

- **Comerciar:** Intercambio de recursos a tasas negociadas
- **Aliarse:** Apoyo mutuo en ataques de hordas, compartir inteligencia
- **Absorber:** Si tienen problemas graves, pueden unirse a tu colonia (con sus supervivientes y recursos)
- **Entrar en conflicto:** Competencia por territorios, diferencias ideológicas
- **Atacar:** Sistema de guerra inter-colonial (solo si el jugador elige este camino)

### 9.3 Eventos Diplomáticos

Eventos narrativos que afectan relaciones:
- Una colonia aliada es atacada por una horda masiva → ¿La ayudas sacrificando recursos?
- Un superviviente tuyo deja tu colonia para unirse a otra → ¿Lo traes de vuelta por la fuerza?
- Una colonia vecina descubre una cura parcial y exige exclusividad → ¿Negocias o espías?

---

## 10. SISTEMA DE CLIMA Y DESASTRES NATURALES

Además de las hordas, el jugador enfrenta **amenazas ambientales** basadas en la geografía real:

| Evento | Efecto | Duración |
|---|---|---|
| Tormenta de nieve | Bloquea vehículos, reduce movimiento, aumenta consumo de calefacción | 2-5 días |
| Ola de calor | Acelera deterioro de comida, aumenta enfermedades, deshidratación | 3-7 días |
| Inundación | Zonas del mapa real inundadas (usando datos de elevación reales), bloquea acceso | Variable |
| Incendio forestal / urbano | Fuego se propaga por el mapa, infectados huyen hacia tu zona | Variable |
| Terremoto | Daño aleatorio a construcciones, abre grietas en el perímetro | Instantáneo + secuelas |
| Eclipse / noche polar | Oscuridad extrema, infectados hiperactivos, costos de iluminación brutales | Horas / días |

---

## 11. MECÁNICAS ROGUELITE (Modo Sandbox/Infinito)

En el modo roguelite, la partida tiene una **escalada progresiva irreversible**:

- Cada semana in-game, el patógeno muta en alguna dirección impredecible
- Los recursos del mapa se agotan permanentemente
- Las hordas crecen en tamaño y frecuencia
- El objetivo no es ganar, sino **sobrevivir el mayor tiempo posible** y desbloquear mejoras para futuras partidas

**Meta-progresión entre partidas:**
- Planos de construcciones especiales
- Rasgos iniciales para nuevas colonias
- Archivos de lore del mundo
- Cosméticos para supervivientes y estructuras

---

## 12. AUDIO Y PRESENTACIÓN VISUAL

### 12.1 Estilo Visual

Vista isométrica con perspectiva ajustable. Estética **realista oscura**, paleta de colores apagados, con contraste alto en elementos de peligro (infectados rojos/naranjas) y seguridad (zona segura en azul/verde tenue). Iluminación volumétrica que afecta la jugabilidad (las sombras importan para esconderse o ser detectado).

### 12.2 Audio Dinámico

- **Sistema de sonido posicional 3D**: Cada infectado emite sonido en su posición real del mapa
- **Música adaptativa**: La banda sonora se transforma en tiempo real según el nivel de amenaza. Silencio y drones ambientales en calma total, percusión industrial y cuerdas de tensión durante ataques
- **Voces de supervivientes**: Cada personaje tiene líneas de voz únicas que comentan situaciones, expresan miedo, esperanza o cansancio
- **Sonidos ambientales reales**: Viento, lluvia, fuego propagándose, ecos urbanos

---

## 13. INTERFAZ Y UX

- **HUD mínimalista:** Solo información crítica en pantalla durante el juego. El resto en menús contextuales accesibles al hacer click
- **Mapa táctico:** Vista de calor que muestra presión de hordas, rutas de patrulla, zonas de riesgo y cobertura de torres defensivas
- **Panel de colonia:** Vista de todos los supervivientes, su estado, asignación y relaciones
- **Sistema de alertas inteligentes:** Solo notifica eventos que requieren acción del jugador, sin spam de notificaciones
- **Modo foto:** Para capturar momentos del mundo generado

---

## 14. RESUMEN DE DIFERENCIALES SOBRE INFECTION FREE ZONE

| Característica | Infection Free Zone | Zone Zero: Last Bastion |
|---|---|---|
| Mapa real | ✅ Básico | ✅ Enriquecido + clima + elevación real |
| Infectados | ✅ Tipos básicos | ✅ IA adaptativa + evolución mutacional |
| Supervivientes | Números genéricos | Individuos únicos con historia y relaciones |
| Diplomacia | ❌ | ✅ Sistema completo de colonias |
| Árbol tecnológico | Básico | 5 ramas profundas con investigación de campo |
| Narrativa | Mínima | 4 campañas + personajes con voces |
| Roguelite | ❌ | ✅ Meta-progresión entre partidas |
| Clima dinámico | Básico | ✅ Basado en geografía real + desastres naturales |
| Moral de colonia | ❌ | ✅ Sistema profundo con consecuencias graves |
| Control de escuadrón | Automático | ✅ Automático + control táctico directo |

---

*Documento elaborado para uso en desarrollo. Versión 1.0*
