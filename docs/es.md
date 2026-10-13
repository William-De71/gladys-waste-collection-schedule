# Waste Collection Schedule

## Presentación

Esta integración trae a Gladys Assistant las fechas de recogida de residuos de su dirección: en el calendario de Gladys, como aviso la víspera por la tarde y en un widget de panel con las próximas recogidas.

Las fechas proceden de [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), la biblioteca que conocen los usuarios de Home Assistant: casi 1.000 fuentes, municipios y operadores de residuos de una treintena de países, aplicaciones (Abfall.IO, Recycle!, ReCollect…) y cualquier enlace de calendario ICS. La biblioteca se ejecuta sin cambios dentro del contenedor de la integración.

- **Calendario**: un calendario por fuente («Recogida de residuos – Casa») para cada usuario que active la integración, con un evento de día completo por recogida y tipo de residuo.
- **Widget** «Próximas recogidas»: los próximos días de recogida, cada uno con un contenedor del color adecuado.
- **Escenas**: avisos la víspera por la tarde y la mañana de una recogida, y acciones para obtener la próxima recogida o actualizar las fechas.

![El widget «Próximas recogidas», con un calendario y luego con dos (ilustración generada, no es una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.es.png)

**Transporte: nube.** El contenedor consulta el sitio web o la API de su fuente desde su Gladys, cada 12 horas por defecto. Su dirección (o lo que necesite la fuente: una calle, un número, un enlace de calendario) se envía a esa fuente y a nadie más. Nada pasa por un servidor de Gladys.

## Requisitos

- Gladys Assistant 5.2.0 o posterior (integraciones de calendario).
- Su Gladys tiene acceso a Internet.
- Una fuente para su dirección. Consulte la [lista de fuentes](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers) o use el botón **Buscar una fuente** de la página de configuración. ¿No hay fuente para su municipio? La fuente **ics** lee cualquier enlace de calendario (`.ics`, `webcal://`) que publique su ayuntamiento o su operador.

## Configuración

Un administrador configura las fuentes una sola vez, para todo el hogar.

### Encontrar su fuente y sus argumentos

1. Abra **Integraciones → Waste Collection Schedule → Configuración**.
2. Al final de la página, escriba el nombre de su municipio o de su operador de residuos en **Buscar una fuente** y ejecútelo. La respuesta lista las fuentes que coinciden, con la **fuente** que debe copiar, los **argumentos** ya conocidos y los que faltan, y la documentación de la fuente.
3. Lea la documentación de la fuente: explica cada argumento (una calle, un número, un identificador del sitio web del operador).

### Rellenar un calendario

| Campo      | Qué escribir                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Nombre     | un nombre para el calendario, mostrado en el calendario, el widget y las escenas (por ejemplo «Casa»)                               |
| Fuente     | el nombre de la fuente, por ejemplo `ics` u `opendata_bordeauxmetropole_fr`                                                         |
| Argumentos | un objeto JSON, por ejemplo `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`, o pares `clave=valor` separados por punto y coma |

Ejemplos:

- un enlace ICS: fuente `ics`, argumentos `{"url": "https://example.org/recogidas.ics"}`;
- Bordeaux Métropole: fuente `opendata_bordeauxmetropole_fr`, argumentos `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`.

Hasta tres calendarios: una segunda residencia, o una segunda fuente para la misma dirección (el municipio para la mayoría de los contenedores y un enlace ICS para el vidrio). Guarde y pulse **Probar los calendarios**: la respuesta indica, para cada calendario, cuántas fechas y qué tipos de residuos devolvió la fuente, o qué falla.

### Tipos de residuos, avisos y actualizaciones

| Campo                                       | Por defecto | Uso                                                                                 |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Renombrar                                   | vacío       | pares `Original=Nuevo` separados por punto y coma: `Envases=Contenedor amarillo`    |
| Ocultar                                     | vacío       | tipos que se ignoran, separados por punto y coma: `Árboles de Navidad; Voluminosos` |
| Aviso de la víspera                         | 19:00       | hora de los disparadores «Recogida de residuos mañana», o Desactivado               |
| Aviso de la mañana                          | 06:00       | hora del disparador «Recogida de residuos hoy», o Desactivado                       |
| Actualizar las fechas cada                  | 12 horas    | frecuencia de consulta de las fuentes (6, 12 o 24 horas)                            |
| Idioma de los textos enviados a las escenas | Inglés      | nombres de calendario por defecto y mensajes de error en las variables de escena    |

Renombrar y ocultar se aplican a todos los calendarios. Los nombres de los calendarios siguen el idioma de cada usuario.

## Uso

### Mis calendarios

Cada usuario que quiera las recogidas en su propio calendario abre la integración y pulsa **Activar para mí** en **Mis calendarios**. Aparece un calendario por fuente, con un evento de día completo por recogida y tipo de residuo, desde 35 días atrás hasta 400 días adelante. Los eventos siguen a la fuente: una recogida que la fuente mueve o suprime se mueve o desaparece también en Gladys.

Un calendario empieza siendo privado. Active **Compartir con el hogar** para mostrarlo a todo el hogar y usarlo en escenas con los disparadores de calendario de Gladys; desactive **Sincronizar este calendario** para dejar de recibirlo. El widget y los disparadores de la integración funcionan aunque nadie la active.

### Widget

En el editor del panel, añada el widget **Próximas recogidas** desde la sección Waste Collection Schedule. Muestra la próxima recogida, los próximos días de recogida con un contenedor del color adecuado (amarillo para envases, azul para papel, verde para vidrio y restos de jardín, marrón para orgánico, gris para la fracción resto), el estado de cada calendario y un botón **Actualizar**. Ajustes: el calendario mostrado (todos o uno), el número de días de recogida (3, 5 u 8) y el botón Actualizar.

### Disparadores de escena

| Disparador                        | Cuándo                                                            | Variables                                                        |
| --------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Recogida de residuos mañana       | la víspera de un día de recogida, a la hora del aviso de la tarde | tipos de residuos, número de tipos, fecha, nombre del calendario |
| Tipo de residuo recogido mañana   | en el mismo momento, una vez por tipo (para filtrar por un tipo)  | tipo de residuo, fecha, nombre del calendario                    |
| Recogida de residuos hoy          | la mañana de un día de recogida, a la hora del aviso de la mañana | tipos de residuos, número de tipos, fecha, nombre del calendario |
| Error al actualizar las recogidas | una vez, cuando una fuente empieza a fallar                       | nombre del calendario, fuente, error                             |

Cada disparador puede filtrarse por un calendario. Un aviso se envía una sola vez, aunque Gladys se reinicie; si Gladys estaba apagado a la hora del aviso, llega hasta 3 horas después.

### Acciones de escena

- **Obtener la próxima recogida** (opcionalmente de un tipo de residuo, por ejemplo «vidrio»): encontrada, fecha, días restantes, tipos de residuos, nombre del calendario. Use «días restantes» en una condición de los pasos siguientes.
- **Actualizar las fechas de recogida**: consulta las fuentes ahora; devuelve éxito, error, próxima fecha, próximos tipos de residuos, días hasta la próxima recogida.

### Ejemplos de escenas

- **Recogida de residuos mañana** → enviar un mensaje «Mañana: {{triggerEvent.data.waste_types}}, saque los contenedores».
- **Tipo de residuo recogido mañana**, tipo «Vidrio» → encender la luz de la entrada en verde durante 10 minutos.
- Un disparador de calendario de Gladys sobre el calendario compartido «Recogida de residuos – Casa», 30 minutos antes del evento → un aviso al hogar.

## Solución de problemas

- **Fuente desconocida**: compruebe cómo se escribe la fuente (minúsculas, guiones bajos), tal como la da **Buscar una fuente**.
- **Argumentos no válidos**: el mensaje de **Probar los calendarios** indica el argumento erróneo y, cuando la fuente los conoce, propone los valores correctos (nombres de calles, municipios).
- **La fuente falló** o **tardó demasiado**: el sitio web de la fuente falla o ha cambiado, o ya no encuentra su dirección. La integración vuelve a intentarlo a los 15 minutos, después cada vez con menos frecuencia, y mientras tanto conserva las últimas fechas conocidas. Si persiste, compruebe si la fuente funciona en Home Assistant: si no, avise a [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues); la corrección llegará con una actualización de la integración.
- **Fechas erróneas o que faltan**: las fechas son las de la fuente. Compárelas con el sitio web de su operador e informe de la diferencia al proyecto de origen.
- **No aparece ningún calendario tras activarla**: los calendarios se envían tras la primera actualización correcta de las fuentes; compruebe que **Sincronizar este calendario** está activado.
- **No llega el aviso**: compruebe las horas de aviso en la configuración y el filtro de calendario de la escena.
- **Registros**: la pestaña **Registros** de la integración. Para más detalle, añada la variable de entorno `DEBUG=gladys-integration-sdk`. Para informar de un problema, abra una [issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) con las versiones de Gladys y de la integración, la fuente y los registros.
