# Criterios de aceptación — Fase 5: Sistema de construcción

**Product Owner** — Definición lista para Desarrollo y Testing.

## Objetivo
El jugador puede elegir un tipo de edificio, ver un fantasma de colocación y colocar/adaptar edificios (empezando por HQ en una ruina seleccionada).

## Criterios de aceptación

### CA1: Menú de construcción (panel izquierdo)
- [x] Existe un panel fijo a la izquierda (ej. 280 px) en la escena City (ui/build_menu.tscn).
- [x] El panel muestra al menos dos opciones: **Adaptar como HQ** (ruina seleccionada) y **Cancelar** / deseleccionar.
- [x] Al hacer clic en "Adaptar como HQ" con una ruina seleccionada, esa ruina se convierte en HQ (sin coste por ahora).

### CA2: Fantasma de colocación (preview)
- [ ] Si en el futuro se añade "Construir en suelo", un fantasma (rectángulo verde/semántico) sigue al ratón y solo se puede colocar en celdas válidas (por ahora se puede omitir si solo hay "Adaptar como HQ").

### CA3: Adaptar ruina a HQ
- [x] Con una ruina seleccionada (resaltado cian), un botón "Adaptar como HQ" convierte esa ruina en edificio tipo HQ.
- [x] Tras adaptar: la ruina deja de ser seleccionable como ruina (building_type == "hq"); se muestra en verde.
- [x] GameManager registra el edificio en buildings y hq_placed = true (register_building).

### CA4: Integración con GameManager
- [x] GameManager tiene hq_placed: bool y buildings con tipo "hq".
- [x] Coste 0 en esta fase.

### CA5: Cancelar / deseleccionar
- [x] Clic en vacío (derecho) o botón "Cancelar" deselecciona y quita el resaltado cian.

## Prioridad
- Crítico: CA1, CA3, CA5.
- Medio: CA2 (simplificado o stub), CA4.

## Definición de "listo"
Testing dará por cumplida la fase cuando: en City, al seleccionar una ruina con clic derecho, aparezca el panel con "Adaptar como HQ"; al pulsarlo, la ruina pase a verse como HQ (verde) y GameManager refleje que hay un HQ colocado; y al hacer clic en vacío o Cancelar se deseleccione.

---

## Informe Testing (Fase 5)

- **Linter**: Sin errores en gamemanager.gd, ruin.gd, map_gen.gd, build_menu.gd.
- **Pruebas manuales** (ejecutar F5 → New Game):
  1. Panel izquierdo visible con "Selecciona una ruina (clic derecho)". OK.
  2. Clic derecho sobre una ruina gris → ruina en cian; panel muestra "Adaptar como HQ" y "Cancelar". OK.
  3. Clic en "Adaptar como HQ" → ruina pasa a verde; panel vuelve a mostrar hint; ya no se puede volver a seleccionar esa celda como ruina. OK.
  4. Clic derecho en vacío o "Cancelar" → se deselecciona, resaltado cian desaparece. OK.
- **Resultado**: Cumple criterios. Fase 5 lista para siguiente fase.
