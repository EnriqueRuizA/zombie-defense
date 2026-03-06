extends CanvasLayer
## Fase 5: Panel izquierdo de construcción. Adaptar ruina como HQ y cancelar.

@onready var panel: PanelContainer = $Panel
@onready var label_hint: Label = $Panel/Margin/VBox/Hint
@onready var btn_adapt_hq: Button = $Panel/Margin/VBox/AdaptHQ
@onready var btn_adapt_almacen: Button = $Panel/Margin/VBox/AdaptAlmacen
@onready var btn_adapt_tower: Button = $Panel/Margin/VBox/AdaptTower
@onready var btn_cancel: Button = $Panel/Margin/VBox/Cancel
@onready var btn_almacen_suelo: Button = $Panel/Margin/VBox/AlmacenSuelo
@onready var btn_torre_suelo: Button = $Panel/Margin/VBox/TorreSuelo


func _ready() -> void:
	btn_adapt_hq.pressed.connect(_on_adapt_hq_pressed)
	btn_adapt_almacen.pressed.connect(func(): _build_type("almacen"))
	btn_adapt_tower.pressed.connect(func(): _build_type("tower"))
	btn_cancel.pressed.connect(_on_cancel_pressed)
	_update_visibility()


func _process(_delta: float) -> void:
	_update_visibility()


func _update_visibility() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		panel.visible = true
		label_hint.visible = true
		btn_adapt_hq.visible = false
		btn_cancel.visible = false
		return

	var selected: Variant = gm.get("current_selected_ruin")
	var has_selection: bool = selected != null and is_instance_valid(selected as Object)
	var is_ruin: bool = false
	if has_selection:
		var obj: Object = selected as Object
		is_ruin = "building_type" in obj and (obj.get("building_type") as String) == ""

	label_hint.visible = not has_selection
	label_hint.text = "Selecciona una ruina\n(clic derecho)"
	btn_adapt_hq.visible = has_selection and is_ruin and gm.has_method("can_build") and gm.can_build("hq")
	btn_adapt_almacen.visible = has_selection and is_ruin and gm.has_method("can_build") and gm.can_build("almacen")
	btn_adapt_tower.visible = has_selection and is_ruin and gm.has_method("can_build") and gm.can_build("tower")
	btn_cancel.visible = has_selection
	btn_almacen_suelo.visible = gm.has_method("can_build") and gm.can_build("almacen")
	btn_torre_suelo.visible = gm.has_method("can_build") and gm.can_build("tower")
	panel.visible = true


func _on_adapt_hq_pressed() -> void:
	_build_type("hq")


func _build_type(building_type: String) -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null or not gm.has_method("can_build") or not gm.can_build(building_type):
		return
	var selected: Variant = gm.get("current_selected_ruin")
	if selected == null or not is_instance_valid(selected as Object):
		return
	var ruin: Node = selected as Node
	if building_type != "hq":
		var def: Dictionary = gm.get("BUILDING_TYPES")[building_type]
		var costs: Dictionary = def.get("cost", {})
		if not costs.is_empty() and gm.has_method("spend") and not gm.spend(costs):
			return
		if ruin.has_method("adapt_to_building_type"):
			ruin.adapt_to_building_type(building_type)
		else:
			return
	else:
		if ruin.has_method("adapt_to_hq"):
			ruin.adapt_to_hq()
		else:
			return
	gm.register_building(ruin, building_type, ruin.global_position)
	if ruin.has_method("set_selected"):
		ruin.set_selected(false)
	gm.set("current_selected_ruin", null)
	var sm: Node = get_node_or_null("/root/SoundManager")
	if sm != null and sm.has_method("play_build"):
		sm.play_build()


func _on_cancel_pressed() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	var selected: Variant = gm.get("current_selected_ruin")
	if selected != null and is_instance_valid(selected as Object):
		var n: Node = selected as Node
		if n.has_method("set_selected"):
			n.set_selected(false)
	gm.set("current_selected_ruin", null)


func _on_almacen_suelo_pressed() -> void:
	var city: Node = get_parent()
	if city != null and city.has_method("start_placement"):
		city.start_placement("almacen")


func _on_torre_suelo_pressed() -> void:
	var city: Node = get_parent()
	if city != null and city.has_method("start_placement"):
		city.start_placement("tower")
