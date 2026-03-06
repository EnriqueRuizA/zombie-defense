extends CanvasLayer
## Fase 6: Panel derecho con lista de supervivientes (nombre, salud, trabajo).
## Base management: selector de trabajo (Sin asignar / Recolectar / Defender).

@onready var title: Label = $Panel/Margin/VBox/Title
@onready var list: VBoxContainer = $Panel/Margin/VBox/Scroll/List


func _ready() -> void:
	_refresh_list()
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_signal("survivors_updated"):
		gm.survivors_updated.connect(_refresh_list)


func _refresh_list() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	var surv_list: Array = gm.get("survivors") if gm.get("survivors") != null else []
	var job_ids: Array = gm.get("JOB_IDS") if gm.get("JOB_IDS") != null else ["idle", "scavenge", "defend"]
	var job_names: Dictionary = gm.get("JOB_NAMES") if gm.get("JOB_NAMES") != null else {}
	for child in list.get_children():
		list.remove_child(child)
		child.queue_free()
	for i in range(surv_list.size()):
		var entry: Variant = surv_list[i]
		if entry == null:
			continue
		var d: Dictionary = entry as Dictionary
		var name_str: String = d.get("name", "?")
		var health_val: int = d.get("health", 0)
		var job_id: String = d.get("job", "idle") as String
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var lbl_name: Label = Label.new()
		lbl_name.text = name_str
		lbl_name.custom_minimum_size.x = 90.0
		var lbl_health: Label = Label.new()
		lbl_health.text = "HP %d" % health_val
		lbl_health.custom_minimum_size.x = 44.0
		var opt_job: OptionButton = OptionButton.new()
		opt_job.custom_minimum_size.x = 110.0
		for j in range(job_ids.size()):
			var id: String = job_ids[j] as String
			opt_job.add_item(job_names.get(id, id), j)
			if id == job_id:
				opt_job.selected = j
		opt_job.item_selected.connect(_on_job_selected.bind(i, opt_job, job_ids))
		row.add_child(lbl_name)
		row.add_child(lbl_health)
		row.add_child(opt_job)
		list.add_child(row)


func _on_job_selected(index: int, survivor_index: int, opt: OptionButton, job_ids: Array) -> void:
	if index < 0 or index >= job_ids.size():
		return
	var job_id: String = job_ids[index] as String
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("set_survivor_job"):
		gm.set_survivor_job(survivor_index, job_id)
