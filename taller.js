/**
 * Taller ACTÚEN+ — el cliente pega sus respuestas rápidas y ve cómo el método
 * las evalúa y las reacomoda.
 *
 * Todo es determinístico y corre en el navegador: no hay IA reescribiendo ni
 * texto que salga del equipo. El reacomodo NO inventa contenido comercial: toma
 * las frases del cliente y las ordena en la estructura del método. Lo único que
 * agrega son datos a pedir y un cierre, tomados de las plantillas del rubro en
 * rubros.json, y siempre marcados como sugerencia para que el cliente decida.
 *
 * T (tiempos) y + (carga bot/humano) no se pueden juzgar mirando un texto: se
 * miden en los chats. Se muestran como tales en vez de puntuarlos con un
 * número inventado.
 */
'use strict';

// ==========================================================================
// NÚCLEO (sin DOM)
// ==========================================================================

const PILARES = [
  { letra: 'A', nombre: 'Atender sin laberintos', evaluable: true,
    idea: 'El cliente cuenta lo que necesita de entrada, sin navegar un menú de opciones.' },
  { letra: 'C', nombre: 'Cero vueltas', evaluable: true,
    idea: 'Todo lo necesario en un solo bloque: información, datos a pedir y acción. Nada de ráfagas ni un dato por turno.' },
  { letra: 'T', nombre: 'Tiempos aceitados', evaluable: false,
    idea: 'Responder dentro del SLA del rubro. Se mide en tus chats, no en un texto.' },
  { letra: 'U', nombre: 'Ubicar la intención', evaluable: true,
    idea: 'Pedir en el mismo turno los datos que dicen qué tan cerca de comprar está el cliente.' },
  { letra: 'E', nombre: 'Experiencia personalizada', evaluable: true,
    idea: 'Hablarle a una persona, no a un expediente. Sin fórmulas de mesa de entradas.' },
  { letra: 'N', nombre: 'Nutrir y cerrar', evaluable: true,
    idea: 'Cada respuesta termina con una pregunta de avance. Nunca deja la próxima jugada en manos del cliente.' },
  { letra: '+', nombre: 'Optimización continua', evaluable: false,
    idea: 'Reparto de carga entre bot y asesores. Se mide en tus chats, no en un texto.' },
];

const SALTO = '[---saltomensaje---]';

const RE_SALUDO_INICIAL = /^\s*[¡!]*\s*(hola|buen[oa]s?(\s+(d[ií]as?|tardes?|noches?))?)([\s,.!¡]+buen[oa]s?(\s+(d[ií]as?|tardes?|noches?))?)?\b[\s,.!¡]*/i;
const RE_CORTESIA = /^[¿\s]*(c[oó]mo (est[aá]s|and[aá]s|va|le va|te va)|todo bien)[?!.\s]*$/i;
const RE_OPCION_MENU = /^\s*(\d{1,2}\s*[-.)️⃣]|[1-9]\ufe0f?\u20e3|[a-e]\))\s*\S/i;
const RE_INSTRUCCION_MENU = /(escrib[ií]|respond[eé]|marc[aá]|eleg[ií]|seleccion|opci[oó]n|digit[aá]|presion[aá]|ingres[aá] el n)/i;
const RE_PASIVO = /(nos comunicaremos|a la brevedad|en breve (te|le) (respond|contact|escrib)|cualquier (otra )?(duda|consulta)|quedo a (tu|su|vuestra) disposici|quedamos a (tu|su) disposici|av[ií]same|nos avis[aá]s|me avis[aá]s|espero tu respuesta|saludos( cordiales)?|muchas gracias|gracias por (tu|su) consulta)/i;
const RE_BUROCRATICO = /(estimad[oa]s?\s+(cliente|usuari|afiliad|client)|su (consulta|solicitud) (ha sido|fue) (recibida|registrada)|a la brevedad|nos comunicaremos con usted|le informamos que|sr\.?\/?a?\.? cliente)/i;
const RE_CIERRE_PROPIO = /(confirm|reserv|coordin|agend|se[ñn][aá]|abon|avan[cz]|te (lo )?guard|te (lo )?separ|lo (armo|preparo|envio|mando))/i;
// Cierre imperativo: pide una acción concreta aunque no lleve signo de pregunta.
const RE_CTA = /(envi[aá]nos|envianos|pasame|pas[aá]nos|decime|dec[ií]nos|contame|cont[aá]nos|respond[eé]nos|apenas nos|con (estos|esos) datos|reserv[aá]|confirm[aá]me)/i;
const RE_CAMPO_LISTA = /^\s*(\d{1,2}\s*[.)-]|•|-)\s*.+[:?]\**\s*$/;
const RE_VOCATIVO = /^estimad[oa]s?\s+[a-záéíóúñ\/()]+\s*,?\s*/i;

// Fórmulas de mesa de entradas con su equivalente directo. Es un reemplazo
// literal y acotado: el taller no reescribe frases libres.
const REEMPLAZOS_TONO = [
  [/su (consulta|solicitud|pedido|reclamo) (ha sido|fue) (recibid[oa]|registrad[oa])/i, (m, q) => `recibimos tu ${q.toLowerCase()}`],
  [/le informamos que\s*/i, ''],
  [/\busted\b/gi, 'vos'],
];

function sinTildes(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function normalizarPregunta(p) {
  let q = p.replace(/^[¿\s]+/, '').replace(/[?\s]+$/, '').trim();
  q = q.replace(/^(y|e|entonces|bueno|ok|dale)\s*,?\s+/i, '');
  return '¿' + capitalizar(q) + '?';
}

/**
 * Quita lo que no es contenido: la firma del operador que agregan algunas
 * plataformas ("^Rocio. A"), emojis de viñeta al inicio y el formato de
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

/** Descompone una respuesta en piezas clasificadas. */
function desarmar(texto) {
  const piezas = [];
  const lineas = texto.replace(/\r/g, '').split('\n');
  let primera = true;

  for (const cruda of lineas) {
    const linea = limpiarLinea(cruda);
    if (!linea || cruda.trim() === SALTO) continue;

    if (RE_CAMPO_LISTA.test(linea)) {
      const t = linea.replace(/^\s*(\d{1,2}\s*[.)-]|•|-)\s*/, '').replace(/\*/g, '').trim();
      piezas.push({ tipo: 'pregunta', texto: t, campo: true });
      primera = false;
      continue;
    }
    if (RE_OPCION_MENU.test(linea)) {
      piezas.push({ tipo: 'opcion', texto: linea.replace(RE_OPCION_MENU, m => m.slice(-1)).trim() });
      primera = false;
      continue;
    }

    for (let f of frases(linea)) {
      if (primera) {
        const saludo = f.match(RE_SALUDO_INICIAL);
        if (saludo) {
          piezas.push({ tipo: 'saludo', texto: saludo[0].trim() });
          f = f.slice(saludo[0].length).trim();
        }
        primera = false;
        if (!f) continue;
      }
      if (RE_VOCATIVO.test(f)) {
        f = capitalizar(f.replace(RE_VOCATIVO, ''));
        piezas.push({ tipo: 'vocativo', texto: '' });
      }
      let ajustada = false;
      for (const [re, por] of REEMPLAZOS_TONO) {
        re.lastIndex = 0;   // las regex con /g guardan estado entre llamadas a test()
        if (re.test(f)) { re.lastIndex = 0; f = capitalizar(f.replace(re, por)); ajustada = true; }
      }
      if (RE_CORTESIA.test(f)) { piezas.push({ tipo: 'cortesia', texto: f }); continue; }
      if (RE_PASIVO.test(f) && !esPregunta(f)) { piezas.push({ tipo: 'pasivo', texto: f }); continue; }
      if (RE_INSTRUCCION_MENU.test(f) && piezas.some(p => p.tipo === 'opcion') ) {
        piezas.push({ tipo: 'instruccion_menu', texto: f }); continue;
      }
      const partida = separarPregunta(f);
      if (partida) {
        if (partida.info) piezas.push({ tipo: 'info', texto: capitalizar(partida.info) + '.' });
        f = partida.pregunta;
      }
      if (esPregunta(f)) {
        piezas.push({ tipo: RE_CIERRE_PROPIO.test(f) ? 'cierre' : 'pregunta', texto: f });
      } else {
        piezas.push({ tipo: 'info', texto: f, ajustada });
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

/** La plantilla del rubro que más vocabulario comparte con la respuesta. */
function plantillaMasCercana(texto, catalogo, rubroKey, soloConCampos = false) {
  const porRubro = catalogo.plantillas[rubroKey] || catalogo.plantillas.servicios_generales;
  const todas = [...(porRubro.ventas || []), ...(porRubro.soporte || [])]
    .filter(p => !soloConCampos || camposDePlantilla(p).length >= 2);
  const propias = new Set(palabras(texto));
  let mejor = null, max = 0;
  for (const p of todas) {
    const suyas = new Set(palabras(`${p.title} ${p.category} ${p.before} ${p.after}`));
    let n = 0;
    propias.forEach(w => { if (suyas.has(w)) n++; });
    if (n > max) { max = n; mejor = p; }
  }
  return max >= 2 ? mejor : null;
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

/**
 * Evalúa una respuesta pilar por pilar.
 * Estado: 'ok' | 'mejorable' | 'falta' | 'no_aplica'.
 */
function evaluar(texto, catalogo, rubroKey) {
  const piezas = desarmar(texto);
  const cuenta = t => piezas.filter(p => p.tipo === t).length;
  const plantilla = plantillaMasCercana(texto, catalogo, rubroKey);
  const plantillaCampos = plantillaMasCercana(texto, catalogo, rubroKey, true);
  const camposEsperados = plantillaCampos ? camposDePlantilla(plantillaCampos).length : 0;
  const reDescartar = new RegExp(catalogo.muestra_frases.regex_descartar, 'i');

  const lineasConContenido = texto.split('\n').map(l => l.trim()).filter(l => l && l !== SALTO);
  const soloSaludo = lineasConContenido.length > 0 && lineasConContenido.every(l => reDescartar.test(sinTildes(l)));
  const pedidos = cuenta('pregunta') + cuenta('cierre');
  const datosPedidos = cuenta('pregunta') + cuenta('cierre');

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
             && !lineasConContenido.some(l => /^(•|-|\d+\.|[📋💬👉])/u.test(l)) && datosPedidos <= 1 && cuenta('opcion') === 0) {
    r.C = { estado: 'mejorable', motivo: `${lineasConContenido.length} líneas cortas que se leen como ráfaga de mensajes sueltos. Van en un solo bloque con estructura.` };
  } else if (cuenta('pregunta') === 1 && camposEsperados >= 2) {
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
  } else if (ultimaPieza.tipo === 'cierre' || (ultimaPieza.tipo === 'info' && RE_CTA.test(ultimaPieza.texto))) {
    // Solo una pregunta de avance o un pedido de acción cuentan. Una frase
    // informativa con "abonar" o "confirmado" adentro no es un cierre.
    r.N = { estado: 'ok', motivo: 'Termina con una pregunta que hace avanzar la venta.' };
  } else if (ultimaPieza.tipo === 'pregunta') {
    r.N = { estado: 'mejorable', motivo: 'Termina con una pregunta, pero de relevamiento: pide un dato, no un compromiso.' };
  } else {
    r.N = { estado: 'falta', motivo: 'Termina informando. Sin una pregunta de avance, la conversación se enfría ahí.' };
  }

  const evaluables = PILARES.filter(p => p.evaluable).map(p => p.letra);
  const puntos = evaluables.reduce((s, l) => s + (r[l].estado === 'ok' ? 1 : r[l].estado === 'mejorable' ? 0.5 : 0), 0);
  return { pilares: r, puntaje: puntos, maximo: evaluables.length, piezas, plantilla, plantillaCampos };
}

function recortar(t, n) {
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * Reacomoda una respuesta en la estructura ACTÚEN+.
 *
 * Devuelve bloques con su origen:
 *   'tuyo'     — palabras del cliente, reordenadas
 *   'metodo'   — conectores de la estructura (saludo, encabezado de datos, salto)
 *   'sugerido' — datos o cierre tomados de la plantilla del rubro
 * Los sugeridos se pueden apagar uno por uno en la interfaz.
 */
function reacomodar(texto, catalogo, rubroKey) {
  const { piezas, plantilla, plantillaCampos } = evaluar(texto, catalogo, rubroKey);
  const bloques = [];

  const saludo = piezas.find(p => p.tipo === 'saludo');
  const cortesia = piezas.find(p => p.tipo === 'cortesia');
  const info = piezas.filter(p => p.tipo === 'info');
  const opciones = piezas.filter(p => p.tipo === 'opcion');
  const preguntas = piezas.filter(p => p.tipo === 'pregunta');
  const cierres = piezas.filter(p => p.tipo === 'cierre');

  bloques.push({ tipo: 'saludo', origen: saludo ? 'tuyo' : 'metodo',
    texto: (saludo ? `👋 ¡${capitalizar(saludo.texto.replace(/^[¡!\s]+|[\s,.!¡]+$/g, '').replace(/[\s,.!¡]+(?=buen)/i, ', '))}!` : '👋 ¡Hola!')
      + (cortesia ? ` ${normalizarPregunta(cortesia.texto)}` : '') });

  // Cada frase propia en su bloque, para poder marcar las que se ajustaron de tono.
  info.forEach(p => bloques.push({ tipo: 'info', origen: p.ajustada ? 'metodo' : 'tuyo', texto: capitalizar(p.texto) }));

  // Un menú se convierte en ejemplos de lo que el cliente puede pedir, sin números.
  if (opciones.length) {
    bloques.push({ tipo: 'encabezado_opciones', origen: 'metodo', texto: '💬 *Contame en un solo mensaje qué necesitás. Por ejemplo:*' });
    bloques.push({ tipo: 'opciones', origen: 'tuyo',
      texto: opciones.map(o => `• ${capitalizar(o.texto)}`).join('\n') });
  }

  // Datos a pedir: primero los del cliente, después los del rubro que no repitan.
  const campos = preguntas.map(p => ({ origen: 'tuyo',
    texto: p.campo ? p.texto.replace(/[:\s]+$/, '') : normalizarPregunta(p.texto) }));
  if (plantillaCampos) {
    const yaPedido = new Set(campos.flatMap(c => palabras(c.texto)));
    camposDePlantilla(plantillaCampos)
      .filter(c => !palabras(c).some(w => yaPedido.has(w)))
      .slice(0, Math.max(0, 4 - campos.length))
      .forEach(c => campos.push({ origen: 'sugerido', texto: c }));
  }
  if (campos.length) {
    bloques.push({ tipo: 'encabezado', origen: 'metodo', texto: '📋 *Para avanzar, pasame en un solo mensaje:*' });
    campos.forEach(c => bloques.push({ tipo: 'campo', origen: c.origen, texto: c.texto }));
  }

  bloques.push({ tipo: 'salto', origen: 'metodo', texto: SALTO });

  if (cierres.length) {
    bloques.push({ tipo: 'cierre', origen: 'tuyo', texto: `👉 *${normalizarPregunta(cierres[cierres.length - 1].texto)}*` });
  } else if (plantilla && plantilla.tipping_point) {
    bloques.push({ tipo: 'cierre', origen: 'sugerido', texto: `👉 *${plantilla.tipping_point}*` });
  } else {
    bloques.push({ tipo: 'cierre', origen: 'sugerido',
      texto: campos.length
        ? '👉 *Con esos datos te confirmo todo en el próximo mensaje. ¿Avanzamos?*'
        : '👉 *¿Querés que avancemos con esto?*' });
  }

  return { bloques, plantilla, plantillaCampos };
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
    // Los campos van pegados al encabezado y entre sí; el resto, en párrafos.
    const pegado = b.tipo === 'campo' || (b.tipo === 'info' && previo === 'info') || b.tipo === 'opciones';
    texto += texto ? (pegado ? '\n' : '\n\n') + linea : linea;
    previo = b.tipo;
  }
  return texto;
}

if (typeof module !== 'undefined') {
  module.exports = { PILARES, separarRespuestas, desarmar, evaluar, reacomodar, componerTexto,
    camposDePlantilla, plantillaMasCercana, detectarRubroDeTexto };
}

// ==========================================================================
// INTERFAZ
// ==========================================================================

if (typeof document !== 'undefined') {
  const EJEMPLOS = {
    construccion_corralon: [
      'Buenos dias!\ncemento avellaneda $6260 holcim $6500\ndepende la zona, a que direccion lo solicitaba?',
      'Hola, te paso el presupuesto en pdf. Cualquier consulta avisame.',
      'Gracias por comunicarte. Elegí una opción:\n1. Ventas\n2. Envíos\n3. Pagos\nRespondé con el número.',
    ].join('\n---\n'),
    salud_obra_social: [
      'Estimado afiliado, su solicitud ha sido recibida. Nos comunicaremos a la brevedad.',
      'Hola! para el turno que especialidad necesitas?',
    ].join('\n---\n'),
  };

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let catalogo = null;

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
    $('pilaresMetodo').innerHTML = PILARES.map(p => `
      <div class="tl-pilar ${p.evaluable ? '' : 'tl-pilar--chats'}">
        <span class="tl-letra">${esc(p.letra)}</span>
        <div>
          <strong>${esc(p.nombre)}</strong>
          <p>${esc(p.idea)}</p>
          ${p.evaluable ? '' : '<span class="tl-tag">se mide en tus chats</span>'}
        </div>
      </div>`).join('');
  }

  const ICONO = { ok: '✅', mejorable: '🟡', falta: '🔴', no_aplica: '⚪' };

  function renderResultados() {
    const texto = $('entrada').value;
    const respuestas = separarRespuestas(texto);
    const selector = $('rubro');
    let rubro = selector.value;
    if (rubro === 'auto') {
      rubro = detectarRubroDeTexto(texto, catalogo);
      $('rubroDetectado').textContent = respuestas.length
        ? `Detectado: ${catalogo.rubros[rubro].icon} ${catalogo.rubros[rubro].name}` : '';
    } else {
      $('rubroDetectado').textContent = '';
    }

    if (!respuestas.length) {
      $('resultados').innerHTML = '<p class="tl-vacio">Pegá una o más respuestas rápidas arriba para ver cómo las acomoda el método.</p>';
      return;
    }

    $('resultados').innerHTML = respuestas.map((r, idx) => {
      const ev = evaluar(r, catalogo, rubro);
      const { bloques, plantilla, plantillaCampos } = reacomodar(r, catalogo, rubro);
      const final = evaluar(componerTexto(bloques), catalogo, rubro);
      const filas = PILARES.map(p => {
        const e = ev.pilares[p.letra];
        return `<li class="tl-eval tl-eval--${e.estado}">
          <span class="tl-eval-letra">${esc(p.letra)}</span>
          <span>${ICONO[e.estado]}</span>
          <span>${esc(e.motivo)}</span></li>`;
      }).join('');
      const bloquesHtml = bloques.map((b, i) =>
        `<div class="tl-bloque tl-bloque--${b.origen} tl-bloque--${b.tipo}" data-i="${i}">` +
        (b.origen === 'sugerido'
          ? `<label class="tl-toggle"><input type="checkbox" checked data-i="${i}"> sugerido</label>` : '') +
        `<span class="tl-bloque-texto">${esc(b.tipo === 'campo' ? '• ' + b.texto : b.texto)}</span></div>`
      ).join('');

      return `
      <article class="tl-card" data-resp="${idx}">
        <header class="tl-card-head">
          <h3>Respuesta ${idx + 1}</h3>
          <span class="tl-score">${fmtPuntaje(ev.puntaje)} → <strong>${fmtPuntaje(final.puntaje)}</strong> / ${ev.maximo} pilares</span>
        </header>
        <div class="tl-grid">
          <div>
            <h4>Tu versión</h4>
            <pre class="tl-original">${esc(r)}</pre>
            <ul class="tl-evals">${filas}</ul>
          </div>
          <div>
            <h4>Acomodada con ACTÚEN+</h4>
            <div class="tl-leyenda">
              <span class="tl-chip tl-chip--tuyo">tus palabras</span>
              <span class="tl-chip tl-chip--metodo">estructura del método</span>
              <span class="tl-chip tl-chip--sugerido">sugerido para tu rubro</span>
            </div>
            <div class="tl-bloques">${bloquesHtml}</div>
            ${notaPlantillas(plantilla, plantillaCampos)}
            <button class="btn btn-primary tl-copiar" data-resp="${idx}">📋 Copiar respuesta</button>
          </div>
        </div>
      </article>`;
    }).join('');

    // Guardar los bloques de cada tarjeta para copiar con lo que quedó activo.
    $('resultados').querySelectorAll('.tl-card').forEach(card => {
      const idx = Number(card.dataset.resp);
      card._bloques = reacomodar(respuestas[idx], catalogo, rubro).bloques;
    });
  }

  function notaPlantillas(p, pc) {
    const usadas = [...new Set([pc, p].filter(Boolean))];
    if (!usadas.length) return '<p class="tl-nota">Ninguna plantilla del rubro se parece a esta respuesta: el cierre sugerido es genérico.</p>';
    return `<p class="tl-nota">Sugerencias tomadas de ${usadas.map(x => `<em>${esc(x.title)}</em> (${esc(x.shortcut)})`).join(' y ')}.</p>`;
  }

  function fmtPuntaje(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }

  function apagadosDe(card) {
    const s = new Set();
    card.querySelectorAll('input[type=checkbox]').forEach(cb => { if (!cb.checked) s.add(Number(cb.dataset.i)); });
    return s;
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
    $('resultados').addEventListener('click', async ev => {
      const btn = ev.target.closest('.tl-copiar');
      if (!btn) return;
      const card = btn.closest('.tl-card');
      const texto = componerTexto(card._bloques, apagadosDe(card));
      try {
        await navigator.clipboard.writeText(texto);
        btn.textContent = '✅ Copiada';
      } catch (e) {
        btn.textContent = '⚠️ No se pudo copiar';
      }
      setTimeout(() => { btn.textContent = '📋 Copiar respuesta'; }, 1800);
    });

    renderResultados();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
}
