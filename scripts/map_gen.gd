extends Node2D
## Generación de ciudad: TileMap (hierba/carretera), ruinas seleccionables.
## Tamaño y ruinas configurables (MAP_SIZE, RUIN_COUNT). Fallback si faltan texturas.

const TILE_SIZE: int = 32
const MAP_SIZE: int = 128
const ROAD_SPACING: int = 16
const RUIN_COUNT: int = 40

const COLOR_GRASS_FALLBACK := Color(0.13, 0.55, 0.13)
const COLOR_ROAD_FALLBACK := Color(0.5, 0.5, 0.5)

var _tilemap: TileMap
var _tileset: TileSet
var _grass_source_id: int = -1
var _road_source_id: int = -1
var _selected_ruin: Node = null
var _rng := RandomNumberGenerator.new()

# Fantasma de colocación (construir en suelo, muro, tropa)
var _placement_type: String = ""
var _placement_ghost: Node2D = null
var _placeables_root: Node2D
var _walls_root: Node2D
var _troops_root: Node2D
const PLACEABLE_SCENE := preload("res://scenes/placeable_building.tscn")
const WALL_SCENE := preload("res://scenes/wall.tscn")
const TROOP_SCENE := preload("res://scenes/troop.tscn")
const PLACEABLE_SIZE_TILES: Vector2i = Vector2i(4, 4)
const WALL_SIZE_TILES: Vector2i = Vector2i(2, 1)


func _ready() -> void:
	_tilemap = $Ground
	_placeables_root = $Placeables
	_walls_root = $Walls
	_troops_root = $Troops
	_rng.randomize()
	_setup_tileset()
	_generate_ground()
	_spawn_ruins()
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_signal("hq_registered"):
		gm.hq_registered.connect(_on_hq_registered)
	# Restaurar HQ y supervivientes si estamos cargando partida
	if gm != null and gm.get("hq_placed") and _get_gm_hq_position(gm) != Vector2.ZERO:
		_restore_hq_and_survivors(gm)


func _make_fallback_texture(color: Color) -> Texture2D:
	var img := Image.create(TILE_SIZE, TILE_SIZE, false, Image.FORMAT_RGBA8)
	img.fill(color)
	return ImageTexture.create_from_image(img)


func _setup_tileset() -> void:
	_tileset = TileSet.new()

	var tex_grass: Texture2D = load("res://assets/Terrains/Grass Materials.png") as Texture2D
	if tex_grass == null:
		tex_grass = _make_fallback_texture(COLOR_GRASS_FALLBACK)
	var src_grass := TileSetAtlasSource.new()
	src_grass.texture = tex_grass
	src_grass.texture_region_size = Vector2i(TILE_SIZE, TILE_SIZE)
	for i in 8:
		src_grass.create_tile(Vector2i(i, 0))
	_grass_source_id = _tileset.add_source(src_grass)

	var tex_road: Texture2D = load("res://assets/Terrains/Gravel Materials.png") as Texture2D
	if tex_road == null:
		tex_road = _make_fallback_texture(COLOR_ROAD_FALLBACK)
	var src_road := TileSetAtlasSource.new()
	src_road.texture = tex_road
	src_road.texture_region_size = Vector2i(TILE_SIZE, TILE_SIZE)
	for i in 8:
		src_road.create_tile(Vector2i(i, 0))
	_road_source_id = _tileset.add_source(src_road)

	_tilemap.tile_set = _tileset
	_tilemap.tile_set.tile_size = Vector2i(TILE_SIZE, TILE_SIZE)


func _generate_ground() -> void:
	## Rellena todo con hierba y pinta carreteras cada ROAD_SPACING tiles.
	for x in MAP_SIZE:
		for y in MAP_SIZE:
			var grass_variant_x := _rng.randi_range(0, 7)
			_tilemap.set_cell(0, Vector2i(x, y), _grass_source_id, Vector2i(grass_variant_x, 0))

	for x in MAP_SIZE:
		if x % ROAD_SPACING == 0:
			for y in MAP_SIZE:
				var road_variant_x := _rng.randi_range(0, 7)
				_tilemap.set_cell(0, Vector2i(x, y), _road_source_id, Vector2i(road_variant_x, 0))

	for y in MAP_SIZE:
		if y % ROAD_SPACING == 0:
			for x in MAP_SIZE:
				var road_variant_x2 := _rng.randi_range(0, 7)
				_tilemap.set_cell(0, Vector2i(x, y), _road_source_id, Vector2i(road_variant_x2, 0))


func _spawn_ruins() -> void:
	## Instancia edificios en ruinas en bloques entre carreteras.
	var ruins_root := $Ruins
	var ruin_scene := preload("res://scenes/ruined_building.tscn")
	var rng := RandomNumberGenerator.new()
	rng.randomize()

	var spawned := 0
	var safety := 0
	while spawned < RUIN_COUNT and safety < RUIN_COUNT * 10:
		safety += 1
		# Elegimos una celda aleatoria lejos del borde.
		var cell := Vector2i(
			rng.randi_range(2, MAP_SIZE - 3),
			rng.randi_range(2, MAP_SIZE - 3)
		)

		# Evitar colocar justo sobre una carretera.
		if cell.x % ROAD_SPACING == 0 or cell.y % ROAD_SPACING == 0:
			continue

		var ruin := ruin_scene.instantiate()
		var ruin_size := Vector2i(
			rng.randi_range(4, 8),
			rng.randi_range(4, 8)
		)
		ruin.size_tiles = ruin_size
		# Vector2i no tiene to_vector2 en Godot 4: convertimos manualmente.
		ruin.global_position = Vector2(cell.x * TILE_SIZE, cell.y * TILE_SIZE)
		ruins_root.add_child(ruin)
		spawned += 1


func _process(_delta: float) -> void:
	if _placement_ghost != null:
		var cam := get_viewport().get_camera_2d()
		if cam != null:
			var mouse_world: Vector2 = cam.get_global_mouse_position()
			var size_tiles: Vector2i = _get_placement_size_tiles()
			var cell := Vector2i(
				int(round(mouse_world.x / TILE_SIZE)),
				int(round(mouse_world.y / TILE_SIZE))
			)
			_placement_ghost.global_position = Vector2(cell.x * TILE_SIZE, cell.y * TILE_SIZE) + Vector2(size_tiles.x * TILE_SIZE * 0.5, size_tiles.y * TILE_SIZE * 0.5)


func _unhandled_input(event: InputEvent) -> void:
	if _placement_ghost != null:
		if event.is_action_pressed("ui_cancel"):
			_cancel_placement()
			get_viewport().set_input_as_handled()
			return
		if event is InputEventMouseButton and event.is_pressed():
			var mb := event as InputEventMouseButton
			if mb.button_index == MOUSE_BUTTON_RIGHT:
				_cancel_placement()
				get_viewport().set_input_as_handled()
				return
			if mb.button_index == MOUSE_BUTTON_LEFT:
				_place_at(_placement_ghost.global_position)
				get_viewport().set_input_as_handled()
				return
	## Selección con botón derecho (acción "select").
	if event is InputEventMouseButton and event.is_pressed():
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_select_at_mouse()


func _select_at_mouse() -> void:
	var viewport := get_viewport()
	if viewport == null:
		return
	var cam := viewport.get_camera_2d()
	if cam == null:
		return
	var mouse_pos_world: Vector2 = cam.get_global_mouse_position()
	var space := get_world_2d().direct_space_state
	var params := PhysicsPointQueryParameters2D.new()
	params.position = mouse_pos_world
	params.collide_with_areas = false
	params.collide_with_bodies = true
	var results: Array = space.intersect_point(params, 16)
	var new_selection: Node = null
	for hit in results:
		var collider: Node = hit.get("collider") as Node
		if collider is StaticBody2D and collider.has_method("set_selected"):
			# Solo ruinas sin adaptar (Fase 5)
			if "building_type" in collider and (collider as Object).get("building_type") != "":
				continue
			new_selection = collider
			break

	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null:
		gm.set("current_selected_ruin", new_selection)

	if _selected_ruin != null and is_instance_valid(_selected_ruin):
		if _selected_ruin.has_method("set_selected"):
			_selected_ruin.set_selected(false)
	_selected_ruin = new_selection
	if _selected_ruin != null and _selected_ruin.has_method("set_selected"):
		_selected_ruin.set_selected(true)


func _get_placement_size_tiles() -> Vector2i:
	if _placement_type == "wall":
		return WALL_SIZE_TILES
	if _placement_type == "troop":
		return Vector2i(1, 1)
	return PLACEABLE_SIZE_TILES


func start_placement(building_type: String) -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	if building_type == "troop":
		if not gm.has_method("can_afford") or not gm.can_afford(gm.get("TROOP_COST")):
			return
	else:
		if not gm.has_method("can_build") or not gm.can_build(building_type):
			return
	if _placement_ghost != null:
		_cancel_placement()
	_placement_type = building_type
	if building_type == "troop":
		_placement_ghost = TROOP_SCENE.instantiate() as Node2D
	else:
		_placement_ghost = PLACEABLE_SCENE.instantiate() as Node2D
	if _placement_ghost == null:
		return
	if building_type != "troop":
		_placement_ghost.set("building_type", building_type)
	_placement_ghost.modulate.a = 0.6
	if _placement_type == "troop":
		_troops_root.add_child(_placement_ghost)
	else:
		_placeables_root.add_child(_placement_ghost)


func _cancel_placement() -> void:
	_placement_type = ""
	if _placement_ghost != null:
		_placement_ghost.queue_free()
		_placement_ghost = null


func _place_at(world_pos: Vector2) -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null or _placement_ghost == null:
		_cancel_placement()
		return
	if _placement_type == "troop":
		var cost: Dictionary = gm.get("TROOP_COST") if gm.get("TROOP_COST") != null else {}
		if not gm.has_method("spend") or not gm.spend(cost):
			_cancel_placement()
			return
		_placement_ghost.global_position = world_pos
		_placement_ghost.modulate.a = 1.0
		var sm: Node = get_node_or_null("/root/SoundManager")
		if sm != null and sm.has_method("play_build"):
			sm.play_build()
		_placement_type = ""
		_placement_ghost = null
		return
	if not gm.has_method("can_build") or not gm.can_build(_placement_type):
		_cancel_placement()
		return
	if _placement_type != "wall" and _overlaps_ruin(world_pos):
		return
	if _placement_type == "wall":
		if _overlaps_wall(world_pos):
			_cancel_placement()
			return
		var def: Dictionary = gm.get("BUILDING_TYPES")[_placement_type]
		var costs: Dictionary = def.get("cost", {})
		if not gm.has_method("spend") or not gm.spend(costs):
			_cancel_placement()
			return
		var wall_node: StaticBody2D = WALL_SCENE.instantiate() as StaticBody2D
		if wall_node == null:
			_cancel_placement()
			return
		wall_node.global_position = world_pos
		_walls_root.add_child(wall_node)
		gm.register_building(wall_node, "wall", world_pos)
	else:
		var def: Dictionary = gm.get("BUILDING_TYPES")[_placement_type]
		var costs: Dictionary = def.get("cost", {})
		if not costs.is_empty() and gm.has_method("spend") and not gm.spend(costs):
			_cancel_placement()
			return
		var building: Node2D = PLACEABLE_SCENE.instantiate() as Node2D
		if building == null:
			_cancel_placement()
			return
		building.global_position = world_pos
		building.set("building_type", _placement_type)
		_placeables_root.add_child(building)
		gm.register_building(building, _placement_type, world_pos)
	var sm: Node = get_node_or_null("/root/SoundManager")
	if sm != null and sm.has_method("play_build"):
		sm.play_build()
	_cancel_placement()


func _overlaps_ruin(center: Vector2) -> bool:
	var size_tiles: Vector2i = _get_placement_size_tiles()
	var half := Vector2(size_tiles.x * TILE_SIZE * 0.5, size_tiles.y * TILE_SIZE * 0.5)
	var my_rect := Rect2(center - half, Vector2(size_tiles.x * TILE_SIZE, size_tiles.y * TILE_SIZE))
	var ruins_root: Node = $Ruins
	for child in ruins_root.get_children():
		var r: Node = child
		if not "global_position" in r or not "size_tiles" in r:
			continue
		var rpos: Vector2 = r.global_position
		var rsize: Vector2 = Vector2(r.get("size_tiles").x * TILE_SIZE, r.get("size_tiles").y * TILE_SIZE)
		var r_rect := Rect2(rpos, rsize)
		if my_rect.intersects(r_rect):
			return true
	return false


func _overlaps_wall(center: Vector2) -> bool:
	var half := Vector2(WALL_SIZE_TILES.x * TILE_SIZE * 0.5, WALL_SIZE_TILES.y * TILE_SIZE * 0.5)
	var my_rect := Rect2(center - half, Vector2(WALL_SIZE_TILES.x * TILE_SIZE, WALL_SIZE_TILES.y * TILE_SIZE))
	for w in get_tree().get_nodes_in_group("wall"):
		var wall_node: Node = w as Node
		if not wall_node.has_method("get_rect_global"):
			continue
		if my_rect.intersects(wall_node.get_rect_global()):
			return true
	return false


func _get_gm_hq_position(gm: Node) -> Vector2:
	var v: Variant = gm.get("hq_position")
	if v is Vector2:
		return v
	return Vector2.ZERO


func _restore_hq_and_survivors(gm: Node) -> void:
	## Crea nodos de supervivientes al cargar partida (HQ ya está en GameManager).
	var survivors_root: Node2D = $Survivors
	if survivors_root == null or not gm.has_method("add_survivor"):
		return
	var pos: Vector2 = _get_gm_hq_position(gm)
	var template: Array = gm.get("_load_survivors_template") if gm.get("_load_survivors_template") != null else []
	var survivor_scene: PackedScene = preload("res://scenes/survivor.tscn")
	var offsets: Array[Vector2] = [Vector2(48, 0), Vector2(-40, 36), Vector2(-24, -40)]
	for i in 3:
		var surv: Node2D = survivor_scene.instantiate() as Node2D
		if surv == null:
			continue
		surv.position = pos + offsets[i]
		if i < template.size():
			var t: Dictionary = template[i] as Dictionary
			if surv.get("survivor_name") != null:
				surv.set("survivor_name", t.get("name", "Superviviente %d" % (i + 1)))
			if surv.get("health") != null:
				surv.set("health", int(t.get("health", 100)))
			if surv.get("job_id") != null:
				surv.set("job_id", t.get("job", "idle"))
		else:
			if surv.get("survivor_name") != null:
				surv.set("survivor_name", "Superviviente %d" % (i + 1))
		survivors_root.add_child(surv)
		gm.add_survivor(surv.get_data())
	# Limpiar plantilla para no usarla dos veces
	gm.set("_load_survivors_template", [])


func _on_hq_registered(pos: Vector2) -> void:
	var survivors_root: Node2D = $Survivors
	var survivor_scene: PackedScene = preload("res://scenes/survivor.tscn")
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null or survivors_root == null:
		return
	var offsets: Array[Vector2] = [Vector2(48, 0), Vector2(-40, 36), Vector2(-24, -40)]
	for i in 3:
		var surv: Node2D = survivor_scene.instantiate() as Node2D
		if surv == null:
			continue
		surv.position = pos + offsets[i]
		if surv.has_method("set") and surv.get("survivor_name") != null:
			surv.set("survivor_name", "Superviviente %d" % (i + 1))
		survivors_root.add_child(surv)
		if gm.has_method("add_survivor") and surv.has_method("get_data"):
			gm.add_survivor(surv.get_data())

