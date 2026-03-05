extends Node
## Genera texturas procedurales para zombie y torre militar (sin assets externos).

const TAM_ZOMBIE := 64
const TAM_TORRE := 64


func crear_textura_zombie() -> ImageTexture:
	var img := Image.create(TAM_ZOMBIE, TAM_ZOMBIE, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var verde_oscuro := Color(0.12, 0.35, 0.1, 1)
	var verde_medio := Color(0.22, 0.5, 0.18, 1)
	var verde_claro := Color(0.35, 0.6, 0.28, 1)
	var cx := TAM_ZOMBIE / 2
	var cy := TAM_ZOMBIE / 2
	# Cabeza (óvalo)
	for y in range(8, 28):
		for x in range(cx - 14, cx + 14):
			var dx := (x - cx) / 14.0
			var dy := (y - 18) / 10.0
			if dx * dx + dy * dy <= 1.0:
				img.set_pixel(x, y, verde_medio)
	# Contorno cabeza
	for y in range(8, 28):
		for x in range(cx - 14, cx + 14):
			var dx := (x - cx) / 14.0
			var dy := (y - 18) / 10.0
			if abs(dx * dx + dy * dy - 1.0) < 0.15:
				img.set_pixel(x, y, verde_oscuro)
	# Cuerpo (trapecio / cuerpo zombie)
	for y in range(28, TAM_ZOMBIE - 4):
		var ancho := 14 - (y - 28) / 4
		ancho = clampi(ancho, 6, 14)
		for x in range(cx - ancho, cx + ancho):
			img.set_pixel(x, y, verde_claro)
	# Contorno cuerpo
	for y in range(28, TAM_ZOMBIE - 4):
		var ancho := 14 - (y - 28) / 4
		ancho = clampi(ancho, 6, 14)
		img.set_pixel(cx - ancho, y, verde_oscuro)
		img.set_pixel(cx + ancho - 1, y, verde_oscuro)
	# Ojos (rojos)
	img.set_pixel(cx - 4, 16, Color(0.7, 0.1, 0.1, 1))
	img.set_pixel(cx + 3, 16, Color(0.7, 0.1, 0.1, 1))
	var tex := ImageTexture.create_from_image(img)
	return tex


func crear_textura_torre_militar() -> ImageTexture:
	var img := Image.create(TAM_TORRE, TAM_TORRE, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var oliva_oscuro := Color(0.25, 0.32, 0.22, 1)
	var oliva := Color(0.38, 0.45, 0.3, 1)
	var oliva_claro := Color(0.45, 0.52, 0.35, 1)
	var gris_metal := Color(0.4, 0.4, 0.42, 1)
	var cx := TAM_TORRE / 2
	# Base (hexágono / plataforma)
	for y in range(38, TAM_TORRE - 2):
		var ancho := 24 - (y - 38) / 2
		ancho = clampi(ancho, 12, 24)
		for x in range(cx - ancho, cx + ancho):
			img.set_pixel(x, y, oliva_oscuro)
	# Torre central (torreta)
	for y in range(18, 42):
		var ancho := 10
		for x in range(cx - ancho, cx + ancho):
			img.set_pixel(x, y, oliva)
	# Techo torreta (cañón / cúpula)
	for y in range(8, 22):
		var ancho := 8 - (y - 8) / 2
		ancho = clampi(ancho, 4, 8)
		for x in range(cx - ancho, cx + ancho):
			img.set_pixel(x, y, gris_metal)
	# Manchas camuflaje
	for i in range(12):
		var px := cx + (i * 7 % 20) - 10
		var py := 22 + (i * 11 % 18)
		img.set_pixel(px, py, oliva_oscuro)
		img.set_pixel(px + 1, py, oliva_oscuro)
	var tex := ImageTexture.create_from_image(img)
	return tex
