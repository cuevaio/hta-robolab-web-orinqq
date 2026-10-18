RoboLab: retos de programación con un robot para Inicial y Primaria, medibles para el docente.

PROBLEMA
En Inicial y Primaria el pensamiento computacional se enseña con robots de piso, pero el docente solo ve si el robot llegó: no sabe qué hizo cada niño, cuántas veces lo intentó ni si necesitó ayuda. En el Perú solo 29,5 % de los niños de 4.º de primaria logra lo esperado en Matemática (ENLA 2024, MINEDU) y 70 % de los estudiantes de 15 años no alcanza el nivel mínimo (PISA 2025). La brecha empieza en los primeros grados.

QUÉ HACE
- Retos abiertos sin cuenta, por tópico STEAM y nivel. En Inicial se programa con bloques (avanzar, retroceder, girar) tocando piezas o con gestos de la mano frente a la cámara: el reconocimiento corre en el propio equipo y la imagen no se envía. En Primaria se resuelven misiones en un tablero 6×6 con paredes, terreno difícil, estaciones y energía, en tres subniveles validados por un algoritmo que rechaza misiones sin solución.
- Robi, la guía, da hasta tres pistas por reto; el servidor registra cuántas se pidieron y si sirvieron.
- Clases sin datos personales: el alumno entra con el código de su clase y un apodo. El docente crea retos en tres pasos o con un asistente de misiones con IA, cuyas propuestas valida el mismo algoritmo, y ve por reto y por alumno qué porcentaje lo logró, intentos, pistas, tiempo y qué se observó. Solo lo observable: no diagnostica.
- Partidas en vivo: la clase compite en el mismo laberinto o lo resuelve en equipo, con avance en tiempo real y resultados confirmados por el servidor.
- Robot físico: un ESP32 recibe el programa por wifi (código de emparejamiento, respuestas OK/RUN/DONE) o por Bluetooth desde la web.
- Cada reto declara las competencias del Currículo Nacional que evidencia, y un panel público muestra el impacto en vivo.

CÓMO SE MIDE
El servidor es la autoridad: vuelve a simular cada programa y cuenta ejecuciones, pistas y tiempo con su propio reloj. Panel en vivo: https://robolab-web-omega.vercel.app/impacto

TECNOLOGÍA
Vite + React 19 + TypeScript; backend Convex en tiempo real; reglas del juego en TypeScript puro, compartidas por navegador y servidor; gestos con MediaPipe en un worker; firmware ESP32. 1082 pruebas automáticas (638 de dominio y backend, 444 de la web) y CI en cada cambio. Código: github.com/orinqq/robolab-web y github.com/orinqq/robolab-backend.

SEGURIDAD Y PRIVACIDAD
Apodos en lugar de nombres, contraseñas con reglas y recuperación por código, freno a la fuerza bruta, fecha decidida por el servidor, claves del robot guardadas solo hasheadas, sin analítica de terceros y sin secretos en los repositorios.

EQUIPO
ORIN (github.com/orinqq): Edwar Silva, David Rodriguez, Dayana Gomez y Jorge Laban.
