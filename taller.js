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
    bien: '¡Hola! Contame qué necesitás y te ayudo.' },
  { letra: 'C', nombre: 'Cero vueltas', evaluable: true,
    idea: 'Todo lo necesario en un solo bloque: información, datos a pedir y acción. Nada de ráfagas ni un dato por turno.',
    pregunta: '¿Resuelve todo en un solo mensaje, o hay que ir y volver?',
    mal: '"Buenos días!" · "sale $6.260" · "¿a qué dirección?" (tres mensajes sueltos)',
    bien: 'Precio, datos que faltan y próximo paso, juntos en un mensaje.' },
  { letra: 'T', nombre: 'Tiempos aceitados', evaluable: false,
    idea: 'Responder dentro del SLA del rubro. Se mide en tus chats, no en un texto.',
    pregunta: '¿Contesta a tiempo?',
    mal: 'Responder a los 40 minutos, cuando ya consultó en otro lado.',
    bien: 'Responder dentro del tiempo ideal de tu rubro.' },
  { letra: 'U', nombre: 'Ubicar la intención', evaluable: true,
    idea: 'Responder lo que el cliente preguntó y pedir en el mismo turno los datos que dicen qué tan cerca de comprar está.',
    pregunta: '¿Contesta lo que preguntó y pide lo que falta para avanzar?',
    mal: 'Cliente: "¿Cuánto sale el cemento?" → "¿Para qué obra es?"',
    bien: '"Está $6.260. ¿Cuántas bolsas y a qué zona lo mandamos?"' },
  { letra: 'E', nombre: 'Experiencia personalizada', evaluable: true,
    idea: 'Hablarle a una persona, no a un expediente. Sin fórmulas de mesa de entradas.',
    pregunta: '¿Suena a una persona o a un expediente?',
    mal: '"Estimado cliente, su consulta ha sido recibida."',
    bien: '"¡Hola Juan! Ya lo reviso."' },
  { letra: 'N', nombre: 'Nutrir y cerrar', evaluable: true,
    idea: 'Cada respuesta termina con una pregunta de avance. Nunca deja la próxima jugada en manos del cliente.',
    pregunta: '¿Termina con un próximo paso concreto?',
    mal: '"Cualquier consulta, avisame."',
    bien: '"¿Te lo reservo para el jueves?"' },
  { letra: '+', nombre: 'Optimización continua', evaluable: false,
    idea: 'Reparto de carga entre bot y asesores. Se mide en tus chats, no en un texto.',
    pregunta: '¿El trabajo está bien repartido entre el bot y las personas?',
    mal: 'Una sola asesora atiende 9 de cada 10 chats.',
    bien: 'El bot resuelve lo repetitivo y deriva lo que necesita criterio.' },
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
    campos: ['¿Qué necesitás cotizar, exactamente?'],
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
const DATOS = {
  direccion: { nombre: 'dirección',
    enCliente: /(?:mi direcci[oó]n (?:es|queda)|direcci[oó]n:?|domicilio:?|vivo en|entregar en|\bcalle\b|\bav\.|avenida|barrio)\s*([^.,;\n?¿!]{3,40})/i,
    enPregunta: /(direcci[oó]n|domicilio|\bzona\b|barrio|localidad|a d[oó]nde|d[oó]nde (ser[ií]a|es la obra|lo (env|mand|entreg)))/i,
    confirmar: v => `¿Te lo enviamos a ${v}?` },
  cantidad: { nombre: 'cantidad',
    enCliente: /\b(\d+(?:[.,]\d+)?\s*(?:barras?|bolsas?|bolsones?|m3|m2|m²|metros?|mts?|unidades?|kg|kilos?|litros?|cajas?|packs?|pallets?|camionadas?|placas?|rollos?|chapas?|personas?|noches?|cubiertos?))\b/i,
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
    enPregunta: /(\blista\b|material|producto|pieza|repuesto|modelo|especialidad|\btalle|\bmedida|cotizar)/i,
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
    .filter(Boolean);
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
    if (m) out[tipo] = (m[1] || m[2] || m[0]).trim().replace(/[\s.]+$/, '');
  }
  return out;
}

/** Cuántos datos distintos pide una pregunta ("¿cuántas bolsas y a qué zona?" = 2). */
function datosEnPregunta(pregunta) {
  const tipos = Object.values(DATOS).filter(d => d.enPregunta.test(pregunta)).length;
  return Math.max(1, tipos);
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
  const yaPedido = new Set(campos.flatMap(c => palabras(c.texto)));
  for (const c of candidatos) {
    if (campos.length >= 4 || (!plantillaCampos && campos.length >= 3)) break;
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

if (typeof module !== 'undefined') {
  module.exports = { PILARES, INTENCIONES, DATOS, separarRespuestas, separarContexto, conContexto, desarmar, evaluar,
    reacomodar, componerTexto, camposDePlantilla, plantillaMasCercana, detectarRubroDeTexto, detectarIntencion, detectarIntenciones,
    datosDelCliente, anonimizar, esCierreActivo, generarPromptRespuesta, generarPromptBiblioteca, extraerPrecios, corregir };
}

// ==========================================================================
// INTERFAZ
// ==========================================================================

if (typeof document !== 'undefined') {
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
      <article class="tl-pilar" id="pilar-${p.letra === '+' ? 'mas' : p.letra}">
        <header class="tl-pilar-head">
          <span class="tl-letra">${esc(p.letra)}</span>
          <strong>${esc(p.nombre)}</strong>
        </header>
        <p class="tl-pilar-pregunta">${esc(p.pregunta)}</p>
        <p class="tl-ej tl-ej--mal"><span aria-label="Mal">✗</span>${esc(p.mal)}</p>
        <p class="tl-ej tl-ej--bien"><span aria-label="Bien">✓</span>${esc(p.bien)}</p>
      </article>`;
    $('pilaresMetodo').innerHTML = PILARES.filter(p => p.evaluable).map(tarjeta).join('');
    $('pilaresChats').innerHTML = PILARES.filter(p => !p.evaluable).map(tarjeta).join('');
  }

  const ICONO = { ok: '✅', mejorable: '🟡', falta: '🔴', no_aplica: '⚪' };

  function renderResultados() {
    const texto = $('entrada').value;
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
    $('barraPrompt').hidden = !respuestas.length;
    $('promptPreview').hidden = true;

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
            <div class="tl-leyenda">
              <span class="tl-chip tl-chip--tuyo">tus palabras</span>
              <span class="tl-chip tl-chip--metodo">estructura del método</span>
              <span class="tl-chip tl-chip--sugerido">sugerido</span>
            </div>
            <div class="tl-bloques">${bloquesHtml}</div>
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

  function mostrarPrompt(texto) {
    $('promptPreview').hidden = false;
    $('promptTexto').value = texto;
    $('promptLargo').textContent = `${texto.length.toLocaleString('es-AR')} caracteres`;
  }

  async function iniciar() {
    aplicarTema();
    renderPilares();
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
    $('entrada').addEventListener('input', () => { clearTimeout(pendiente); pendiente = setTimeout(renderResultados, 250); });
    $('rubro').addEventListener('change', renderResultados);
    $('btnEjemplo').addEventListener('click', () => {
      const r = $('rubro').value;
      $('entrada').value = EJEMPLOS[r] || EJEMPLOS.construccion_corralon;
      if (!EJEMPLOS[r]) $('rubro').value = 'auto';
      renderResultados();
    });

    $('resultados').addEventListener('change', ev => {
      const cb = ev.target;
      if (cb.type !== 'checkbox') return;
      cb.closest('.tl-bloque').classList.toggle('tl-bloque--apagado', !cb.checked);
    });
    $('resultados').addEventListener('click', ev => {
      const card = ev.target.closest('.tl-card');
      if (!card) return;
      const idx = Number(card.dataset.resp);
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

    renderResultados();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
}
