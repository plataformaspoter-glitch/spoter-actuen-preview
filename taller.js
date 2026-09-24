/**
 * Taller ACTÚEN+ — el cliente pega sus respuestas rápidas y ve cómo el método
 * las evalúa y las reacomoda.
 *
 * Todo es determinístico y corre en el navegador: no hay IA reescribiendo ni
 * texto que salga del equipo. El reacomodo NO inventa contenido comercial: toma
 * las frases del cliente y las ordena en la estructura del método. Lo que
 * agrega (datos a pedir, cierre, marcadores como {PRECIO}) sale de las
 * plantillas del rubro o de la estructura del método, y siempre queda marcado
 * como sugerencia para que el cliente decida.
 *
 * Para redactar de verdad, el taller exporta un prompt con el método, el
 * contexto del rubro, el diagnóstico y el borrador, listo para pegar en la IA
 * que use el asesor o el negocio. Ahí sí el texto sale del equipo, y por eso
 * el prompt se anonimiza por defecto.
 *
 * T (tiempos) y + (carga bot/humano) no se pueden juzgar mirando un texto: se
 * miden en los chats. Se muestran como tales en vez de puntuarlos con un
 * número inventado.
 */
'use strict';

// ==========================================================================
// NÚCLEO (sin DOM)
// ==========================================================================

// `pregunta`, `mal` y `bien` son para explicar el método en la página: una
// pregunta que cualquiera puede hacerse sobre su respuesta y un ejemplo de cada lado.
const PILARES = [
  { letra: 'A', nombre: 'Atender sin laberintos', evaluable: true,
    idea: 'El cliente cuenta lo que necesita de entrada, sin navegar un menú de opciones.',
    pregunta: '¿El cliente puede decir lo que necesita apenas escribe?',
    mal: 'Elegí una opción: 1. Ventas 2. Envíos 3. Pagos',
    bien: '¡Hola! Contame qué necesitás y te ayudo.',
    detalle: {
          porQue: "Cada paso extra antes de poder hablar es una oportunidad de que el cliente se canse y consulte en otro lado. Un menú además lo obliga a adivinar en qué categoría cae su consulta, y muchas no entran en ninguna.",
          revisa: [
                "Listas numeradas acompañadas de “elegí una opción” o “respondé con el número”.",
                "Menús escritos en una sola línea.",
                "Pedidos de escribir una palabra clave, como “MENÚ” o “INICIO”, para seguir."
          ],
          arreglo: [
                "Invitá a escribir libremente: “Contame qué necesitás”.",
                "Si querés orientar, mostrá las opciones como ejemplos, sin números.",
                "Que clasifique el bot o el asesor, no el cliente."
          ],
          antes: "Gracias por comunicarte. Elegí una opción:\n1. Ventas\n2. Envíos\n3. Pagos\nRespondé con el número.",
          despues: "👋 ¡Hola! Gracias por comunicarte.\n💬 Contame en un solo mensaje qué necesitás. Por ejemplo:\n• Precios y presupuestos\n• Envíos\n• Pagos\n👉 ¿En qué te ayudo?"
    } },
  { letra: 'C', nombre: 'Cero vueltas', evaluable: true,
    idea: 'Todo lo necesario en un solo bloque: información, datos a pedir y acción. Nada de ráfagas ni un dato por turno.',
    pregunta: '¿Resuelve todo en un solo mensaje, o hay que ir y volver?',
    mal: '"Buenos días!" · "sale $6.260" · "¿a qué dirección?" (tres mensajes sueltos)',
    bien: 'Precio, datos que faltan y próximo paso, juntos en un mensaje.',
    detalle: {
          porQue: "Cada vez que el cliente tiene que contestar algo que se le podría haber preguntado antes, la conversación suma un turno de espera. Y con varios mensajes sueltos lo importante se pierde: el cliente responde a medias.",
          revisa: [
                "Un saludo suelto que ocupa un mensaje entero.",
                "Varias líneas cortas que se leen como una ráfaga de mensajes.",
                "Pedir un solo dato cuando la consulta necesita varios.",
                "Mandar un PDF sin escribir el número clave en el chat.",
                "Tres o más preguntas sueltas dentro del texto.",
                "Volver a preguntar algo que el cliente ya dijo."
          ],
          arreglo: [
                "Juntá saludo, respuesta y pedido de datos en un mismo mensaje.",
                "Pedí todos los datos que faltan en una lista numerada.",
                "Si mandás un PDF, escribí el total y la validez en el chat.",
                "Si necesitás dos burbujas, usá la marca [---saltomensaje---]."
          ],
          antes: "Buenos dias!\ncemento avellaneda $6260 holcim $6500\na que direccion lo necesitas?",
          despues: "👋 ¡Buenos días!\n• Cemento Avellaneda: $6.260\n• Holcim: $6.500\n📋 Para cotizarte el envío, pasame:\n1. Cantidad de bolsas\n2. Dirección de entrega\n[---saltomensaje---]\n👉 ¿Te lo reservo para esta semana?"
    } },
  { letra: 'T', nombre: 'Tiempos aceitados', evaluable: false,
    idea: 'Responder dentro del SLA del rubro. Se mide en tus chats, no en un texto.',
    pregunta: '¿Contesta a tiempo?',
    mal: 'Responder a los 40 minutos, cuando ya consultó en otro lado.',
    bien: 'Responder dentro del tiempo ideal de tu rubro.',
    detalle: {
          porQue: "Mientras espera, el cliente sigue buscando. En los rubros donde se compara precio, una demora larga suele significar que ya compró en otro lado.",
          mide: [
                "El tiempo que tarda la primera respuesta en tus chats reales.",
                "Cómo se compara con el tiempo ideal de tu rubro.",
                "Qué consultas con intención de compra quedaron esperando detrás de otras."
          ],
          arreglo: [
                "Tené respuestas rápidas listas para lo más consultado.",
                "Que el bot dé un primer mensaje útil mientras llega el asesor.",
                "Atendé primero a quien está por comprar, no solo por orden de llegada."
          ]
    } },
  { letra: 'U', nombre: 'Ubicar la intención', evaluable: true,
    idea: 'Responder lo que el cliente preguntó y pedir en el mismo turno los datos que dicen qué tan cerca de comprar está.',
    pregunta: '¿Contesta lo que preguntó y pide lo que falta para avanzar?',
    mal: 'Cliente: "¿Cuánto sale el cemento?" → "¿Para qué obra es?"',
    bien: '"Está $6.260. ¿Cuántas bolsas y a qué zona lo mandamos?"',
    detalle: {
          porQue: "El cliente escribe con una intención concreta. Si la respuesta no la atiende, siente que no lo leyeron. Y sin los datos que faltan (qué, cuánto, dónde, cuándo) no se puede cotizar ni saber qué tan cerca está de comprar.",
          revisa: [
                "Si el cliente preguntó precio, stock, envío, turno, pago u horario y la respuesta no lo contesta. Para esto hace falta pegar su mensaje con “Cliente:”.",
                "Cuántos datos pide la respuesta en el mismo turno.",
                "Si pregunta algo que el cliente ya dio: dirección, cantidad, producto, DNI, día o forma de pago."
          ],
          arreglo: [
                "Contestá primero lo que preguntó.",
                "Pedí juntos los datos que definen la venta: qué, cuánto, dónde y cuándo.",
                "Si ya dio un dato, confirmalo en vez de volver a preguntarlo."
          ],
          antes: "Cliente: ¿Cuánto sale el cemento?\n¿Para qué obra es?",
          despues: "Cliente: ¿Cuánto sale el cemento?\nEstá $6.260 la bolsa. ¿Cuántas bolsas necesitás y a qué zona lo mandamos?"
    } },
  { letra: 'E', nombre: 'Experiencia personalizada', evaluable: true,
    idea: 'Hablarle a una persona, no a un expediente. Sin fórmulas de mesa de entradas.',
    pregunta: '¿Suena a una persona o a un expediente?',
    mal: '"Estimado cliente, su consulta ha sido recibida."',
    bien: '"¡Hola Juan! Ya lo reviso."',
    detalle: {
          porQue: "Las fórmulas de oficina marcan distancia y suenan a respuesta automática. En WhatsApp el cliente espera hablar con alguien, y lo nota enseguida.",
          revisa: [
                "Fórmulas de mesa de entradas: “estimado cliente”, “su solicitud ha sido recibida”, “a la brevedad”.",
                "Mensajes escritos en mayúsculas sostenidas.",
                "Mezclar “usted” y “vos” en la misma respuesta.",
                "Contestar un reclamo sin reconocer el problema. Esto también necesita el mensaje del cliente."
          ],
          arreglo: [
                "Escribí como hablarías en el mostrador.",
                "Elegí un trato, vos o usted, y sostenelo.",
                "Ante un reclamo, primero reconocé el problema: “Entiendo, ya lo reviso”."
          ],
          antes: "Estimado cliente, su consulta ha sido recibida. Nos comunicaremos a la brevedad.",
          despues: "¡Hola Juan! Recibí tu consulta y ya la estoy revisando. ¿Me pasás el número de pedido así lo busco?"
    } },
  { letra: 'N', nombre: 'Nutrir y cerrar', evaluable: true,
    idea: 'Cada respuesta termina con una pregunta de avance. Nunca deja la próxima jugada en manos del cliente.',
    pregunta: '¿Termina con un próximo paso concreto?',
    mal: '"Cualquier consulta, avisame."',
    bien: '"¿Te lo reservo para el jueves?"',
    detalle: {
          porQue: "Si la respuesta termina informando, la próxima jugada queda en manos del cliente, y muchas veces no la hace. Una pregunta concreta de avance mantiene viva la conversación.",
          revisa: [
                "Cierres pasivos: “cualquier consulta avisame”, “quedo a disposición”, “saludos”.",
                "Respuestas que terminan informando, sin pedir nada.",
                "Un “no tenemos” sin alternativa.",
                "Derivar sin decir a quién ni en cuánto tiempo."
          ],
          arreglo: [
                "Terminá con una pregunta que invite a decidir: reservar, confirmar, coordinar.",
                "Si la respuesta es no, ofrecé una alternativa.",
                "Si derivás, decí quién responde y cuándo."
          ],
          antes: "Te paso el presupuesto en pdf. Cualquier consulta avisame.",
          despues: "Te paso el presupuesto: total $45.000, válido por 48 hs. ¿Querés que te lo reserve?"
    } },
  { letra: '+', nombre: 'Optimización continua', evaluable: false,
    idea: 'Reparto de carga entre bot y asesores. Se mide en tus chats, no en un texto.',
    pregunta: '¿El trabajo está bien repartido entre el bot y las personas?',
    mal: 'Una sola asesora atiende 9 de cada 10 chats.',
    bien: 'El bot resuelve lo repetitivo y deriva lo que necesita criterio.',
    detalle: {
          porQue: "Si una sola persona concentra la mayoría de los chats, la atención depende de ella: se satura, se equivoca y, si falta un día, las ventas se frenan.",
          mide: [
                "Cuánto trabajo resuelve el bot y cuánto cada asesor.",
                "Por qué motivos se deriva a una persona.",
                "Cuáles de esas derivaciones se podrían automatizar."
          ],
          arreglo: [
                "Automatizá las consultas repetitivas.",
                "Derivá a una persona solo lo que necesita criterio.",
                "Repartí la carga entre asesores."
          ]
    } },
];

const SALTO = '[---saltomensaje---]';

const RE_SALUDO_INICIAL = /^\s*[¡!]*\s*(hola|buen[oa]s?(\s+(d[ií]as?|tardes?|noches?))?)([\s,.!¡]+buen[oa]s?(\s+(d[ií]as?|tardes?|noches?))?)?\b[\s,.!¡]*/i;
const RE_CORTESIA = /^[¿\s]*(c[oó]mo (est[aá]s|and[aá]s|va|le va|te va)|todo bien)[?!.\s]*$/i;
const RE_OPCION_MENU = /^\s*(\d{1,2}\s*[-.)️⃣]|[1-9]\ufe0f?\u20e3|[a-e]\))\s*\S/i;
const RE_INSTRUCCION_MENU = /(\b(escrib[ií]|respond[eé]|marc[aá]|eleg[ií]|seleccion[aá]|digit[aá]|presion[aá])(\s|$|[.,:!])|opci[oó]n|ingres[aá] el n)/i;
// Encabezado que pide datos: la lista numerada que sigue son campos, no un menú.
const RE_PIDE_DATOS = /(pasame|pas[aá]nos|decime|dec[ií]nos|envi[aá]nos|envianos|indic[aá](me|nos)|necesito|necesitamos|contame|cont[aá]nos|complet[aá]|respond[eé](me|nos)|mand[aá](me|nos)|adjunt[aá])/i;
// Menú en una sola línea: "Elegí una opción: 1. Ventas 2. Envíos 3. Pagos".
const RE_MENU_EN_LINEA = /(?:^|\s)1\s*[.)-]\s*\S.*?\s2\s*[.)-]\s*\S/;
const RE_ESCRIBI_MENU = /(escrib[ií]|envi[aá]|mand[aá]|tip[eé]a)\s+(la palabra\s+)?["'«*]?(men[uú]|inicio|volver|opciones)\b/i;
const RE_PASIVO = /(nos comunicaremos|a la brevedad|en breve (te|le) (respond|contact|escrib)|cualquier (otra )?(duda|consulta)|quedo a (tu|su|vuestra) disposici|quedamos a (tu|su) disposici|av[ií]same|nos avis[aá]s|me avis[aá]s|espero tu respuesta|saludos( cordiales)?|muchas gracias|gracias por (tu|su) consulta)/i;
const RE_BUROCRATICO = /(estimad[oa]s?\s+(cliente|usuari|afiliad|client)|su (consulta|solicitud) (ha sido|fue) (recibida|registrada)|a la brevedad|nos comunicaremos con usted|le informamos que|sr\.?\/?a?\.? cliente)/i;
const RE_CIERRE_PROPIO = /(confirm|reserv|coordin|agend|se[ñn][aá]|abon|avan[cz]|quer[eé]s que|te gustar[ií]a|te parece( bien)? (si|que)|emit|activ[aeo]|te (lo )?guard|te (lo )?separ|lo (armo|preparo|envio|mando|cargamos|cargo|ingreso|ingresamos|gestiono|gestionamos|tramito|resuelvo|resolvemos))/i;

/** Si un texto cumple el pilar N: pregunta de compromiso o pedido de acción. */
function esCierreActivo(t) {
  const n = sinTildes(t).replace(/[*_\s]+$/, '');
  return (/\?$/.test(n) && RE_CIERRE_PROPIO.test(n)) || RE_CTA.test(n);
}
// Cierre imperativo: pide una acción concreta aunque no lleve signo de pregunta.
const RE_CTA = /(envi[aá]nos|envianos|adjunt[aá](nos|me)?\b|pasame|pas[aá]nos|decime|dec[ií]nos|contame|cont[aá]nos|respond[eé]nos|apenas (me|nos) (pas|envi|mand)|con (estos|esos) datos|reserv[aá]|confirm[aá]me)/i;
const RE_CAMPO_LISTA = /^\s*(\d{1,2}\s*[.)-]|•|-)\s*.+[:?]\**\s*$/;
const RE_VOCATIVO = /^estimad[oa]s?(\s+(cliente|client[ea]s?|afiliad[oa]s?|usuari[oa]s?|soci[oa]s?|paciente|alumn[oa]s?|se[ñn]or[a]?))?\s*,?\s*/i;

// Hallazgos que no dependen del contexto.
const RE_NEGATIVA = /\bno (tenemos|hay|trabajamos|hacemos|realizamos|vendemos|es posible|contamos con|corresponde|llegamos|queda|quedan|disponemos|podemos)\b|\bsin stock\b|\bno se puede\b/i;
const RE_DERIVACION = /\b(te |lo |la |los |le )?(derivo|derivamos|(te|le) paso con|(te|le) comunico con|comunicate (con|al)|llam[aá] al|escrib[ií] (a|al)|dirigite|acercate a|consult[aá] (con|en) (el|la))\b/i;
const RE_PLAZO = /(\d+\s*(hs|horas?|min|minutos|d[ií]as?)|\bhoy\b|ma[ñn]ana|en el d[ií]a|\{PLAZO\})/i;
const RE_ADJUNTO = /(\bpdf\b|adjunt|te (paso|mando|env[ií]o|dejo) (el|la|los) (presupuesto|cotizaci|cat[aá]logo|lista)|\[document\])/i;
const RE_PRECIO_DADO = /(\$\s?\d|\d+\s?(pesos|usd|u\$s|d[oó]lares)|\$\{PRECIO|\{PRECIO\}|\{TOTAL\})/i;
const RE_USTED = /\b(usted|le (informo|comento|paso|env[ií]o|aviso|confirmo|va a)|su (pedido|consulta|solicitud|reclamo|turno|orden|factura|cuenta|compra))\b/i;
const RE_VOS = /\b(ten[eé]s|pod[eé]s|quer[eé]s|necesit[aá]s|vos|contame|pasame|decime|fijate|mir[aá])\b/i;
// El cliente pide algo (y no solo lo menciona: "espero otros presupuestos").
const RE_PEDIDO = /(\?|quisiera|queria|quer[ií]a|necesito|me (pasas|pas[aá]s|podr[ií]as|dir[ií]as|dec[ií]s|mand[aá]s)|consulto|consulta|saber|poneme|pasame|cotizame|mandame|decime|avisame|podr[ií]an)/i;
const RE_RECONOCE = /(disculp|lament|perd[oó]n|entiendo|ten[eé]s raz[oó]n|ya (lo |te )?(reviso|verifico|chequeo|consulto)|vamos a resolver|qu[eé] macana)/i;

// Fórmulas con su equivalente directo. Reemplazo literal y acotado: el taller
// no reescribe frases libres. "usted" → "vos" NO está: rompe la conjugación
// ("vos tiene"). Ese cambio queda para la IA, vía el prompt exportado.
// El tercer valor marca los que pasan a tuteo: no se aplican si la respuesta
// trata de "usted", para no dejarla con los dos tratos mezclados.
const REEMPLAZOS_TONO = [
  [/su (consulta|solicitud|pedido|reclamo) (ha sido|fue) (recibid[oa]|registrad[oa])/i, (m, q) => `recibimos tu ${q.toLowerCase()}`, true],
  [/le informamos que\s*/i, '', false],
  [/\ble (informo|comento|paso|env[ií]o|aviso|confirmo|va a)\b/gi, (m, v) => `te ${v}`, true],
  [/\bsu (pedido|consulta|solicitud|reclamo|turno|orden|factura|cuenta|compra)\b/gi, (m, s) => `tu ${s}`, true],
];

// Ortografía frecuente en chats. Solo palabras sin ambigüedad ("esta", "mas"
// o "si" pueden ir con o sin tilde según el sentido, así que no se tocan).
const ACENTOS = {
  direccion: 'dirección', envio: 'envío', envios: 'envíos', telefono: 'teléfono', numero: 'número',
  informacion: 'información', tambien: 'también', dias: 'días', medico: 'médico', medica: 'médica',
  codigo: 'código', ubicacion: 'ubicación', cotizacion: 'cotización', autorizacion: 'autorización',
  facturacion: 'facturación', practica: 'práctica', credito: 'crédito', debito: 'débito',
  tenes: 'tenés', podes: 'podés', queres: 'querés', necesitas: 'necesitás', sabes: 'sabés',
  aca: 'acá', despues: 'después', rapido: 'rápido', unico: 'único', pagina: 'página', camion: 'camión',
  operacion: 'operación', solucion: 'solución', atencion: 'atención', opcion: 'opción', opciones: 'opciones',
  tmb: 'también', xq: 'porque', pq: 'porque',
};
const RE_INTERROGATIVA_SIN_TILDE = /^(a |de |para |en |por |con |y )?(que|cual|cuales|cuanto|cuanta|cuantos|cuantas|cuando|donde|como)\b/i;
const TILDE_INTERROGATIVA = { que: 'qué', cual: 'cuál', cuales: 'cuáles', cuanto: 'cuánto', cuanta: 'cuánta',
  cuantos: 'cuántos', cuantas: 'cuántas', cuando: 'cuándo', donde: 'dónde', como: 'cómo' };

/**
 * Qué está pidiendo el cliente. `cliente` se busca en su mensaje, `respuesta`
 * en la del asesor cuando no hay contexto; `plantilla` elige las plantillas
 * del rubro pertinentes; `respondida` dice si la respuesta la atiende;
 * `marcador` es lo que se sugiere agregar si no la atiende.
 */
const INTENCIONES = {
  reclamo: { etiqueta: '⚠️ Reclamo',
    cliente: /(reclamo|queja|no (me )?(llego|llega|funciona|anda|responde|contestan)|todavia no (recib|me lleg|tengo|me (dieron|respond|contest))|nadie (me )?(responde|atiende)|(tengo|hay) un problema|roto|fallad|(tanta|mucha|esta) demora|hace \d+ (dias|horas|semanas) que|mal atend|es una verguenza|sigo esperando)/,
    // Sin "fcr": cerrar un reclamo abierto preguntando "¿quedó resuelto?" es lo contrario de lo que pide.
    plantilla: /(triaje|soporte|cambios|devolu|demora|siniestro|cancelacion|postventa)/,
    campos: ['Número de pedido, trámite o reclamo', '¿Desde cuándo está pasando?'],
    cierre: '¿Me pasás esos datos así lo resuelvo ahora?' },
  tramite: { etiqueta: '📄 Trámite',
    cliente: /(autoriza|orden medica|receta|reintegro|cobertura|credencial|tramite|inscrip|requisito|documentacion|siniestro|choque|tasaci|baja del plan|alta del plan)/,
    plantilla: /(autoriz|tramite|reintegro|receta|credencial|inscripcion|requisito|siniestro|tasacion|onboarding)/,
    campos: ['Número de DNI o de cliente'],
    cierre: 'Apenas me pases eso, lo ingreso hoy mismo.' },
  pago: { etiqueta: '💳 Pago',
    cliente: /(\bpag(o|ar|ue|ar)\b|abon|transfer|\balias\b|\bcbu\b|cuotas|tarjeta|efectivo|factura|comprobante)/,
    respuesta: /(\balias\b|\bcbu\b|transfer|efectivo|tarjeta|cuotas|mercado ?pago|link de pago|\{ALIAS\})/,
    plantilla: /(pago|cobr|factur|cierre_corralon|cuota)/,
    marcador: '💳 *Medios de pago:* {MEDIOS_DE_PAGO}',
    campos: ['¿Qué medio de pago vas a usar?'],
    cierre: '¿Te paso los datos para que lo confirmes hoy?' },
  turno: { etiqueta: '📅 Turno / reserva',
    cliente: /(turno|\bcita\b|agendar|reserv|visita|test drive|\bdemo\b)/,
    respuesta: /(turno|agenda|disponib|horario|\d{1,2}(:\d{2})?\s*(hs|h\b)|lunes|martes|miercoles|jueves|viernes|sabado|\{DIAS)/,
    plantilla: /(turno|reserva|agenda|visita|demo|taller|cita)/,
    marcador: '📅 *Próximos turnos disponibles:* {DIAS_Y_HORARIOS}',
    campos: ['¿Qué día y horario te queda cómodo?'],
    cierre: '¿Te reservo el primer turno disponible?' },
  envio: { etiqueta: '🚚 Envío',
    cliente: /(envio|envian|flete|entrega|llegan a|mandan|delivery|despach|retiro|retirar)/,
    respuesta: /(envio|flete|entrega|zona|direccion|despach|delivery|retir|\{COSTO_ENVIO)/,
    plantilla: /(envio|flete|logistic|despacho|delivery)/,
    marcador: '🚚 *Envío:* {COSTO_ENVIO} · {PLAZO_ENTREGA}',
    campos: ['Dirección o zona de entrega', '¿Para qué día lo necesitás?'],
    cierre: '¿Coordinamos la entrega?' },
  precio: { etiqueta: '💰 Precio / presupuesto',
    cliente: /(precio|cuanto (sale|salen|cuesta|cuestan|esta|vale|seria|me sale|queda)|\bvalor|cotiz|presupuest|tarifa|arancel|\bcosto)/,
    respuesta: /(\$\s?\d|\d+\s?(pesos|usd)|precio|valor|cotiz|presupuest|\{PRECIO|\{TOTAL)/,
    plantilla: /(presupuest|cotiz|precio|tarifa|arancel|ficha|catalogo|aridos|hierro|paquete|carrera|unidad|producto|loteo|carta)/,
    marcador: '💰 *{PRODUCTO}:* ${PRECIO}',
    campos: ['¿Qué necesitás cotizar, exactamente?', '¿Qué cantidad necesitás?', '¿Para cuándo lo necesitás?'],
    cierre: '¿Querés que te lo reserve?' },
  stock: { etiqueta: '📦 Stock',
    cliente: /(\bstock\b|disponib|\b(tienen|tenes|tendran|hay|les queda|manejan|venden)\s+(?!que\b|problema|drama|chance|algun|alguna|forma|manera|posibilidad|tarjeta|opcion|novedad|lugar|turno)[a-z]{3,}[^?]*\?)/,
    respuesta: /(\bsi\b|tenemos|\bhay\b|stock|disponib|no (hay|tenemos|queda)|ingres|llega|\{DISPONIBILIDAD)/,
    plantilla: /(stock|disponib|producto|repuesto|aridos|hierro|unidad|habitacion)/,
    marcador: '📦 *Disponibilidad:* {DISPONIBILIDAD}',
    campos: ['¿Qué cantidad necesitás?', '¿Para qué día lo necesitás?'],
    cierre: '¿Te lo separo?' },
  horario: { etiqueta: '🕘 Horario / ubicación',
    cliente: /(horario|a que hora|abren|cierran|atienden|donde (estan|quedan|queda)|direccion del local|sucursal)/,
    respuesta: /(\d{1,2}(:\d{2})?\s*(a|hs|h\b)|lunes|sabado|direccion|calle|\bav\b|sucursal|\{HORARIO)/,
    plantilla: null,
    marcador: '🕘 *Horario:* {HORARIO} · 📍 {DIRECCION_LOCAL}' },
  seguimiento: { etiqueta: '🔁 Seguimiento',
    cliente: null,
    respuesta: /(pudiste (ver|revisar)|te escribo (por|para)|retom|segu[ií]s interesad|como (te fue|quedaste)|te consulto si)/,
    plantilla: /(rescate|seguimiento|reactiv)/ },
};
const ORDEN_INTENCIONES = ['reclamo', 'tramite', 'pago', 'turno', 'precio', 'envio', 'stock', 'horario', 'seguimiento'];

/** Tipos de dato: cómo aparecen en el mensaje del cliente y cómo se preguntan. */
const UNIDADES = 'barras?|bolsas?|bolsones?|m3|m2|m²|metros?|mts?|unidades?|kg|kilos?|litros?|cajas?|' +
  'packs?|pallets?|camionadas?|placas?|rollos?|chapas?|personas?|noches?|cubiertos?';

const DATOS = {
  // La zona va antes que la dirección: si el cliente dijo "Pilar", preguntar
  // "¿en qué zona?" sobra, pero pedir la calle y la altura sigue haciendo falta.
  zona: { nombre: 'zona',
    // El lugar suele venir de costado: "para una obra en Pilar", "me lo traen
    // a Moreno?", "estoy en Villa Luzuriaga", "soy de zona sur".
    enCliente: /(?:vivo en|estoy en|soy de|obra (?:es |est[aá] |queda )?en|(?:traen|llevan|mandan|env[ií]an|entregan)(?:\s+\w+){0,2}\s+a|barrio|zona)\s*([^.,;\n?¿!]{3,40})/i,
    enPregunta: /(direcci[oó]n aproximada|\bzona\b|barrio|localidad|a d[oó]nde|d[oó]nde (ser[ií]a|es la obra|lo (env|mand|entreg)))/i,
    confirmar: v => `¿Te lo enviamos a ${v}?` },
  direccion: { nombre: 'dirección',
    enCliente: /(?:mi direcci[oó]n (?:es|queda)|direcci[oó]n:?|domicilio:?|entregar en|entrega en|\bcalle\b|\bav\.|avenida)\s*([^.,;\n?¿!]{3,40})/i,
    enPregunta: /(direcci[oó]n (?!aproximada)|domicilio|calle y altura|altura|d[oó]nde (entregamos|descargamos))/i,
    confirmar: v => `¿Te lo enviamos a ${v}?` },
  cantidad: { nombre: 'cantidad',
    // Con unidad ("20 bolsas") o sin ella ("necesito 20"): el cliente ya dijo
    // cuánto, y volver a preguntarlo suena a que no se leyó el mensaje.
    enCliente: new RegExp(`\\b(\\d+(?:[.,]\\d+)?\\s*(?:${UNIDADES}))\\b` +
      // Sin unidad, la cantidad se reconoce por el verbo: "necesito 20".
      `|\\b(?:necesito|necesitar[ií]a|quiero|querr[ií]a|llevo|preciso|comprar[ií]a|ser[ií]an?|son|me llevo)\\s+(\\d+(?:[.,]\\d+)?)(?!\\s*(?:${UNIDADES}|%|hs\\b|horas|am\\b|pm\\b|:|\\/))`, 'i'),
    enPregunta: /(cu[aá]nt[oa]s\b|qu[eé] cantidad|\bcantidad\b)/i,
    confirmar: v => `¿Confirmamos ${v}?` },
  dni: { nombre: 'DNI',
    enCliente: /\b(?:dni|documento|cuit|cuil)\D{0,12}(\d[\d.]{6,12})|^\s*(\d{2}\.?\d{3}\.?\d{3})\b/i,
    enPregunta: /(\bdni\b|documento|\bcuit\b|\bcuil\b)/i,
    confirmar: null },
  afiliado: { nombre: 'número de afiliado',
    enCliente: /(?:afiliad[oa]|credencial|socio)\D{0,15}(\d{5,})/i,
    enPregunta: /(n[uú]mero de (afiliad|socio)|credencial)/i,
    confirmar: null },
  fecha: { nombre: 'día',
    enCliente: /\b(pasado ma[ñn]ana|ma[ñn]ana|(?:el )?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|\d{1,2}\/\d{1,2}|esta semana|la semana que viene)\b/i,
    enPregunta: /(qu[eé] d[ií]a|para cu[aá]ndo|\bfecha\b)/i,
    confirmar: v => `¿Lo coordinamos para ${v}?` },
  pago: { nombre: 'forma de pago',
    enCliente: /\b(transferencia|efectivo|tarjeta de (?:d[eé]bito|cr[eé]dito)|d[eé]bito|mercado ?pago|en cuotas)\b/i,
    enPregunta: /(c[oó]mo .{0,25}(abon|pag)|forma de pago|medio de pago)/i,
    confirmar: v => `¿Lo abonás con ${v}?` },
  producto: { nombre: 'producto',
    // "precio de 20 bolsas de cemento con envío" → "cemento"; "cuánto sale el plan familiar" → "plan familiar"
    enCliente: /(?:precio|presupuesto|cotizaci[oó]n|cotizar|necesito|quiero|busco|tienen|ten[eé]s|cu[aá]nto (?:sale|salen|cuesta|cuestan|est[aá]))\s+(?:de\s+|del\s+|el\s+|la\s+|los\s+|las\s+|un[ao]?s?\s+)?(?:\d+\s+[a-záéíóúñ]+\s+de\s+)?((?!(?:precio|presupuesto|info|informaci[oó]n|saber|consultar|hacer|un|una)\b)[a-záéíóúñ][a-záéíóúñ0-9 ]{2,28}?)(?=\s+(?:con|para|a|y|en|que|por)\b|[?,.!\n]|$)/i,
    enPregunta: /(\blista\b|material|producto|pieza|repuesto|modelo|especialidad|\btalle|\bmedida|cotizar|qu[eé] precio)/i,
    confirmar: null },
};

function sinTildes(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function recortar(t, n) {
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * Separa lo que el cliente pegó en respuestas.
 * Si hay líneas `---`, esas son las divisiones (permite respuestas con párrafos).
 * Si no, cada bloque separado por una línea en blanco es una respuesta.
 */
function separarRespuestas(texto) {
  const limpio = String(texto || '').replace(/\r/g, '').trim();
  if (!limpio) return [];
  const partes = /^\s*-{3,}\s*$/m.test(limpio)
    ? limpio.split(/^\s*-{3,}\s*$/m)
    : limpio.split(/\n\s*\n/);
  return partes.map(p => p.trim()).filter(Boolean);
}

/**
 * Separa el mensaje del cliente (líneas "Cliente: …" o "> …") de la respuesta
 * del asesor. El prefijo "Asesor:" es opcional y se descarta.
 */
function separarContexto(texto) {
  const cliente = [], respuesta = [];
  String(texto || '').replace(/\r/g, '').split('\n').forEach(l => {
    const c = l.match(/^\s*(?:cliente|cli|c)\s*[:>]\s?(.*)$/i) || l.match(/^\s*>\s?(.*)$/);
    if (c) cliente.push(c[1]);
    else respuesta.push(l.replace(/^\s*(?:asesor|asesora|operador|operadora)\s*:\s?/i, ''));
  });
  return { cliente: cliente.join('\n').trim(), respuesta: respuesta.join('\n').trim() };
}

function conContexto(cliente, respuesta) {
  return cliente ? cliente.split('\n').map(l => `Cliente: ${l}`).join('\n') + '\n' + respuesta : respuesta;
}

/** Frases de una línea, cortando después de . ! ? sin perder el signo. */
function frases(linea) {
  return linea.split(/(?<=[.!?])\s+(?=\S)/).map(s => s.trim()).filter(Boolean);
}

/**
 * Parte "depende la zona, a qué dirección lo solicitaba?" en la parte
 * informativa y la pregunta, para que cada una vaya a su bloque.
 */
function separarPregunta(frase) {
  const i = frase.search(/,\s*(¿\s*)?(a )?(qu[eé]|cu[aá]l|cu[aá]nt|cu[aá]ndo|d[oó]nde|c[oó]mo|para qu[eé]|me pas|pasame|ten[eé]s|necesit|quer[eé]s|pod[eé]s)/i);
  if (i > 0 && /\?\s*$/.test(frase)) {
    return { info: frase.slice(0, i).trim(), pregunta: frase.slice(i + 1).trim() };
  }
  return null;
}

function esPregunta(frase) {
  return /\?\s*$/.test(frase) || /^¿/.test(frase);
}

/** Corrige tildes sin ambigüedad y mayúsculas sostenidas. Devuelve {texto, cambio}. */
function corregir(t) {
  let texto = t;
  const letras = texto.replace(/[^a-záéíóúñ]/gi, '');
  if (letras.length > 15 && letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letras.length > 0.7) {
    texto = capitalizar(texto.toLowerCase());
  }
  texto = texto.replace(/[A-Za-zñÑ]+/g, w => {
    const c = ACENTOS[w.toLowerCase()];
    if (!c) return w;
    return w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? capitalizar(c) : c;
  });
  return { texto, cambio: sinTildes(texto) !== sinTildes(t) || texto !== t };
}

function normalizarPregunta(p) {
  let q = p.replace(/^[¿\s]+/, '').replace(/[?\s]+$/, '').trim();
  q = q.replace(/^(y|e|entonces|bueno|ok|dale)\s*,?\s+/i, '');
  q = q.replace(RE_INTERROGATIVA_SIN_TILDE, (m, prep, w) => (prep || '') + TILDE_INTERROGATIVA[w.toLowerCase()]);
  return '¿' + capitalizar(q) + '?';
}

/**
 * Quita lo que no es contenido: la firma del operador que agregan algunas
 * plataformas ("^Laura M."), emojis de viñeta al inicio y el formato de
 * WhatsApp que envuelve la línea (*negrita*, _cursiva_).
 */
function limpiarLinea(cruda) {
  return String(cruda)
    .replace(/\s*\^[^\n^]{1,30}$/, '')
    .trim()
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '')
    .replace(/^[*_~]+(?=\S)|(?<=\S)[*_~]+$/g, '')
    .trim();
}

function formatearMonto(v) {
  const limpio = v.replace(/[.,]$/, '');
  return /^\d{4,}$/.test(limpio) ? limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : limpio;
}

/**
 * "cemento avellaneda $6260 holcim $6500" → dos ítems con etiqueta y monto.
 * Devuelve null si hay menos de dos precios. `resto` es lo que sigue al último.
 */
function extraerPrecios(frase) {
  const montos = [...frase.matchAll(/\$\s?(\d[\d.,]*)/g)];
  if (montos.length < 2) return null;
  const items = [];
  let desde = 0;
  for (const m of montos) {
    let etiqueta = frase.slice(desde, m.index);
    for (let i = 0; i < 3; i++) {
      etiqueta = etiqueta.replace(/^[\s,;:|/-]+|[\s:=,;-]+$/g, '')
        .replace(/^(y|e|tengo|tenemos|esta|está|sale|salen|cuesta|el|la|los|las|a|en)\s+/i, '')
        .replace(/\s+(a|en|sale|salen|esta|está|cuesta|por|de)$/i, '');
    }
    items.push({ etiqueta: capitalizar(etiqueta.trim()), monto: formatearMonto(m[1]) });
    desde = m.index + m[0].length;
  }
  return { items, cabeza: frase.slice(0, desde), resto: frase.slice(desde).replace(/^[\s,;.]+/, '').trim() };
}

/** Descompone una respuesta en piezas clasificadas. `original` guarda el texto de entrada. */
function desarmar(texto) {
  const piezas = [];
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  let primera = true;
  const tratoUsted = /\busted(es)?\b/i.test(texto);

  // Menú escrito en una línea: se separa en la instrucción y una línea por opción.
  for (let i = 0; i < lineas.length; i++) {
    const l = limpiarLinea(lineas[i]);
    if (RE_MENU_EN_LINEA.test(l) && RE_INSTRUCCION_MENU.test(l)) {
      const partes = l.split(/\s(?=\d{1,2}\s*[.)-]\s*\S)/);
      lineas.splice(i, 1, ...partes);
      i += partes.length - 1;
    }
  }
  // Líneas numeradas que siguen a "decime:" / "pasame:" son datos a pedir.
  const esCampo = new Set();
  let bajoPedido = false;
  lineas.forEach((cruda, i) => {
    const l = limpiarLinea(cruda);
    if (!l) return;
    if (/:\s*\**$/.test(l) && RE_PIDE_DATOS.test(l)) { bajoPedido = true; return; }
    if (bajoPedido && /^(\d{1,2}\s*[.)-]|•|-)\s*\S/.test(l)) { esCampo.add(i); return; }
    bajoPedido = false;
  });
  const hayOpciones = lineas.filter((l, i) => !esCampo.has(i) && RE_OPCION_MENU.test(limpiarLinea(l)) && !RE_CAMPO_LISTA.test(limpiarLinea(l))).length >= 2;

  for (const [indice, cruda] of lineas.entries()) {
    const linea = limpiarLinea(cruda);
    if (!linea || cruda.trim() === SALTO) continue;

    if (RE_CAMPO_LISTA.test(linea) || esCampo.has(indice)) {
      const t = linea.replace(/^\s*(\d{1,2}\s*[.)-]|•|-)\s*/, '').replace(/\*/g, '').trim();
      piezas.push({ tipo: 'pregunta', texto: t, original: t, campo: true });
      primera = false;
      continue;
    }
    if (hayOpciones && RE_OPCION_MENU.test(linea)) {
      const t = linea.replace(RE_OPCION_MENU, m => m.slice(-1)).trim();
      piezas.push({ tipo: 'opcion', texto: t, original: t });
      primera = false;
      continue;
    }

    const pendientes = frases(linea);
    while (pendientes.length) {
      let f = pendientes.shift();
      const original = f;
      if (primera && RE_VOCATIVO.test(f) && /^estimad/i.test(f)) {
        f = f.replace(RE_VOCATIVO, '');
        piezas.push({ tipo: 'vocativo', texto: '' });
        if (!f) continue;
      }
      if (primera) {
        const saludo = f.match(RE_SALUDO_INICIAL);
        if (saludo) {
          piezas.push({ tipo: 'saludo', texto: saludo[0].trim() });
          f = f.slice(saludo[0].length).trim();
        }
        primera = false;
        if (!f) continue;
      }
      if (/^estimad/i.test(f)) {
        f = capitalizar(f.replace(RE_VOCATIVO, ''));
        piezas.push({ tipo: 'vocativo', texto: '' });
      }
      let retocada = false;
      for (const [re, por, tuteo] of REEMPLAZOS_TONO) {
        if (tratoUsted && tuteo) continue;
        re.lastIndex = 0;   // las regex con /g guardan estado entre llamadas a test()
        if (re.test(f)) { re.lastIndex = 0; f = capitalizar(f.replace(re, por)); retocada = true; }
      }
      if (RE_CORTESIA.test(f)) { piezas.push({ tipo: 'cortesia', texto: f }); continue; }
      if (RE_PASIVO.test(f) && !esPregunta(f)) { piezas.push({ tipo: 'pasivo', texto: f }); continue; }
      if ((hayOpciones && RE_INSTRUCCION_MENU.test(f)) || RE_ESCRIBI_MENU.test(f)) {
        piezas.push({ tipo: 'instruccion_menu', texto: f }); continue;
      }

      const precios = !esPregunta(f) || /\$/.test(f) ? extraerPrecios(f) : null;
      if (precios) {
        piezas.push({ tipo: 'precios', items: precios.items, original: precios.cabeza });
        if (precios.resto) pendientes.unshift(precios.resto);
        continue;
      }

      const partida = separarPregunta(f);
      if (partida) {
        if (partida.info) {
          const c = corregir(partida.info);
          piezas.push({ tipo: 'info', texto: capitalizar(c.texto) + '.', original: partida.info, retocada: retocada || c.cambio });
        }
        f = partida.pregunta;
      }
      if (esPregunta(f)) {
        const c = corregir(f);
        piezas.push({ tipo: RE_CIERRE_PROPIO.test(sinTildes(f)) ? 'cierre' : 'pregunta', texto: c.texto, original });
      } else if (/:\s*$/.test(f) && f.length < 70) {
        piezas.push({ tipo: 'encabezado', texto: corregir(f).texto, original });
      } else {
        const c = corregir(f);
        piezas.push({ tipo: 'info', texto: c.texto, original, retocada: retocada || c.cambio });
      }
    }
  }
  return piezas;
}

/** Líneas de "datos a pedir" de una plantilla del catálogo. */
function camposDePlantilla(plantilla) {
  return String(plantilla.after || '').split('\n')
    .map(l => l.trim())
    .filter(l => !/[{$]/.test(l))
    .filter(l => /^\d+\.\s/.test(l) || (/^•\s/.test(l) && /[:?]\**\s*$/.test(l)))
    .map(l => l.replace(/^(\d+\.|•)\s*/, '').replace(/\*/g, '').replace(/[:.]\s*$/, '').trim())
    // Un dato a pedir no es una oferta ni una explicación después de dos puntos:
    // "Transferencia con 10% OFF" o "Tarjeta: en 3 cuotas" son ejemplos de la
    // plantilla, no preguntas, y sus números no son del negocio. "3 fotos
    // generales" o "Kilometraje (ej. 10.000 km)" sí son datos a pedir.
    .filter(l => l && !/:\s*\S/.test(l) && !/(%|\bOFF\b|cuotas|\$)/i.test(l));
}

const VACIAS = new Set(('de la el los las un una y o a en con para por del al que se tu su mi ' +
  'es lo le te me nos hay mas muy como pero sin sobre este esta ese esa todo toda ' +
  'hola buenos buenas dias tardes noches gracias estas puedo podes ayudar ayudo necesitas queres ' +
  // vocabulario de la propia estructura: si no, el texto reacomodado se parece a
  // plantillas que el original no se parecía
  'avanzar avanzamos pasame solo mensaje datos confirmo proximo').split(' '));

function palabras(t) {
  return sinTildes(t).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !VACIAS.has(w));
}

/**
 * Intenciones de un texto en orden de prioridad (un mensaje puede pedir precio
 * y envío a la vez). `lado` es 'cliente' o 'respuesta'.
 */
function detectarIntenciones(texto, lado = 'cliente') {
  const t = sinTildes(texto);
  if (!t.trim()) return [];
  return ORDEN_INTENCIONES.filter(clave => {
    const re = INTENCIONES[clave][lado] || (lado === 'respuesta' ? INTENCIONES[clave].cliente : null);
    return re && re.test(t);
  });
}

function detectarIntencion(texto, lado = 'cliente') {
  return detectarIntenciones(texto, lado)[0] || null;
}

/** Plantillas del rubro sin duplicados (ventas y soporte comparten varias). */
function plantillasDelRubro(catalogo, rubroKey) {
  const porRubro = catalogo.plantillas[rubroKey] || catalogo.plantillas.servicios_generales;
  const vistas = new Map();
  [...(porRubro.ventas || []), ...(porRubro.soporte || [])].forEach(p => { if (!vistas.has(p.id)) vistas.set(p.id, p); });
  return [...vistas.values()];
}

/**
 * La plantilla del rubro más pertinente. Primero manda la intención (del
 * cliente si hay contexto): una plantilla del mismo tipo de consulta suma 4.
 * Sin intención coincidente hacen falta 3 palabras en común, no 2: con 2
 * aparecían sugerencias de turnos en respuestas que solo decían "hola".
 */
function plantillaMasCercana(texto, catalogo, rubroKey, soloConCampos = false, intenciones = []) {
  const propias = new Set(palabras(texto));
  const lista = (Array.isArray(intenciones) ? intenciones : [intenciones]).filter(Boolean);
  let mejor = null, max = 0;
  for (const p of plantillasDelRubro(catalogo, rubroKey)) {
    if (soloConCampos && camposDePlantilla(p).length < 2) continue;
    const suyas = new Set(palabras(`${p.title} ${p.category} ${p.before} ${p.after}`));
    let n = 0;
    propias.forEach(w => { if (suyas.has(w)) n++; });
    const nombre = sinTildes(`${p.id} ${p.title} ${p.category}`);
    // La intención más prioritaria pesa más que las secundarias.
    const pos = lista.findIndex(k => INTENCIONES[k].plantilla && INTENCIONES[k].plantilla.test(nombre));
    const coincide = pos >= 0;
    const puntaje = n + (coincide ? 4 + Math.max(0, 2 - pos) : 0);
    if (puntaje > max && (coincide || n >= 3)) { max = puntaje; mejor = p; }
  }
  return mejor;
}

/** Detecta el rubro por las keywords del catálogo, igual que el analizador. */
function detectarRubroDeTexto(texto, catalogo) {
  let mejor = 'servicios_generales', max = 0;
  for (const [clave, info] of Object.entries(catalogo.rubros)) {
    let n = 0;
    for (const patron of info.keywords) {
      const m = texto.match(new RegExp(patron, 'gi'));
      if (m) n += m.length;
    }
    if (n > max) { max = n; mejor = clave; }
  }
  return mejor;
}

/** Datos que el cliente ya dio en su mensaje: {tipo: valor}. */
function datosDelCliente(cliente) {
  const out = {};
  if (!cliente) return out;
  for (const [tipo, d] of Object.entries(DATOS)) {
    if (!d.enCliente) continue;
    const m = cliente.match(d.enCliente);
    if (!m) continue;
    // El verbo y la cantidad quedan pegados en algunas capturas ("cotizar 50
    // chapas"): lo que importa es el dato, no cómo lo pidió.
    const valor = (m.slice(1).find(Boolean) || m[0]).trim()
      .replace(/^(?:cotizar|presupuestar|comprar|llevar)\s+/i, '')
      .replace(/[\s.]+$/, '');
    if (valor) out[tipo] = tipo === 'producto' ? valor.replace(/^\d+(?:[.,]\d+)?\s+/, '') : valor;
  }
  return out;
}

/** Cuántos datos distintos pide una pregunta ("¿cuántas bolsas y a qué zona?" = 2). */
function datosEnPregunta(pregunta) {
  const tipos = Object.values(DATOS).filter(d => d.enPregunta.test(pregunta)).length;
  return Math.max(1, tipos);
}

const RE_YA_COTIZA = /(\$\s?\d|\d\s?(pesos|usd|u\$s)\b|(te|les?) (paso|mando|env[ií]o|adjunto|dejo|comparto)\s+(el |la |un |una )?(presupuesto|cotizaci[oó]n|lista de precios|precio))/i;

const RE_POR_UNIDAD = /(\b(la|el|por|cada|x)\s+(bolsa|bols[oó]n|unidad|metro|m2|m3|m²|kilo|kg|litro|caja|barra|placa|rollo|chapa|pallet|pack|docena|par)\b|c\/u|\bxu\b)/i;

/** ¿La respuesta del equipo ya cotiza? (da un precio o manda el presupuesto) */
function yaCotiza(piezas) {
  return piezas.some(p => p.tipo === 'precios' || (typeof p.texto === 'string' && RE_YA_COTIZA.test(p.texto)));
}

function tipoDeDato(pregunta) {
  for (const [tipo, d] of Object.entries(DATOS)) if (d.enPregunta.test(pregunta)) return tipo;
  return null;
}

const RANGO = { falta: 0, mejorable: 1, ok: 2, no_aplica: 3 };

/** Suma un hallazgo al pilar: si es más grave manda; si no, queda como nota. */
function aplicarHallazgo(pilares, h) {
  const actual = pilares[h.pilar];
  if (RANGO[h.estado] < RANGO[actual.estado]) {
    const notas = actual.estado === 'ok' ? [] : [actual.motivo, ...(actual.notas || [])];
    pilares[h.pilar] = { estado: h.estado, motivo: h.motivo, notas };
  } else {
    actual.notas = [...(actual.notas || []), h.motivo];
  }
}

/**
 * Evalúa una respuesta pilar por pilar. Si el texto trae líneas "Cliente:",
 * se usan como contexto.
 * Estado: 'ok' | 'mejorable' | 'falta' | 'no_aplica'.
 */
function evaluar(entrada, catalogo, rubroKey) {
  const { cliente, respuesta: texto } = separarContexto(entrada);
  const piezas = desarmar(texto);
  const cuenta = t => piezas.filter(p => p.tipo === t).length;
  const intencionesCliente = detectarIntenciones(cliente, 'cliente');
  // Sin contexto, la intención sale de la respuesta, pero no de las opciones de
  // un menú: un menú que lista "Envíos" no está hablando de un envío.
  const textoSinMenu = piezas.filter(p => !['opcion', 'instruccion_menu'].includes(p.tipo))
    .map(p => p.original || p.texto || '').join('\n');
  const intenciones = intencionesCliente.length ? intencionesCliente : detectarIntenciones(textoSinMenu, 'respuesta');
  const intencionCliente = intencionesCliente[0] || null;
  const intencion = intenciones[0] || null;
  const base = `${cliente}\n${texto}`;
  const plantilla = plantillaMasCercana(base, catalogo, rubroKey, false, intenciones);
  const plantillaCampos = plantillaMasCercana(base, catalogo, rubroKey, true, intenciones);
  const camposEsperados = plantillaCampos ? camposDePlantilla(plantillaCampos).length : 0;
  const reDescartar = new RegExp(catalogo.muestra_frases.regex_descartar, 'i');
  const conocidos = datosDelCliente(cliente);

  const lineasConContenido = texto.split('\n').map(l => l.trim()).filter(l => l && l !== SALTO);
  const soloSaludo = lineasConContenido.length > 0 && lineasConContenido.every(l => reDescartar.test(sinTildes(l)));
  const datosPedidos = piezas.filter(p => p.tipo === 'pregunta' || p.tipo === 'cierre')
    .reduce((n, p) => n + datosEnPregunta(p.texto), 0);
  const preguntasSueltas = piezas.filter(p => p.tipo === 'pregunta' && !p.campo).length;

  // Preguntas por datos que el cliente ya dio.
  piezas.forEach(p => {
    if (p.tipo !== 'pregunta') return;
    const tipo = tipoDeDato(p.texto);
    if (tipo && conocidos[tipo]) p.redundante = { tipo, valor: conocidos[tipo] };
  });

  const r = {};

  // A — menú de opciones
  if (cuenta('opcion') >= 2 && (cuenta('instruccion_menu') > 0 || RE_INSTRUCCION_MENU.test(texto))) {
    r.A = { estado: 'falta', motivo: `Menú de ${cuenta('opcion')} opciones: el cliente navega antes de poder decir qué necesita.` };
  } else if (cuenta('opcion') >= 2) {
    r.A = { estado: 'mejorable', motivo: 'Lista numerada que se lee como menú. Conviene presentarla como opciones informativas, no como algo a elegir por número.' };
  } else {
    r.A = { estado: 'ok', motivo: 'Sin menú: el cliente puede responder directamente.' };
  }

  // C — bloque único
  const largoSinEstructura = texto.length > 350 && lineasConContenido.length <= 2;
  if (soloSaludo) {
    r.C = { estado: 'falta', motivo: 'Es solo un saludo: gasta un turno entero sin avanzar. El saludo va en la misma burbuja que la respuesta.' };
  } else if (lineasConContenido.length >= 3 && lineasConContenido.every(l => l.length < 60)
             && !lineasConContenido.some(l => /^(•|-|\d+\.|[📋💬👉💰🚚📦🕘📅💳⏱️])/u.test(l)) && datosPedidos <= 1 && cuenta('opcion') === 0) {
    r.C = { estado: 'mejorable', motivo: `${lineasConContenido.length} líneas cortas que se leen como ráfaga de mensajes sueltos. Van en un solo bloque con estructura.` };
  } else if (piezas.filter(p => p.tipo === 'pregunta').reduce((n, p) => n + datosEnPregunta(p.texto), 0) === 1 && camposEsperados >= 2) {
    r.C = { estado: 'mejorable', motivo: `Pide un solo dato cuando para esta consulta hacen falta ${camposEsperados}: habrá que volver a preguntar en el próximo turno.` };
  } else if (largoSinEstructura) {
    r.C = { estado: 'mejorable', motivo: 'Párrafo largo sin estructura: en el celular se saltea. Separalo en bloques y viñetas.' };
  } else {
    r.C = { estado: 'ok', motivo: 'Resuelve en un solo bloque.' };
  }

  // T y + — no se evalúan en un texto
  r.T = { estado: 'no_aplica', motivo: 'Se mide con los tiempos reales de tus chats.' };
  r['+'] = { estado: 'no_aplica', motivo: 'Se mide con el reparto bot/asesores de tus chats.' };

  // U — datos que califican
  if (datosPedidos >= 2) {
    r.U = { estado: 'ok', motivo: `Pide ${datosPedidos} datos en el mismo turno.` };
  } else if (datosPedidos === 1) {
    r.U = { estado: 'mejorable', motivo: 'Pide un único dato: alcanza para seguir hablando, no para saber qué tan cerca de comprar está.' };
  } else {
    r.U = { estado: 'falta', motivo: 'No pide ningún dato: no hay forma de saber qué necesita ni cuánto le urge.' };
  }

  // E — tono
  if (RE_BUROCRATICO.test(texto) || /\busted\b/i.test(texto)) {
    r.E = { estado: 'mejorable', motivo: 'Fórmulas de mesa de entradas ("estimado cliente", "a la brevedad"): suena a expediente, no a una persona.' };
  } else if (/\{\s*nombre\s*\}/i.test(texto)) {
    r.E = { estado: 'ok', motivo: 'Usa el nombre del cliente.' };
  } else {
    r.E = { estado: 'ok', motivo: 'Tono directo, de persona a persona.' };
  }

  // N — cierre activo
  const ultimaPieza = [...piezas].reverse().find(p => p.tipo !== 'saludo');
  if (!ultimaPieza) {
    r.N = { estado: 'falta', motivo: 'No termina con ninguna acción.' };
  } else if (ultimaPieza.tipo === 'pasivo') {
    r.N = { estado: 'falta', motivo: `Cierre pasivo ("${recortar(ultimaPieza.texto, 40)}"): deja la próxima jugada en manos del cliente.` };
  } else if (ultimaPieza.tipo === 'cierre' || (ultimaPieza.tipo === 'info' && RE_CTA.test(sinTildes(ultimaPieza.texto)))) {
    // Solo una pregunta de avance o un pedido de acción cuentan. Una frase
    // informativa con "abonar" o "confirmado" adentro no es un cierre.
    r.N = { estado: 'ok', motivo: 'Termina con una pregunta que hace avanzar la venta.' };
  } else if (ultimaPieza.tipo === 'pregunta') {
    r.N = { estado: 'mejorable', motivo: 'Termina con una pregunta, pero de relevamiento: pide un dato, no un compromiso.' };
  } else {
    r.N = { estado: 'falta', motivo: 'Termina informando. Sin una pregunta de avance, la conversación se enfría ahí.' };
  }

  // --- Hallazgos finos -----------------------------------------------------
  const hallazgos = [];
  const agregar = (id, pilar, estado, motivo) => hallazgos.push({ id, pilar, estado, motivo });
  const tieneAccion = datosPedidos > 0 || piezas.some(p => p.tipo === 'info' && RE_CTA.test(sinTildes(p.texto)));

  if (RE_ESCRIBI_MENU.test(texto)) {
    agregar('menu_palabra', 'A', 'mejorable', 'Pide escribir una palabra clave ("MENÚ", "INICIO") para seguir: es un menú disfrazado.');
  }
  if (RE_ADJUNTO.test(texto) && !RE_PRECIO_DADO.test(texto)) {
    agregar('adjunto_mudo', 'C', 'mejorable', 'Manda el adjunto sin resumirlo: en el celular muchos no lo abren y el total queda escondido. El número clave va en el chat.');
  }
  if (preguntasSueltas >= 3) {
    agregar('preguntas_sueltas', 'C', 'mejorable', `${preguntasSueltas} preguntas sueltas en el texto: el cliente contesta una y se olvida del resto. Van en lista numerada.`);
  }
  piezas.filter(p => p.redundante).forEach(p => {
    agregar('dato_repetido', 'C', 'mejorable', `Pregunta ${DATOS[p.redundante.tipo].nombre} cuando el cliente ya lo dijo ("${recortar(p.redundante.valor, 30)}"): suena a que no se leyó el mensaje.`);
  });
  if (RE_NEGATIVA.test(texto) && !tieneAccion) {
    agregar('callejon', 'N', 'falta', 'Dice que no y no ofrece alternativa ni siguiente paso: la conversación muere ahí.');
  }
  if (RE_DERIVACION.test(texto) && !RE_PLAZO.test(texto)) {
    agregar('derivacion', 'N', 'mejorable', 'Deriva sin plazo ni seguimiento: el cliente no sabe quién le responde ni cuándo.');
  }
  const letras = texto.replace(/[^a-záéíóúñ]/gi, '');
  if (letras.length > 15 && letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letras.length > 0.7) {
    agregar('mayusculas', 'E', 'mejorable', 'Escrito en mayúsculas sostenidas: en WhatsApp se lee como un grito.');
  }
  if (RE_USTED.test(texto) && RE_VOS.test(texto)) {
    agregar('usted_vos', 'E', 'mejorable', 'Mezcla "usted" y "vos" en la misma respuesta: elegí un trato y sostenelo.');
  }
  if (intencionCliente === 'reclamo' && !RE_RECONOCE.test(texto)) {
    agregar('reclamo_frio', 'E', 'mejorable', 'El cliente está reclamando y la respuesta no reconoce el problema antes de pedir o informar.');
  }
  const ignoradas = (RE_PEDIDO.test(cliente) ? intencionesCliente.slice(0, 2) : []).filter(clave => {
    const def = INTENCIONES[clave];
    if (!def.respuesta) return false;
    const atendida = def.respuesta.test(sinTildes(texto)) || (clave === 'precio' && RE_PRECIO_DADO.test(texto));
    const pideLoNecesario = piezas.some(p => p.tipo === 'pregunta' && ['cantidad', 'producto', 'direccion'].includes(tipoDeDato(p.texto)));
    return !atendida && !(clave === 'precio' && pideLoNecesario);
  });
  ignoradas.forEach(clave => {
    const grave = clave === 'precio';
    agregar('intencion_ignorada', 'U', grave ? 'falta' : 'mejorable',
      grave
        ? 'El cliente preguntó un precio y la respuesta no lo da ni pide lo necesario para cotizar.'
        : `El cliente consultó por ${INTENCIONES[clave].etiqueta.replace(/^\S+\s/, '').toLowerCase()} y la respuesta no lo contesta.`);
  });
  hallazgos.forEach(h => aplicarHallazgo(r, h));

  const evaluables = PILARES.filter(p => p.evaluable).map(p => p.letra);
  const puntos = evaluables.reduce((s, l) => s + (r[l].estado === 'ok' ? 1 : r[l].estado === 'mejorable' ? 0.5 : 0), 0);
  return { pilares: r, puntaje: puntos, maximo: evaluables.length, piezas, plantilla, plantillaCampos,
    hallazgos, intencion, intenciones, intencionCliente, ignoradas, cliente, respuesta: texto, conocidos };
}

/**
 * Reacomoda una respuesta en la estructura ACTÚEN+.
 *
 * Devuelve bloques con su origen:
 *   'tuyo'     — palabras del cliente, reordenadas (con `retocada` si se
 *                corrigió ortografía o una fórmula fija)
 *   'metodo'   — conectores de la estructura (saludo, encabezado de datos, salto)
 *   'sugerido' — datos, marcadores o cierre tomados del rubro o del método
 * Los sugeridos se pueden apagar uno por uno en la interfaz.
 */
function reacomodar(entrada, catalogo, rubroKey) {
  const ev = evaluar(entrada, catalogo, rubroKey);
  const { piezas, plantilla, plantillaCampos, hallazgos, intenciones, ignoradas, conocidos } = ev;
  const tiene = id => hallazgos.some(h => h.id === id);
  const bloques = [];

  const saludo = piezas.find(p => p.tipo === 'saludo');
  const cortesia = piezas.find(p => p.tipo === 'cortesia');
  const opciones = piezas.filter(p => p.tipo === 'opcion');
  const preguntas = piezas.filter(p => p.tipo === 'pregunta');
  const cierres = piezas.filter(p => p.tipo === 'cierre');

  bloques.push({ tipo: 'saludo', origen: saludo ? 'tuyo' : 'metodo',
    texto: (saludo ? `👋 ¡${capitalizar(corregir(saludo.texto).texto.replace(/^[¡!\s]+|[\s,.!¡]+$/g, '').replace(/[\s,.!¡]+(?=buen)/i, ', '))}!` : '👋 ¡Hola!')
      + (cortesia ? ` ${normalizarPregunta(cortesia.texto)}` : '') });

  if (tiene('reclamo_frio')) {
    bloques.push({ tipo: 'info', origen: 'sugerido', texto: 'Entiendo, y lamento el inconveniente. Ya lo estoy revisando.' });
  }

  // Información propia en el orden original: frases y listas de precios.
  piezas.forEach(p => {
    if (p.tipo === 'info') {
      bloques.push({ tipo: 'info', origen: 'tuyo', retocada: !!p.retocada, texto: capitalizar(p.texto) });
    } else if (p.tipo === 'precios') {
      bloques.push({ tipo: 'precios', origen: 'tuyo', retocada: true,
        texto: p.items.map(i => `• ${i.etiqueta ? `*${i.etiqueta}:* ` : ''}$${i.monto}`).join('\n') });
    }
  });

  // Si la consulta del cliente quedó sin contestar, un marcador para completar.
  ignoradas.filter(k => INTENCIONES[k].marcador).forEach(k => {
    bloques.push({ tipo: 'info', origen: 'sugerido', texto: INTENCIONES[k].marcador });
  });
  if (tiene('adjunto_mudo')) {
    bloques.push({ tipo: 'info', origen: 'sugerido', texto: '📋 *Resumen:* total ${TOTAL} · válido hasta {VIGENCIA}' });
  }
  if (tiene('derivacion')) {
    bloques.push({ tipo: 'info', origen: 'sugerido', texto: '⏱️ Te contactan dentro de {PLAZO}. Si no pasa, escribime por acá y lo sigo yo.' });
  }

  // Un menú se convierte en ejemplos de lo que el cliente puede pedir, sin números.
  if (opciones.length) {
    bloques.push({ tipo: 'encabezado_opciones', origen: 'metodo', texto: '💬 *Contame en un solo mensaje qué necesitás. Por ejemplo:*' });
    bloques.push({ tipo: 'opciones', origen: 'tuyo',
      texto: opciones.map(o => `• ${capitalizar(o.texto)}`).join('\n') });
  }

  // Datos a pedir: los del asesor (confirmando los que el cliente ya dio),
  // después los del rubro que no repitan ni pidan algo ya conocido.
  const campos = [];
  preguntas.forEach(p => {
    if (p.redundante) {
      const confirmar = DATOS[p.redundante.tipo].confirmar;
      if (confirmar) campos.push({ origen: 'metodo', texto: confirmar(p.redundante.valor), tipoDato: p.redundante.tipo });
      return;
    }
    campos.push({ origen: 'tuyo', texto: p.campo ? p.texto.replace(/[:\s]+$/, '') : normalizarPregunta(p.texto),
      tipoDato: tipoDeDato(p.texto) });
  });
  // Candidatos: primero los de la plantilla del rubro; si no alcanzan, los
  // genéricos de cada intención detectada.
  const deIntencion = intenciones.flatMap(k => INTENCIONES[k].campos || []);
  const dePlantilla = plantillaCampos ? camposDePlantilla(plantillaCampos) : [];
  // En un reclamo primero va lo que permite ubicar el caso, no los requisitos de un trámite nuevo.
  const candidatos = intenciones[0] === 'reclamo' ? [...deIntencion, ...dePlantilla] : [...dePlantilla, ...deIntencion];
  const tipos = new Set([...campos.map(c => c.tipoDato), ...Object.keys(conocidos)].filter(Boolean));
  // Si la respuesta ya da un precio o manda el presupuesto, el producto se sabe:
  // preguntar "¿qué necesitás cotizar?" después de cotizar suena a no leer lo propio.
  if (yaCotiza(piezas)) tipos.add('producto');
  // "¿Qué cantidad?" solo tiene sentido si el precio es por unidad (la bolsa,
  // el metro, c/u); para una consulta o un plan mensual suena fuera de lugar.
  const textoPropio = piezas.map(p => p.texto || '').join(' ');
  if (yaCotiza(piezas) && !RE_POR_UNIDAD.test(textoPropio) && !intenciones.includes('stock')) tipos.add('cantidad');
  const yaPedido = new Set(campos.flatMap(c => palabras(c.texto)));
  // Si la respuesta dice que no hay envíos, no se pide dónde entregar.
  const sinEnvios = /\bno\s+(hacemos|realizamos|tenemos)\s+(env[ií]os?|entregas?|delivery)|\bno\s+enviamos\b/i.test(textoPropio);
  for (const c of candidatos) {
    if (campos.length >= 4 || (!plantillaCampos && campos.length >= 3)) break;
    if (sinEnvios && /(entrega|env[ií]o|recibe en obra|direcci[oó]n)/i.test(c)) continue;
    const t = tipoDeDato(c);
    if ((t && tipos.has(t)) || palabras(c).some(w => yaPedido.has(w))) continue;
    campos.push({ origen: 'sugerido', texto: c.replace(/:$/, '') });
    if (t) tipos.add(t);
    palabras(c).forEach(w => yaPedido.add(w));
  }
  const encabezadoPropio = piezas.find(p => p.tipo === 'encabezado');
  if (campos.length) {
    bloques.push(encabezadoPropio
      ? { tipo: 'encabezado', origen: 'tuyo', texto: `📋 *${capitalizar(encabezadoPropio.texto.replace(/[\s:]+$/, ''))}:*` }
      : { tipo: 'encabezado', origen: 'metodo', texto: '📋 *Para avanzar, pasame en un solo mensaje:*' });
    campos.forEach(c => bloques.push({ tipo: 'campo', origen: c.origen, texto: c.texto }));
  }

  bloques.push({ tipo: 'salto', origen: 'metodo', texto: SALTO });

  // Un cierre de plantilla que pide algo que el cliente ya dio no sirve.
  const pideConocido = t => Object.keys(conocidos).some(k => DATOS[k].enPregunta.test(t));
  const cierreIntencion = intenciones.map(k => INTENCIONES[k].cierre).find(c => c && esCierreActivo(c));
  if (cierres.length) {
    bloques.push({ tipo: 'cierre', origen: 'tuyo', texto: `👉 *${normalizarPregunta(cierres[cierres.length - 1].texto)}*` });
  } else if (tiene('callejon')) {
    bloques.push({ tipo: 'cierre', origen: 'sugerido', texto: '👉 *¿Querés que te ofrezca una alternativa que sí tengamos?*' });
  } else if (plantilla && plantilla.tipping_point && esCierreActivo(plantilla.tipping_point) && !pideConocido(plantilla.tipping_point)
             && !(intenciones[0] === 'reclamo' && !INTENCIONES.reclamo.plantilla.test(sinTildes(plantilla.id)))) {
    bloques.push({ tipo: 'cierre', origen: 'sugerido', texto: `👉 *${plantilla.tipping_point}*` });
  } else if (cierreIntencion) {
    bloques.push({ tipo: 'cierre', origen: 'sugerido', texto: `👉 *${cierreIntencion}*` });
  } else {
    bloques.push({ tipo: 'cierre', origen: 'sugerido',
      texto: campos.length
        ? '👉 *Con esos datos te confirmo todo en el próximo mensaje. ¿Avanzamos?*'
        : '👉 *¿Querés que avancemos con esto?*' });
  }

  return { bloques, plantilla, plantillaCampos, evaluacion: ev };
}

/** Texto final para copiar, respetando qué sugerencias quedaron activas. */
function componerTexto(bloques, apagados = new Set()) {
  const activos = bloques.filter((b, i) => !apagados.has(i));
  const hayCampos = activos.some(b => b.tipo === 'campo');
  let texto = '';
  let n = 0;
  let previo = null;
  for (const b of activos) {
    if (b.tipo === 'encabezado' && !hayCampos) continue;   // encabezado sin datos debajo
    let linea = b.texto;
    if (b.tipo === 'campo') linea = `${++n}. ${/\?$/.test(b.texto) ? b.texto : b.texto + ':'}`;
    // Los campos van pegados al encabezado y entre sí; la información contigua, junta.
    const infoContigua = ['info', 'precios'].includes(b.tipo) && ['info', 'precios'].includes(previo);
    const pegado = b.tipo === 'campo' || infoContigua || b.tipo === 'opciones';
    texto += texto ? (pegado ? '\n' : '\n\n') + linea : linea;
    previo = b.tipo;
  }
  return texto;
}

// --------------------------------------------------------------------------
// Prompt para IA
// --------------------------------------------------------------------------

/**
 * Tapa datos personales antes de que el texto salga del equipo: emails, CBU,
 * teléfonos, DNI/CUIT y firmas de operador. Los montos con $ se respetan.
 */
function anonimizar(texto) {
  return String(texto || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]')
    .replace(/\b\d{22}\b/g, '[CBU]')
    .replace(/(?<![$\d.,])\+?\d[\d\s-]{8,}\d\b/g, '[TELÉFONO]')
    .replace(/(?<![$\d.,]\s?)\b\d{2}\.?\d{3}\.?\d{3}\b/g, '[DNI]')
    .replace(/\b\d{2}-\d{8}-\d\b/g, '[CUIT]')
    .replace(/\s*\^[^\n^]{1,30}$/gm, ' [FIRMA]')
    .replace(/\b(soy|me llamo|mi nombre es|habla|te habla)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?/g, '$1 [NOMBRE]')
    // Calle y altura: "calle Belgrano 1450", "Av. San Martín 230", "Belgrano 1450".
    // Tapa de más a propósito ("Plan 300" también cae): mejor que dejar un domicilio.
    .replace(/\b(calle|av\.?|avenida|pasaje|ruta|barrio)\s+[^\n,.;?!]{2,30}?\s\d{1,5}\b/gi, '[DIRECCIÓN]')
    .replace(/(?<![$\d])\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?\s\d{2,5}\b/g, '[DIRECCIÓN]');
}

function contextoDelRubro(catalogo, rubroKey) {
  const r = catalogo.rubros[rubroKey] || catalogo.rubros.servicios_generales;
  const cautivo = r.tipo_cliente === 'cautivo';
  return [
    `- Rubro: ${r.name}.`,
    r.description ? `- Descripción: ${r.description}` : null,
    `- Tipo de cliente: ${cautivo
      ? 'cautivo (tiene contrato, plan o ciclo; una mala atención no produce una baja inmediata, pero erosiona la renovación)'
      : 'transaccional (compara y compra donde le respondan primero y mejor)'}.`,
    `- Foco habitual: ${r.default_focus === 'soporte' ? 'soporte y resolución' : 'ventas'}.`,
    r.sla ? `- Tiempo ideal de primera respuesta: ${r.sla.ideal_immediate} min. ${r.sla.benchmark_text || ''}` : null,
  ].filter(Boolean).join('\n');
}

const REGLAS_PROMPT = `- No inventes precios, stock, plazos, políticas, direcciones ni nombres. Donde falte un dato real, dejá un marcador entre llaves: {PRECIO}, {PLAZO}, {DIRECCION_LOCAL}, etc.
- Los datos reales que ya están en la respuesta (precios, plazos, horarios, cantidades) se conservan tal cual: los marcadores son solo para lo que falta, nunca para tapar un dato que el negocio ya dio.
- Lo que la respuesta ya le dice al cliente también se conserva, con tus palabras: que se le manda el presupuesto o un adjunto, lo que el negocio NO hace, los medios de pago, los días y los links.
- Español rioplatense con voseo, cercano y profesional. Nada de "estimado cliente", "a la brevedad" ni "quedo a disposición".
- Formato WhatsApp: *negrita* para lo clave, viñetas • para información, lista numerada para los datos a pedir. Como máximo 2 o 3 emojis y solo si ordenan.
- Un solo bloque. Si hace falta separar la información del cierre, usá una única vez la marca [---saltomensaje---] en su propia línea.
- Pedí en este mismo turno todos los datos necesarios para avanzar, sin repetir lo que el cliente ya dijo.
- Respondé primero lo que el cliente preguntó.
- Terminá siempre con una pregunta de avance o un pedido de acción concreto. Nunca con "cualquier consulta avisame".
- Si la respuesta es un "no", ofrecé una alternativa o un siguiente paso. Si derivás, decí a quién y en cuánto tiempo.
- Máximo 700 caracteres por burbuja.`;

function textoPilares() {
  return PILARES.map(p => `- ${p.letra} — ${p.nombre}: ${p.idea}`).join('\n');
}

function diagnosticoTexto(ev) {
  return PILARES.filter(p => p.evaluable).map(p => {
    const e = ev.pilares[p.letra];
    const marca = { ok: 'OK', mejorable: 'MEJORABLE', falta: 'FALTA' }[e.estado];
    const notas = (e.notas || []).length ? ` (además: ${e.notas.join(' ')})` : '';
    return `- ${p.letra} [${marca}] ${e.motivo}${notas}`;
  }).join('\n');
}

/** Prompt para que el asesor mejore UNA respuesta con su IA. */
function generarPromptRespuesta(entrada, catalogo, rubroKey, opciones = {}) {
  const { apagados = new Set(), ocultarDatos = true } = opciones;
  const limpiar = ocultarDatos ? anonimizar : t => t;
  const { bloques, plantilla, plantillaCampos, evaluacion: ev } = reacomodar(entrada, catalogo, rubroKey);
  const borrador = componerTexto(bloques, apagados);
  const referencia = plantillaCampos || plantilla;

  return `# Rol
Sos especialista en atención y ventas por WhatsApp y aplicás el Método ACTÚEN+ de Spoter. Tu tarea es reescribir una respuesta rápida de un asesor.

# Contexto del negocio
${contextoDelRubro(catalogo, rubroKey)}

# Método ACTÚEN+
${textoPilares()}

# Reglas
${REGLAS_PROMPT}

# Mensaje del cliente
${ev.cliente ? limpiar(ev.cliente) : '(No se indicó. Es una respuesta rápida genérica: redactala para que sirva en la situación más común.)'}${ev.intencion ? `\nIntención detectada: ${INTENCIONES[ev.intencion].etiqueta.replace(/^\S+\s/, '')}.` : ''}

# Respuesta actual del asesor
"""
${limpiar(ev.respuesta)}
"""

# Diagnóstico automático (reglas del taller, puntaje ${ev.puntaje} de ${ev.maximo})
${limpiar(diagnosticoTexto(ev))}

# Borrador reacomodado por el taller (punto de partida, mejoralo)
"""
${limpiar(borrador)}
"""
${referencia ? `
# Referencia de estilo del rubro: "${referencia.title}" (${referencia.shortcut})
"""
${referencia.after}
"""
` : ''}
# Qué devolver
1. **Respuesta final**, lista para pegar en WhatsApp.
2. **Versión corta** (menos de 300 caracteres) para cuando el cliente viene apurado.
3. **Qué cambiaste**: una línea por pilar A, C, U, E y N.
4. **Marcadores a completar** antes de enviar, con una línea sobre qué va en cada uno.`;
}

/** Prompt para que el negocio arme su biblioteca completa de respuestas rápidas. */
function generarPromptBiblioteca(respuestas, catalogo, rubroKey, opciones = {}) {
  const { ocultarDatos = true } = opciones;
  const limpiar = ocultarDatos ? anonimizar : t => t;
  const cubiertas = new Set();
  const secciones = respuestas.map((entrada, i) => {
    const { bloques, plantilla, plantillaCampos, evaluacion: ev } = reacomodar(entrada, catalogo, rubroKey);
    [plantilla, plantillaCampos].filter(Boolean).forEach(p => cubiertas.add(p.id));
    return `## Respuesta ${i + 1}${ev.intencion ? ` — ${INTENCIONES[ev.intencion].etiqueta.replace(/^\S+\s/, '')}` : ''}
${ev.cliente ? `Mensaje del cliente: ${limpiar(ev.cliente)}\n` : ''}Actual:
"""
${limpiar(ev.respuesta)}
"""
Diagnóstico (${ev.puntaje}/${ev.maximo}):
${limpiar(diagnosticoTexto(ev))}
Borrador del taller:
"""
${limpiar(componerTexto(bloques))}
"""`;
  }).join('\n\n');

  const faltantes = plantillasDelRubro(catalogo, rubroKey).filter(p => !cubiertas.has(p.id));

  return `# Rol
Sos especialista en atención y ventas por WhatsApp y aplicás el Método ACTÚEN+ de Spoter. Vas a convertir las respuestas rápidas de un negocio en una biblioteca ordenada, lista para cargar como atajos.

# Contexto del negocio
${contextoDelRubro(catalogo, rubroKey)}

# Método ACTÚEN+
${textoPilares()}

# Reglas para cada respuesta
${REGLAS_PROMPT}

# Respuestas actuales del equipo (${respuestas.length})
Cada una trae el diagnóstico automático y un borrador reacomodado como punto de partida.

${secciones}
${faltantes.length ? `
# Situaciones frecuentes del rubro que no aparecen en la lista
${faltantes.map(p => `- ${p.title} (${p.shortcut}): ${p.key_benefit || p.category}`).join('\n')}
` : ''}
# Qué devolver
1. **Tabla resumen** con: atajo (/nombre corto), situación en la que se usa, pilar que más mejora.
2. **Cada respuesta final**, con su atajo como título, lista para pegar. Si dos respuestas cubren la misma situación, unificalas y aclaralo.
3. ${faltantes.length ? '**Respuestas nuevas** para las situaciones frecuentes que faltan, con el mismo formato.' : '**Situaciones que conviene sumar** a la biblioteca, si detectás alguna.'}
4. **Marcadores a completar** por el negocio ({PRECIO}, {PLAZO}, etc.), agrupados, con qué va en cada uno.
5. **Tres reglas de uso** para el equipo, en una línea cada una.`;
}

// --------------------------------------------------------------------------
// Resumen del lote y atajos
// --------------------------------------------------------------------------

const ETIQUETA_HALLAZGO = {
  intencion_ignorada: 'No contesta lo que preguntó el cliente',
  dato_repetido: 'Pregunta datos que el cliente ya dio',
  adjunto_mudo: 'Manda PDF sin el número clave en el chat',
  callejon: 'Dice que no sin ofrecer alternativa',
  derivacion: 'Deriva sin decir quién ni cuándo',
  reclamo_frio: 'Contesta reclamos sin reconocer el problema',
  mayusculas: 'Escribe en mayúsculas sostenidas',
  usted_vos: 'Mezcla "usted" y "vos"',
  preguntas_sueltas: 'Hace preguntas sueltas en vez de una lista',
  menu_palabra: 'Pide escribir una palabra clave para seguir',
};

/**
 * Qué pilar conviene trabajar primero con el equipo. Un "falta" pesa el doble
 * que un "mejorable": es lo que más turnos y ventas cuesta.
 */
function resumenLote(respuestas, catalogo, rubroKey) {
  const evaluables = PILARES.filter(p => p.evaluable).map(p => p.letra);
  const porPilar = Object.fromEntries(evaluables.map(l => [l, { falta: 0, mejorable: 0, ok: 0 }]));
  const hallazgos = {};
  let antes = 0, despues = 0;

  respuestas.forEach(entrada => {
    const { bloques, evaluacion: ev } = reacomodar(entrada, catalogo, rubroKey);
    const final = evaluar(conContexto(ev.cliente, componerTexto(bloques)), catalogo, rubroKey);
    antes += ev.puntaje;
    despues += final.puntaje;
    evaluables.forEach(l => { porPilar[l][ev.pilares[l].estado]++; });
    new Set(ev.hallazgos.map(h => h.id)).forEach(id => { hallazgos[id] = (hallazgos[id] || 0) + 1; });
  });

  const n = respuestas.length;
  const peso = l => porPilar[l].falta * 2 + porPilar[l].mejorable;
  const prioridad = evaluables.slice().sort((a, b) => peso(b) - peso(a))[0];
  return {
    n,
    antes: n ? antes / n : 0,
    despues: n ? despues / n : 0,
    porPilar,
    prioridad: peso(prioridad) > 0 ? prioridad : null,
    hallazgos: Object.entries(hallazgos).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, veces]) => ({ id, veces, etiqueta: ETIQUETA_HALLAZGO[id] || id })),
  };
}

const ATAJO_POR_INTENCION = { precio: '/precio', stock: '/stock', envio: '/envio', pago: '/pago', turno: '/turno',
  tramite: '/tramite', reclamo: '/reclamo', horario: '/horario', seguimiento: '/seguimiento' };

/** Nombre de atajo propuesto: el de la plantilla del rubro, o el de la intención. */
function sugerirAtajo(evaluacion, plantilla) {
  if (plantilla && plantilla.shortcut) return plantilla.shortcut;
  return ATAJO_POR_INTENCION[evaluacion.intencion] || '/respuesta';
}

function tituloDeRespuesta(evaluacion) {
  if (evaluacion.intencion) return INTENCIONES[evaluacion.intencion].etiqueta.replace(/^\S+\s/, '');
  const t = evaluacion.respuesta.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? t.slice(0, 47) + '…' : t;
}

/**
 * Qué bloque sugerido ilustra cada pilar: lo que el reacomodo agregó para
 * cubrirlo. Así la mejora se muestra con el texto concreto y no en abstracto.
 */
const BLOQUE_POR_PILAR = { C: ['info'], U: ['campo'], N: ['cierre'] };

/**
 * De los arreglos que enseña el pilar, el que habla de lo que falló: el que más
 * palabras comparte con el diagnóstico (el motivo y sus notas). Sin
 * coincidencias, el primero, que es el arreglo principal del pilar.
 */
function arregloQueAplica(pilar, diagnostico) {
  const clave = new Set(palabras(diagnostico));
  let mejor = pilar.detalle.arreglo[0];
  let puntos = 0;
  pilar.detalle.arreglo.forEach(a => {
    const n = palabras(a).filter(w => clave.has(w)).length;
    if (n > puntos) { puntos = n; mejor = a; }
  });
  return mejor;
}

/** Tres cosas por vez. Una lista más larga no se corrige, se abandona. */
const TOPE_MEJORAS = 3;

/**
 * Qué conviene corregir en UNA respuesta, ordenado por gravedad: primero lo que
 * falta, después lo mejorable. El motivo que ya escribió `evaluar` se parte en
 * título (qué está mal) y por qué importa.
 */
function mejorasDe(evaluacion, bloques = []) {
  const ejemploDe = letra => {
    const tipos = BLOQUE_POR_PILAR[letra] || [];
    return bloques.filter(b => b.origen === 'sugerido' && tipos.includes(b.tipo))
      .map(b => (b.tipo === 'campo' ? `\u2022 ${b.texto}` : b.texto)).join('\n');
  };
  return PILARES.filter(p => p.evaluable)
    .map(p => ({ p, e: evaluacion.pilares[p.letra] }))
    .filter(({ e }) => e.estado === 'falta' || e.estado === 'mejorable')
    .sort((a, b) => RANGO[a.e.estado] - RANGO[b.e.estado])
    .slice(0, TOPE_MEJORAS)
    .map(({ p, e }) => {
      const corte = e.motivo.indexOf(': ');
      return {
        pilar: p.letra,
        nombre: p.nombre,
        estado: e.estado,
        titulo: corte > 0 ? e.motivo.slice(0, corte) : e.motivo,
        porQue: corte > 0 ? e.motivo.slice(corte + 2) : '',
        arreglo: arregloQueAplica(p, [e.motivo, ...(e.notas || [])].join(' ')),
        notas: e.notas || [],
        ejemplo: ejemploDe(p.letra),
      };
    });
}

/** Una línea que dice cómo salió, nombrando lo primero que hay que arreglar. */
function titularDeDiagnostico(mejoras) {
  if (!mejoras.length) return 'Está lista para usar: cumple todos los pilares que se pueden revisar en un texto.';
  const resto = mejoras.length - 1;
  return `Lo más importante: ${mejoras[0].titulo}${resto ? ` \u2014 y ${resto} más` : ''}.`;
}

if (typeof module !== 'undefined') {
  module.exports = { PILARES, resumenLote, mejorasDe, titularDeDiagnostico, sugerirAtajo, tituloDeRespuesta, ETIQUETA_HALLAZGO, INTENCIONES, DATOS, separarRespuestas, separarContexto, conContexto, desarmar, evaluar,
    reacomodar, componerTexto, camposDePlantilla, plantillaMasCercana, detectarRubroDeTexto, detectarIntencion, detectarIntenciones,
    datosDelCliente, anonimizar, esCierreActivo, generarPromptRespuesta, generarPromptBiblioteca, extraerPrecios, corregir };
}

// ==========================================================================
// INTERFAZ
// ==========================================================================

if (typeof document !== 'undefined') {
  /**
   * Casos listos para pegar, uno por situación típica. Enseñan el formato por
   * imitación: se ve el "Cliente:", la respuesta del equipo y el separador ---
   * sin tener que leer las instrucciones.
   */
  const CASOS = {
    cotizacion: {
      etiqueta: '💰 Cotización de un producto',
      texto: 'Cliente: hola, cuanto sale la bolsa de cemento? necesito 20 para una obra en Pilar\nBuenos dias! te paso el presupuesto en pdf. cualquier consulta avisame.',
    },
    renovacion: {
      etiqueta: '🔁 Renovación de un servicio',
      texto: 'Cliente: me llego el aviso de vencimiento, que tengo que hacer?\nHola! si, vence este mes. Te paso con administracion asi te informan.',
    },
    reclamo: {
      etiqueta: '😠 Reclamo de un cliente enojado',
      texto: 'Cliente: hace 10 dias que espero la autorizacion y nadie me responde\nEstimado cliente, su solicitud ha sido recibida. Nos comunicaremos a la brevedad.',
    },
    envio: {
      etiqueta: '🚚 Consulta de envío',
      texto: 'Cliente: hacen envios a Moreno?\nsi hacemos, depende la zona. a que direccion?',
    },
  };

  const EJEMPLOS = {
    construccion_corralon: [
      'Cliente: hola, necesito precio de 20 bolsas de cemento con envio a calle Belgrano 1450\nBuenos dias!\ncemento avellaneda $6260 holcim $6500\ndepende la zona, a que direccion lo solicitaba?',
      'Hola, te paso el presupuesto en pdf. Cualquier consulta avisame.',
      'Cliente: tienen hierro del 12?\nNO TENEMOS DEL 12 POR AHORA',
      'Gracias por comunicarte. Elegí una opción:\n1. Ventas\n2. Envíos\n3. Pagos\nRespondé con el número.',
    ].join('\n---\n'),
    salud_obra_social: [
      'Cliente: hace 10 dias que espero la autorizacion y nadie me responde\nEstimado afiliado, su solicitud ha sido recibida. Nos comunicaremos a la brevedad.',
      'Hola! para el turno que especialidad necesitas?',
      'Cliente: cuanto sale el plan familiar?\nLe paso con el sector comercial que le va a informar.',
    ].join('\n---\n'),
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let catalogo = null;
  let estado = { respuestas: [], rubro: null };
  // 'wizard' = una respuesta por vez (lo que se ve al entrar); 'lote' = el panel
  // plegado de abajo, para revisar varias juntas y armar la biblioteca.
  let modo = 'wizard';
  const CLAVE_BORRADOR = 'spoter_taller_borrador';
  const CLAVE_GUIA = 'spoter_taller_guia_vista';

  /**
   * La guía de primera vez: qué pegar y de dónde sacarlo. Se muestra solo si
   * el taller está vacío y nunca se cerró; apenas hay texto, sobra.
   */
  function mostrarGuiaSiHaceFalta() {
    let vista = null;
    try { vista = localStorage.getItem(CLAVE_GUIA); } catch (e) { /* sin almacenamiento */ }
    $('tlGuia').hidden = !!vista || !!$('tlRespuesta').value.trim() || !!$('entrada').value.trim();
  }

  function ocultarGuia() {
    $('tlGuia').hidden = true;
    try { localStorage.setItem(CLAVE_GUIA, '1'); } catch (e) { /* sin almacenamiento */ }
  }
  const CLAVE_IMPORTACION = 'spoter_taller_importacion';

  // El borrador vive solo en este navegador: si no hay almacenamiento
  // (ventana privada, bloqueo), el taller funciona igual sin guardar.
  function guardarBorrador() {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        texto: $('entrada').value, rubro: $('rubro').value,
        cliente: $('tlCliente').value, respuesta: $('tlRespuesta').value,
      }));
    } catch (e) { /* sin almacenamiento */ }
  }
  function leerJson(clave) {
    try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: `${tipo};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function aplicarTema() {
    let tema = null;
    try { tema = localStorage.getItem('spoter_actuen_theme'); } catch (e) { /* sin almacenamiento */ }
    if (!tema) tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', tema);
    const btn = $('btnTheme');
    btn.textContent = tema === 'dark' ? '🌙' : '☀️';
    btn.onclick = () => {
      const sig = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', sig);
      try { localStorage.setItem('spoter_actuen_theme', sig); } catch (e) { /* sin almacenamiento */ }
      btn.textContent = sig === 'dark' ? '🌙' : '☀️';
    };
  }

  function renderPilares() {
    const tarjeta = p => `
      <article class="tl-pilar" id="pilar-${p.letra === '+' ? 'mas' : p.letra}" data-letra="${esc(p.letra)}">
        <header class="tl-pilar-head">
          <span class="tl-letra">${esc(p.letra)}</span>
          <strong>${esc(p.nombre)}</strong>
        </header>
        <p class="tl-pilar-pregunta">${esc(p.pregunta)}</p>
        <p class="tl-ej tl-ej--mal"><span aria-label="Mal">✗</span>${esc(p.mal)}</p>
        <p class="tl-ej tl-ej--bien"><span aria-label="Bien">✓</span>${esc(p.bien)}</p>
        <button type="button" class="tl-pilar-mas" data-letra="${esc(p.letra)}">${p.evaluable ? 'Ver cómo se revisa' : 'Ver cómo se mide'} →</button>
      </article>`;
    $('pilaresMetodo').innerHTML = PILARES.filter(p => p.evaluable).map(tarjeta).join('');
    $('pilaresChats').innerHTML = PILARES.filter(p => !p.evaluable).map(tarjeta).join('');
  }

  // --- Panel de detalle de cada pilar -------------------------------------
  let letraAbierta = null;

  function abrirPilar(letra) {
    const i = PILARES.findIndex(p => p.letra === letra);
    const p = PILARES[i];
    const d = p.detalle;
    letraAbierta = letra;
    const lista = items => `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const anterior = PILARES[(i + PILARES.length - 1) % PILARES.length];
    const siguiente = PILARES[(i + 1) % PILARES.length];

    $('pilarDialogoContenido').innerHTML = `
      <header class="tl-dlg-head">
        <span class="tl-letra tl-letra--grande">${esc(p.letra)}</span>
        <div>
          <p class="tl-dlg-sub">${p.evaluable ? 'Se revisa en el texto' : 'Se mide en tus chats'} · pilar ${i + 1} de ${PILARES.length}</p>
          <h3 id="pilarDialogoTitulo">${esc(p.nombre)}</h3>
          <p class="tl-dlg-pregunta">${esc(p.pregunta)}</p>
        </div>
      </header>
      <section><h4>Por qué importa</h4><p>${esc(d.porQue)}</p></section>
      ${p.evaluable
        ? `<section><h4>Qué revisa el taller</h4>${lista(d.revisa)}</section>`
        : `<section><h4>Qué mide el Analizador</h4>${lista(d.mide)}
             <p class="tl-dlg-nota">No se puede juzgar desde un texto suelto. <a href="index.html">Abrí el Analizador</a> con tus chats exportados.</p></section>`}
      <section><h4>Cómo mejorarlo</h4>${lista(d.arreglo)}</section>
      ${d.antes ? `
      <section><h4>Antes y después</h4>
        <div class="tl-dlg-ab">
          <div><span class="tl-dlg-tag tl-dlg-tag--mal">✗ Antes</span><pre>${esc(d.antes)}</pre></div>
          <div><span class="tl-dlg-tag tl-dlg-tag--bien">✓ Después</span><pre>${esc(d.despues)}</pre></div>
        </div>
        <button type="button" class="btn btn-primary tl-dlg-probar" data-letra="${esc(p.letra)}">▶ Probar el “antes” en el taller</button>
      </section>` : ''}
      <nav class="tl-dlg-nav">
        <button type="button" class="btn btn-secondary" data-ir="${esc(anterior.letra)}">← ${esc(anterior.letra)} · ${esc(anterior.nombre)}</button>
        <button type="button" class="btn btn-secondary" data-ir="${esc(siguiente.letra)}">${esc(siguiente.letra)} · ${esc(siguiente.nombre)} →</button>
      </nav>`;
    const dlg = $('pilarDialogo');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  function probarEjemplo(letra) {
    const p = PILARES.find(x => x.letra === letra);
    $('pilarDialogo').close();
    $('entrada').value = p.detalle.antes;
    $('rubro').value = 'construccion_corralon';
    $('avisoImportacion').hidden = true;
    renderResultados();
    guardarBorrador();
    const card = document.querySelector('.tl-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function iniciarDialogo() {
    const dlg = $('pilarDialogo');
    document.querySelector('.tl-teoria').addEventListener('click', ev => {
      const card = ev.target.closest('.tl-pilar');
      if (card && !ev.target.closest('a')) abrirPilar(card.dataset.letra);
    });
    dlg.addEventListener('click', ev => {
      if (ev.target === dlg) { dlg.close(); return; }          // clic en el fondo
      const ir = ev.target.closest('[data-ir]');
      if (ir) abrirPilar(ir.dataset.ir);
      const probar = ev.target.closest('.tl-dlg-probar');
      if (probar) probarEjemplo(probar.dataset.letra);
    });
    $('pilarDialogoCerrar').addEventListener('click', () => dlg.close());
    dlg.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        const i = PILARES.findIndex(p => p.letra === letraAbierta);
        const j = (i + (ev.key === 'ArrowRight' ? 1 : PILARES.length - 1)) % PILARES.length;
        abrirPilar(PILARES[j].letra);
      }
    });
    // La sigla de arriba también abre el panel.
    document.querySelectorAll('.tl-sigla a').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      abrirPilar(a.querySelector('b').textContent.replace('Ú', 'U'));
    }));
  }

  const ICONO = { ok: '✅', mejorable: '🟡', falta: '🔴', no_aplica: '⚪' };

  function renderResultados(texto = $('entrada').value) {
    const respuestas = separarRespuestas(texto);
    let rubro = $('rubro').value;
    if (rubro === 'auto') {
      rubro = detectarRubroDeTexto(texto, catalogo);
      $('rubroDetectado').textContent = respuestas.length
        ? `Detectado: ${catalogo.rubros[rubro].icon} ${catalogo.rubros[rubro].name}` : '';
    } else {
      $('rubroDetectado').textContent = '';
    }
    estado = { respuestas, rubro };
    // La capa de IA (taller_ia.js) necesita saber qué texto corresponde a cada
    // tarjeta y con qué rubro se evaluó.
    window.estadoDelTaller = () => estado;
    $('barraPrompt').hidden = modo === 'wizard' || !respuestas.length;
    // Con texto pegado ya se puede mirar el diagnóstico; con resultados en
    // pantalla, lo que queda es copiar.
    if (modo === 'lote') marcarPaso(respuestas.length ? 3 : 1);
    $('promptPreview').hidden = true;
    renderResumen(respuestas, rubro);

    if (!respuestas.length) {
      $('resultados').innerHTML = '<p class="tl-vacio">Pegá una o más respuestas rápidas arriba para ver cómo las acomoda el método.</p>';
      return;
    }

    $('resultados').innerHTML = respuestas.map((r, idx) => {
      const { bloques, plantilla, plantillaCampos, evaluacion: ev } = reacomodar(r, catalogo, rubro);
      const final = evaluar(conContexto(ev.cliente, componerTexto(bloques)), catalogo, rubro);
      const filas = PILARES.map(p => {
        const e = ev.pilares[p.letra];
        const notas = (e.notas || []).map(n => `<span class="tl-eval-nota">${esc(n)}</span>`).join('');
        return `<li class="tl-eval tl-eval--${e.estado}">
          <span class="tl-eval-letra">${esc(p.letra)}</span>
          <span>${ICONO[e.estado]}</span>
          <span>${esc(e.motivo)}${notas}</span></li>`;
      }).join('');
      const bloquesHtml = bloques.map((b, i) =>
        `<div class="tl-bloque tl-bloque--${b.origen} tl-bloque--${b.tipo}" data-i="${i}">` +
        (b.origen === 'sugerido'
          ? `<label class="tl-toggle"><input type="checkbox" checked data-i="${i}"> sugerido</label>` : '') +
        (b.retocada ? '<span class="tl-retoque" title="Se corrigió ortografía, formato o una fórmula fija">✎</span>' : '') +
        `<span class="tl-bloque-texto">${esc(b.tipo === 'campo' ? '• ' + b.texto : b.texto)}</span></div>`
      ).join('');
      const conocidos = Object.entries(ev.conocidos).map(([k, v]) => `${DATOS[k].nombre}: ${v}`).join(' · ');

      return `
      <article class="tl-card" data-resp="${idx}">
        <header class="tl-card-head">
          <h3>Respuesta ${idx + 1}${ev.intencion ? ` <span class="tl-intencion">${esc(INTENCIONES[ev.intencion].etiqueta)}</span>` : ''}</h3>
          <label class="tl-atajo" title="Nombre del atajo al exportar">Atajo
            <input type="text" class="tl-atajo-input" value="${esc(sugerirAtajo(ev, plantillaCampos || plantilla))}" spellcheck="false" aria-label="Nombre del atajo de la respuesta ${idx + 1}">
          </label>
          <span class="tl-score">${fmtPuntaje(ev.puntaje)} → <strong>${fmtPuntaje(final.puntaje)}</strong> / ${ev.maximo} pilares</span>
        </header>
        <div class="tl-grid">
          <div>
            ${ev.cliente ? `<h4>El cliente escribió</h4><pre class="tl-original tl-original--cliente">${esc(ev.cliente)}</pre>
              ${conocidos ? `<p class="tl-nota">Datos que ya dio: ${esc(conocidos)}</p>` : ''}` : ''}
            <h4>Tu versión</h4>
            <pre class="tl-original">${esc(ev.respuesta)}</pre>
            <ul class="tl-evals">${filas}</ul>
          </div>
          <div>
            <h4>Acomodada con ACTÚEN+</h4>
            <div class="tl-vista" role="group" aria-label="Cómo mostrar la respuesta">
              <button type="button" class="tl-vista-btn tl-vista-btn--activo" data-vista="partes">🧩 Por partes</button>
              <button type="button" class="tl-vista-btn" data-vista="chat">💬 Como la ve el cliente</button>
            </div>
            <div class="tl-leyenda">
              <span class="tl-chip tl-chip--tuyo">tus palabras</span>
              <span class="tl-chip tl-chip--metodo">estructura del método</span>
              <span class="tl-chip tl-chip--sugerido">sugerido</span>
            </div>
            <div class="tl-bloques">${bloquesHtml}</div>
            <div class="tl-chat tl-chat--vista" hidden><div class="tl-chat-lienzo"></div></div>
            ${notaPlantillas(plantilla, plantillaCampos)}
            <div class="tl-acciones">
              <button class="btn btn-primary tl-copiar">📋 Copiar respuesta</button>
              <button class="btn btn-secondary tl-prompt" title="Copia un prompt para que el asesor la mejore con su IA">🤖 Prompt para el asesor</button>
            </div>
          </div>
        </div>
      </article>`;
    }).join('');

    // Guardar los bloques de cada tarjeta para copiar con lo que quedó activo.
    $('resultados').querySelectorAll('.tl-card').forEach(card => {
      card._bloques = reacomodar(respuestas[Number(card.dataset.resp)], catalogo, rubro).bloques;
    });
  }

  const LARGO_BURBUJA = 700;

  /**
   * El paso a paso de arriba: dónde está parado el usuario. Sin esto, el taller
   * es una pantalla con muchas cosas y ningún orden evidente.
   */
  function marcarPaso(paso) {
    const lista = $('tlStepper');
    if (!lista) return;
    [...lista.children].forEach(li => {
      const n = Number(li.dataset.paso);
      li.classList.toggle('activo', n === paso);
      li.classList.toggle('hecho', n < paso);
    });
  }

  /** Qué respuesta está tocando el cursor: es la que se previsualiza. */
  function respuestaBajoElCursor(texto, posicion) {
    const partes = separarRespuestas(texto);
    if (partes.length <= 1) return partes[0] || '';
    let recorrido = 0;
    for (const parte of partes) {
      const desde = texto.indexOf(parte, recorrido);
      if (desde < 0) continue;
      recorrido = desde + parte.length;
      if (posicion <= recorrido) return parte;
    }
    return partes[partes.length - 1];
  }

  const negritaWsp = t => esc(t).replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');

  function burbujasHtml(cliente, texto) {
    const burbujas = String(texto || '').split(SALTO).map(t => t.trim()).filter(Boolean);
    return (cliente ? `<div class="tl-burbuja-cliente">${negritaWsp(cliente)}</div>` : '') +
      burbujas.map((b, i) => {
        const larga = b.length > LARGO_BURBUJA;
        return `<div class="tl-burbuja${larga ? ' tl-burbuja--larga' : ''}">${negritaWsp(b)}` +
          `<span class="tl-burbuja-pie">${b.length} caracteres${larga ? ' · pasa los ' + LARGO_BURBUJA + ', conviene partirla' : ''}</span></div>` +
          (i < burbujas.length - 1 ? '<div class="tl-chat-corte">se envía como otro mensaje</div>' : '');
      }).join('');
  }

  /**
   * El teléfono al costado del editor: muestra cómo le llega al cliente lo que
   * se está escribiendo, y qué le falta. Es el mismo diagnóstico de las
   * tarjetas, pero al lado del texto y mientras se escribe, que es cuando sirve.
   */
  /** Lo escrito en el wizard, en el formato que entiende el motor. */
  function textoDelWizard() {
    return conContexto($('tlCliente').value.trim(), $('tlRespuesta').value.trim());
  }

  /** Qué respuesta se está mirando: la del wizard, o la que toca el cursor en el lote. */
  function respuestaEnFoco() {
    if (modo === 'lote') {
      const caja = $('entrada');
      return respuestaBajoElCursor(caja.value, caja.selectionStart);
    }
    return textoDelWizard();
  }

  const rubroDe = texto => ($('rubro').value === 'auto' ? detectarRubroDeTexto(texto, catalogo) : $('rubro').value);

  function pintarTelefono() {
    const pantalla = $('tlPantalla');
    const sugerencias = $('tlSugerencias');
    if (!pantalla) return;

    const enFoco = respuestaEnFoco();
    const { cliente, respuesta: soloRespuesta } = separarContexto(enFoco);
    if (!soloRespuesta.trim()) {
      pantalla.innerHTML = '<p class="tl-fono-vacio">Escribí una respuesta y acá vas a ver cómo le llega al cliente.</p>';
      sugerencias.hidden = true;
      if (modo === 'lote') marcarPaso(1);
      return;
    }

    pantalla.innerHTML = burbujasHtml(cliente, soloRespuesta);
    pantalla.scrollTop = pantalla.scrollHeight;

    const ev = evaluar(enFoco, catalogo, rubroDe(enFoco));
    const flojos = mejorasDe(ev);
    sugerencias.innerHTML = flojos.length
      ? flojos.map(m => `<div class="tl-sug tl-sug--${m.estado}">
          <span class="tl-sug-letra">${esc(m.pilar)}</span>
          <span><b>${esc(m.nombre)}:</b> ${esc(m.titulo)}.</span></div>`).join('')
      : `<div class="tl-sug tl-sug--ok"><span class="tl-sug-letra">✓</span>
          <span><b>Cumple los ${ev.maximo} pilares de texto.</b> Revisala para copiarla.</span></div>`;
    sugerencias.hidden = false;
  }

  /**
   * La respuesta acomodada, vista como la va a ver el cliente en WhatsApp.
   * Es donde se entiende de un vistazo qué hace [---saltomensaje---] y cuándo
   * una burbuja quedó demasiado larga para leerla en el celular.
   */
  function pintarChat(card) {
    const idx = Number(card.dataset.resp);
    const { cliente } = separarContexto(estado.respuestas[idx] || '');
    const texto = componerTexto(card._bloques, apagadosDe(card));
    const burbujas = texto.split(SALTO).map(t => t.trim()).filter(Boolean);
    const negrita = t => esc(t).replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
    card.querySelector('.tl-chat-lienzo').innerHTML =
      (cliente ? `<div class="tl-burbuja-cliente">${negrita(cliente)}</div>` : '') +
      burbujas.map((b, i) => {
        const larga = b.length > LARGO_BURBUJA;
        return `<div class="tl-burbuja${larga ? ' tl-burbuja--larga' : ''}">${negrita(b)}` +
          `<span class="tl-burbuja-pie">${b.length} caracteres${larga ? ' · pasa los ' + LARGO_BURBUJA + ', conviene partirla' : ''}</span></div>` +
          (i < burbujas.length - 1 ? '<div class="tl-chat-corte">se envía como otro mensaje</div>' : '');
      }).join('');
  }

  function renderResumen(respuestas, rubro) {
    const caja = $('resumenLote');
    if (respuestas.length < 2) { caja.hidden = true; caja.innerHTML = ''; return; }
    const r = resumenLote(respuestas, catalogo, rubro);
    const barra = l => {
      const c = r.porPilar[l];
      const pct = v => (100 * v / r.n).toFixed(1);
      const p = PILARES.find(x => x.letra === l);
      return `<div class="tl-res-fila">
        <button type="button" class="tl-res-letra" data-abrir="${esc(l)}" title="Ver ${esc(p.nombre)}">${esc(l)}</button>
        <span class="tl-res-nombre">${esc(p.nombre)}</span>
        <span class="tl-res-barra" role="img" aria-label="${c.falta} faltan, ${c.mejorable} mejorables, ${c.ok} cumplen">
          <i class="tl-res-falta" style="width:${pct(c.falta)}%"></i><i class="tl-res-mejorable" style="width:${pct(c.mejorable)}%"></i><i class="tl-res-ok" style="width:${pct(c.ok)}%"></i>
        </span>
        <span class="tl-res-cuenta">${c.falta ? `<b class="t-falta">${c.falta}</b> faltan` : ''}${c.falta && c.mejorable ? ' · ' : ''}${c.mejorable ? `<b class="t-mejorable">${c.mejorable}</b> mejorables` : ''}${!c.falta && !c.mejorable ? '<b class="t-ok">todas cumplen</b>' : ''}</span>
      </div>`;
    };
    const prio = r.prioridad && PILARES.find(p => p.letra === r.prioridad);
    const cp = prio && r.porPilar[prio.letra];
    caja.hidden = false;
    caja.innerHTML = `
      <header class="tl-res-head">
        <h3>Resumen de tus ${r.n} respuestas</h3>
        <span class="tl-score">Promedio ${fmtPuntaje(Math.round(r.antes * 10) / 10)} → <strong>${fmtPuntaje(Math.round(r.despues * 10) / 10)}</strong> / 5 pilares</span>
      </header>
      ${prio ? `<p class="tl-res-prioridad">🎯 <strong>Por dónde empezar: ${esc(prio.letra)} · ${esc(prio.nombre)}.</strong>
        ${cp.falta ? `Falta en ${cp.falta}` : ''}${cp.falta && cp.mejorable ? ' y es mejorable en ' : (cp.mejorable ? 'Es mejorable en ' : '')}${cp.mejorable || ''} de ${r.n} respuestas.
        <button type="button" class="tl-link" data-abrir="${esc(prio.letra)}">Ver cómo mejorarlo →</button></p>`
        : '<p class="tl-res-prioridad">🎉 Todas tus respuestas cumplen los pilares que se revisan en el texto.</p>'}
      <div class="tl-res-barras">${PILARES.filter(p => p.evaluable).map(p => barra(p.letra)).join('')}</div>
      ${r.hallazgos.length ? `<p class="tl-res-hallazgos-titulo">Lo que más se repite</p>
        <ul class="tl-res-hallazgos">${r.hallazgos.map(h => `<li><b>${h.veces}</b> ${esc(h.etiqueta)}</li>`).join('')}</ul>` : ''}`;
  }

  function atajosDelLote() {
    const cards = [...$('resultados').querySelectorAll('.tl-card')];
    return construirAtajos(cards.map(card => {
      const idx = Number(card.dataset.resp);
      const ev = evaluar(estado.respuestas[idx], catalogo, estado.rubro);
      return {
        atajo: card.querySelector('.tl-atajo-input').value,
        titulo: tituloDeRespuesta(ev),
        categoria: 'Taller ACTÚEN+',
        texto: componerTexto(card._bloques, apagadosDe(card)),
      };
    }), { origen: 'taller', rubro: estado.rubro });
  }

  function notaPlantillas(p, pc) {
    const usadas = [...new Set([pc, p].filter(Boolean))];
    if (!usadas.length) return '<p class="tl-nota">Ninguna plantilla del rubro corresponde a esta consulta: no se sugieren datos y el cierre es genérico.</p>';
    return `<p class="tl-nota">Sugerencias del rubro tomadas de ${usadas.map(x => `<em>${esc(x.title)}</em> (${esc(x.shortcut)})`).join(' y ')}.</p>`;
  }

  function fmtPuntaje(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }

  function apagadosDe(card) {
    const s = new Set();
    card.querySelectorAll('input[type=checkbox][data-i]').forEach(cb => { if (!cb.checked) s.add(Number(cb.dataset.i)); });
    return s;
  }

  async function copiar(btn, texto, etiqueta) {
    try {
      await navigator.clipboard.writeText(texto);
      btn.textContent = '✅ Copiado';
    } catch (e) {
      btn.textContent = '⚠️ No se pudo copiar';
    }
    setTimeout(() => { btn.textContent = etiqueta; }, 1800);
  }

  // ==========================================================================
  // WIZARD: una respuesta por vez
  // ==========================================================================

  let paso = 1;
  let mejorasEnPantalla = [];

  /**
   * Qué se ve en cada paso. La tarjeta con la versión acomodada (`#resultados`)
   * aparece recién en el paso 3: antes distrae de lo que hay que mirar.
   */
  function mostrarPaso(n, desplazar = false) {
    paso = n;
    [1, 2, 3].forEach(i => { $('tlPaso' + i).hidden = modo === 'lote' ? i !== 1 : i !== n; });
    marcarPaso(n);
    $('resultados').hidden = modo === 'wizard' && n < 3;
    $('barraPrompt').hidden = modo === 'wizard' || !estado.respuestas.length;
    // Mientras se mira el resultado de UNA respuesta, el panel del lote estorba:
    // se metería entre las mejoras y la versión acomodada.
    $('tlLote').hidden = modo === 'wizard' && n > 1;
    if (desplazar) $('tlStepper').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Paso 2: cómo salió, con lo que falta arriba. */
  function pintarResultado(texto) {
    const { bloques, evaluacion: ev } = reacomodar(texto, catalogo, estado.rubro);
    const final = evaluar(conContexto(ev.cliente, componerTexto(bloques)), catalogo, estado.rubro);
    mejorasEnPantalla = mejorasDe(ev, bloques);

    $('tlTitular').textContent = titularDeDiagnostico(mejorasEnPantalla);
    $('tlPuntaje').innerHTML = `Cumple <strong>${fmtPuntaje(ev.puntaje)} de ${ev.maximo}</strong> pilares de los que se pueden `
      + 'revisar en un texto.'
      + (final.puntaje > ev.puntaje
        ? ` Acomodada con el método llega a <strong>${fmtPuntaje(final.puntaje)}</strong>.`
        : '');

    $('tlSemaforo').innerHTML = PILARES.slice()
      .sort((a, b) => RANGO[ev.pilares[a.letra].estado] - RANGO[ev.pilares[b.letra].estado])
      .map(p => {
        const e = ev.pilares[p.letra];
        const notas = (e.notas || []).map(n => `<span class="tl-eval-nota">${esc(n)}</span>`).join('');
        return `<li class="tl-eval tl-eval--${e.estado}">
          <span class="tl-eval-letra">${esc(p.letra)}</span>
          <span>${ICONO[e.estado]}</span>
          <span><b>${esc(p.nombre)}.</b> ${esc(e.motivo)}${notas}</span></li>`;
      }).join('');
  }

  /** Paso 3: qué cambiar, en orden, con el texto que propone el método. */
  function pintarMejoras() {
    const m = mejorasEnPantalla;
    $('tlTituloMejoras').textContent = !m.length ? 'No hay nada que cambiar'
      : m.length === 1 ? 'Una sola cosa para cambiar' : `${m.length} cosas para cambiar, en orden`;
    $('tlPistaAcomodada').hidden = !m.length;
    $('tlMejoras').innerHTML = m.length
      ? m.map((x, i) => `<article class="tl-mejora tl-mejora--${x.estado}">
          <div class="tl-mejora-top">
            <span class="tl-mejora-orden">${i + 1}</span>
            <span class="tl-mejora-titulo">${esc(x.titulo)}</span>
            <span class="tl-mejora-pilar">${esc(x.pilar)} · ${esc(x.nombre)}</span>
          </div>
          ${x.porQue ? `<p>${esc(x.porQue)}</p>` : ''}
          ${x.notas.length ? `<p>${esc(x.notas.join(' '))}</p>` : ''}
          <div class="tl-mejora-arreglo"><span>✅</span><span>${esc(x.arreglo)}</span></div>
          ${x.ejemplo ? `<div class="tl-mejora-ejemplo"><b>Lo que le suma el método</b>${esc(x.ejemplo)}</div>` : ''}
        </article>`).join('')
      : '<p class="tl-vacio">Esta respuesta ya cumple los pilares que se pueden revisar en un texto. '
        + 'Copiala de la tarjeta de abajo y probá la próxima.</p>';
  }

  /** El botón del paso 1: revisa lo escrito y pasa al resultado. */
  function revisar() {
    const texto = textoDelWizard();
    if (!separarContexto(texto).respuesta.trim()) {
      $('tlAvisoVacio').hidden = false;
      $('tlRespuesta').focus();
      return;
    }
    $('tlAvisoVacio').hidden = true;
    modo = 'wizard';
    ocultarGuia();
    renderResultados(texto);
    pintarResultado(texto);
    mostrarPaso(2, true);
    guardarBorrador();
  }

  function limpiarWizard() {
    $('tlCliente').value = '';
    $('tlRespuesta').value = '';
    $('tlAvisoVacio').hidden = true;
    $('tlGuardada').hidden = true;
    mejorasEnPantalla = [];
    modo = 'wizard';
    renderResultados('');
    mostrarPaso(1, true);
    pintarTelefono();
    guardarBorrador();
    $('tlRespuesta').focus();
  }

  /**
   * Guardar y seguir: la respuesta pasa al lote, que es la biblioteca en armado.
   * No se abre el lote: el taller saldría del wizard justo cuando el usuario
   * pidió probar otra. Alcanza con decirle dónde quedó y cuántas van.
   */
  function sumarAlLote() {
    const texto = textoDelWizard();
    const caja = $('entrada');
    caja.value = caja.value.trim() ? `${caja.value.trim()}\n\n${texto}` : texto;
    return separarRespuestas(caja.value).length;
  }

  function avisarGuardada(cuantas) {
    const aviso = $('tlGuardada');
    aviso.textContent = `✅ Guardada. ${cuantas === 1 ? 'Va 1 respuesta' : `Van ${cuantas} respuestas`} `
      + 'en «Revisar varias juntas», acá abajo.';
    aviso.hidden = false;
    $('tlLotePista').textContent = cuantas === 1
      ? '1 respuesta guardada · pegá más o armá la biblioteca de atajos'
      : `${cuantas} respuestas guardadas · pegá más o armá la biblioteca de atajos`;
  }

  /** Carga una respuesta en el wizard (un caso de ejemplo, o el chip de un rubro). */
  function cargarEnWizard(texto, rubro) {
    const { cliente, respuesta } = separarContexto(texto);
    $('tlCliente').value = cliente;
    $('tlRespuesta').value = respuesta;
    if (rubro) $('rubro').value = rubro;
    modo = 'wizard';
    $('tlAvisoVacio').hidden = true;
    ocultarGuia();
    mostrarPaso(1);
    pintarTelefono();
    guardarBorrador();
  }

  function mostrarPrompt(texto) {
    $('promptPreview').hidden = false;
    $('promptTexto').value = texto;
    $('promptLargo').textContent = `${texto.length.toLocaleString('es-AR')} caracteres`;
  }

  async function iniciar() {
    aplicarTema();
    renderPilares();
    iniciarDialogo();
    try {
      const res = await fetch('rubros.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      catalogo = await res.json();
    } catch (e) {
      $('resultados').innerHTML = `<p class="tl-error">No se pudo cargar <code>rubros.json</code> (${esc(e.message)}). El taller necesita el catálogo de rubros para funcionar.</p>`;
      return;
    }

    $('rubro').innerHTML = '<option value="auto">🎯 Detectar por el texto</option>' +
      Object.entries(catalogo.rubros).map(([k, r]) => `<option value="${k}">${r.icon} ${esc(r.name)}</option>`).join('');

    let pendiente = null;
    const revisarLote = () => { modo = 'lote'; renderResultados(); mostrarPaso(1); guardarBorrador(); };
    $('entrada').addEventListener('input', () => {
      clearTimeout(pendiente);
      pendiente = setTimeout(revisarLote, 250);
    });
    // Abrir el panel de abajo es entrar al modo lote; cerrarlo, volver al wizard.
    $('tlLote').addEventListener('toggle', () => {
      modo = $('tlLote').open ? 'lote' : 'wizard';
      if (modo === 'lote') renderResultados(); else renderResultados(textoDelWizard());
      mostrarPaso(modo === 'lote' ? 1 : paso);
      pintarTelefono();
    });
    $('rubro').addEventListener('change', () => {
      if (modo === 'lote') renderResultados();
      else if (paso > 1) { renderResultados(textoDelWizard()); pintarResultado(textoDelWizard()); pintarMejoras(); }
      guardarBorrador();
    });

    // --- Botones del wizard ---
    $('btnRevisar').addEventListener('click', revisar);
    $('btnComoMejoro').addEventListener('click', () => { pintarMejoras(); mostrarPaso(3, true); });
    $('btnVolverEditar').addEventListener('click', () => mostrarPaso(1, true));
    $('btnVolverResultado').addEventListener('click', () => mostrarPaso(2, true));
    $('btnOtra').addEventListener('click', limpiarWizard);
    $('btnGuardarSeguir').addEventListener('click', () => {
      const cuantas = sumarAlLote();
      limpiarWizard();
      avisarGuardada(cuantas);
    });
    $('btnVaciar').addEventListener('click', limpiarWizard);
    $('btnVaciarLote').addEventListener('click', () => {
      $('entrada').value = '';
      $('avisoImportacion').hidden = true;
      revisarLote();
      $('entrada').focus();
    });
    $('resumenLote').addEventListener('click', ev => {
      const b = ev.target.closest('[data-abrir]');
      if (b) abrirPilar(b.dataset.abrir);
    });
    $('btnAtajosJson').addEventListener('click', () => {
      descargar('atajos_taller_actuen.json', JSON.stringify(atajosDelLote(), null, 2), 'application/json');
    });
    $('btnAtajosCsv').addEventListener('click', () => {
      descargar('atajos_taller_actuen.csv', '\ufeff' + atajosACsv(atajosDelLote()), 'text/csv');
    });
    $('tlCasos').innerHTML = Object.entries(CASOS)
      .map(([clave, c]) => `<button type="button" class="tl-caso" data-caso="${clave}">${esc(c.etiqueta)}</button>`).join('');
    $('tlCasos').addEventListener('click', ev => {
      const b = ev.target.closest('[data-caso]');
      if (b) cargarEnWizard(CASOS[b.dataset.caso].texto, 'auto');
    });

    $('btnEjemplo').addEventListener('click', () => {
      const r = $('rubro').value;
      $('entrada').value = EJEMPLOS[r] || EJEMPLOS.construccion_corralon;
      if (!EJEMPLOS[r]) $('rubro').value = 'auto';
      $('avisoImportacion').hidden = true;
      $('tlLote').open = true;
      ocultarGuia();
      revisarLote();
      pintarTelefono();
    });
    // La guía muestra UNA respuesta cargada: es lo que el wizard sabe hacer.
    $('btnGuiaEjemplo').addEventListener('click', () => cargarEnWizard(CASOS.cotizacion.texto, 'auto'));
    $('btnGuiaEmpezar').addEventListener('click', () => {
      ocultarGuia();
      $('tlRespuesta').focus();
      $('tlRespuesta').scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    $('btnGuiaCerrar').addEventListener('click', ocultarGuia);

    // El teléfono sigue al cursor y al texto, sin recalcular en cada tecla.
    let esperaTelefono = null;
    const refrescarTelefono = () => {
      clearTimeout(esperaTelefono);
      esperaTelefono = setTimeout(pintarTelefono, 150);
    };
    ['input', 'click', 'keyup'].forEach(evento => {
      $('entrada').addEventListener(evento, refrescarTelefono);
      $('tlRespuesta').addEventListener(evento, refrescarTelefono);
    });
    $('tlCliente').addEventListener('input', refrescarTelefono);
    $('rubro').addEventListener('change', refrescarTelefono);
    // Lo que se escribe en el wizard se guarda, y la guía ya no hace falta.
    [$('tlRespuesta'), $('tlCliente')].forEach(caja => caja.addEventListener('input', () => {
      if ($('tlRespuesta').value.trim()) ocultarGuia();
      $('tlAvisoVacio').hidden = true;
      guardarBorrador();
    }));

    $('btnTeoria').addEventListener('click', () => {
      const teoria = $('tlTeoria');
      teoria.open = true;
      teoria.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // Apenas pega algo, la guía ya cumplió: no tiene que estorbar.
    $('entrada').addEventListener('input', () => { if ($('entrada').value.trim()) ocultarGuia(); }, { once: false });

    $('resultados').addEventListener('change', ev => {
      const cb = ev.target;
      if (cb.type !== 'checkbox') return;
      cb.closest('.tl-bloque').classList.toggle('tl-bloque--apagado', !cb.checked);
      const card = cb.closest('.tl-card');
      // Si el chat está a la vista, tiene que reflejar lo que quedó activo.
      if (card && !card.querySelector('.tl-chat--vista').hidden) pintarChat(card);
    });
    $('resultados').addEventListener('click', ev => {
      const card = ev.target.closest('.tl-card');
      if (!card) return;
      const idx = Number(card.dataset.resp);
      const vista = ev.target.closest('[data-vista]');
      if (vista) {
        const chat = vista.dataset.vista === 'chat';
        if (chat) pintarChat(card);
        card.querySelector('.tl-chat--vista').hidden = !chat;
        card.querySelector('.tl-bloques').hidden = chat;
        card.querySelector('.tl-leyenda').hidden = chat;
        card.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('tl-vista-btn--activo', b === vista));
        return;
      }
      if (ev.target.closest('.tl-copiar')) {
        copiar(ev.target.closest('.tl-copiar'), componerTexto(card._bloques, apagadosDe(card)), '📋 Copiar respuesta');
      } else if (ev.target.closest('.tl-prompt')) {
        const texto = generarPromptRespuesta(estado.respuestas[idx], catalogo, estado.rubro,
          { apagados: apagadosDe(card), ocultarDatos: $('ocultarDatos').checked });
        mostrarPrompt(texto);
        copiar(ev.target.closest('.tl-prompt'), texto, '🤖 Prompt para el asesor');
      }
    });

    $('btnPromptBiblioteca').addEventListener('click', () => {
      const texto = generarPromptBiblioteca(estado.respuestas, catalogo, estado.rubro, { ocultarDatos: $('ocultarDatos').checked });
      mostrarPrompt(texto);
      copiar($('btnPromptBiblioteca'), texto, '🤖 Prompt para armar la biblioteca');
    });
    $('btnDescargarPrompt').addEventListener('click', () => {
      const blob = new Blob([$('promptTexto').value], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'prompt_actuen.md';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    // Qué se carga al abrir: lo que manda el Analizador, o el borrador guardado.
    const importado = /[?&]desde=analizador\b/.test(location.search) ? leerJson(CLAVE_IMPORTACION) : null;
    if (importado && importado.texto) {
      $('entrada').value = importado.texto;
      if (importado.rubro && catalogo.rubros[importado.rubro]) $('rubro').value = importado.rubro;
      $('avisoImportacionTexto').textContent =
        `Se cargaron ${importado.cantidad} respuestas desde el Analizador: las que más repiten tus asesores, cada una con un mensaje real de cliente.`;
      $('avisoImportacion').hidden = false;
      // Vienen varias respuestas juntas: eso es el lote, no el wizard.
      modo = 'lote';
      $('tlLote').open = true;
      try { localStorage.removeItem(CLAVE_IMPORTACION); } catch (e) { /* sin almacenamiento */ }
      history.replaceState(null, '', location.pathname);
      guardarBorrador();
    } else {
      const borrador = leerJson(CLAVE_BORRADOR);
      if (borrador) {
        if (borrador.texto) $('entrada').value = borrador.texto;
        if (borrador.respuesta) $('tlRespuesta').value = borrador.respuesta;
        if (borrador.cliente) $('tlCliente').value = borrador.cliente;
        if (borrador.rubro && $('rubro').querySelector(`option[value="${borrador.rubro}"]`)) $('rubro').value = borrador.rubro;
      }
    }

    mostrarGuiaSiHaceFalta();
    renderResultados(modo === 'lote' ? $('entrada').value : textoDelWizard());
    mostrarPaso(1);
    pintarTelefono();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
}
