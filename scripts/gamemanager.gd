extends Node
## Singleton: recursos, día/hora, edificios, escuadras, investigación y guardado.
## FASE 4: 12 recursos tipo wiki, señales y HUD.

const SAVE_PATH: String = "user://save.tres"

# Recursos (claves tipo Infection Free Zone)
const RESOURCE_KEYS: Array[String] = [
	"wood", "raw_metal", "bricks", "basic_tool", "canned_food", "food_rations",
	"bag_grain", "raw_meat", "ammo_crates", "fuel_canister", "fertilizer", "first_aid_kit"
]

# Base management: tipos de edificio con coste y límite por tipo
const BUILDING_TYPES: Dictionary = {
	"hq": {"cost": {}, "max": 1, "name": "HQ"},
	"almacen": {"cost": {"wood": 25, "bricks": 15}, "max": 5, "name": "Almacén"},
	"tower": {"cost": {"wood": 20, "raw_metal": 15}, "max": 3, "name": "Torre de vigilancia"},
	"wall": {"cost": {"bricks": 10, "wood": 5}, "max": 15, "name": "Muro"}
}
# Coste para colocar una tropa de defensa
const TROOP_COST: Dictionary = {"ammo_crates": 5, "food_rations": 3}

# Trabajos de supervivientes (id interno -> nombre UI)
const JOB_IDS: Array[String] = ["idle", "scavenge", "defend"]
const JOB_NAMES: Dictionary = {"idle": "Sin asignar", "scavenge": "Recolectar", "defend": "Defender"}
const SCAVENGE_REWARDS: Array[Dictionary] = [
	{"wood": 2}, {"raw_metal": 1}, {"bricks": 1}, {"food_rations": 1}
]

var resources: Dictionary = {}

var day: int = 1
var time: float = 0.0  # 0..1 dentro del día
var day_duration_sec: float = 30.0  # ~30 s por día para que sea jugable rápido
var is_night: bool = false

var buildings: Array = []  # nodos o datos de edificios
var survivors: Array = []  # Fase 6: datos de supervivientes (name, health, job, node)
var squads: Array = []
var unlocked_research: Array = []  # nombres de investigación desbloqueada

# Fase 5: selección actual (ruina) y estado de HQ
var current_selected_ruin: Node = null
var hq_placed: bool = false
var hq_position: Vector2 = Vector2.ZERO  # Para guardar/cargar partida
# Al cargar partida, la ciudad usa esto para crear nodos de supervivientes; se limpia tras restaurar.
var _load_survivors_template: Array = []

signal resource_changed(key: String, value: int)
signal day_changed(new_day: int)
signal time_updated(t: float)
signal night_started(day_num: int)  # Emitido al entrar en fase noche (time >= 0.6)
signal hq_registered(pos: Vector2)  # Fase 6: al registrar HQ, para spawn de supervivientes
signal survivors_updated()  # Lista o trabajo de supervivientes cambió (para refrescar UI)

var is_paused: bool = false:
	set(v):
		is_paused = v
		if get_tree():
			get_tree().paused = is_paused


func _ready() -> void:
	_init_resources()


## Llamar al iniciar partida nueva (desde menú New Game).
func reset_for_new_game() -> void:
	_init_resources()
	day = 1
	time = 0.0
	is_night = false
	hq_placed = false
	hq_position = Vector2.ZERO
	buildings.clear()
	survivors.clear()
	_load_survivors_template.clear()
	current_selected_ruin = null
	day_changed.emit(day)
	time_updated.emit(time)


func _init_resources() -> void:
	for k in RESOURCE_KEYS:
		resources[k] = 100
	resources["food_rations"] = 50


func add_res(key: String, amount: int) -> void:
	if not resources.has(key):
		return
	var prev: int = resources[key]
	resources[key] = clampi(prev + amount, 0, 0x7FFFFFFF)
	resource_changed.emit(key, resources[key])


func get_res(key: String) -> int:
	return resources.get(key, 0)


func can_afford(costs: Dictionary) -> bool:
	for key in costs:
		if get_res(key) < int(costs[key]):
			return false
	return true


func spend(costs: Dictionary) -> bool:
	if not can_afford(costs):
		return false
	for key in costs:
		add_res(key, -int(costs[key]))
	return true


## Cuenta cuántos edificios del tipo hay ya construidos.
func count_buildings(building_type: String) -> int:
	var n: int = 0
	for b in buildings:
		if (b as Dictionary).get("type", "") == building_type:
			n += 1
	return n


## Comprueba si se puede construir (coste y límite de ese tipo).
func can_build(building_type: String) -> bool:
	if not BUILDING_TYPES.has(building_type):
		return false
	var def: Dictionary = BUILDING_TYPES[building_type]
	var max_count: int = def.get("max", 99)
	if count_buildings(building_type) >= max_count:
		return false
	var costs: Dictionary = def.get("cost", {})
	return can_afford(costs)


## Registrar edificio adaptado (Fase 5). Fase 6: emite hq_placed(pos) para spawn supervivientes.
func register_building(building_node: Node, building_type: String, pos: Vector2) -> void:
	buildings.append({"node": building_node, "type": building_type, "position": pos})
	if building_type == "hq":
		hq_placed = true
		hq_position = pos
		hq_registered.emit(pos)
	if building_type == "wall" and building_node.has_signal("destroyed"):
		building_node.destroyed.connect(_on_building_destroyed.bind(building_node))
	current_selected_ruin = null


func _on_building_destroyed(building_node: Node) -> void:
	for i in range(buildings.size() - 1, -1, -1):
		if (buildings[i] as Dictionary).get("node") == building_node:
			buildings.remove_at(i)
			break


## Fase 6: añadir superviviente a la lista (datos).
func add_survivor(survivor_data: Dictionary) -> void:
	survivors.append(survivor_data)
	survivors_updated.emit()


## Fase 6: al pasar el día, cada superviviente consume 1 ración.
func consume_survivor_rations() -> void:
	var total: int = survivors.size()
	var rations: int = get_res("food_rations")
	var deduct: int = mini(total, rations)
	if deduct > 0:
		add_res("food_rations", -deduct)


## Base management: aplica producción de trabajos (Recolectar da recursos al cambiar de día).
func apply_survivor_jobs() -> void:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for s in survivors:
		var d: Dictionary = s as Dictionary
		if (d.get("job", "idle") as String) != "scavenge":
			continue
		# Un recurso aleatorio de la lista por recolector y día
		var idx: int = rng.randi_range(0, SCAVENGE_REWARDS.size() - 1)
		var reward: Dictionary = SCAVENGE_REWARDS[idx].duplicate()
		for key in reward:
			add_res(key, reward[key])


## Cuenta cuántos supervivientes tienen trabajo "defend" (oleadas nocturnas).
func get_defender_count() -> int:
	var n: int = 0
	for s in survivors:
		if (s as Dictionary).get("job", "idle") as String == "defend":
			n += 1
	return n


## Asigna el trabajo a un superviviente por índice; actualiza el nodo si existe.
func set_survivor_job(survivor_index: int, job_id: String) -> void:
	if survivor_index < 0 or survivor_index >= survivors.size():
		return
	if not job_id in JOB_IDS:
		job_id = "idle"
	var d: Dictionary = survivors[survivor_index] as Dictionary
	d["job"] = job_id
	var node_ref: Variant = d.get("node", null)
	if node_ref != null and is_instance_valid(node_ref as Object):
		var node: Node = node_ref as Node
		if node.get("job_id") != null:
			node.set("job_id", job_id)
	survivors_updated.emit()


func add_time(delta_sec: float) -> void:
	if is_paused:
		return
	var was_night: bool = is_night
	time += delta_sec / day_duration_sec
	if time >= 1.0:
		time = 0.0
		day += 1
		consume_survivor_rations()
		apply_survivor_jobs()
		day_changed.emit(day)
		is_night = false
	else:
		is_night = time >= 0.6
		if is_night and not was_night:
			night_started.emit(day)
	time_updated.emit(time)


func _process(delta: float) -> void:
	# Solo avanzar tiempo cuando estamos en la escena de ciudad.
	var tree: SceneTree = get_tree()
	if tree and tree.current_scene and tree.current_scene.name == "City":
		add_time(delta)


## Guarda recursos, día, hora, HQ y supervivientes en user://save.tres
func save_game() -> int:
	var surv_data: Array = []
	for s in survivors:
		var d: Dictionary = s as Dictionary
		surv_data.append({
			"name": d.get("name", "?"),
			"health": d.get("health", 100),
			"job": d.get("job", "idle")
		})
	var build_data: Array = []
	for b in buildings:
		var d: Dictionary = b as Dictionary
		var pos: Vector2 = d.get("position", Vector2.ZERO)
		build_data.append({"type": d.get("type", ""), "position": pos})
	var data: Dictionary = {
		"version": 3,
		"resources": resources.duplicate(),
		"day": day,
		"time": time,
		"hq_placed": hq_placed,
		"hq_position": hq_position,
		"survivors": surv_data,
		"buildings": build_data,
		"unlocked_research": unlocked_research.duplicate(),
	}
	var res := SaveData.new()
	res.data = data
	return ResourceSaver.save(res, SAVE_PATH)


## Carga datos desde user://save.tres. Devuelve {} si no hay partida guardada.
func load_game() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return {}
	var res: Resource = ResourceLoader.load(SAVE_PATH) as SaveData
	if res == null:
		return {}
	return (res as SaveData).data


## Aplica un estado cargado (recursos, día, HQ, supervivientes). Devuelve true si data era válido.
func apply_loaded_state(data: Dictionary) -> bool:
	if data.is_empty():
		return false
	var v: Variant = data.get("version", 0)
	if int(v) < 3:
		return false
	# Recursos
	var res_dict: Dictionary = data.get("resources", {})
	if not res_dict.is_empty():
		for k in RESOURCE_KEYS:
			if res_dict.has(k):
				resources[k] = int(res_dict[k])
	day = int(data.get("day", 1))
	time = float(data.get("time", 0.0))
	is_night = time >= 0.6
	hq_placed = bool(data.get("hq_placed", false))
	var hp: Variant = data.get("hq_position", Vector2.ZERO)
	if hp is Vector2:
		hq_position = hp
	elif hp is Dictionary and hp.has("x") and hp.has("y"):
		hq_position = Vector2(float(hp["x"]), float(hp["y"]))
	else:
		hq_position = Vector2.ZERO
	buildings.clear()
	survivors.clear()
	_load_survivors_template = data.get("survivors", [])
	day_changed.emit(day)
	time_updated.emit(time)
	return true


class SaveData:
	extends Resource
	@export var data: Dictionary = {}
