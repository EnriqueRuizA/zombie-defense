extends CanvasLayer
## UI principal: actualiza oro, vidas, oleada y botón de iniciar oleada.

@onready var label_oro: Label = $Panel/VBox/HBoxStats/OroLabel
@onready var label_vidas: Label = $Panel/VBox/HBoxStats/VidasLabel
@onready var label_oleada: Label = $Panel/VBox/HBoxStats/OleadaLabel
@onready var label_velocidad_valor: Label = $Panel/VBox/HBoxVelocidad/LabelVelocidadValor
@onready var boton_velocidad_menos: Button = $Panel/VBox/HBoxVelocidad/VelocidadMenos
@onready var boton_velocidad_mas: Button = $Panel/VBox/HBoxVelocidad/VelocidadMas
@onready var boton_comprar_torre: Button = $Panel/VBox/HBoxBotones/ComprarTorre
@onready var boton_mover_torres: Button = $Panel/VBox/HBoxBotones/MoverTorres
@onready var boton_oleada: Button = $Panel/VBox/HBoxBotones/IniciarOleada
@onready var game_over_panel: Panel = $GameOverPanel
@onready var victory_panel: Panel = get_node_or_null("VictoryPanel") as Panel
@onready var hint_colocar: Label = $HintColocar
@onready var label_oleada_completada: Label = get_node_or_null("LabelOleadaCompletada") as Label
@onready var label_recorrido: Label = get_node_or_null("LabelRecorrido") as Label
@onready var boton_borrar_recorrido: Button = get_node_or_null("Panel/VBox/HBoxBotones/BorrarRecorrido") as Button
@onready var boton_recorrido_listo: Button = $Panel/VBox/HBoxBotones/RecorridoListo
@onready var menu_comprar: Panel = $MenuComprar
@onready var recruit_btn: Button = $MenuComprar/VBox/RecruitBtn
@onready var soldier_btn: Button = $MenuComprar/VBox/SoldierBtn
@onready var sniper_btn: Button = $MenuComprar/VBox/SniperBtn

var main: Main
var escena_zombie: PackedScene
var zombies_base_oleada: int = 5
var zombies_incremento_oleada: int = 2
var intervalo_spawn: float = 2.2
var timer_spawn: Timer
var timer_entre_oleadas: Timer
var spawns_restantes_esta_oleada: int = 0

const VELOCIDAD_OPCIONES: Array[float] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
var indice_velocidad: int = 2


func _ready() -> void:
	timer_entre_oleadas = Timer.new()
	timer_entre_oleadas.one_shot = true
	add_child(timer_entre_oleadas)
	timer_entre_oleadas.timeout.connect(_on_timer_entre_oleadas_timeout)
	main = get_tree().get_first_node_in_group("game_manager") as Main
	if main == null:
		main = get_parent() as Main
	escena_zombie = preload("res://scenes/zombie.tscn") as PackedScene
	timer_spawn = Timer.new()
	timer_spawn.one_shot = false
	add_child(timer_spawn)
	timer_spawn.timeout.connect(_on_timer_spawn_timeout)

	if main != null:
		if main.has_signal("oro_cambiado"):
			main.oro_cambiado.connect(_on_oro_cambiado)
		if main.has_signal("vidas_cambiadas"):
			main.vidas_cambiadas.connect(_on_vidas_cambiadas)
		if main.has_signal("oleada_iniciada"):
			main.oleada_iniciada.connect(_on_oleada_iniciada)
		if main.has_signal("juego_perdido"):
			main.juego_perdido.connect(_on_juego_perdido)
		if main.has_signal("modo_colocar_torre_cambiado"):
			main.modo_colocar_torre_cambiado.connect(_on_modo_colocar_torre_cambiado)
		if main.has_signal("oleada_terminada"):
			main.oleada_terminada.connect(_on_oleada_terminada)
		if main.has_signal("juego_ganado"):
			main.juego_ganado.connect(_on_juego_ganado)
		if main.has_signal("modo_reubicar_torre_cambiado"):
			main.modo_reubicar_torre_cambiado.connect(_on_modo_reubicar_torre_cambiado)
		if main.has_signal("torre_seleccionada_para_reubicar"):
			main.torre_seleccionada_para_reubicar.connect(_on_torre_seleccionada_reubicar)
		if main.has_signal("iniciar_oleada_fallido"):
			main.iniciar_oleada_fallido.connect(_on_iniciar_oleada_fallido)
		if main.has_signal("recorrido_actualizado"):
			main.recorrido_actualizado.connect(_actualizar_ui_planificacion)
		_on_oro_cambiado(main.oro)
		_on_vidas_cambiadas(main.vidas)
		_on_oleada_iniciada(main.oleada_actual)
	else:
		_on_oleada_iniciada(0)

	boton_comprar_torre.pressed.connect(_on_comprar_torre_pressed)
	boton_mover_torres.pressed.connect(_on_mover_torres_pressed)
	if boton_borrar_recorrido != null:
		boton_borrar_recorrido.pressed.connect(_on_borrar_recorrido_pressed)
	boton_recorrido_listo.pressed.connect(_on_recorrido_listo_pressed)
	boton_velocidad_menos.pressed.connect(_on_velocidad_menos_pressed)
	boton_velocidad_mas.pressed.connect(_on_velocidad_mas_pressed)
	recruit_btn.pressed.connect(_on_tipo_torre_pressed.bind("recruit"))
	soldier_btn.pressed.connect(_on_tipo_torre_pressed.bind("soldier"))
	sniper_btn.pressed.connect(_on_tipo_torre_pressed.bind("sniper"))
	menu_comprar.get_node("VBox/CerrarMenuBtn").pressed.connect(_on_cerrar_menu_pressed)
	boton_oleada.pressed.connect(_on_iniciar_oleada_pressed)
	game_over_panel.get_node("VBox/ReiniciarBtn").pressed.connect(_on_reiniciar_pressed)
	game_over_panel.get_node("VBox/MenuPrincipalBtn").pressed.connect(_on_menu_principal_pressed)
	if victory_panel != null:
		victory_panel.get_node("VBox/ReiniciarBtn").pressed.connect(_on_reiniciar_pressed)
		victory_panel.get_node("VBox/MenuPrincipalBtn").pressed.connect(_on_menu_principal_pressed)
	if label_oleada_completada != null:
		label_oleada_completada.visible = false
	if victory_panel != null:
		victory_panel.visible = false
	_aplicar_velocidad()
	_actualizar_ui_planificacion()


func _on_oro_cambiado(nuevo: int) -> void:
	label_oro.text = "Oro: %d" % nuevo
	_actualizar_botones_torres()


func _on_vidas_cambiadas(nuevo: int) -> void:
	label_vidas.text = "Vidas: %d" % nuevo


func _on_oleada_iniciada(numero: int) -> void:
	label_oleada.text = "Oleada: %d" % numero
	_actualizar_ui_planificacion()


func _actualizar_ui_planificacion() -> void:
	if main == null:
		return
	var planif: bool = main.en_fase_planificacion() if main.has_method("en_fase_planificacion") else false
	if boton_borrar_recorrido != null:
		boton_borrar_recorrido.visible = planif
	boton_recorrido_listo.visible = planif
	if label_recorrido != null:
		label_recorrido.visible = planif
		if planif:
			var n: int = main.get_cantidad_puntos_recorrido() if main.has_method("get_cantidad_puntos_recorrido") else 0
			label_recorrido.text = "Clic en la cuadrícula para dibujar el recorrido (mín. 2 puntos). Actual: %d." % n


func _on_juego_perdido() -> void:
	boton_oleada.disabled = true
	boton_comprar_torre.disabled = true
	label_vidas.text = "0"
	if main != null:
		game_over_panel.get_node("VBox/GameOverLabel").text = "¡Has perdido!"
		game_over_panel.get_node("VBox/StatsLabel").text = "Oleada: %d  |  Zombies eliminados: %d" % [main.oleada_actual, main.zombies_eliminados]
	game_over_panel.visible = true
	if victory_panel != null:
		victory_panel.visible = false
	hint_colocar.visible = false
	if label_oleada_completada != null:
		label_oleada_completada.visible = false


func _on_comprar_torre_pressed() -> void:
	menu_comprar.visible = not menu_comprar.visible
	_actualizar_botones_torres()


func _actualizar_botones_torres() -> void:
	if main == null:
		return
	var tipos: Dictionary = main.tipos_torre
	var oro_actual: int = main.oro
	recruit_btn.disabled = oro_actual < tipos.get("recruit", {}).get("costo", 999)
	soldier_btn.disabled = oro_actual < tipos.get("soldier", {}).get("costo", 999)
	sniper_btn.disabled = oro_actual < tipos.get("sniper", {}).get("costo", 999)


func _on_tipo_torre_pressed(tipo_id: String) -> void:
	menu_comprar.visible = false
	if main != null and main.has_method("activar_modo_colocar_torre"):
		main.activar_modo_colocar_torre(tipo_id)


func _on_cerrar_menu_pressed() -> void:
	menu_comprar.visible = false


func _on_modo_colocar_torre_cambiado(activo: bool) -> void:
	boton_comprar_torre.disabled = activo
	menu_comprar.visible = false
	hint_colocar.visible = activo
	if activo:
		hint_colocar.text = "Clic en el suelo para colocar — ESC o clic derecho cancelar"
		boton_oleada.disabled = true
		boton_mover_torres.disabled = true
	else:
		boton_oleada.disabled = spawns_restantes_esta_oleada > 0
		boton_mover_torres.disabled = false
		_actualizar_botones_torres()
		if main != null and not main.modo_reubicar_torre:
			hint_colocar.visible = false


func _on_mover_torres_pressed() -> void:
	if main == null or not main.has_method("activar_modo_reubicar_torre"):
		return
	if main.modo_reubicar_torre:
		main.cancelar_modo_reubicar_torre()
		hint_colocar.visible = false
		boton_oleada.disabled = spawns_restantes_esta_oleada > 0
		boton_mover_torres.disabled = false
		return
	main.activar_modo_reubicar_torre()


func _on_modo_reubicar_torre_cambiado(activo: bool) -> void:
	if activo:
		boton_comprar_torre.disabled = true
		boton_oleada.disabled = true
		menu_comprar.visible = false
		hint_colocar.visible = true
		hint_colocar.text = "Clic en una torre para seleccionar, luego clic en el suelo para reubicar. ESC o clic derecho cancelar."
	else:
		hint_colocar.visible = false
		boton_oleada.disabled = spawns_restantes_esta_oleada > 0
		boton_mover_torres.disabled = false
		_actualizar_botones_torres()


func _on_torre_seleccionada_reubicar(_torre: Node2D) -> void:
	if hint_colocar != null:
		hint_colocar.text = "Clic en la nueva posición. ESC o clic derecho cancelar."


func _on_iniciar_oleada_fallido(mensaje: String) -> void:
	if label_oleada_completada != null:
		label_oleada_completada.text = mensaje
		label_oleada_completada.visible = true
		get_tree().create_timer(3.0).timeout.connect(func() -> void:
			if label_oleada_completada != null:
				label_oleada_completada.visible = false
		)


func _aplicar_velocidad() -> void:
	indice_velocidad = clampi(indice_velocidad, 0, VELOCIDAD_OPCIONES.size() - 1)
	Engine.time_scale = VELOCIDAD_OPCIONES[indice_velocidad]
	if label_velocidad_valor != null:
		label_velocidad_valor.text = "%sx" % snappedf(VELOCIDAD_OPCIONES[indice_velocidad], 0.01)


func _on_velocidad_menos_pressed() -> void:
	indice_velocidad -= 1
	_aplicar_velocidad()


func _on_velocidad_mas_pressed() -> void:
	indice_velocidad += 1
	_aplicar_velocidad()


func _on_borrar_recorrido_pressed() -> void:
	if main != null and main.has_method("limpiar_recorrido"):
		main.limpiar_recorrido()
		_actualizar_ui_planificacion()


func _on_recorrido_listo_pressed() -> void:
	var mensaje: String = "Recorrido listo. Pulsa Iniciar oleada para empezar."
	if label_recorrido != null:
		label_recorrido.text = mensaje
		label_recorrido.visible = true
	if label_oleada_completada != null:
		label_oleada_completada.text = mensaje
		label_oleada_completada.visible = true
	get_tree().create_timer(3.0).timeout.connect(func() -> void:
		if label_oleada_completada != null:
			label_oleada_completada.visible = false
		_actualizar_ui_planificacion()
	)


func _on_iniciar_oleada_pressed() -> void:
	if main == null:
		return
	var cantidad: int = zombies_base_oleada + main.oleada_actual * zombies_incremento_oleada
	if not main.iniciar_oleada(cantidad):
		return
	boton_oleada.disabled = true
	spawns_restantes_esta_oleada = cantidad
	timer_spawn.wait_time = intervalo_spawn
	timer_spawn.start()
	_crear_un_zombie()
	_actualizar_ui_planificacion()


func _on_oleada_terminada(numero_oleada: int) -> void:
	if label_oleada_completada != null:
		label_oleada_completada.text = "Oleada %d completada!" % numero_oleada
		label_oleada_completada.visible = true
	var delay: float = 2.0
	if main != null and main.get("tiempo_entre_oleadas") != null:
		delay = main.tiempo_entre_oleadas
	timer_entre_oleadas.wait_time = delay
	timer_entre_oleadas.start()


func _on_timer_entre_oleadas_timeout() -> void:
	if label_oleada_completada != null:
		label_oleada_completada.visible = false
	boton_oleada.disabled = false
	_actualizar_botones_torres()


func _on_juego_ganado() -> void:
	boton_oleada.disabled = true
	boton_comprar_torre.disabled = true
	if victory_panel != null:
		victory_panel.get_node("VBox/VictoryLabel").text = "¡Victoria!"
		victory_panel.get_node("VBox/StatsLabel").text = "Oleada %d  |  Zombies eliminados: %d" % [main.oleada_actual, main.zombies_eliminados]
		victory_panel.visible = true
	game_over_panel.visible = false
	hint_colocar.visible = false
	if label_oleada_completada != null:
		label_oleada_completada.visible = false


func _on_menu_principal_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")


func _on_reiniciar_pressed() -> void:
	get_tree().reload_current_scene()


func _on_timer_spawn_timeout() -> void:
	_crear_un_zombie()


func _crear_un_zombie() -> void:
	if spawns_restantes_esta_oleada <= 0 or main == null:
		return
	main.spawn_zombie(escena_zombie)
	spawns_restantes_esta_oleada -= 1
	if spawns_restantes_esta_oleada <= 0:
		timer_spawn.stop()
		# El botón se habilita en _on_timer_entre_oleadas_timeout tras oleada_terminada
