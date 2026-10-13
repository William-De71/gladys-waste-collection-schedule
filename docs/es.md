# Waste Collection Schedule

## Presentación

Esta integración trae a Gladys Assistant las fechas de recogida de residuos de su dirección: cuándo pasan los envases, el vidrio o la fracción resto, un aviso la víspera por la tarde y un widget de panel con las próximas recogidas.

Las fechas proceden de [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), la biblioteca que conocen los usuarios de Home Assistant: casi 1.000 fuentes, municipios y operadores de residuos de una treintena de países, aplicaciones (Abfall.IO, Recycle!, ReCollect…) y cualquier enlace de calendario ICS. La biblioteca se ejecuta sin cambios dentro del contenedor de la integración.

Existe en dos variantes, que comparten el mismo código y la misma imagen:

- **Waste Collection Schedule** (esta): un dispositivo por calendario de recogida, con los días que faltan para la próxima recogida de cada tipo de residuo, utilizable en mosaicos, gráficos y condiciones de escena;
- **Waste Collection Calendar**: las recogidas en el calendario de Gladys, un calendario por fuente para cada usuario que la active (Gladys 5.2.0 o posterior).

Las dos variantes tienen el widget, los disparadores y las acciones de escena. Instale la que prefiera, o ambas.

![El widget «Próximas recogidas», con un calendario y luego con dos (ilustración generada, no es una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.es.png)

**Transporte: nube.** El contenedor consulta el sitio web o la API de su fuente desde su Gladys, cada 12 horas por defecto. Su dirección (o lo que necesite la fuente: una calle, un número, un enlace de calendario) se envía a esa fuente y a nadie más. Nada pasa por un servidor de Gladys.

### Dispositivos y funcionalidades

| Funcionalidad                                  | Valor                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Próxima recogida (días)                        | días hasta la próxima recogida, de cualquier tipo: 0 hoy, 1 mañana         |
| Próxima recogida                               | los tipos de residuos de esa recogida, como texto                          |
| _&lt;tipo de residuo&gt;_ (días), uno por tipo | días hasta la próxima recogida de ese tipo, -1 cuando no hay nada previsto |

Los nombres de los tipos de residuos son los de la fuente (por ejemplo «Envases», «Resto», «Vidrio»).

## Requisitos

- Gladys Assistant 5.1.1 o posterior (5.2.0 o posterior para la variante calendario).
- Su Gladys tiene acceso a Internet.
- Una fuente para su dirección. Consulte la [lista de fuentes](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers) o use el botón **Buscar una fuente** de la página de configuración. ¿No hay fuente para su municipio? La fuente **ics** lee cualquier enlace de calendario (`.ics`, `webcal://`) que publique su ayuntamiento o su operador.

## Configuración

### Encontrar su fuente y sus argumentos

1. Abra **Integraciones → Waste Collection Schedule → Configuración**.
2. Al final de la página, escriba el nombre de su municipio o de su operador de residuos en **Buscar una fuente** y ejecútelo. La respuesta lista las fuentes que coinciden, con la **fuente** que debe copiar, los **argumentos** ya conocidos y los que faltan, y la documentación de la fuente.
3. Lea la documentación de la fuente: explica cada argumento (una calle, un número, un identificador del sitio web del operador).

### Rellenar un calendario

| Campo      | Qué escribir                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Nombre     | un nombre para el calendario, mostrado en el dispositivo, el widget y las escenas (por ejemplo «Casa»)                              |
| Fuente     | el nombre de la fuente, por ejemplo `ics` u `opendata_bordeauxmetropole_fr`                                                         |
| Argumentos | un objeto JSON, por ejemplo `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`, o pares `clave=valor` separados por punto y coma |

Ejemplos:

- un enlace ICS: fuente `ics`, argumentos `{"url": "https://example.org/recogidas.ics"}`;
- Bordeaux Métropole: fuente `opendata_bordeauxmetropole_fr`, argumentos `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`.

Hasta tres calendarios: una segunda residencia, o una segunda fuente para la misma dirección (el municipio para la mayoría de los contenedores y un enlace ICS para el vidrio). Guarde y pulse **Probar los calendarios**: la respuesta indica, para cada calendario, cuántas fechas y qué tipos de residuos devolvió la fuente, o qué falla.

### Tipos de residuos, avisos y actualizaciones

| Campo                                 | Por defecto | Uso                                                                                 |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Renombrar                             | vacío       | pares `Original=Nuevo` separados por punto y coma: `Envases=Contenedor amarillo`    |
| Ocultar                               | vacío       | tipos que se ignoran, separados por punto y coma: `Árboles de Navidad; Voluminosos` |
| Aviso de la víspera                   | 19:00       | hora de los disparadores «Recogida de residuos mañana», o Desactivado               |
| Aviso de la mañana                    | 06:00       | hora del disparador «Recogida de residuos hoy», o Desactivado                       |
| Actualizar las fechas cada            | 12 horas    | frecuencia de consulta de las fuentes (6, 12 o 24 horas)                            |
| Idioma de los nombres de dispositivos | Inglés      | idioma de los nombres de dispositivos y funcionalidades                             |

Renombrar y ocultar se aplican a todos los calendarios. Un tipo renombrado recibe una funcionalidad nueva: vea Solución de problemas.

## Uso

### Dispositivos

Abra la pestaña **Descubrir**: cada calendario aparece como un dispositivo «Recogida de residuos _&lt;nombre&gt;_». Añádalo: sus valores se actualizan tras cada consulta y a medianoche. Ponga las funcionalidades en un panel, muestre su historial o úselas en condiciones de escena, por ejemplo «días hasta la recogida del vidrio igual a 1».

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

- **Obtener la próxima recogida** (opcionalmente de un tipo de residuo, por ejemplo «vidrio»): encontrada, fecha, días restantes, tipos de residuos, nombre del calendario.
- **Actualizar las fechas de recogida**: consulta las fuentes ahora; devuelve éxito, error, próxima fecha, próximos tipos de residuos, días hasta la próxima recogida.

### Ejemplos de escenas

- **Recogida de residuos mañana** → enviar un mensaje «Mañana: {{triggerEvent.data.waste_types}}, saque los contenedores».
- **Tipo de residuo recogido mañana**, tipo «Vidrio» → encender la luz de la entrada en verde durante 10 minutos.
- **Recogida de residuos hoy**, a las 06:00 → si la puerta del garaje está cerrada, enviar un mensaje «Recogida esta mañana».

### Variante calendario

Instale **Waste Collection Calendar**, configúrela del mismo modo y, después, cada usuario que quiera las recogidas en su calendario la activa en **Mis calendarios**. Cada calendario de recogida se convierte en un calendario de Gladys con un evento de día completo por recogida y tipo de residuo, desde 35 días atrás hasta 400 días adelante. Un calendario empieza siendo privado: active **Compartir con el hogar** en **Mis calendarios** para mostrarlo a todo el hogar y usarlo en escenas, con los disparadores de calendario de Gladys.

## Solución de problemas

- **Fuente desconocida**: compruebe cómo se escribe la fuente (minúsculas, guiones bajos), tal como la da **Buscar una fuente**.
- **Argumentos no válidos**: el mensaje de **Probar los calendarios** indica el argumento erróneo y, cuando la fuente los conoce, propone los valores correctos (nombres de calles, municipios).
- **La fuente falló** o **tardó demasiado**: el sitio web de la fuente falla o ha cambiado, o ya no encuentra su dirección. La integración vuelve a intentarlo a los 15 minutos, después cada vez con menos frecuencia, y mientras tanto conserva las últimas fechas conocidas. Si persiste, compruebe si la fuente funciona en Home Assistant: si no, avise a [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues); la corrección llegará con una actualización de la integración.
- **Fechas erróneas o que faltan**: las fechas son las de la fuente. Compárelas con el sitio web de su operador e informe de la diferencia al proyecto de origen.
- **Una funcionalidad desapareció o apareció tras renombrar**: las funcionalidades se identifican por el nombre del tipo de residuo. Tras un cambio de nombre (suyo o de la fuente), elimine el dispositivo y vuelva a añadirlo desde la pestaña **Descubrir**.
- **No llega el aviso**: compruebe las horas de aviso en la configuración y el filtro de calendario de la escena.
- **Registros**: la pestaña **Registros** de la integración. Para más detalle, añada la variable de entorno `DEBUG=gladys-integration-sdk`. Para informar de un problema, abra una [issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) con las versiones de Gladys y de la integración, la fuente y los registros.
