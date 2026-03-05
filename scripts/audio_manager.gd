extends Node
## Autoload de audio: reproduce SFX y música. Sin streams asignados no hace nada.
## Asigna AudioStream en el editor o por código para activar sonidos.

var _player_sfx: AudioStreamPlayer
var _player_musica: AudioStreamPlayer

# Opcional: asignar streams desde código o recurso
var _streams: Dictionary = {}  # ej. "disparo" -> AudioStream

func _ready() -> void:
	_player_sfx = AudioStreamPlayer.new()
	_player_sfx.bus = &"Master"
	add_child(_player_sfx)
	_player_musica = AudioStreamPlayer.new()
	_player_musica.bus = &"Master"
	_player_musica.volume_db = -6.0
	add_child(_player_musica)


func play_sfx(stream: AudioStream) -> void:
	if stream == null:
		return
	_player_sfx.stream = stream
	_player_sfx.play()


func play_sfx_id(id: String) -> void:
	if _streams.has(id) and _streams[id] is AudioStream:
		play_sfx(_streams[id] as AudioStream)


func set_stream(id: String, stream: AudioStream) -> void:
	_streams[id] = stream


func play_musica(stream: AudioStream) -> void:
	if stream == null:
		return
	_player_musica.stream = stream
	_player_musica.play()


func set_volumen_master_db(db: float) -> void:
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(&"Master"), db)
