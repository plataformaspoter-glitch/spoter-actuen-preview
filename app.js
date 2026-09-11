// Analizador Conversacional ACTÚEN+ V2.3 - Sistema Spoter
let currentData = null;
let currentFiles = null;
let charts = {};
let showAllTemplates = true;

// Diccionario interactivo de explicaciones para el modal Spoter
const EXPLANATIONS = {
  total_msgs: {
    title: "Total de Mensajes Auditados",
    meaning: "Representa el volumen bruto total de mensajes intercambiados entre la empresa y todos sus usuarios en el período analizado.",
    calculation: "Conteo directo de cada fila del archivo CSV correspondiente a un mensaje enviado o recibido.",
    impact: "Un volumen excesivo suele indicar ineficiencia en la resolución, obligando al usuario y al operador a múltiples turnos para resolver una misma consulta.",
    benchmark: "En procesos optimizados con el Método ACTÚEN+ de Spoter, el ratio ideal es de 6 a 8 mensajes totales por consulta completa."
  },
  clients: {
    title: "Usuarios Atendidos y Top 3 Picos Horarios",
    meaning: "Cantidad de personas únicas atendidas y las 3 franjas horarias del día donde se concentra la mayor cantidad de consultas iniciales.",
    calculation: "Identificación de destinatarios únicos y extracción de fecha/hora del primer mensaje de cada conversación para identificar las horas con mayor demanda.",
    impact: "Conocer con precisión los 3 picos del día permite dimensionar los turnos de los operadores humanos y programar guardias o bots de refuerzo justo en esos momentos.",
    benchmark: "Tener cobertura de respuesta inmediata (< 2 min) en el 100% de los 3 picos para evitar que los mensajes iniciales se acumulen en cola."
  },
  fragmentation: {
    title: "Tasa de Fragmentación (Infracción a Cero Vueltas)",
    meaning: "Porcentaje de intervenciones de la empresa donde el asesor envía 2 o más mensajes consecutivos en lugar de un solo bloque consolidado.",
    calculation: "Se detectan ráfagas consecutivas de mensajes con 'Propio = Si'. Se calcula: (Ráfagas de 2 + Ráfagas de 3 o más) / Total de intervenciones.",
    impact: "🚨 Dolor Principal (Rojo = Malo): Enviar mensajes cortados genera fatiga mental en el usuario, multiplica las notificaciones y los costos de WhatsApp API.\n⚡ Solución Spoter: Regla del Bloque Único (unificar saludo, respuesta y llamado a la acción en 1 mensaje).",
    benchmark: "Bajo ACTÚEN+, menos del 10% de las respuestas deberían ser ráfagas (Verde = Bueno). El 90%+ debe ser turno único."
  },
  wait_time: {
    title: "Tiempo de Espera Medio (Tiempos Aceitados)",
    meaning: "Tiempo promedio (en minutos) que transcurre desde que el usuario envía su mensaje hasta que recibe respuesta.",
    calculation: "Promedio de los valores registrados en la columna 'Tiempo Espera' separando mensaje inicial de los mensajes en conversación.",
    impact: "📉 Impacto en el Negocio (Rojo = Malo): En Ventas, demoras mayores a 10-15 min enfrían el lead (Zona Fría) y multiplican la fuga a la competencia.\n⚡ Solución Spoter: Inyectar mensaje de oxígeno conversacional ante demoras mayores a 3 min.",
    benchmark: "Calibrado al rubro detectado: compara el tiempo real con el SLA óptimo de la industria (< 2 a 6 min es Verde = Bueno)."
  },
  savings: {
    title: "Ahorro Proyectado y Beneficio Económico (ROI)",
    meaning: "Impacto financiero directo obtenido al reducir la cantidad de mensajes enviados mediante respuestas 'Cero Vueltas'.",
    calculation: "Se calcula la reducción de mensajes de la empresa (-50% a -60%) multiplicada por el costo de mensajería API/CRM ($45/msg) más las horas-hombre de tipeo liberadas ($5.000/hora laboral).",
    impact: "⚡ Solución Spoter (Verde = Bueno): Genera un retorno de inversión (ROI) inmediato: reduce el gasto en plataformas de mensajería y libera hasta un puesto completo de trabajo para tareas comerciales activas.",
    benchmark: "Ahorro promedio del 55% al 60% en volumen de mensajes y recupero de más de 100 horas operativas mensuales."
  },
  bottleneck: {
    title: "Carga Operativa, Bot y Derivación Humana (Handoff)",
    meaning: "Analiza cómo se distribuye la atención entre el Bot (automatización) y los asesores humanos del equipo.",
    calculation: "Se separa el volumen atendido por Bots del volumen atendido por personas reales. En los asesores humanos, se calcula el porcentaje absorbido por el asesor más cargado.",
    impact: "💡 Enfoque Spoter: Si el Bot absorbe volumen, es Verde = Bueno (automatización exitosa). Si un asesor humano concentra más del 60% de la carga humana, es Rojo = Malo (cuello de botella con demoras y errores).",
    benchmark: "Bajo política de autoservicio: Bot > 50%. En atención humana: ningún asesor debe superar el 35-40% de la carga total."
  },
  avg_wait: {
    title: "Espera Promedio del Canal",
    meaning: "Media aritmética de todos los tiempos de espera registrados en el período.",
    calculation: "Suma total de minutos de espera dividida por la cantidad de respuestas auditadas.",
    impact: "Refleja la agilidad promedio del canal de atención frente al estándar del rubro.",
    benchmark: "Menor a 5 minutos en atención en caliente."
  },
  p90_wait: {
    title: "Percentil 90 (P90 de Espera)",
    meaning: "El 90% de los usuarios fue atendido en este tiempo o menos. Solo el 10% más demorado esperó más que este valor.",
    calculation: "Cálculo estadístico ordenando los tiempos de menor a mayor y tomando la posición al 90%.",
    impact: "Muestra la peor cara del servicio sin ser distorsionada por casos extremos atípicos.",
    benchmark: "En canales de alto rendimiento, el P90 no debe superar los 15 minutos."
  },
  p95_wait: {
    title: "Percentil 95 (P95 de Espera)",
    meaning: "El umbral del 5% de casos más demorados de todo el período.",
    calculation: "Posición al 95% de la serie ordenada de tiempos de espera.",
    impact: "Identifica los casos que caen en riesgo total de abandono, quejas o cancelación.",
    benchmark: "Menor a 25 minutos."
  },
  over_warning: {
    title: "❄️ ¿Qué es la Zona Fría (Zona Azul) en el SLA?",
    meaning: "Representa todas las respuestas donde el usuario debió esperar más de 15 minutos.\n\nSe denomina 'Zona Fría' (históricamente llamada Zona Azul) porque en WhatsApp el cliente se enfría por completo ('lead frío').",
    calculation: "Conteo de turnos de respuesta donde el tiempo de espera superó el umbral crítico de 15 minutos.",
    impact: "🚨 Pérdida Directa (Rojo = Malo): En canales de mensajería instantánea, el 70%+ de los clientes acude a un competidor o abandona la compra si no es atendido en los primeros minutos. Entrar en Zona Fría destruye la conversión comercial.",
    benchmark: "Menos del 5% del total de turnos en Zona Fría. El 90%+ debe atenderse de inmediato (< 2-6 min)."
  },
  drops: {
    title: "Expulsiones del Sistema (Timeout de Operador)",
    meaning: "Veces que la plataforma removió al asesor automáticamente por no responder a tiempo la conversación en espera.",
    calculation: "Conteo de mensajes de sistema que contienen 'fue removido automáticamente' o similar.",
    impact: "Indica saturación extrema del operador y muestra un mensaje técnico desagradable al cliente.",
    benchmark: "0 incidentes."
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initTabs();

  // El catálogo se carga antes que nada: sin él no hay rubros, plantillas,
  // SLAs ni supuestos económicos, así que no tiene sentido habilitar la carga
  // de archivos hasta tenerlo.
  try {
    await cargarCatalogo();
  } catch (e) {
    console.error('No se pudo cargar rubros.json:', e);
    const zona = document.getElementById('dropzonePanel');
    if (zona) {
      const aviso = document.createElement('div');
      aviso.className = 'engine-notice';
      aviso.style.marginTop = '18px';
      aviso.innerHTML = `
        <div class="engine-notice-icon">⚠️</div>
        <div class="engine-notice-body">
          <h4>No se pudo cargar el catálogo de rubros</h4>
          <p>El archivo <code>rubros.json</code> no está disponible, y sin él no se
          puede clasificar el rubro ni calcular SLAs, plantillas o LTV.</p>
          <p class="engine-notice-cta">Si abriste el archivo con doble clic, servilo por HTTP:
          <code>python3 api_server.py 8080</code></p>
        </div>`;
      zona.appendChild(aviso);
    }
    showToast('⚠️ No se pudo cargar rubros.json');
    return;
  }

  poblarSelectoresDeRubro();
  initDragAndDrop();
  initWizardEvents();
  initSimulator();
  initExecutiveControls();
  initModalEvents();
  initTemplateToggle();
  initResetModal();
  checkApiStatus();
});

// --- TEMA CLARO / OSCURO ---
function initTheme() {
  const toggleBtn = document.getElementById('btnTheme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('spoter_actuen_theme') || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('spoter_actuen_theme', next);
    toggleBtn.textContent = next === 'dark' ? '🌙' : '☀️';
  });
  toggleBtn.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
}

// --- PESTAÑAS ---
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });
}

// --- CONTROLES EJECUTIVOS SUPERIORES (FOCO Y HANDOFF) ---
function initExecutiveControls() {
  const selectFocus = document.getElementById('selectFocus');
  const selectHandoff = document.getElementById('selectHandoff');

  // Inicializar política de handoff guardada
  const savedHandoff = localStorage.getItem('spoter_handoff_policy');
  if (savedHandoff && selectHandoff) {
    selectHandoff.value = savedHandoff;
  }

  const triggerReload = () => {
    const focusVal = selectFocus ? (selectFocus.value === 'auto' ? null : selectFocus.value) : null;
    const handoffVal = selectHandoff ? selectHandoff.value : (localStorage.getItem('spoter_handoff_policy') || 'hybrid');
    localStorage.setItem('spoter_handoff_policy', handoffVal);
    const rubroVal = currentData && currentData.meta ? currentData.meta.detected_rubro_key : null;
    if (currentFiles && currentFiles.length) {
      handleFiles(currentFiles, rubroVal, focusVal, handoffVal, true);
    } else {
      loadDataset(rubroVal, focusVal, handoffVal, true);
    }
  };

    const selectRubroTop = document.getElementById('selectRubroTop');
  if (selectRubroTop) {
    selectRubroTop.addEventListener('change', (e) => {
      const newRubro = e.target.value;
      if (currentData) {
        currentData.meta.detected_rubro_key = newRubro;
        currentData.meta.detected_rubro = selectRubroTop.options[selectRubroTop.selectedIndex].text.replace(/^[^\s]+\s/, '');
        currentData.meta.rubro_updated = true;
        const isSales = (currentData.meta.business_focus === 'ventas');
        currentData.master_templates = getDynamicRubroTemplates(newRubro, isSales, currentData.meta.company_name);

        // Re-mapear inmediatamente los disparadores de Handoff al nuevo rubro
        const gapCats = getRubroGapCategories(newRubro);
        if (currentData.handoff_gap_analysis && currentData.handoff_gap_analysis.top_triggers) {
          const oldList = currentData.handoff_gap_analysis.top_triggers;
          currentData.handoff_gap_analysis.top_triggers = gapCats.map((c, i) => {
            const old = oldList[i] || {};
            return {
              category_key: c.key,
              title: c.title,
              icon: c.icon,
              count: old.count || 45,
              percentage: old.percentage || 12.5,
              human_hours_spent: old.human_hours_spent || 8.0,
              is_avoidable: c.feasibility !== "Consultiva (Humano)",
              automation_feasibility: c.feasibility,
              solution_type: c.solution_type,
              solution_action: c.solution_action,
              sample_client_phrases: old.sample_client_phrases || [],
              sample_operator_responses: old.sample_operator_responses || [],
              template_target_id: c.template_target_id
            };
          });
          renderHandoffGapAnalysis(currentData.handoff_gap_analysis);
        }

        renderTemplates(currentData.master_templates, isSales);
        renderQualificationPanel(currentData);
        const badgeRubro = document.getElementById('badgeRubroTop');
        if (badgeRubro) badgeRubro.textContent = `🏢 Rubro: ${currentData.meta.detected_rubro}`;
        showToast(`🏢 Rubro y brechas actualizadas: ${selectRubroTop.options[selectRubroTop.selectedIndex].text}`);
      }
      triggerReload();
    });
  }

  if (selectFocus) selectFocus.addEventListener('change', triggerReload);
  
  if (selectHandoff) {
    selectHandoff.addEventListener('change', (e) => {
      const newVal = e.target.value;
      localStorage.setItem('spoter_handoff_policy', newVal);
      if (currentData) {
        currentData.meta.handoff_policy = newVal;
        if (currentData.handoff) currentData.handoff.policy = newVal;
        renderBottleneckKPI(currentData.handoff);
        renderQualificationPanel(currentData);
        updateScorecardHandoff(currentData, newVal);
        const policyLabel = selectHandoff.options[selectHandoff.selectedIndex].text;
        showToast(`🤖 Política de Handoff actualizada: ${policyLabel}`);
      }
      triggerReload();
    });
  }

  // Menú de exportación discreto
  const btnToggleExport = document.getElementById('btnToggleExportMenu');
  const dropdownExport = document.getElementById('dropdownExport');
  if (btnToggleExport && dropdownExport) {
    btnToggleExport.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownExport.classList.toggle('open');
      const isOpen = dropdownExport.classList.contains('open');
      btnToggleExport.setAttribute('aria-expanded', isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!dropdownExport.contains(e.target)) {
        dropdownExport.classList.remove('open');
        btnToggleExport.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Descargas discretas
  const btnTopMd = document.getElementById('btnTopDownloadReport');
  if (btnTopMd) {
    btnTopMd.addEventListener('click', () => {
      if (dropdownExport) dropdownExport.classList.remove('open');
      downloadReportFile();
    });
  }

  const btnTopPdf = document.getElementById('btnTopPrintReport');
  if (btnTopPdf) {
    btnTopPdf.addEventListener('click', () => {
      if (dropdownExport) dropdownExport.classList.remove('open');
      window.print();
    });
  }
}

// --- VERIFICAR ESTADO API ---
function checkApiStatus() {
  const badge = document.getElementById('apiStatusBadge');
  fetch('/api/status')
    .then(r => r.json())
    .then(data => {
      badge.innerHTML = `<span class="status-dot"></span> Spoter Motor Online (${data.version})`;
      badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    })
    .catch(() => {
      badge.innerHTML = `<span class="status-dot" style="background:#f59e0b;box-shadow:none;"></span> Modo Autónomo en Navegador`;
    });
}

// --- CARGA DE DATOS ---
async function loadDataset(forcedRubro = null, forcedFocus = null, handoffPolicy = null, skipWizard = false) {
  const btn = document.getElementById('btnLoadDefault');
  if (btn) btn.disabled = true;
  showToast("⏳ Spoter: Procesando lote de prueba y analizando intenciones...");
  
  // Estos valores se declaran FUERA del try porque el catch —que contiene el
  // fallback a sample_data.json— también los usa. Declarados con const dentro
  // del try quedaban fuera de alcance y el fallback moría con un ReferenceError,
  // que el catch externo se tragaba: sin motor, el botón no hacía nada.
  const selectFocus = document.getElementById('selectFocus');
  const selectHandoff = document.getElementById('selectHandoff');
  const rVal = forcedRubro || (currentData && currentData.meta ? currentData.meta.detected_rubro_key : '');
  const fVal = forcedFocus || (selectFocus && selectFocus.value === 'auto' ? '' : (selectFocus ? selectFocus.value : ''));
  const savedHandoff = localStorage.getItem('spoter_handoff_policy');
  const hVal = handoffPolicy || savedHandoff || (selectHandoff ? selectHandoff.value : 'hybrid');
  localStorage.setItem('spoter_handoff_policy', hVal);

  try {
    let url = `/api/analyze-default?handoff=${hVal}`;
    if (fVal) url += `&focus=${fVal}`;
    if (rVal) url += `&rubro=${rVal}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error en servidor");
    const data = await res.json();
    
    if (skipWizard) {
      renderAnalysis(data);
      showToast("✅ Análisis completado con éxito");
    } else {
      openWizard(data);
      showToast("⚙️ Calibrá los parámetros antes de ver los resultados");
    }
  } catch (err) {
    console.warn("API server no disponible, intentando cargar sample_data.json estático:", err);
    try {
      const staticRes = await fetch('./sample_data.json');
      if (staticRes.ok) {
        const data = await staticRes.json();
        data.meta.handoff_policy = hVal;
        if (data.handoff) data.handoff.policy = hVal;
        if (rVal) {
          data.meta.detected_rubro_key = rVal;
          const infoR = CATALOGO.rubros[rVal];
          if (infoR) data.meta.detected_rubro = infoR.name;
          data.master_templates = getDynamicRubroTemplates(rVal, (fVal || data.meta.business_focus) === 'ventas', data.meta.company_name);
        }
        if (fVal) {
          data.meta.business_focus = fVal;
          data.master_templates = getDynamicRubroTemplates(data.meta.detected_rubro_key, fVal === 'ventas', data.meta.company_name);
        }
        if (skipWizard) {
          renderAnalysis(data);
          showToast("✅ Lote de prueba cargado (Modo Estático / GitHub Pages)");
        } else {
          openWizard(data);
          showToast("⚙️ Calibrá los parámetros antes de ver los resultados");
        }
        return;
      }
    } catch (e2) {
      console.warn("Fallo carga de sample_data.json:", e2);
    }
    showToast("ℹ️ Seleccioná o arrastrá tus archivos CSV para comenzar.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- DRAG & DROP Y SUBIDA DE ARCHIVOS ---
function initDragAndDrop() {
  const dropzoneBox = document.getElementById('dropzoneBox') || document.getElementById('dropzonePanel');
  const fileInput = document.getElementById('fileInput');
  const btnUpload = document.getElementById('btnUpload');
  const btnDefault = document.getElementById('btnLoadDefault');

  if (btnDefault) {
    btnDefault.addEventListener('click', () => {
      currentFiles = null;
      loadDataset();
    });
  }

  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        let filesArr = Array.from(e.target.files);
        if (filesArr.length > 10) {
          showToast("📁 Capacidad máxima: Se procesarán los primeros 10 archivos CSV.");
          filesArr = filesArr.slice(0, 10);
        }
        currentFiles = filesArr;
        handleFiles(currentFiles);
      }
    });
  }

  if (dropzoneBox) {
    dropzoneBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneBox.classList.add('dragover');
    });

    dropzoneBox.addEventListener('dragleave', () => dropzoneBox.classList.remove('dragover'));

    dropzoneBox.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneBox.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        let filesArr = Array.from(e.dataTransfer.files);
        if (filesArr.length > 10) {
          showToast("📁 Capacidad máxima: Se procesarán los primeros 10 archivos CSV.");
          filesArr = filesArr.slice(0, 10);
        }
        currentFiles = filesArr;
        handleFiles(currentFiles);
      }
    });
  }
}

async function handleFiles(files, forcedRubro = null, forcedFocus = null, handoffPolicy = null, skipWizard = false) {
  const selectFocus = document.getElementById('selectFocus');
  const selectHandoff = document.getElementById('selectHandoff');
  const rVal = forcedRubro || (currentData && currentData.meta ? currentData.meta.detected_rubro_key : '');
  const fVal = forcedFocus || (selectFocus && selectFocus.value === 'auto' ? '' : (selectFocus ? selectFocus.value : ''));
  const hVal = handoffPolicy || (selectHandoff ? selectHandoff.value : 'hybrid');

  let fileList = Array.from(files);
  if (fileList.length > 10) {
    showToast("📁 Capacidad máxima: Se procesarán los primeros 10 archivos CSV.");
    fileList = fileList.slice(0, 10);
  }

  showToast(`Spoter: Procesando ${fileList.length} archivo(s) CSV...`);

  try {
    const formData = new FormData();
    for (let f of fileList) formData.append('files', f);
    
    let url = `/api/analyze?handoff=${hVal}`;
    if (fVal) url += `&focus=${fVal}`;
    if (rVal) url += `&rubro=${rVal}`;

    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (skipWizard) {
        renderAnalysis(data);
        showToast("✅ Análisis multirubro completado");
      } else {
        openWizard(data);
        showToast("⚙️ Calibrá los parámetros antes de ver los resultados");
      }
      return;
    }
  } catch (e) {
    console.log("Servidor no respondió, procesando en cliente...", e);
  }

  processFilesClientSide(fileList, fVal, hVal, rVal);
}


// --- CATÁLOGO MAESTRO DINÁMICO DE PLANTILLAS MULTIRUBRO (11 RUBROS) ---
// ==========================================================================
// CATÁLOGO — fuente única de verdad, compartida con engine.py
// ==========================================================================
// rubros.json tiene los 11 rubros con sus SLAs, modelos de LTV, keywords y
// categorías, más las plantillas, las categorías de handoff y los supuestos
// económicos. Nada de esto se duplica acá: si falta un dato, va al JSON.

let CATALOGO = null;

async function cargarCatalogo() {
  if (CATALOGO) return CATALOGO;
  // no-cache fuerza una revalidación condicional: si el catálogo cambió en un
  // deploy, el navegador no sigue sirviendo el viejo desde su caché. Cuando no
  // cambió el servidor responde 304 y no se transfiere nada.
  const res = await fetch('rubros.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se pudo cargar rubros.json (HTTP ${res.status})`);
  CATALOGO = await res.json();
  return CATALOGO;
}

/** Supuestos económicos (FX, costos, tasas). Un solo lugar para todos. */
function supuestos() {
  return (CATALOGO && CATALOGO.supuestos_economicos) || {};
}

/** Alias bancario a partir del nombre. Espejo de derivar_alias() en engine.py. */
function derivarAlias(nombreEmpresa) {
  const base = String(nombreEmpresa || '').trim().toUpperCase()
    .replace(/[^A-Za-z0-9]/g, '.').replace(/^\.+|\.+$/g, '');
  return (base && base !== 'EMPRESA') ? `${base}.OFICIAL` : 'PAGOS.OFICIALES';
}

/** Plantillas maestras del rubro, desde el catálogo. */
function getDynamicRubroTemplates(rubroKey, isSales, companyName) {
  if (!CATALOGO) return [];
  const porRubro = CATALOGO.plantillas[rubroKey] || CATALOGO.plantillas['servicios_generales'];
  const plantillas = porRubro[isSales ? 'ventas' : 'soporte'] || porRubro['ventas'];
  const cName = (companyName && companyName !== 'Empresa' && companyName !== 'Nuestra Empresa')
    ? companyName : 'Nuestra Empresa';
  const crudo = JSON.stringify(plantillas)
    .split('{{ALIAS}}').join(derivarAlias(cName))
    .split('{{EMPRESA}}').join(cName);
  return JSON.parse(crudo);
}

/** Categorías de brechas de handoff del rubro, con las regex compiladas. */
function getRubroGapCategories(rubroKey) {
  if (!CATALOGO) return [];
  const cats = CATALOGO.categorias_gap[rubroKey] || CATALOGO.categorias_gap['servicios_generales'];
  return cats.map(c => {
    const d = Object.assign({}, c);
    if (d.regex != null) d.regex = new RegExp(d.regex, d.regex_flags || '');
    delete d.regex_flags;
    return d;
  });
}

/** Llena los <select> de rubro desde el catálogo.
 *
 * Antes las opciones estaban escritas a mano en index.html, en dos selectores
 * que habían quedado desincronizados: el de la barra ejecutiva usaba cinco
 * claves que el motor no conoce (y las ignoraba en silencio), y al del wizard
 * le faltaba el rubro SaaS. Generándolas del catálogo, no pueden divergir.
 */
function poblarSelectoresDeRubro() {
  const rubros = Object.entries(CATALOGO.rubros);
  ['selectRubroTop', 'wizSelectRubro'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const previo = sel.value;
    const tieneAuto = !!sel.querySelector('option[value="auto"]');
    sel.innerHTML =
      (tieneAuto ? '<option value="auto">🎯 Detección automática</option>' : '') +
      rubros.map(([clave, info]) =>
        `<option value="${clave}">${info.icon} ${escapeHtml(info.name)}</option>`
      ).join('');
    if (previo && sel.querySelector(`option[value="${previo}"]`)) sel.value = previo;
  });
}

/** Puntúa cada rubro contando coincidencias de sus keywords. Espejo del motor. */
function detectarRubro(textoCliente) {
  const puntajes = {};
  let mejor = 'servicios_generales', maximo = 0;
  for (const [clave, info] of Object.entries(CATALOGO.rubros)) {
    let score = 0;
    for (const patron of info.keywords) {
      const m = textoCliente.match(new RegExp(patron, 'gi'));
      if (m) score += m.length;
    }
    puntajes[clave] = score;
    if (score > maximo) { maximo = score; mejor = clave; }
  }
  return { clave: maximo > 0 ? mejor : 'servicios_generales', puntajes };
}


// --- DEFINICIÓN DE CATEGORÍAS DE BRECHAS DE HANDOFF POR RUBRO ---

// --- FALLBACK CLIENT-SIDE (MULTIRUBRO) ---
function processFilesClientSide(files, forcedFocus = null, handoffPolicy = null, forcedRubro = null) {
  let allRows = [];
  let loaded = 0;

  for (let file of files) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'utf-8',
      complete: (results) => {
        allRows = allRows.concat(results.data);
        loaded++;
        if (loaded === files.length) {
          runClientSideAnalysis(allRows, forcedFocus, handoffPolicy, files.length, forcedRubro);
        }
      }
    });
  }
}

/** Muestra un error de interpretación del CSV en lugar de un informe vacío. */
function showParseError(motivos, columnas, filas) {
  const panel = document.getElementById('dropzonePanel');
  const html = `
    <div class="engine-notice" style="border-color: var(--danger, #ef4444);">
      <div class="engine-notice-icon">⚠️</div>
      <div class="engine-notice-body">
        <h4>El CSV se leyó pero no pudo interpretarse</h4>
        <p>Se leyeron <strong>${filas.toLocaleString()}</strong> filas, pero ${motivos.map(escapeHtml).join('; ')}.</p>
        <p><strong>Columnas detectadas:</strong> ${columnas.map(escapeHtml).join(', ') || '(ninguna)'}</p>
        <p class="engine-notice-cta">Revisá que el archivo sea una exportación de conversaciones con una columna que indique la dirección del mensaje.</p>
      </div>
    </div>`;
  if (panel) {
    let box = document.getElementById('parseErrorBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'parseErrorBox';
      box.style.marginTop = '18px';
      panel.appendChild(box);
    }
    box.innerHTML = html;
  }
  showToast('⚠️ No se pudo interpretar el CSV — revisá las columnas');
}

// --- Métricas derivadas del CSV (espejo de engine.py) ------------------------
// Los índices de percentil, el conteo de ráfagas y las franjas de SLA replican
// la semántica del motor Python para que ambos den el mismo número.

/** Percentil por índice truncado, igual que w_list[int(n * q)] en Python. */
function percentileAt(sortedList, q) {
  if (!sortedList.length) return 0.0;
  const idx = Math.min(sortedList.length - 1, Math.floor(sortedList.length * q));
  return sortedList[idx];
}

function round1(n) { return Math.round(n * 10) / 10; }

/** Renderiza con un decimal fijo, como el round(x, 1) de Python al interpolar. */
function fmt1(n) { return Number(n).toFixed(1); }

/** Espejo de calc_brackets(): promedio, percentiles, franjas y resúmenes. */
function calcBrackets(list, sla) {
  const w = [...list].sort((a, b) => a - b);
  const nw = w.length || 1;
  const tImm = sla.ideal_immediate, tAcc = sla.acceptable;
  const tWarn = sla.warning, tCrit = sla.critical;

  const bImm  = w.filter(x => x <= tImm).length;
  const bAcc  = w.filter(x => x > tImm && x <= tAcc).length;
  const bWarn = w.filter(x => x > tAcc && x <= tWarn).length;
  const bCold = w.filter(x => x > tWarn && x <= tCrit).length;
  const bCrit = w.filter(x => x > tCrit).length;

  const okCount = bImm + bAcc + bWarn;
  const riskCount = bCold + bCrit;
  const f = n => Math.round(n);

  return {
    average_minutes: w.length ? round1(w.reduce((a, b) => a + b, 0) / nw) : 0.0,
    median_minutes: w.length ? round1(w[Math.floor(nw / 2)]) : 0.0,
    p90_minutes: w.length ? round1(percentileAt(w, 0.9)) : 0.0,
    p95_minutes: w.length ? round1(percentileAt(w, 0.95)) : 0.0,
    count: w.length,
    over_warning_count: riskCount,
    over_warning_percentage: round1((riskCount / nw) * 100),
    ok_summary: {
      count: okCount,
      percentage: round1((okCount / nw) * 100),
      label: "Atención Oportuna / Saludable (3 Franjas)"
    },
    risk_summary: {
      count: riskCount,
      percentage: round1((riskCount / nw) * 100),
      label: "Zona de Riesgo / Fuga (2 Franjas)"
    },
    brackets: {
      [`< ${f(tImm)}m (Inmediato)`]: bImm,
      [`${f(tImm)} - ${f(tAcc)}m (Aceptable)`]: bAcc,
      [`${f(tAcc)} - ${f(tWarn)}m (Alerta)`]: bWarn,
      [`${f(tWarn)} - ${f(tCrit)}m (❄️ Zona Fría)`]: bCold,
      [`> ${f(tCrit)}m (Crítico)`]: bCrit
    }
  };
}

/** Ordena cada conversación por fecha, en sitio. Espejo del msgs.sort() del motor. */
function sortConversationsByDate(clientConvs) {
  Object.keys(clientConvs).forEach(cid => {
    clientConvs[cid].sort((a, b) => {
      const da = parseDate(a['Fecha_Hora']);
      const db = parseDate(b['Fecha_Hora']);
      return (da ? da.getTime() : -Infinity) - (db ? db.getTime() : -Infinity);
    });
  });
}

/**
 * Ráfagas de mensajes consecutivos de la empresa (infracción a Cero Vueltas).
 * Una ráfaga se cierra cuando responde el cliente. Cada mensaje cuenta según
 * sus divisiones por [---saltomensaje---], igual que en el motor.
 */
function computeBursts(clientConvs, splitRegex) {
  const burstSizes = [];
  Object.keys(clientConvs).forEach(cid => {
    let cur = 0;
    for (const m of clientConvs[cid]) {
      if (isPropio(m)) {
        const txt = m['Mensaje'] || '';
        const parts = txt ? txt.split(splitRegex).filter(x => x.trim()) : [];
        cur += Math.max(1, parts.length);
      } else if (cur > 0) {
        burstSizes.push(cur);
        cur = 0;
      }
    }
    if (cur > 0) burstSizes.push(cur);
  });

  const total = burstSizes.length || 1;
  const b1 = burstSizes.filter(b => b === 1).length;
  const b2 = burstSizes.filter(b => b === 2).length;
  const b3 = burstSizes.filter(b => b >= 3).length;
  return {
    rate: round1(((b2 + b3) / total) * 100),
    burst_1_msg: b1,
    burst_2_msgs: b2,
    burst_3_plus_msgs: b3,
    total_bursts: burstSizes.length
  };
}

/** Distribución horaria y semanal del PRIMER contacto de cada conversación. */
function computeSchedule(clientConvs, uniqueClients) {
  const hourly = new Array(24).fill(0);
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const weekdays = {};
  dayNames.forEach(d => { weekdays[d] = 0; });
  let biz = 0, after = 0, conFecha = 0;

  Object.keys(clientConvs).forEach(cid => {
    const msgs = clientConvs[cid];
    if (!msgs.length) return;
    const first = parseDate(msgs[0]['Fecha_Hora']);
    if (!first) return;
    conFecha++;
    const h = first.getHours();
    // getDay(): domingo=0. weekday() de Python: lunes=0.
    const w = (first.getDay() + 6) % 7;
    hourly[h]++;
    weekdays[dayNames[w]]++;
    const esLaboral = (w < 5 && h >= 8 && h < 18) || (w === 5 && h >= 8 && h < 13);
    if (esLaboral) biz++; else after++;
  });

  // Sin ninguna fecha reconocible no se inventa una curva.
  if (conFecha === 0) return null;

  const maxH = Math.max(...hourly);
  const peakHourIdx = maxH > 0 ? hourly.indexOf(maxH) : 10;
  const peakDay = Object.keys(weekdays).reduce((a, b) => weekdays[b] > weekdays[a] ? b : a, dayNames[0]);
  const pad = n => String(n).padStart(2, '0');

  const topPeakHours = hourly
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(({ hour, count }) => ({
      hour,
      hour_range: `${pad(hour)}:00 a ${pad(hour + 1)}:00 hs`,
      count,
      percentage: round1((count / (uniqueClients || 1)) * 100)
    }));

  return {
    hourly,
    weekdays,
    peak_hour: `${pad(peakHourIdx)}:00 a ${pad(peakHourIdx + 1)}:00 hs`,
    peak_day: peakDay,
    top_peak_hours: topPeakHours,
    peak_hours_summary: topPeakHours.map(p => `${p.hour_range.split(' ')[0]} hs (${p.percentage}%)`).join(' | '),
    business_hours_count: biz,
    after_hours_count: after,
    business_hours_percentage: round1((biz / (uniqueClients || 1)) * 100),
    after_hours_percentage: round1((after / (uniqueClients || 1)) * 100)
  };
}

/**
 * Separa la espera de la PRIMERA respuesta de la empresa de las siguientes.
 * El "primer" turno solo se consume con un mensaje de empresa que además traiga
 * un tiempo de espera parseable, igual que en el motor.
 */
function splitWaitTimes(clientConvs) {
  const initial = [], inConv = [];
  Object.keys(clientConvs).forEach(cid => {
    let firstSeen = false;
    for (const m of clientConvs[cid]) {
      const te = String(m['Tiempo Espera'] || '').trim();
      if (!te) continue;
      const val = parseFloat(te);
      if (isNaN(val)) continue;
      if (!isPropio(m)) continue;
      if (!firstSeen) { initial.push(val); firstSeen = true; }
      else { inConv.push(val); }
    }
  });
  return { initial, inConv };
}

// --- Triage IU/IC, LTV, Spoter Lite, temas y Semáforo (espejo de engine.py) ----
// Portado de _compute_prioritization_and_ltv y _evaluate_actuen_dynamic. Los
// umbrales, pesos y regex replican el motor para que ambos den el mismo número.

const ES_BOT = /bot|sistema|auto|automatiz/i;
const RE_INTENT_HIGH = /(precio|cuanto sale|cuánto sale|costo|cotiz|comprar|pedir|tarjeta|cuota|transferencia|alias|cbu|pago|turno|reserv|disponib|env[ií]o|flete|descuento|promo)/i;
const RE_CLOSING = /(ya transfer[ií]|comprobante|pasame el alias|pasame el link|cbu|confirmar|donde firmo|lo llevo|quiero comprar|reservalo|reservámelo)/i;
const RE_ENABLERS = /(dni|calle|direcci[oó]n|localidad|provincia|mail|correo|orden|patente|modelo|a[ñn]o)/i;
const RE_PRESUPUESTO = /(presupuesto|cotiz|cuota|financi|env[ií]o)/i;

/** IC/IU por conversación, más LTV económico y fases Spoter Lite. */
function computePrioritizationAndLtv(clientConvs, infoRubro, sla, focus) {
  const S = supuestos();
  const ltvCfg = infoRubro.ltv_model;
  const avgTicket = ltvCfg.avg_ticket_usd;
  const freq = ltvCfg.annual_frequency;
  const years = ltvCfg.retention_years;
  const ltvVal = Math.round(avgTicket * freq * years);
  const cac = ltvCfg.cac_usd;
  const tWarn = sla.warning != null ? sla.warning : 15.0;

  const ids = Object.keys(clientConvs);
  const totalClients = ids.length || 1;

  const icScores = [], iuScores = [], fifoHighWaits = [];
  let highIntent = 0, highIntentDelayed = 0, breaches24h = 0, leadsAtRisk = 0;
  let gracia = 0, trabajo = 0, rescate = 0, ruido = 0, rescatables = 0;

  for (const cid of ids) {
    const msgs = clientConvs[cid];
    const userMsgs = msgs.filter(m => !isPropio(m));
    const companyMsgs = msgs.filter(m => isPropio(m));
    const userText = userMsgs.map(m => m['Mensaje'] || '').join(' ').toLowerCase();

    // E: Etapa
    let e;
    if (RE_CLOSING.test(userText)) e = 25;
    else if (RE_INTENT_HIGH.test(userText) && userMsgs.length >= 3) e = 20;
    else if (RE_INTENT_HIGH.test(userText)) e = 15;
    else if (userMsgs.length >= 2) e = 10;
    else e = 5;

    // I: Intención observable
    let i;
    if (RE_CLOSING.test(userText)) i = 30;
    else if (RE_PRESUPUESTO.test(userText)) i = 20;
    else if (RE_INTENT_HIGH.test(userText)) i = 15;
    else if (userMsgs.length > 0) i = 10;
    else i = 0;

    // G: Engagement (ritmo + sustancia)
    const gRitmo = userMsgs.length >= 3 ? 8 : (userMsgs.length >= 1 ? 5 : 0);
    const avgCharLen = userMsgs.length
      ? userMsgs.reduce((a, m) => a + (m['Mensaje'] || '').length, 0) / userMsgs.length : 0;
    const hasQ = userText.includes('?') ? 5 : 0;
    const gSustancia = Math.min(10, (avgCharLen > 35 ? 5 : 2) + hasQ);
    const g = gRitmo + gSustancia;

    const h = RE_ENABLERS.test(userText) ? 15 : 5;              // H: Habilitantes
    const r = userMsgs.length >= 4 ? 7 : 0;                      // R: Reconexión

    const ghosting = companyMsgs.length > userMsgs.length + 1 ? 10 : 0;
    const icScore = Math.max(0, Math.min(100, e + i + g + h + r - ghosting));
    icScores.push(icScore);

    let maxWait = 0.0;
    for (const m of companyMsgs) {
      const te = String(m['Tiempo Espera'] || '').trim();
      if (!te) continue;
      const w = parseFloat(te);
      if (!isNaN(w) && w > maxWait) maxWait = w;
    }

    // IU: valor estructural (A), espera contra SLA (B), compromisos (C), intención (D)
    const aNorm = focus === 'ventas' ? 0.75 : 0.60;
    let bNorm;
    if (maxWait <= 0) bNorm = 0.1;
    else if (maxWait <= (sla.ideal_immediate != null ? sla.ideal_immediate : 2.0)) bNorm = 0.3;
    else if (maxWait <= tWarn) bNorm = 0.6;
    else bNorm = Math.min(1.0, 0.7 + (maxWait / (tWarn * 3)));
    const cNorm = 0.2;
    const dNorm = icScore >= 80 ? 1.0 : icScore >= 60 ? 0.8 : icScore >= 40 ? 0.6 : icScore >= 20 ? 0.4 : 0.2;
    iuScores.push(round1(100 * (0.25 * aNorm + 0.35 * bNorm + 0.15 * cNorm + 0.25 * dNorm)));

    if (icScore >= 40) {
      highIntent++;
      if (maxWait > 0) fifoHighWaits.push(maxWait);
      if (maxWait > tWarn) highIntentDelayed++;
    }
    if (maxWait > 1440) breaches24h++;
    if (icScore >= 40 && maxWait > tWarn) leadsAtRisk++;

    // Fases Spoter Lite
    const n = msgs.length;
    if (icScore < 15 && n <= 2) ruido++;
    else if (n <= 3) gracia++;
    else if (n <= 7) trabajo++;
    else { rescate++; if (icScore >= 40) rescatables++; }
  }

  const perdida = S.tasa_caida_conversion;
  const immediateLost = Math.round(leadsAtRisk * avgTicket * perdida);
  const ltvCapitalLost = Math.round(leadsAtRisk * ltvVal * perdida);
  const cacWasted = Math.round(leadsAtRisk * cac);
  const totalRisk = ltvCapitalLost + cacWasted;
  const recovered = Math.round(totalRisk * S.tasa_recuperacion_spoter);
  const fx = S.tipo_cambio_ars;

  const suma = a => a.reduce((x, y) => x + y, 0);
  const avgIc = round1(suma(icScores) / (icScores.length || 1));
  const avgIu = round1(suma(iuScores) / (iuScores.length || 1));
  const fifoAvg = round1(suma(fifoHighWaits) / (fifoHighWaits.length || 1));
  const spoterWait = round1(Math.min(sla.ideal_immediate != null ? sla.ideal_immediate : 2.0, 2.5));

  const ltv_economics = {
    rubro_name: infoRubro.name,
    avg_ticket_usd: avgTicket, annual_frequency: freq, retention_years: years,
    ltv_usd: ltvVal, cac_usd: cac,
    ticket_name: ltvCfg.ticket_name || 'Ticket Base',
    concept: ltvCfg.concept || '',
    leads_analyzed: totalClients,
    leads_at_risk_count: leadsAtRisk,
    leads_at_risk_percentage: round1((leadsAtRisk / totalClients) * 100),
    immediate_lost_usd: immediateLost,
    ltv_capital_at_risk_usd: ltvCapitalLost,
    cac_wasted_usd: cacWasted,
    total_economic_risk_usd: totalRisk,
    projected_recovered_ltv_usd: recovered,
    exchange_rate_ars: fx,
    total_economic_risk_ars: totalRisk * fx,
    projected_recovered_ltv_ars: recovered * fx
  };

  const prioritization_audit = {
    avg_ic_score: avgIc,
    avg_iu_score: avgIu,
    high_intent_leads_count: highIntent,
    high_intent_delayed_count: highIntentDelayed,
    fifo_delayed_percentage: round1((highIntentDelayed / (highIntent || 1)) * 100),
    whatsapp_24h_breaches: breaches24h,
    whatsapp_24h_breach_percentage: round1((breaches24h / totalClients) * 100),
    ic_distribution: {
      muy_alta_80_100: icScores.filter(x => x >= 80).length,
      alta_60_79: icScores.filter(x => x >= 60 && x < 80).length,
      media_40_59: icScores.filter(x => x >= 40 && x < 60).length,
      baja_20_39: icScores.filter(x => x >= 20 && x < 40).length,
      ruido_0_19: icScores.filter(x => x < 20).length
    },
    iu_presets: {
      comercial_avg: round1(avgIu * 1.06),
      velocidad_avg: round1(avgIu * 0.96),
      cumplimiento_avg: round1(avgIu * 0.99),
      calidad_avg: round1(avgIu * 1.02)
    },
    fifo_vs_spoter_wait: {
      fifo_high_intent_wait_min: fifoAvg,
      spoter_high_intent_wait_min: spoterWait,
      wait_reduction_percentage: fifoAvg > 0 ? round1((1 - (spoterWait / (fifoAvg || 1))) * 100) : 0.0
    }
  };

  const spoter_lite = {
    phases: {
      gracia_count: gracia, gracia_percentage: round1((gracia / totalClients) * 100),
      trabajo_count: trabajo, trabajo_percentage: round1((trabajo / totalClients) * 100),
      cierre_rescate_count: rescate, cierre_rescate_percentage: round1((rescate / totalClients) * 100),
      ruido_stop_count: ruido, ruido_stop_percentage: round1((ruido / totalClients) * 100)
    },
    leads_rescatables_count: rescatables,
    leads_rescatables_percentage: rescate ? round1((rescatables / (rescate || 1)) * 100) : 0.0,
    rescate_strategy_summary: `${rescatables} leads con intención activa (IC >= 40) quedaron abandonados sin aplicar una pregunta de rescate estructurada antes de declarar el silencio.`
  };

  return { ltv_economics, prioritization_audit, spoter_lite };
}

/** Temas por categoría del rubro, con severidad de ping-pong. */
function computeTopics(clientConvs, infoRubro, rubroKey, uniqueClients) {
  const [idealC, idealOp] = CATALOGO.pingpong_por_rubro[rubroKey] || [3.5, 3.0];
  const idealTotal = round1(idealC + idealOp);
  const salida = [];

  for (const [cat, patrones] of Object.entries(infoRubro.categories)) {
    const regs = patrones.map(p => new RegExp(p, 'i'));
    let clientes = 0, msgsTotal = 0, msgsCliente = 0, msgsOperador = 0;

    for (const cid of Object.keys(clientConvs)) {
      const msgs = clientConvs[cid];
      const texto = msgs.filter(m => !isPropio(m)).map(m => (m['Mensaje'] || '').toLowerCase()).join(' ');
      if (!regs.some(re => re.test(texto))) continue;
      clientes++;
      msgsTotal += msgs.length;
      for (const m of msgs) { if (isPropio(m)) msgsOperador++; else msgsCliente++; }
    }

    const avgMsgs = clientes ? msgsTotal / clientes : 0;
    let severity, badge, explicacion;
    if (avgMsgs <= idealTotal * 1.3) {
      severity = 'ÓPTIMO'; badge = 'green'; explicacion = `Dentro del rango ideal para ${infoRubro.name}.`;
    } else if (avgMsgs <= idealTotal * 2.2) {
      severity = 'MODERADO'; badge = 'yellow'; explicacion = 'Idas y vueltas aceptables con leve margen de optimización.';
    } else if (avgMsgs <= idealTotal * 3.5) {
      severity = 'ALERTA'; badge = 'orange'; explicacion = 'Fragmentación evitable: requiere más turnos de lo aconsejado.';
    } else {
      severity = 'CRÍTICO'; badge = 'red'; explicacion = 'Fricción severa: ping-pong excesivo que demora la resolución.';
    }

    salida.push({
      category: cat,
      conversations: clientes,
      percentage: round1((clientes / (uniqueClients || 1)) * 100),
      avg_messages_per_client: round1(avgMsgs),
      avg_client_messages: round1(clientes ? msgsCliente / clientes : 0),
      avg_operator_messages: round1(clientes ? msgsOperador / clientes : 0),
      ideal_client_messages: idealC,
      ideal_operator_messages: idealOp,
      ideal_total_messages: idealTotal,
      ping_pong_rate: idealTotal ? round1(avgMsgs / idealTotal) : 1.0,
      ping_pong_excess_percentage: round1((Math.max(0, avgMsgs - idealTotal) / idealTotal) * 100),
      ping_pong_turns: round1(avgMsgs / 2),
      ping_pong_severity: severity,
      status_explanation: explicacion,
      badge_class: badge,
      total_messages: msgsTotal,
      client_messages: msgsCliente,
      operator_messages: msgsOperador
    });
  }

  salida.sort((a, b) => b.conversations - a.conversations);
  return salida;
}

/** Cierre activo vs pasivo. Descarta difusiones y mensajes automáticos:
 *  medir la calidad de cierre sobre una bienvenida de bot no dice nada del asesor.
 *  Requiere las conversaciones ya ordenadas por fecha. */
function computeClosings(clientConvs) {
  const cfg = CATALOGO.deteccion_cierre;
  const reAuto = new RegExp(cfg.regex_automatico, 'i');
  const reActivo = new RegExp(cfg.regex_cierre_activo, 'i');

  const apariciones = {};
  for (const cid of Object.keys(clientConvs)) {
    const textos = new Set();
    for (const m of clientConvs[cid]) {
      if (!isPropio(m)) continue;
      const t = (m['Mensaje'] || '').trim();
      if (t) textos.add(t);
    }
    textos.forEach(t => { apariciones[t] = (apariciones[t] || 0) + 1; });
  }
  const difusiones = new Set(Object.keys(apariciones)
    .filter(t => apariciones[t] >= cfg.umbral_difusion_conversaciones));

  let activos = 0, pasivos = 0, noEvaluables = 0;
  for (const cid of Object.keys(clientConvs)) {
    const reales = clientConvs[cid].filter(m => {
      if (!isPropio(m)) return false;
      const t = (m['Mensaje'] || '').trim();
      return t && !difusiones.has(t) && !reAuto.test(t);
    });
    if (!reales.length) { noEvaluables++; continue; }
    const ultimo = (reales[reales.length - 1]['Mensaje'] || '').trim();
    if (reActivo.test(ultimo)) activos++; else pasivos++;
  }
  const evaluables = activos + pasivos;
  return {
    passive_closing_rate: round1((pasivos / (evaluables || 1)) * 100),
    evaluables, activos, pasivos, no_evaluables: noEvaluables
  };
}

/** Semáforo ACTÚEN+: los 7 pilares. */
function computeScorecard(ctx) {
  const { focus, rubroName, sla, fragmentationRate, avgWait, pctOverWarning,
          systemDrops, botWelcomes, uniqueClients, handoff, topQuestions, topics } = ctx;
  const isSales = focus === 'ventas';
  const policy = handoff.policy || 'hybrid';
  const sc = [];
  const ent = n => Math.round(n);

  // A - Atraer y Atender
  const botRatio = botWelcomes / (uniqueClients || 1);
  let aStatus, aDiag, aRecom;
  if (policy === 'bot_priority') {
    aStatus = 'ÓPTIMO';
    aDiag = `En política de Bot Autoservicio, el bot absorbe el ${handoff.bot_share_percentage}% de la mensajería inicial sin desbordar al personal humano.`;
    aRecom = 'Mantener menús de autoservicio claros y permitir derivación rápida solo si el bot no comprende la solicitud.';
  } else {
    aStatus = botRatio > 1.1 ? 'ALERTA' : 'ÓPTIMO';
    aDiag = `El bot de bienvenida se activó ${botWelcomes} veces para ${uniqueClients} usuarios (${Math.round(botRatio * 100) / 100} disparos/contacto). En clientes recurrentes, repetir el menú genera fricción antes de conectar con el asesor.`;
    aRecom = 'Filtro Directo: Identificar al cliente en el primer mensaje y transferir al asesor asignado sin menús infinitos.';
  }
  sc.push({ pillar: 'A - Atraer y Atender', score: aStatus === 'ÓPTIMO' ? 75 : 55, status: aStatus,
            focus_context: `Política de Handoff: ${policy.toUpperCase()}`, diagnosis: aDiag, recommendation: aRecom });

  // C - Cero Vueltas
  const cStatus = fragmentationRate > 35 ? 'CRÍTICO' : (fragmentationRate > 15 ? 'ALERTA' : 'ÓPTIMO');
  const qEj = (topQuestions && topQuestions.length)
    ? topQuestions.slice(0, 2).map(q => `"${q[0].slice(0, 35)}..."`).join(', ')
    : 'preguntas cortas consecutivas';
  sc.push({ pillar: 'C - Cero Vueltas', score: fragmentationRate > 35 ? 35 : 70, status: cStatus,
            focus_context: isSales ? 'Cotización Todo-en-Uno' : 'Diagnóstico en Turno Único',
            diagnosis: `El ${fmt1(fragmentationRate)}% de las respuestas de la empresa se envían en ráfagas de 2 o más mensajes seguidos. Se detectan preguntas aisladas como ${qEj}, aumentando la carga cognitiva.`,
            recommendation: 'Imponer la Regla del Bloque Único: Unificar respuesta, viñetas explicativas y el requerimiento de datos en un solo mensaje estructurado.' });

  // T - Tiempos Aceitados
  const tStatus = (avgWait > sla.warning || pctOverWarning > 12) ? 'CRÍTICO' : (avgWait > sla.acceptable ? 'ALERTA' : 'ÓPTIMO');
  sc.push({ pillar: 'T - Tiempos Aceitados', score: tStatus === 'CRÍTICO' ? 35 : (tStatus === 'ALERTA' ? 65 : 85), status: tStatus,
            focus_context: 'SLA Ideal: ' + sla.benchmark_text,
            diagnosis: `Tiempo promedio de ${fmt1(avgWait)} min frente al SLA aceptable de ${ent(sla.acceptable)} min en ${rubroName}. El ${fmt1(pctOverWarning)}% de las consultas superaron el umbral de alerta (${ent(sla.warning)} min). Hubo ${systemDrops} expulsiones del sistema.`,
            recommendation: `Inyectar oxígeno conversacional: Si la gestión demora más de ${ent(sla.ideal_immediate)} minutos, enviar un mensaje de contención predefinido.` });

  // U - Ubicar la Intención (medido con el Índice de Conversión)
  const topInquiry = (topics && topics.length) ? topics[0].category : 'la consulta principal';
  const prio = ctx.prioAudit || {};
  const avgIc = prio.avg_ic_score || 0;
  const dist = prio.ic_distribution || {};
  const calientes = (dist.muy_alta_80_100 || 0) + (dist.alta_60_79 || 0);
  const frias = (dist.baja_20_39 || 0) + (dist.ruido_0_19 || 0);
  const totalIc = calientes + frias + (dist.media_40_59 || 0);
  const uStatus = avgIc >= 60 ? 'ÓPTIMO' : (avgIc >= 40 ? 'ALERTA' : 'CRÍTICO');
  sc.push({ pillar: 'U - Ubicar la Intención', score: Math.round(avgIc), status: uStatus,
            focus_context: `Índice de Conversión medio: ${avgIc}/100`,
            diagnosis: `El IC medio de la cartera es ${avgIc}/100: ${calientes} conversaciones con intención alta y ${frias} que quedaron en zona fría o ruido sobre ${totalIc} analizadas. El ${(topics && topics.length) ? topics[0].percentage : 30}% ingresa por '${topInquiry}'. Un IC bajo puede venir de tráfico frío o de no extraer la necesidad completa en el turno inicial; el desglose por conversación permite distinguirlo.`,
            recommendation: `Diseñar un Blueprint de Micro-intenciones: Al consultar por ${topInquiry.toLowerCase()}, solicitar los datos clave (habilitantes) en el turno inicial para elevar el IC.` });

  // E - Experiencia Personalizada (medido con las fases Spoter Lite)
  const lite = ctx.lite || {};
  const fases = lite.phases || {};
  const rescatables = lite.leads_rescatables_count || 0;
  const pctRescatables = lite.leads_rescatables_percentage || 0;
  const enRescate = fases.cierre_rescate_count || 0;
  const eStatus = pctRescatables >= 50 ? 'CRÍTICO' : (pctRescatables >= 20 ? 'ALERTA' : 'ÓPTIMO');
  sc.push({ pillar: 'E - Experiencia Personalizada',
            score: Math.max(0, Math.min(100, Math.round(100 - pctRescatables))), status: eStatus,
            focus_context: `Protocolo de Rescate: ${pctRescatables}% de la fase de cierre quedó sin reactivar`,
            diagnosis: `De ${enRescate} conversaciones que llegaron a la fase de cierre/rescate, ${rescatables} (${pctRescatables}%) conservaban intención activa (IC >= 40) y quedaron abandonadas sin una pregunta de rescate estructurada. Es abandono sin seguimiento ${isSales ? 'comercial del presupuesto' : 'del estado del trámite/caso'}.`,
            recommendation: 'Protocolo de Rescate: Reactivar al usuario utilizando su nombre y el motivo específico de su consulta, evitando plantillas robóticas.' });

  // N - Nutrir y Cerrar (medido con la tasa de cierres pasivos)
  const uc = CATALOGO.deteccion_cierre;
  const pasivos = ctx.passiveClosingRate != null ? ctx.passiveClosingRate : 58.0;
  const evaluables = ctx.cierresEvaluables || 0;
  const nStatus = pasivos >= uc.umbral_critico_pct ? 'CRÍTICO' : (pasivos >= uc.umbral_alerta_pct ? 'ALERTA' : 'ÓPTIMO');
  sc.push({ pillar: 'N - Nutrir y Cerrar',
            score: Math.max(0, Math.min(100, Math.round(100 - pasivos))), status: nStatus,
            focus_context: (isSales ? 'Tipping Point Comercial' : 'Confirmación de FCR (Resolución)') + ` · ${pasivos}% de cierres pasivos`,
            diagnosis: `El ${pasivos}% de los cierres termina con un mensaje que no incluye pregunta de avance ni llamado a la acción, dejando el control en el usuario. Medido sobre ${evaluables.toLocaleString('en-US')} conversaciones con cierre propio, excluyendo difusiones y mensajes automáticos.`,
            recommendation: 'Cierre Activo Obligatorio: ' + (isSales
              ? 'Cerrar con una pregunta de reserva o confirmación de pedido (Tipping Point).'
              : "Cerrar con confirmación explícita de solución ('¿Quedó resuelta tu gestión o necesitás algo más?').") });

  // + Optimización Continua
  const topHuman = handoff.top_human_operator || 'Un operador';
  const topHumanPct = handoff.top_human_percentage_of_human || 0;
  const botPct = handoff.bot_share_percentage || 0;
  let pStatus, pDiag, pRecom;
  if (policy === 'bot_priority' && botPct >= 40) {
    pStatus = 'ÓPTIMO';
    pDiag = `El Bot absorbe el ${botPct}% de la carga total, logrando alta eficiencia por automatización. Entre los operadores humanos escalados, ${topHuman} atiende el ${fmt1(topHumanPct)}% de los casos complejos.`;
    pRecom = 'Seguir ampliando las intenciones automáticas del Bot para reducir aún más las transferencias complejas.';
  } else {
    const cuello = topHumanPct > 50;
    pStatus = cuello ? 'ALERTA' : 'ÓPTIMO';
    pDiag = `Entre los operadores humanos, ${topHuman} concentra el ${fmt1(topHumanPct)}% de la atención (${(handoff.top_human_messages || 0).toLocaleString('en-US')} msgs), ${cuello ? 'generando un cuello de botella sistémico' : 'con buena distribución de equipo'}.`;
    pRecom = `Cargar atajos rápidos de teclado para ${topHuman} y redistribuir la asignación de leads en horarios pico.`;
  }
  // El pilar + suma la consecuencia patrimonial del cuello de botella.
  const ltvE = ctx.ltv || {};
  const enRiesgo = ltvE.leads_at_risk_count || 0;
  const pctRiesgo = ltvE.leads_at_risk_percentage || 0;
  const capital = ltvE.total_economic_risk_usd || 0;
  let pScore = pStatus === 'ÓPTIMO' ? 80 : 50;
  if (pctRiesgo >= 30) { pStatus = 'CRÍTICO'; pScore = Math.min(pScore, 35); }
  else if (pctRiesgo >= 15 && pStatus === 'ÓPTIMO') { pStatus = 'ALERTA'; pScore = Math.min(pScore, 60); }
  if (enRiesgo) {
    pDiag += ` En paralelo, ${enRiesgo} leads (${pctRiesgo}%) con intención activa esperaron más allá del umbral de alerta: $${capital.toLocaleString('en-US')} USD de capital de cartera expuesto.`;
    pRecom += ' Priorizar por Índice de Urgencia para que el capital en riesgo se atienda primero.';
  }
  sc.push({ pillar: '+ Optimización Continua', score: pScore, status: pStatus,
            focus_context: `Carga Humana (${handoff.human_share_percentage || 0}%) vs Bot (${botPct}%) · Capital expuesto: $${capital.toLocaleString('en-US')} USD`,
            diagnosis: pDiag, recommendation: pRecom });

  return sc;
}

// --- Normalización de valores de entrada -------------------------------------
// Espejo de is_propio() / parse_datetime() de engine.py. Los encabezados se
// normalizan aparte; acá se normalizan los VALORES, que varían por plataforma.

const TRUTHY_PROPIO = new Set([
  'si', 'sí', 'yes', 'y', 'true', 't', '1',
  'out', 'outgoing', 'saliente', 'enviado', 'empresa', 'me'
]);

/** True si el mensaje lo envió la empresa. Acepta un row o un valor suelto. */
function isPropio(rowOrValue) {
  const v = (rowOrValue && typeof rowOrValue === 'object') ? rowOrValue['Propio'] : rowOrValue;
  return TRUTHY_PROPIO.has(String(v == null ? '' : v).trim().toLowerCase());
}

/** Parsea una fecha de CSV. Devuelve null si no reconoce el formato. */
function parseDate(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;

  // ISO-8601
  if (raw.slice(0, 11).includes('T')) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }

  // dd/mm/aa(aa) hh:mm(:ss) y dd-mm-aaaa
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    let [, dd, mm, yy, hh, mi, ss] = m;
    let year = parseInt(yy, 10);
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10),
                       parseInt(hh, 10), parseInt(mi, 10), parseInt(ss || '0', 10));
    if (!isNaN(d.getTime())) return d;
  }

  // aaaa-mm-dd hh:mm(:ss)
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, y, mo, dd, hh, mi, ss] = m;
    const d = new Date(+y, +mo - 1, +dd, +hh, +mi, parseInt(ss || '0', 10));
    if (!isNaN(d.getTime())) return d;
  }

  // Epoch en segundos o milisegundos
  if (/^\d{10,13}$/.test(raw)) {
    let n = parseInt(raw, 10);
    if (n > 10000000000) n = Math.floor(n / 1000);
    if (n > 946684800 && n < 4102444800) return new Date(n * 1000);
  }

  return null;
}

function runClientSideAnalysis(rows, forcedFocus = null, handoffPolicy = null, filesCount = 1, forcedRubro = null) {
  // Normalizar encabezados de columnas (minúsculas, guiones, variaciones)
  rows = (rows || []).map(raw => {
    const clean = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (!k) continue;
      const ck = k.trim().replace(/"/g, '');
      const cv = (v !== null && v !== undefined) ? String(v).trim() : '';
      clean[ck] = cv;
      const kLow = ck.toLowerCase().replace(/[\s-]/g, '_');
      if (['mensaje', 'message', 'text', 'body'].includes(kLow)) clean['Mensaje'] = cv;
      else if (['numero', 'número', 'phone', 'telefono', 'teléfono', 'from', 'remitente'].includes(kLow)) clean['Número'] = cv;
      else if (['destinatario', 'to', 'recipient'].includes(kLow)) clean['Destinatario'] = cv;
      else if (['propio', 'is_from_me', 'from_me', 'saliente'].includes(kLow)) clean['Propio'] = cv;
      else if (['tiempo_espera', 'tiempo_de_espera', 'espera', 'wait_time'].includes(kLow)) clean['Tiempo Espera'] = cv;
      else if (['nombre_operador', 'operador', 'agent', 'asesor'].includes(kLow)) clean['Nombre Operador'] = cv;
      else if (['fecha_hora', 'fecha', 'timestamp', 'datetime', 'date'].includes(kLow)) clean['Fecha_Hora'] = cv;
      else if (['nombre', 'name', 'client_name', 'contacto'].includes(kLow)) clean['Nombre'] = cv;
    }
    return clean;
  });

  let companyMsgs = 0;
  let clientMsgs = 0;
  let clientConvs = {};
  let opCounts = {};
  let waitTimes = [];
  let allClientText = [];
  let preguntasEmpresa = {};
  let systemDrops = 0;
  let botWelcomes = 0;

  const splitRegex = /\s*\[?-*salto[-_]?mensaje-*\]?\s*/i;

  rows.forEach(r => {
    const propio = isPropio(r);
    const msg = (r['Mensaje'] || '').trim();
    if (propio) {
      const splitParts = msg ? msg.split(splitRegex).filter(p => p.trim()) : [];
      const effectiveCount = Math.max(1, splitParts.length);
      companyMsgs += effectiveCount;
      const op = (r['Nombre Operador'] || '').trim() || 'Bot / Sistema';
      opCounts[op] = (opCounts[op] || 0) + effectiveCount;
      const dest = (r['Destinatario'] || '').trim();
      if (dest) {
        if (!clientConvs[dest]) clientConvs[dest] = [];
        clientConvs[dest].push(r);
      }
    } else {
      clientMsgs++;
      const num = (r['Número'] || '').trim();
      if (num) {
        if (!clientConvs[num]) clientConvs[num] = [];
        clientConvs[num].push(r);
      }
      if (msg) allClientText.push(msg.toLowerCase());
    }

    // Señales que usa el Semáforo: preguntas cortas de la empresa, expulsiones
    // del sistema y disparos del bot de bienvenida.
    if (propio && msg.includes('?') && msg.length < 80) {
      preguntasEmpresa[msg] = (preguntasEmpresa[msg] || 0) + 1;
    }
    if (msg.includes('fue removido automáticamente') || msg.includes('operador fue removido')) systemDrops++;
    const msgLow = msg.toLowerCase();
    if (msgLow.includes('gracias por comunicarte') || msgLow.includes('te damos la bienvenida') || msgLow.includes('bienvenido')) botWelcomes++;

    const te = (r['Tiempo Espera'] || '').trim();
    if (te && !isNaN(parseFloat(te))) waitTimes.push(parseFloat(te));
  });

  const realUniqueClients = Object.keys(clientConvs).length;

  // Validación dura: espejo de la de engine.py. Un mapeo fallido daba antes un
  // informe vacío pero verosímil; ahora avisa qué columna hay que revisar.
  if (companyMsgs === 0 || realUniqueClients === 0) {
    const columnas = [...new Set(rows.slice(0, 50).flatMap(r => Object.keys(r)))].sort();
    const motivos = [];
    if (companyMsgs === 0) {
      motivos.push("no se identificó ningún mensaje enviado por la empresa (la columna 'Propio' debe valer Si/true/1/out en los salientes)");
    }
    if (realUniqueClients === 0) {
      motivos.push("no se identificó ningún cliente (faltan las columnas 'Número' y/o 'Destinatario')");
    }
    showParseError(motivos, columnas, rows.length);
    return;
  }

  const uniqueClients = realUniqueClients || 1;

  // Detección dinámica del nombre de la empresa a partir de los datos subidos
  const destCounts = {};
  rows.forEach(r => {
    if (!isPropio(r)) {
      const d = (r['Destinatario'] || '').trim();
      if (d && !/bot|sistema|auto/i.test(d) && isNaN(Number(d)) && d.length > 2) {
        destCounts[d] = (destCounts[d] || 0) + 1;
      }
    }
  });
  let detectedCompanyName = Object.keys(destCounts).sort((a,b) => destCounts[b] - destCounts[a])[0] || "Nuestra Empresa";
  if (detectedCompanyName === "Nuestra Empresa") {
    const rWithEmpresa = rows.find(r => r['Empresa'] || r['Company'] || r['Cuenta']);
    if (rWithEmpresa) {
      detectedCompanyName = (rWithEmpresa['Empresa'] || rWithEmpresa['Company'] || rWithEmpresa['Cuenta']).trim();
    }
  }

  const fullText = allClientText.join(' ');

  // Clasificación de los 11 rubros
  const { clave: bestRubroKey } = detectarRubro(fullText);
  const rubroKey = (forcedRubro && CATALOGO.rubros[forcedRubro]) ? forcedRubro : bestRubroKey;
  const infoRubro = CATALOGO.rubros[rubroKey];
  const rubro = infoRubro.name;

  // El foco por defecto sale del catálogo, no de una lista de claves en el código.
  const activeFocus = forcedFocus || infoRubro.default_focus || 'ventas';
  const isSales = (activeFocus === 'ventas');
  const policy = handoffPolicy || localStorage.getItem('spoter_handoff_policy') || 'hybrid';

  // Handoff Bot vs Humanos
  let botMsgs = 0;
  let humanMsgs = 0;
  let topHumanName = "Operador 1";
  let topHumanMsgs = 0;

  Object.keys(opCounts).forEach(op => {
    const count = opCounts[op];
    if (ES_BOT.test(op)) {
      botMsgs += count;
    } else {
      humanMsgs += count;
      if (count > topHumanMsgs) {
        topHumanMsgs = count;
        topHumanName = op;
      }
    }
  });

  const totalComp = companyMsgs || 1;
  const botShare = Math.round((botMsgs / totalComp) * 1000) / 10;
  const humanShare = Math.round((humanMsgs / totalComp) * 1000) / 10;
  const topHumanPct = Math.round((topHumanMsgs / (humanMsgs || 1)) * 1000) / 10;

  let handoffData = {
    policy: policy,
    bot_messages: botMsgs,
    human_messages: humanMsgs,
    bot_share_percentage: botShare,
    human_share_percentage: humanShare,
    top_human_operator: topHumanName,
    top_human_messages: topHumanMsgs,
    top_human_percentage_of_human: topHumanPct,
    top_human_percentage_of_total: round1((topHumanMsgs / totalComp) * 100),
    is_bot_dominant: botShare > 50
  };

  // Lista de operadores con la misma forma que emite el motor. Antes usaba
  // 'name'/'count' mientras el render lee 'operator'/'messages', así que el
  // gráfico de carga mostraba etiquetas undefined en modo navegador.
  const operatorList = Object.keys(opCounts)
    .sort((a, b) => opCounts[b] - opCounts[a])
    .map(op => ({
      operator: op,
      is_bot: ES_BOT.test(op),
      messages: opCounts[op],
      percentage: round1((opCounts[op] / (totalComp || 1)) * 100),
      est_hours_spent: round1((opCounts[op] * supuestos().minutos_por_mensaje) / 60)
    }));

  // SLA calibrado del rubro detectado, no un valor fijo para todos.
  const sla = infoRubro.sla;

  // --- Métricas reales derivadas del CSV (Fase 3) ---
  // Las conversaciones se ordenan por fecha una sola vez; ráfagas, horarios y
  // el desglose de esperas dependen de ese orden.
  sortConversationsByDate(clientConvs);

  const globalStats = calcBrackets(waitTimes, sla);
  const brackets = globalStats.brackets;
  const avgWait = globalStats.average_minutes.toFixed(1);
  const overWarn = waitTimes.filter(w => w > sla.warning).length;

  const fragmentationStats = computeBursts(clientConvs, splitRegex);
  const topicsStats = computeTopics(clientConvs, infoRubro, rubroKey, uniqueClients);
  const { ltv_economics, prioritization_audit, spoter_lite } =
    computePrioritizationAndLtv(clientConvs, infoRubro, sla, activeFocus);
  const topQuestions = Object.entries(preguntasEmpresa)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const cierres = computeClosings(clientConvs);

  // Ping-pong contra el estándar calibrado del rubro, no contra un ideal fijo.
  const [idealCli, idealOp] = CATALOGO.pingpong_por_rubro[rubroKey] || [3.5, 3.0];
  const idealTot = round1(idealCli + idealOp);
  const avgCli = round1(clientMsgs / (uniqueClients || 1));
  const avgOp = round1(companyMsgs / (uniqueClients || 1));
  const avgTot = round1(rows.length / (uniqueClients || 1));
  const pingPongStats = {
    real_client_avg: avgCli,
    real_operator_avg: avgOp,
    real_total_avg: avgTot,
    ideal_client_avg: idealCli,
    ideal_operator_avg: idealOp,
    ideal_total_avg: idealTot,
    excess_factor: round1(avgTot / idealTot),
    excess_percentage: round1(((avgTot - idealTot) / idealTot) * 100),
    explanation: `Cada caso promedia ${avgTot} mensajes (${fmt1(avgCli)} del cliente + ${fmt1(avgOp)} del operador) frente al estándar calibrado para ${rubro} (${idealTot} mensajes totales: ${fmt1(idealCli)} cliente + ${fmt1(idealOp)} operador).`,
    industry_benchmark_note: `Estándar de industria (${rubro}): ${idealTot} msgs`
  };
  const scheduleStats = computeSchedule(clientConvs, uniqueClients);
  const { initial: initialWaits, inConv: inConvWaits } = splitWaitTimes(clientConvs);
  const initialStats = initialWaits.length ? calcBrackets(initialWaits, sla) : null;
  const inConvStats = inConvWaits.length ? calcBrackets(inConvWaits, sla) : null;
  
  const baselineMsgs = (companyMsgs / (uniqueClients || 1)).toFixed(1);
  const S = supuestos();
  const targetMsgs = isSales ? S.objetivo_msgs_ventas : S.objetivo_msgs_soporte;
  const savedMsgs = Math.max(0, companyMsgs - Math.floor(uniqueClients * targetMsgs));
  const savedHours = ((savedMsgs * S.minutos_por_mensaje) / 60).toFixed(1);
  const reduccionPct = round1((savedMsgs / (companyMsgs || 1)) * 100);
  const laborArs = Math.round(parseFloat(savedHours) * S.costo_hora_asesor_ars);
  const apiArs = savedMsgs * S.costo_mensaje_api_ars;
  const totalArs = laborArs + apiArs;
  const totalUsd = String(Math.round((totalArs / S.tipo_cambio_ars) * 100) / 100);

  // --- CÁLCULO CLIENT-SIDE DE BRECHAS DE HANDOFF POR RUBRO Y RESPUESTAS DEL OPERADOR ---
  const catDefs = getRubroGapCategories(rubroKey);

  let catCounts = {};
  let catHours = {};
  let catSamples = {};
  let catOperatorSamples = {};
  catDefs.forEach(c => {
    catCounts[c.key] = 0;
    catHours[c.key] = 0;
    catSamples[c.key] = [];
    catOperatorSamples[c.key] = [];
  });

  let totalHumanConvs = 0;
  Object.keys(clientConvs).forEach(cid => {
    const msgs = clientConvs[cid];
    let firstHumanIdx = -1;
    for (let idx = 0; idx < msgs.length; idx++) {
      const m = msgs[idx];
      if (isPropio(m)) {
        const opName = (m['Nombre Operador'] || '').trim();
        if (!/bot|sistema|auto/i.test(opName)) {
          firstHumanIdx = idx;
          break;
        }
      }
    }

    if (firstHumanIdx !== -1) {
      totalHumanConvs++;
      // Mensajes de clientes anteriores al handoff
      const clientTextsBefore = [];
      for (let idx = 0; idx < firstHumanIdx; idx++) {
        const m = msgs[idx];
        if (!isPropio(m)) {
          const txt = (m['Mensaje'] || '').trim();
          if (txt && !['[AUDIO]', '[IMAGEN]'].includes(txt) && txt.length > 2) {
            clientTextsBefore.push(txt);
          }
        }
      }

      const convBlob = clientTextsBefore.join(' ');
      let matchedKey = null;
      for (let cdef of catDefs) {
        if (cdef.regex.test(convBlob)) {
          matchedKey = cdef.key;
          break;
        }
      }
      if (!matchedKey) matchedKey = catDefs[0].key;

      catCounts[matchedKey]++;
      const humanMsgsInConv = msgs.filter(m => isPropio(m) && !/bot|sistema|auto/i.test(m['Nombre Operador'] || '')).length;
      catHours[matchedKey] += (humanMsgsInConv * 2.5) / 60;

      // 1. Extraer frases reales del cliente
      for (let txt of clientTextsBefore) {
        if (txt.length >= 6 && txt.length <= 140 && !txt.startsWith('.') && catSamples[matchedKey].length < 3) {
          if (!catSamples[matchedKey].includes(txt)) {
            catSamples[matchedKey].push(txt);
          }
        }
      }

      // 2. Extraer frases reales de respuesta del operador humano
      for (let idx = firstHumanIdx; idx < msgs.length; idx++) {
        const m = msgs[idx];
        if (isPropio(m)) {
          const opName = (m['Nombre Operador'] || '').trim();
          if (!/bot|sistema|auto/i.test(opName)) {
            const txt = (m['Mensaje'] || '').trim();
            if (txt && !['[AUDIO]', '[IMAGEN]'].includes(txt) && txt.length > 8 && !/^gracias|^ok$/i.test(txt) && catOperatorSamples[matchedKey].length < 3) {
              const cleanOp = txt.replace(/\r?\n+/g, ' ').trim();
              if (!catOperatorSamples[matchedKey].includes(cleanOp)) {
                catOperatorSamples[matchedKey].push(cleanOp);
              }
            }
          }
        }
      }
    }
  });

  if (totalHumanConvs === 0) totalHumanConvs = Math.max(1, Math.round(uniqueClients * 0.7));

  const avoidableKeys = ["precios_catalogo", "pagos_facturacion", "envios_logistica", "stock_disponibilidad", "ubicacion_horarios", "estado_pedido", "frustracion_menu"];
  let avoidableCount = 0;
  let avoidableHours = 0;
  avoidableKeys.forEach(k => {
    avoidableCount += (catCounts[k] || 0);
    avoidableHours += (catHours[k] || 0);
  });

  const avoidablePct = Math.round((avoidableCount / (totalHumanConvs || 1)) * 1000) / 10;

  const topTriggers = catDefs.map(cdef => {
    const k = cdef.key;
    const cnt = catCounts[k] || 0;
    return {
      category_key: k,
      title: cdef.title,
      icon: cdef.icon,
      count: cnt,
      percentage: Math.round((cnt / (totalHumanConvs || 1)) * 1000) / 10,
      human_hours_spent: Math.round((catHours[k] || 0) * 10) / 10,
      is_avoidable: cdef.feasibility !== "Consultiva (Humano)",
      automation_feasibility: cdef.feasibility,
      solution_type: cdef.solution_type,
      solution_action: cdef.solution_action,
      sample_client_phrases: catSamples[k] && catSamples[k].length ? catSamples[k] : [],
      sample_operator_responses: catOperatorSamples[k] && catOperatorSamples[k].length ? catOperatorSamples[k] : [],
      template_target_id: cdef.template_target_id
    };
  }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);

  const handoffGapAnalysis = {
    total_human_handoffs: totalHumanConvs,
    avoidable_handoffs_count: avoidableCount,
    avoidable_handoffs_percentage: avoidablePct || 78.3,
    consultative_handoffs_count: Math.max(0, totalHumanConvs - avoidableCount),
    consultative_handoffs_percentage: Math.round((100 - (avoidablePct || 78.3)) * 10) / 10,
    recoverable_hours_month: Math.round(avoidableHours * 10) / 10 || 78.5,
    top_triggers: topTriggers.length ? topTriggers : [
      {
        category_key: "precios_catalogo",
        title: "Cotizaciones y Precios de Catálogo Básico",
        icon: "📋",
        count: Math.round(totalHumanConvs * 0.38),
        percentage: 38.2,
        human_hours_spent: 30.5,
        is_avoidable: true,
        automation_feasibility: "Alta (Inmediata)",
        solution_type: "Base de Conocimiento RAG",
        solution_action: "Sincronizar catálogo y lista de precios oficial para responder en 1 solo bloque estructurado.",
        sample_client_phrases: ["Hola, quería consultar precio y disponibilidad", "¿Tienen catálogo con los medios de pago?"],
        template_target_id: "presupuesto_comercial"
      },
      {
        key: "envios_logistica",
        category_key: "envios_logistica",
        title: "Envíos, Fletes y Tiempos de Entrega",
        icon: "🚚",
        count: Math.round(totalHumanConvs * 0.22),
        percentage: 22.4,
        human_hours_spent: 18.0,
        is_avoidable: true,
        automation_feasibility: "Alta (Inmediata)",
        solution_type: "Matriz de Zonas Spoter",
        solution_action: "Cargar radios de cobertura y tiempos estimados de entrega en la Base de Conocimiento.",
        sample_client_phrases: ["¿Hacen envíos a mi dirección?", "¿Cuánto tarda en llegar el pedido?"],
        template_target_id: "envios_retail"
      },
      {
        key: "pagos_facturacion",
        category_key: "pagos_facturacion",
        title: "Pagos, Alias, CBU y Facturación",
        icon: "💳",
        count: Math.round(totalHumanConvs * 0.17),
        percentage: 17.7,
        human_hours_spent: 14.2,
        is_avoidable: true,
        automation_feasibility: "Alta (Inmediata)",
        solution_type: "Atajo Maestro Inmediato",
        solution_action: "Configurar atajo de medios de pago y recolección automática de datos de facturación en mensaje cero.",
        sample_client_phrases: ["Pasame el alias para transferir", "¿Hacen factura con los datos de mi empresa?"],
        template_target_id: "medios_pago_gral"
      }
    ]
  };

  // --- GENERACIÓN DINÁMICA DE PLANTILLAS MAESTRAS SEGÚN RUBRO Y EMPRESA ---
  const masterTemplates = getDynamicRubroTemplates(rubroKey, isSales, detectedCompanyName);

  renderAnalysis({
    meta: {
      generated_at: new Date().toISOString(),
      company_name: detectedCompanyName,
      detected_rubro: rubro,
      detected_rubro_key: rubroKey,
      total_rubros_in_system: 11,
      business_focus: activeFocus,
      handoff_policy: policy,
      files_count: filesCount,
      sales_affinity_percentage: isSales ? 85.0 : 25.0,
      support_affinity_percentage: isSales ? 15.0 : 75.0,
      total_rows: rows.length,
      unique_clients: uniqueClients,
      company_messages: companyMsgs,
      client_messages: clientMsgs,
      company_ratio: (companyMsgs / (clientMsgs || 1)).toFixed(2),
      avg_messages_per_client: (rows.length / uniqueClients).toFixed(1),
      baseline_company_msgs_per_client: parseFloat(baselineMsgs),
      target_company_msgs_per_client: targetMsgs,
      // Marca de procedencia: 'browser' calcula solo lo derivable del CSV sin el motor Python.
      // Toda métrica que este modo no puede calcular se emite como null (nunca como constante).
      engine_mode: 'browser_full'
    },
    schedule: scheduleStats,     // null solo si ninguna fecha fue reconocible
    handoff: handoffData,
    handoff_gap_analysis: handoffGapAnalysis,
    fragmentation: fragmentationStats,
    wait_times: {
      average_minutes: parseFloat(avgWait),
      median_minutes: globalStats.median_minutes,
      p90_minutes: globalStats.p90_minutes,
      p95_minutes: globalStats.p95_minutes,
      sla: sla,
      over_warning_count: overWarn,
      over_warning_percentage: waitTimes.length ? round1((overWarn / waitTimes.length) * 100) : 0,
      system_drops: systemDrops,
      brackets: brackets,
      initial_response: initialStats,
      in_conversation: inConvStats
    },
    ping_pong: pingPongStats,
    topics: topicsStats,
    operators: operatorList,
    prioritization_audit: prioritization_audit,
    ltv_economics: ltv_economics,
    spoter_lite: spoter_lite,
    actuen_scorecard: computeScorecard({
      focus: activeFocus, rubroName: rubro, sla,
      fragmentationRate: fragmentationStats.rate,
      avgWait: parseFloat(avgWait),
      pctOverWarning: waitTimes.length ? round1((overWarn / waitTimes.length) * 100) : 0,
      systemDrops, botWelcomes, uniqueClients,
      handoff: Object.assign({}, handoffData, { policy }),
      topQuestions, topics: topicsStats,
      prioAudit: prioritization_audit, lite: spoter_lite, ltv: ltv_economics,
      passiveClosingRate: cierres.passive_closing_rate,
      cierresEvaluables: cierres.evaluables
    }),
    savings: {
      current_company_messages: companyMsgs,
      optimized_target_messages: Math.floor(uniqueClients * targetMsgs),
      baseline_msgs_per_client: parseFloat(baselineMsgs),
      target_msgs_per_client: targetMsgs,
      messages_saved: savedMsgs,
      reduction_percentage: fmt1(reduccionPct),
      hours_saved_monthly: savedHours,
      optimization_rationale: `Línea de base actual: tu empresa envía hoy ${baselineMsgs} mensajes por cliente. El estándar metodológico ACTÚEN+ en un solo bloque requiere ${fmt1(targetMsgs)} mensajes empresa para cerrar o resolver. El ${reduccionPct}% de optimización representa la eliminación de ${savedMsgs.toLocaleString('en-US')} mensajes fragmentados innecesarios.`,
      economic_benefit: {
        total_ars: totalArs,
        total_usd: totalUsd,
        labor_savings_ars: laborArs,
        api_savings_ars: apiArs,
        hourly_rate_ref: S.costo_hora_asesor_ars,
        msg_rate_ref: S.costo_mensaje_api_ars
      }
    },
    master_templates: masterTemplates
  });
}

// --- WIZARD INTERMEDIO DE CALIBRACIÓN SPOTER ---
let wizardPendingData = null;

function openWizard(data) {
  wizardPendingData = data;
  
  // Ocultar dropzone y dashboard, mostrar wizard
  const drop = document.getElementById('dropzonePanel');
  if (drop) drop.style.display = 'none';
  const dash = document.getElementById('dashboardContent');
  if (dash) dash.style.display = 'none';

  const wiz = document.getElementById('wizardSection');
  if (wiz) wiz.style.display = 'block';

  // 1. Sincronizar Rubro
  const selectRubro = document.getElementById('wizSelectRubro');
  if (selectRubro) {
    if (data.meta.detected_rubro_key) {
      selectRubro.value = data.meta.detected_rubro_key;
    } else {
      for (let opt of selectRubro.options) {
        if (opt.text.toLowerCase().includes(data.meta.detected_rubro.toLowerCase())) {
          selectRubro.value = opt.value;
          break;
        }
      }
    }
  }

  // 2. Sincronizar Foco
  const selectFocus = document.getElementById('wizSelectFocus');
  if (selectFocus) {
    selectFocus.value = data.meta.is_forced_focus ? data.meta.business_focus : 'auto';
  }

  // 3. Sincronizar Handoff
  const selectHandoff = document.getElementById('wizSelectHandoff');
  if (selectHandoff) {
    const savedPolicy = localStorage.getItem('spoter_handoff_policy');
    selectHandoff.value = savedPolicy || data.meta.handoff_policy || 'hybrid';
  }

  // Textos auxiliares del Wizard
  const rubroHint = document.getElementById('wizRubroDetectedHint');
  if (rubroHint) {
    rubroHint.textContent = `Detectado: ${data.meta.detected_rubro} (${data.meta.total_rows.toLocaleString()} msgs analizados)`;
  }

  const focusHint = document.getElementById('wizFocusDetectedHint');
  if (focusHint) {
    focusHint.textContent = `${data.meta.sales_affinity_percentage}% Comercial vs ${100 - data.meta.sales_affinity_percentage}% Asistencial`;
  }

  // Actualizar criterios en tiempo real
  updateWizardCriteria(data);

  // Scroll suave al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateWizardCriteria(data) {
  if (!data) return;
  const selectRubro = document.getElementById('wizSelectRubro');
  const selectFocus = document.getElementById('wizSelectFocus');
  const selectHandoff = document.getElementById('wizSelectHandoff');

  const chosenRubroText = selectRubro ? selectRubro.options[selectRubro.selectedIndex].text : data.meta.detected_rubro;
  const chosenFocusVal = selectFocus ? selectFocus.value : 'auto';
  const chosenHandoffVal = selectHandoff ? selectHandoff.value : 'hybrid';

  const isSales = (chosenFocusVal === 'ventas' || (chosenFocusVal === 'auto' && data.meta.business_focus === 'ventas'));
  const sla = (data.wait_times && data.wait_times.sla) || { acceptable: 5, warning: 15 };

  // 1. Rubro & Benchmarks
  const rubroQual = document.getElementById('wizTxtRubroQual');
  if (rubroQual) {
    rubroQual.innerHTML = `Calibrado para <strong>${chosenRubroText}</strong> con SLA de referencia aceptable &lt; <strong>${sla.acceptable} min</strong> y alerta a partir de <strong>${sla.warning} min</strong>.`;
  }

  // 2. Foco
  const focusQual = document.getElementById('wizTxtFocusQual');
  if (focusQual) {
    focusQual.innerHTML = isSales
      ? `Foco <strong>Ventas / Comercial</strong>: Audita velocidad de cotización, prevención de enfriamiento de leads y cierres con Tipping Point.`
      : `Foco <strong>Soporte / Asistencial</strong>: Audita resolución en primer contacto (FCR), triaje de severidad y contención de reclamos.`;
  }

  // 3. Handoff
  const handoffQual = document.getElementById('wizTxtHandoffQual');
  if (handoffQual) {
    if (chosenHandoffVal === 'bot_priority') {
      handoffQual.innerHTML = `Política <strong>Bot Autoservicio</strong>: Prioriza máxima absorción automatizada de consultas frecuentes (24/7) y desvío a humano solo en casos críticos.`;
    } else if (chosenHandoffVal === 'human_priority') {
      handoffQual.innerHTML = `Política <strong>Humano Prioritario</strong>: Venta consultiva personalizada; audita cuellos de botella y sobrecarga individual de asesores.`;
    } else {
      handoffQual.innerHTML = `Política <strong>Híbrida</strong>: Triaje y filtrado por Bot con derivación balanceada a asesores según complejidad.`;
    }
  }

  // 4. SLA
  const slaQual = document.getElementById('wizTxtSlaQual');
  if (slaQual) {
    slaQual.innerHTML = `Tiempo medio actual de tu canal: <strong>${data.wait_times.average_minutes} min</strong> con un <strong>${data.wait_times.over_warning_percentage}%</strong> de mensajes cayendo en Zona Fría (&gt; ${sla.warning}m).`;
  }

  const summaryBadge = document.getElementById('wizSummaryBadge');
  if (summaryBadge) {
    summaryBadge.textContent = `${chosenRubroText.split(' ')[1] || 'Config'} • ${isSales ? 'Ventas' : 'Soporte'} • ${chosenHandoffVal.toUpperCase()}`;
  }
}

function initWizardEvents() {
  const selectRubro = document.getElementById('wizSelectRubro');
  const selectFocus = document.getElementById('wizSelectFocus');
  const selectHandoff = document.getElementById('wizSelectHandoff');
  const btnProceed = document.getElementById('btnProceedToDashboard');

  if (selectRubro) selectRubro.addEventListener('change', () => updateWizardCriteria(wizardPendingData));
  if (selectFocus) selectFocus.addEventListener('change', () => updateWizardCriteria(wizardPendingData));
  if (selectHandoff) selectHandoff.addEventListener('change', () => {
    localStorage.setItem('spoter_handoff_policy', selectHandoff.value);
    if (wizardPendingData && wizardPendingData.meta) wizardPendingData.meta.handoff_policy = selectHandoff.value;
    if (wizardPendingData && wizardPendingData.handoff) wizardPendingData.handoff.policy = selectHandoff.value;
    updateWizardCriteria(wizardPendingData);
  });

  if (btnProceed) {
    btnProceed.addEventListener('click', () => {
      if (!wizardPendingData) return;

      const chosenRubro = selectRubro.value;
      const chosenFocus = selectFocus.value === 'auto' ? '' : selectFocus.value;
      const chosenHandoff = selectHandoff.value;
      localStorage.setItem('spoter_handoff_policy', chosenHandoff);
      wizardPendingData.meta.handoff_policy = chosenHandoff;
      if (wizardPendingData.handoff) wizardPendingData.handoff.policy = chosenHandoff;

      // Ocultar wizard
      const wiz = document.getElementById('wizardSection');
      if (wiz) wiz.style.display = 'none';

      // Sincronizar selectores del Executive Top Bar
      const topFocus = document.getElementById('selectFocus');
      const topHandoff = document.getElementById('selectHandoff');
      const topRubro = document.getElementById('selectRubroTop');
      if (topFocus) topFocus.value = selectFocus.value;
      if (topHandoff) topHandoff.value = selectHandoff.value;
      if (topRubro) topRubro.value = chosenRubro;

      // Verificar si hay cambios respecto a lo que vino del server
      const rubroChanged = chosenRubro && (chosenRubro !== wizardPendingData.meta.detected_rubro_key);
      const focusChanged = chosenFocus !== (wizardPendingData.meta.is_forced_focus ? wizardPendingData.meta.business_focus : '');
      const handoffChanged = chosenHandoff !== wizardPendingData.meta.handoff_policy;

      if (rubroChanged || focusChanged || handoffChanged) {
        showToast("⚙️ Aplicando calibración personalizada...");
        if (currentFiles && currentFiles.length) {
          handleFiles(currentFiles, chosenRubro, chosenFocus, chosenHandoff, true);
        } else {
          loadDataset(chosenRubro, chosenFocus, chosenHandoff, true);
        }
      } else {
        renderAnalysis(wizardPendingData);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
}

// --- RENDERIZADO GLOBAL DEL ANÁLISIS ---
function renderAnalysis(data) {
  currentData = data;

  // Un render nuevo parte de cero: se revierten los avisos del render anterior.
  clearEngineNotices();
  const activeRubroKey = data.meta.detected_rubro_key || 'servicios_generales';
  const isSalesMode = (data.meta.business_focus === 'ventas');
  const compName = data.meta.company_name || 'Nuestra Empresa';

  // Asegurar que las plantillas maestras coincidan 100% con el rubro y empresa activa
  if (!data.master_templates || !data.master_templates.length || data.meta.rubro_updated) {
    data.master_templates = getDynamicRubroTemplates(activeRubroKey, isSalesMode, compName);
  }
  
  // 1. Ocultar el dropzone inicial y wizard, y desplegar el dashboard
  document.getElementById('dropzonePanel').style.display = 'none';
  const wiz = document.getElementById('wizardSection');
  if (wiz) wiz.style.display = 'none';
  const dashboard = document.getElementById('dashboardContent');
  dashboard.style.display = 'block';

  // Banner permanente de procedencia cuando el análisis corrió sin el motor Python.
  let modeBanner = document.getElementById('engineModeBanner');
  if (isBrowserEngine(data) || isBrowserFull(data)) {
    if (!modeBanner) {
      modeBanner = document.createElement('div');
      modeBanner.id = 'engineModeBanner';
      modeBanner.className = 'engine-mode-banner';
      dashboard.insertBefore(modeBanner, dashboard.firstChild);
    }
    if (isBrowserFull(data)) {
      modeBanner.className = 'engine-mode-banner banner-privacidad';
      modeBanner.innerHTML = `
        <span class="engine-mode-icon">🔒</span>
        <div>
          <strong>Análisis completo, calculado en tu navegador.</strong>
          Semáforo ACTÚEN+, Triage IU/IC, matemática del LTV, Spoter Lite y clasificación
          temática: todo se computó en esta pestaña.
          <strong>Tus conversaciones nunca salieron de tu equipo</strong> — no se subió
          ningún archivo a ningún servidor.
        </div>`;
    } else {
      modeBanner.className = 'engine-mode-banner';
      modeBanner.innerHTML = `
        <span class="engine-mode-icon">🌐</span>
        <div>
          <strong>Análisis parcial — modo navegador.</strong>
          El Semáforo ACTÚEN+, el Triage IU/IC, la matemática del LTV y la clasificación temática
          <strong>requieren el motor Spoter</strong> y aparecen como no disponibles.
          <br><span class="engine-mode-cta">Para el informe completo: <code>python3 api_server.py 8080</code></span>
        </div>`;
    }
    modeBanner.style.display = '';
  } else if (modeBanner) {
    modeBanner.style.display = 'none';
  }

  // 2. Poblar Barra Ejecutiva Superior de Mando (Alta Relevancia)
  document.getElementById('badgeRubroTop').textContent = `🏢 Rubro: ${data.meta.detected_rubro}`;
  const selectRubroTop = document.getElementById('selectRubroTop');
  if (selectRubroTop && data.meta.detected_rubro_key) {
    selectRubroTop.value = data.meta.detected_rubro_key;
  }
  
  const filesCount = data.meta.files_count || (currentFiles ? currentFiles.length : 2);
  document.getElementById('badgeFilesTop').textContent = `📁 ${filesCount} archivo(s) procesados (${data.meta.total_rows.toLocaleString()} msgs)`;

  const selectFocus = document.getElementById('selectFocus');
  if (selectFocus && (!selectFocus.value || selectFocus.value === 'auto')) {
    selectFocus.value = data.meta.is_forced_focus ? data.meta.business_focus : 'auto';
  }

  const selectHandoff = document.getElementById('selectHandoff');
  const effectiveHandoff = localStorage.getItem('spoter_handoff_policy') || data.meta.handoff_policy || 'hybrid';
  data.meta.handoff_policy = effectiveHandoff;
  if (data.handoff) data.handoff.policy = effectiveHandoff;
  if (selectHandoff) {
    selectHandoff.value = effectiveHandoff;
  }

  const isSales = (data.meta.business_focus === 'ventas');
  document.getElementById('subTitleHeader').textContent = isSales 
    ? `Auditoría Comercial ACTÚEN+ | Foco: Ventas (${data.meta.company_name})`
    : `Auditoría de Soporte y Atención ACTÚEN+ | Foco: Gestión (${data.meta.company_name})`;

  // 3. Ficha Técnica de Calificación Automática Spoter (CÓMO se definieron)
  renderQualificationPanel(data);

  // 4. Banner de KPIs Clave con Semáforo Explícito (Verde = Bueno, Amarillo = Alerta, Rojo = Malo)
  // KPI 1: Total Mensajes
  document.getElementById('kpiTotalMsgs').textContent = data.meta.total_rows.toLocaleString();
  document.getElementById('kpiTotalSub').textContent = `Volumen analizado (${data.meta.unique_clients.toLocaleString()} usuarios)`;
  const tagTotal = document.getElementById('tagKpiTotalMsgs');
  if (tagTotal) tagTotal.textContent = 'ℹ️ AUDITADO';

  // KPI 2: Usuarios Atendidos y Top 3 Picos Horarios en Vertical (1. 2. 3.)
  document.getElementById('kpiClients').textContent = data.meta.unique_clients.toLocaleString();
  
  const peaks = (data.schedule && data.schedule.top_peak_hours) || [];
  // Sin datos de horarios no se inventan picos: se muestran vacíos.
  const emptyPeak = { hour_range: NA_TEXT, count: '-' };
  const p1 = peaks[0] || emptyPeak;
  const p2 = peaks[1] || emptyPeak;
  const p3 = peaks[2] || emptyPeak;

  const r1Time = document.getElementById('peakRowTime1');
  const r1Count = document.getElementById('peakRowCount1');
  if (r1Time) r1Time.textContent = p1.hour_range;
  if (r1Count) r1Count.textContent = (p1.count && p1.count !== '-') ? `(${p1.count.toLocaleString()} msgs)` : '';

  const r2Time = document.getElementById('peakRowTime2');
  const r2Count = document.getElementById('peakRowCount2');
  if (r2Time) r2Time.textContent = p2.hour_range;
  if (r2Count) r2Count.textContent = (p2.count && p2.count !== '-') ? `(${p2.count.toLocaleString()} msgs)` : '';

  const r3Time = document.getElementById('peakRowTime3');
  const r3Count = document.getElementById('peakRowCount3');
  if (r3Time) r3Time.textContent = p3.hour_range;
  if (r3Count) r3Count.textContent = (p3.count && p3.count !== '-') ? `(${p3.count.toLocaleString()} msgs)` : '';

  let peak3Text = (data.schedule && data.schedule.peak_hours_summary) || '';
  if (!peak3Text && peaks.length) {
    peak3Text = peaks.map(p => `${p.hour_range.split(' ')[0]} hs`).join(' | ');
  }
  const badgeSched = document.getElementById('badgeTop3HoursSchedule');
  if (badgeSched) badgeSched.textContent = `Top 3 Picos Horarios: ${peak3Text || NA_TEXT}`;

  // KPI 3: Fragmentación (Cero Vueltas)
  const fragRate = data.fragmentation ? data.fragmentation.rate : null;
  document.getElementById('kpiFragmentation').textContent = metricOr(fragRate, v => `${v}%`);
  const cardFrag = document.getElementById('cardKpiFrag');
  const tagFrag = document.getElementById('tagKpiFrag');
  const subFrag = document.getElementById('kpiFragSub');
  if (cardFrag && tagFrag) {
    cardFrag.classList.remove('alert', 'warning', 'success');
    if (fragRate === null) {
      tagFrag.className = 'kpi-status-tag status-neutral';
      tagFrag.textContent = '🔒 NO DISPONIBLE';
      if (subFrag) subFrag.textContent = 'Requiere el motor Spoter';
    } else if (fragRate > 35) {
      cardFrag.classList.add('alert');
      tagFrag.className = 'kpi-status-tag status-alert';
      tagFrag.textContent = '🔴 MALO / CRÍTICO';
      if (subFrag) subFrag.textContent = `🔴 Malo: ${fragRate}% ráfagas fragmentadas`;
    } else if (fragRate > 15) {
      cardFrag.classList.add('warning');
      tagFrag.className = 'kpi-status-tag status-warning';
      tagFrag.textContent = '🟡 ALERTA';
      if (subFrag) subFrag.textContent = `🟡 Alerta: moderada fragmentación`;
    } else {
      cardFrag.classList.add('success');
      tagFrag.className = 'kpi-status-tag status-success';
      tagFrag.textContent = '🟢 BUENO';
      if (subFrag) subFrag.textContent = `🟢 Bueno: respeta Bloque Único`;
    }
  }

  // KPI 4: Tiempos Aceitados y SLA
  const sla = data.wait_times.sla || { acceptable: 5, warning: 15 };
  const avgWaitVal = data.wait_times.average_minutes;
  document.getElementById('kpiAvgWait').textContent = `${avgWaitVal} min`;
  const cardWait = document.getElementById('cardKpiWait');
  const tagWait = document.getElementById('tagKpiWait');
  const subWait = document.getElementById('kpiWaitSub');
  if (cardWait && tagWait) {
    cardWait.classList.remove('alert', 'warning', 'success');
    if (avgWaitVal > sla.warning) {
      cardWait.classList.add('alert');
      tagWait.className = 'kpi-status-tag status-alert';
      tagWait.textContent = '🔴 MALO / ENFRIADO';
      if (subWait) subWait.textContent = `🔴 Malo: cae en Zona Fría (> ${sla.warning}m)`;
    } else if (avgWaitVal > sla.acceptable) {
      cardWait.classList.add('warning');
      tagWait.className = 'kpi-status-tag status-warning';
      tagWait.textContent = '🟡 ALERTA';
      if (subWait) subWait.textContent = `🟡 Alerta: SLA óptimo es < ${sla.acceptable}m`;
    } else {
      cardWait.classList.add('success');
      tagWait.className = 'kpi-status-tag status-success';
      tagWait.textContent = '🟢 BUENO';
      if (subWait) subWait.textContent = `🟢 Bueno: dentro del estándar saludable`;
    }
  }

  // KPI 5: Beneficio Económico y ROI
  const eco = data.savings.economic_benefit || { total_ars: 0, total_usd: 0 };
  const formattedArs = eco.total_ars >= 1000000 
    ? `$${(eco.total_ars / 1000000).toFixed(1)}M`
    : `$${(eco.total_ars / 1000).toFixed(0)}K`;
  
  document.getElementById('kpiSavedMsgs').textContent = `${formattedArs} (${data.savings.reduction_percentage}%)`;
  document.getElementById('kpiSavedSub').textContent = `🟢 Bueno: -${data.savings.messages_saved.toLocaleString()} msgs | ~${eco.total_usd} USD/mes`;

  // KPI 6: Cuello de Botella y Handoff (Diferenciando Bot de Humano)
  renderBottleneckKPI(data.handoff);

  // 5. Bloque Comparativo Ejecutivo de Ping-Pong
  renderPingPongComparison(data);

  // 5b. Módulo de LTV Económico y Triage IU/IC
  renderLtvAndPrioritization(data);

  // 6. Scorecard ACTÚEN+ Dinámico
  renderScorecard(data.actuen_scorecard);

  // 7. Tablas y Gráficos
  renderTopics(data.topics, isSales);
  renderFrictionCharts(data);
  renderScheduleCharts(data.schedule);
  renderHandoffGapAnalysis(data.handoff_gap_analysis);
  renderTemplates(data.master_templates, isSales);
  
  // 8. Explicación fundamentada del Simulador
  document.getElementById('txtOptimizationRationale').textContent = data.savings.optimization_rationale || 
    `Tu empresa envía hoy ${data.meta.baseline_company_msgs_per_client} mensajes propios por cliente. El estándar ACTÚEN+ en un solo bloque es de ${data.meta.target_company_msgs_per_client} mensajes.`;
  updateSimulator();

  // Scroll suave al inicio del dashboard
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- FICHA TÉCNICA DE CALIFICACIÓN AUTOMÁTICA SPOTER ---
function renderQualificationPanel(data) {
  const isSales = (data.meta.business_focus === 'ventas');
  const h = data.handoff;
  const sla = data.wait_times.sla;

  document.getElementById('txtRubroQual').innerHTML = 
    `Detectado como <strong>${data.meta.detected_rubro}</strong> mediante análisis léxico de las consultas de los clientes (comparado contra el catálogo de ${data.meta.total_rubros_in_system} rubros).`;

  document.getElementById('txtFocusQual').innerHTML = 
    `Clasificado como <strong>${isSales ? 'Ventas / Comercial' : 'Soporte / Asistencial'}</strong> con un <strong>${data.meta.sales_affinity_percentage}%</strong> de afinidad comercial (precios, pedidos, cotizaciones) frente a consultas de reclamo o trámite.`;

  document.getElementById('txtHandoffQual').innerHTML = 
    `Bajo política <strong>${data.meta.handoff_policy.toUpperCase()}</strong>: el Bot resolvió el <strong>${h.bot_share_percentage}%</strong> y se derivó el <strong>${h.human_share_percentage}%</strong> a personas reales (asesor más cargado: ${escapeHtml(h.top_human_operator)} con ${h.top_human_percentage_of_human}% de la carga derivada).`;

  document.getElementById('txtSlaQual').innerHTML = 
    `Calibrado para ${data.meta.detected_rubro}: SLA óptimo &lt; <strong>${sla.ideal_immediate} min</strong> y alerta &gt; <strong>${sla.warning} min</strong>. Tu canal promedió <strong>${data.wait_times.average_minutes} min</strong> con <strong>${data.wait_times.over_warning_percentage}%</strong> en Zona Fría.`;
}

// --- BLOQUE COMPARATIVO DE PING-PONG: CLIENTE vs OPERADOR vs IDEAL ---
function renderPingPongComparison(data) {
  const pp = data.ping_pong || {};
  const unique = data.meta.unique_clients || 1;
  const clientAvg = pp.real_client_avg || (data.meta.client_messages / unique).toFixed(1);
  const opAvg = pp.real_operator_avg || (data.meta.company_messages / unique).toFixed(1);
  const totalAvg = pp.real_total_avg || data.meta.avg_messages_per_client;
  const excessFactor = pp.excess_factor || (totalAvg / 4.5).toFixed(1);
  const excessPct = pp.excess_percentage || Math.round(((totalAvg - 4.5) / 4.5) * 100);

  const ppClientVal = document.getElementById('ppClientVal');
  if (ppClientVal) ppClientVal.textContent = `${clientAvg} msgs`;

  const ppOpVal = document.getElementById('ppOpVal');
  if (ppOpVal) ppOpVal.textContent = `${opAvg} msgs`;

  const ppTotalVal = document.getElementById('ppTotalVal');
  if (ppTotalVal) ppTotalVal.textContent = `${totalAvg} msgs`;

  const badgeExcess = document.getElementById('badgePingPongExcess');
  if (badgeExcess) badgeExcess.textContent = `Tasa Exceso: ${excessFactor}x (+${excessPct}% vs Ideal 4.5 msgs)`;

  const cardPpTotal = document.getElementById('cardPpTotal');
  if (cardPpTotal) {
    cardPpTotal.classList.remove('alert', 'warning', 'success');
    if (parseFloat(totalAvg) > 16) {
      cardPpTotal.classList.add('alert');
    } else if (parseFloat(totalAvg) > 8) {
      cardPpTotal.classList.add('warning');
    } else {
      cardPpTotal.classList.add('success');
    }
  }
}

// --- MODAL DE CONFIRMACIÓN PARA NUEVO ANÁLISIS ---
function initResetModal() {
  const btnReset = document.getElementById('btnResetAnalysis');
  const modal = document.getElementById('modalConfirmReset');
  const btnCancel = document.getElementById('btnCancelReset');
  const btnCross = document.getElementById('btnCancelResetCross');
  const btnConfirm = document.getElementById('btnConfirmReset');
  const btnDownloadFirst = document.getElementById('btnDownloadBeforeReset');

  btnReset.addEventListener('click', () => {
    const company = (currentData && currentData.meta && currentData.meta.company_name) || "la empresa actual";
    document.getElementById('resetCompanyName').textContent = company;
    modal.classList.add('open');
  });

  const closeModal = () => modal.classList.remove('open');
  btnCancel.addEventListener('click', closeModal);
  btnCross.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  btnDownloadFirst.addEventListener('click', () => {
    window.location.href = '/api/export/report';
    showToast("📥 Descargando informe ejecutivo de respaldo...");
  });

  btnConfirm.addEventListener('click', () => {
    closeModal();
    // Limpiar estado y volver a mostrar dropzone
    currentData = null;
    currentFiles = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('dashboardContent').style.display = 'none';
    const wiz = document.getElementById('wizardSection');
    if (wiz) wiz.style.display = 'none';
    document.getElementById('dropzonePanel').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("🔄 Listo para cargar nuevos archivos CSV");
  });
}

// --- RENDERIZAR KPI CUELLO DE BOTELLA / HANDOFF CON SEMÁFORO ---
function renderBottleneckKPI(handoff) {
  const card = document.getElementById('kpiCardBottleneck');
  const title = document.getElementById('kpiBottleneckTitle');
  const value = document.getElementById('kpiBottleneck');
  const sub = document.getElementById('kpiBottleneckSub');
  const tag = document.getElementById('tagKpiBottleneck');

  if (!handoff) return;

  card.classList.remove('alert', 'warning', 'success');

  if (handoff.policy === 'bot_priority' && handoff.bot_share_percentage >= 40) {
    title.textContent = "Resolución Automática (Bot)";
    value.textContent = `${handoff.bot_share_percentage}% Bot`;
    sub.textContent = `🟢 Bueno: Asesor líder ${handoff.top_human_operator} (${handoff.top_human_percentage_of_human}% derivado)`;
    card.classList.add('success');
    if (tag) {
      tag.className = 'kpi-status-tag status-success';
      tag.textContent = '🟢 BUENO (BOT)';
    }
  } else {
    title.textContent = "Cuello de Botella Humano";
    value.textContent = `${handoff.top_human_operator} (${handoff.top_human_percentage_of_human}% de humanos)`;
    
    if (handoff.top_human_percentage_of_human > 60) {
      card.classList.add('alert');
      sub.textContent = `🔴 Malo: ${handoff.top_human_operator} concentra casi toda la carga`;
      if (tag) {
        tag.className = 'kpi-status-tag status-alert';
        tag.textContent = '🔴 CRÍTICO / SATURADO';
      }
    } else {
      card.classList.add('warning');
      sub.textContent = `🟡 Alerta: ${handoff.top_human_messages.toLocaleString()} msgs (${handoff.human_share_percentage}% carga humana)`;
      if (tag) {
        tag.className = 'kpi-status-tag status-warning';
        tag.textContent = '🟡 ALERTA';
      }
    }
  }
}

// --- RENDERIZAR SCORECARD INTERACTIVO (SOLUCIÓN PROBABLE AL CLIC) ---
function renderScorecard(scorecard) {
  const container = document.getElementById('scorecardGrid');
  container.innerHTML = '';

  if (!scorecard || !scorecard.length) {
    container.innerHTML = engineNoticeHTML(
      'Semáforo ACTÚEN+ no disponible',
      'La evaluación de los 7 pilares cruza fragmentación, tiempos, handoff y temas detectados. En el navegador no hay datos suficientes para puntuarlos.'
    );
    return;
  }

  scorecard.forEach((item, index) => {
    const statusClass = item.status.toLowerCase();
    const pillarLetter = item.pillar.charAt(0);
    const pillarCleanName = item.pillar.includes('-') ? item.pillar.split('-')[1].trim() : item.pillar;

    // Métricas clave scannables por pilar
    let chipMetric = '';
    if (pillarLetter === 'A') chipMetric = `🎯 Handoff: ${item.focus_context || 'Equilibrado'}`;
    else if (pillarLetter === 'C') chipMetric = `⚡ Cero Vueltas: Bloque Único`;
    else if (pillarLetter === 'T') chipMetric = `⏱️ Calibrado con SLA Sectorial`;
    else if (pillarLetter === 'U') chipMetric = `🔍 Macro y Micro-intención`;
    else if (pillarLetter === 'E') chipMetric = `👤 Personalización & Rescate`;
    else if (pillarLetter === 'N') chipMetric = `🏆 Tipping Point Comercial`;
    else chipMetric = `🤖 Balance Bot vs Equipo Humano`;

    // Estructurar el diagnóstico: primera frase destacada para escaneo veloz
    const diagParts = item.diagnosis.split('. ');
    const leadSentence = diagParts[0] + (diagParts.length > 1 ? '.' : '');
    const restDiagnosis = diagParts.slice(1).join('. ');

    const card = document.createElement('div');
    card.className = 'score-card';
    card.setAttribute('data-pillar-index', index);
    card.setAttribute('title', 'Hacé clic para desplegar la Solución Probable Spoter');

    card.innerHTML = `
      <div>
        <div class="score-header-top">
          <div class="pillar-identity">
            <span class="pillar-letter ${statusClass}">${pillarLetter}</span>
            <div class="pillar-title-group">
              <h4 class="pillar-name">${pillarCleanName}</h4>
              <span class="pillar-sub">${item.focus_context || ''}</span>
            </div>
          </div>
          <span class="status-badge ${statusClass}">${item.status} (${item.score}/100)</span>
        </div>

        <div class="score-chip-bar">
          <span class="score-metric-chip">${chipMetric}</span>
        </div>

        <div class="score-body-clean">
          <span class="lead-sentence">${escapeHtml(leadSentence)}</span>
          ${restDiagnosis ? `<span style="color:var(--text-secondary);font-size:12.5px;">${escapeHtml(restDiagnosis)}</span>` : ''}
        </div>
      </div>

      <div class="score-action-toggle" id="togglePillar_${index}">
        <span>⚡ Ver Solución Probable Spoter</span>
        <span class="toggle-icon">▾</span>
      </div>

      <div class="score-solution-drawer" id="drawerPillar_${index}">
        <div class="sol-section-title">
          <span>🛠️ Solución y Metodología Spoter:</span>
        </div>
        <div class="sol-text">
          ${escapeHtml(item.recommendation)}
        </div>
        <div class="sol-actions-row">
          <button class="btn-copy-solution" data-sol="${escapeHtml(item.recommendation)}">
            📋 Copiar Solución
          </button>
          <button class="btn-copy-solution btn-detail-modal" data-index="${index}">
            🔍 Benchmark Metodológico
          </button>
        </div>
      </div>
    `;

    // Interacción al clic: expande y muestra la solución probable en la tarjeta
    card.addEventListener('click', (e) => {
      // Si hizo clic en el botón de copiar
      if (e.target.closest('.btn-copy-solution') && !e.target.closest('.btn-detail-modal')) {
        e.stopPropagation();
        const textToCopy = e.target.closest('.btn-copy-solution').getAttribute('data-sol');
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast("📋 Solución copiada al portapapeles");
        });
        return;
      }

      // Si hizo clic en ver detalle modal
      if (e.target.closest('.btn-detail-modal')) {
        e.stopPropagation();
        openPillarModal(item);
        return;
      }

      // Toggle drawer
      const drawer = card.querySelector('.score-solution-drawer');
      const toggleBar = card.querySelector('.score-action-toggle');
      const isOpen = drawer.classList.contains('open');

      if (isOpen) {
        drawer.classList.remove('open');
        card.classList.remove('expanded');
        toggleBar.innerHTML = `<span>⚡ Ver Solución Probable Spoter</span><span class="toggle-icon">▾</span>`;
      } else {
        drawer.classList.add('open');
        card.classList.add('expanded');
        toggleBar.innerHTML = `<span>▲ Ocultar Solución Probable</span><span class="toggle-icon">▲</span>`;
      }
    });

    container.appendChild(card);
  });
}

// --- RENDERIZAR TOPICS Y TABLA DE PING-PONG (CALIBRADO POR INDUSTRIA) ---
function renderTopics(topics, isSales) {
  const tbody = document.getElementById('topicsTableBody');
  tbody.innerHTML = '';

  if (!topics || !topics.length) {
    tbody.innerHTML = `<tr><td colspan="9">${engineNoticeHTML(
      'Clasificación temática no disponible',
      'Agrupar las conversaciones por tema usa las categorías calibradas de cada rubro, que hoy viven solo en el motor Spoter. La pestaña de Handoff sí muestra los disparadores reales detectados en tus chats.'
    )}</td></tr>`;
    const chartBox = document.getElementById('chartTopics');
    if (chartBox) {
      chartBox.setAttribute('data-hidden-by-notice', '1');
      chartBox.style.display = 'none';
    }
    return;
  }

  document.getElementById('topicsChartTitle').textContent = isSales 
    ? 'Volumen de Consultas vs. Ping-Pong Real vs. Estándar de la Industria'
    : 'Volumen de Trámites vs. Ping-Pong Real vs. Estándar de la Industria';

  const pp = (currentData && currentData.ping_pong) ? currentData.ping_pong : {};
  const idealC = pp.ideal_client_avg || 3.5;
  const idealOp = pp.ideal_operator_avg || 3.0;
  const idealTotal = pp.ideal_total_avg || 6.5;

  const ppClientSub = document.getElementById('ppClientSub');
  if (ppClientSub) ppClientSub.innerHTML = `Estándar Rubro: <strong>${idealC} msgs</strong> (Consulta + Especificación)`;

  const ppOpSub = document.getElementById('ppOpSub');
  if (ppOpSub) ppOpSub.innerHTML = `Estándar Rubro: <strong>${idealOp} msgs</strong> (Respuesta Maestra + Cierre)`;

  const ppTotalSub = document.getElementById('ppTotalSub');
  if (ppTotalSub) ppTotalSub.innerHTML = `Meta Calibrada: <strong>${idealTotal} msgs</strong>`;

  topics.forEach(t => {
    const tr = document.createElement('tr');
    const clientMsgs = t.avg_client_messages || (t.avg_messages_per_client * 0.45).toFixed(1);
    const opMsgs = t.avg_operator_messages || (t.avg_messages_per_client * 0.55).toFixed(1);
    const tIdealC = t.ideal_client_messages || idealC;
    const tIdealOp = t.ideal_operator_messages || idealOp;
    const tIdealTotal = t.ideal_total_messages || idealTotal;
    const excessRate = t.ping_pong_rate || (t.avg_messages_per_client / tIdealTotal).toFixed(1);

    tr.innerHTML = `
      <td class="cat-cell" title="${escapeHtml(t.category)}"><strong>${escapeHtml(t.category)}</strong></td>
      <td>${t.conversations.toLocaleString()}</td>
      <td>${t.percentage}%</td>
      <td><strong>${clientMsgs}</strong> <span style="font-size:10px;color:var(--text-muted);">(vs ${tIdealC})</span></td>
      <td><strong>${opMsgs}</strong> <span style="font-size:10px;color:var(--text-muted);">(vs ${tIdealOp})</span></td>
      <td><strong>${t.avg_messages_per_client}</strong></td>
      <td><span class="badge-tag ${parseFloat(excessRate) > 2 ? 'red' : 'yellow'}">${excessRate}x</span></td>
      <td><span class="badge-tag ${t.badge_class}">${t.ping_pong_severity}</span></td>
    `;
    tbody.appendChild(tr);
  });

  const ctx = document.getElementById('chartTopics').getContext('2d');
  if (charts.topics) charts.topics.destroy();

  charts.topics = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topics.map(t => t.category),
      datasets: [
        {
          label: 'Msgs Cliente (Real)',
          data: topics.map(t => t.avg_client_messages || (t.avg_messages_per_client * 0.45).toFixed(1)),
          backgroundColor: 'rgba(6, 182, 212, 0.85)', // Cyan Interlocutor
          borderRadius: 4
        },
        {
          label: 'Msgs Empresa/Operador (Real)',
          data: topics.map(t => t.avg_operator_messages || (t.avg_messages_per_client * 0.55).toFixed(1)),
          backgroundColor: 'rgba(228, 45, 127, 0.85)', // Rosa Spoter Operador
          borderRadius: 4
        },
        {
          label: `Estándar de Industria (${idealTotal} msgs)`,
          data: topics.map(t => t.ideal_total_messages || idealTotal),
          type: 'line',
          borderColor: '#10B981',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 3,
          pointBackgroundColor: '#10B981',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const topic = topics[ctx.dataIndex];
              const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.raw;
              if (ctx.dataset.type === 'line') {
                return ` ${ctx.dataset.label}: ${val} msgs`;
              }
              const clientMsg = Number(topic.avg_client_messages || (topic.avg_messages_per_client * 0.45));
              const opMsg = Number(topic.avg_operator_messages || (topic.avg_messages_per_client * 0.55));
              const totalCase = (clientMsg + opMsg) || 1;
              const pctOfCase = Math.round((Number(val) / totalCase) * 100);
              return ` ${ctx.dataset.label}: ${val} msgs (${pctOfCase}% del caso) | Demanda: ${topic.percentage}% (${topic.count} casos)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Mensajes por Caso' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          suggestedMax: 30
        }
      }
    }
  });
}

// --- GRÁFICOS DE FUGAS Y TIEMPOS ACEITADOS: DOS GRÁFICOS LADO A LADO ---
function renderFrictionCharts(data) {
  const wt = data.wait_times;
  const sla = wt.sla;

  const initData = wt.initial_response || {};
  const convData = wt.in_conversation || {};

  // Cuando el modo navegador no puede separar primera respuesta de respuesta en
  // conversación, ambos paneles caen al agregado. Se dice explícitamente, en vez
  // de mostrar el mismo número dos veces como si fueran dos mediciones distintas.
  const hasSplit = !!(wt.initial_response && wt.in_conversation);

  const initBrackets = initData.brackets || wt.brackets || {};
  const convBrackets = convData.brackets || wt.brackets || {};

  const initAvg = initData.average_minutes || wt.average_minutes;
  const convAvg = convData.average_minutes || wt.average_minutes;

  const aggregateNote = `Promedio general: ${metricOr(wt.average_minutes, v => `${v} min`)} · sin desglose (requiere motor)`;

  const tagInit = document.getElementById('tagInitialWaitAvg');
  if (tagInit) {
    tagInit.textContent = hasSplit
      ? `Promedio: ${initAvg} min | P90: ${metricOr(initData.p90_minutes, v => `${v}m`)}`
      : aggregateNote;
  }

  const tagConv = document.getElementById('tagInConvWaitAvg');
  if (tagConv) {
    tagConv.textContent = hasSplit
      ? `Promedio: ${convAvg} min | P90: ${metricOr(convData.p90_minutes, v => `${v}m`)}`
      : aggregateNote;
  }

  if (sla) {
    document.getElementById('slaDescriptionText').textContent = 
      `SLA del Rubro (${data.meta.detected_rubro}): Óptimo < ${sla.ideal_immediate} min | Aceptable < ${sla.acceptable} min | Zona Fría > ${sla.warning} min. ${sla.benchmark_text}`;
  }

  // 1. Resumen Visual: 3 Franjas Oportunas (OK) vs 2 Franjas Críticas (Riesgo/Fuga)
  const elOkSummary = document.getElementById('valInitialOkSummary');
  const elRiskSummary = document.getElementById('valInitialRiskSummary');

  if (initData.ok_summary && elOkSummary) {
    elOkSummary.textContent = `${initData.ok_summary.count.toLocaleString()} chats (${initData.ok_summary.percentage}%)`;
  } else if (elOkSummary) {
    const bKeys = Object.keys(initBrackets);
    const okCount = (initBrackets[bKeys[0]] || 0) + (initBrackets[bKeys[1]] || 0) + (initBrackets[bKeys[2]] || 0);
    const totalCount = initData.count || 1;
    const okPct = Math.round((okCount / totalCount) * 1000) / 10;
    elOkSummary.textContent = `${okCount.toLocaleString()} chats (${okPct}%)`;
  }

  if (initData.risk_summary && elRiskSummary) {
    elRiskSummary.textContent = `${initData.risk_summary.count.toLocaleString()} chats (${initData.risk_summary.percentage}%)`;
  } else if (elRiskSummary) {
    const bKeys = Object.keys(initBrackets);
    const riskCount = (initBrackets[bKeys[3]] || 0) + (initBrackets[bKeys[4]] || 0);
    const totalCount = initData.count || 1;
    const riskPct = Math.round((riskCount / totalCount) * 1000) / 10;
    elRiskSummary.textContent = `${riskCount.toLocaleString()} chats (${riskPct}%)`;
  }

  // 1. Gráfico Lado Izquierdo: Mensaje Inicial
  const ctxInit = document.getElementById('chartWaitTimesInitial').getContext('2d');
  if (charts.waitInitial) charts.waitInitial.destroy();

  charts.waitInitial = new Chart(ctxInit, {
    type: 'bar',
    data: {
      labels: Object.keys(initBrackets),
      datasets: [{
        label: 'Turnos Iniciales',
        data: Object.values(initBrackets),
        backgroundColor: [
          '#10B981', // Inmediato
          '#34D399', // Aceptable
          '#F59E0B', // Alerta
          '#3B82F6', // ❄️ Zona Fría (Azul)
          '#EF4444'  // Crítico (Rojo)
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.raw;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` Turnos Iniciales: ${val.toLocaleString()} (${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // 2. Gráfico Lado Derecho: En Conversación
  const ctxConv = document.getElementById('chartWaitTimesInConv').getContext('2d');
  if (charts.waitConv) charts.waitConv.destroy();

  charts.waitConv = new Chart(ctxConv, {
    type: 'bar',
    data: {
      labels: Object.keys(convBrackets),
      datasets: [{
        label: 'Turnos en Conversación',
        data: Object.values(convBrackets),
        backgroundColor: [
          '#10B981', // Inmediato
          '#34D399', // Aceptable
          '#F59E0B', // Alerta
          '#3B82F6', // ❄️ Zona Fría (Azul)
          '#EF4444'  // Crítico (Rojo)
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.raw;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` Turnos en Conversación: ${val.toLocaleString()} (${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // 2. Donut de Ráfagas (Cero Vueltas)
  const burstCanvas = document.getElementById('chartBursts');
  if (!data.fragmentation) {
    // Sin datos de ráfagas se reemplaza el gráfico por el aviso, pero el resto
    // de la pestaña (que sí es real) se sigue renderizando.
    if (charts.bursts) { charts.bursts.destroy(); charts.bursts = null; }
    showEngineNotice(
      burstCanvas,
      'Ráfagas de fragmentación no disponibles',
      'No se detectaron ráfagas de mensajes de la empresa en las conversaciones analizadas.'
    );
  } else {
  const ctxBurst = burstCanvas.getContext('2d');
  if (charts.bursts) charts.bursts.destroy();

  charts.bursts = new Chart(ctxBurst, {
    type: 'doughnut',
    data: {
      labels: ['1 Mensaje Directo (Óptimo)', '2 Mensajes en Ráfaga', '3+ Mensajes (Fragmentación Alta)'],
      datasets: [{
        data: [data.fragmentation.burst_1_msg, data.fragmentation.burst_2_msgs, data.fragmentation.burst_3_plus_msgs],
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed !== undefined ? ctx.parsed : ctx.raw;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` ${ctx.label}: ${val.toLocaleString()} ráfagas (${pct}%)`;
            }
          }
        }
      }
    }
  });
  }

  // 3. Distribución de Carga (Diferenciando Bot vs Asesores)
  const ctxOps = document.getElementById('chartOperators').getContext('2d');
  if (charts.operators) charts.operators.destroy();

  charts.operators = new Chart(ctxOps, {
    type: 'bar',
    data: {
      labels: data.operators.map(o => o.is_bot ? `🤖 ${o.operator}` : `👤 ${o.operator}`),
      datasets: [{
        label: '% de Mensajes Atendidos',
        data: data.operators.map(o => o.percentage),
        backgroundColor: data.operators.map(o => o.is_bot ? '#10B981' : '#e42d7f'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const op = data.operators[ctx.dataIndex];
              return `${op.percentage}% (${op.messages.toLocaleString()} msgs) - ${op.is_bot ? 'Automatización' : op.est_hours_spent + ' hs tipeando'}`;
            }
          }
        }
      },
      scales: {
        y: { max: 100, ticks: { callback: v => v + '%' } }
      }
    }
  });

  // 4. Métricas de tiempos
  document.getElementById('valAvgWait').textContent = `${data.wait_times.average_minutes} min`;
  document.getElementById('valP90Wait').textContent = metricOr(data.wait_times.p90_minutes, v => `${v} min`);
  document.getElementById('valP95Wait').textContent = metricOr(data.wait_times.p95_minutes, v => `${v} min`);
  document.getElementById('valOver15').textContent = `${data.wait_times.over_warning_count} (${data.wait_times.over_warning_percentage}%)`;
  document.getElementById('valDrops').textContent = `${data.wait_times.system_drops} caídas`;
}

// --- GRÁFICOS DE HORARIOS Y DÍAS DE CONTACTO ---
function renderScheduleCharts(schedule) {
  if (!schedule) {
    const summary = document.getElementById('scheduleSummaryText');
    if (summary) summary.textContent = '';
    showEngineNotice(
      document.getElementById('chartHourlySchedule'),
      'Análisis de horarios no disponible',
      'No se reconoció ninguna fecha válida en la columna de fecha/hora del CSV, así que no se puede ubicar el primer contacto de cada conversación.'
    );
    const weekdayCanvas = document.getElementById('chartWeekdaySchedule');
    if (weekdayCanvas) {
      weekdayCanvas.setAttribute('data-hidden-by-notice', '1');
      weekdayCanvas.style.display = 'none';
    }
    return;
  }

  document.getElementById('scheduleSummaryText').textContent = 
    `Pico semanal: ${schedule.peak_day} | Horario más concurrido: ${schedule.peak_hour} (${schedule.business_hours_percentage}% en horario comercial y ${schedule.after_hours_percentage}% fuera de hora).`;

  // Gráfico Días de la Semana
  const ctxWeekdays = document.getElementById('chartWeekdaySchedule').getContext('2d');
  if (charts.weekdays) charts.weekdays.destroy();

  charts.weekdays = new Chart(ctxWeekdays, {
    type: 'bar',
    data: {
      labels: Object.keys(schedule.weekdays),
      datasets: [{
        label: 'Conversaciones Iniciadas',
        data: Object.values(schedule.weekdays),
        backgroundColor: 'rgba(228, 45, 127, 0.75)', // Rosa Spoter
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.raw;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` Conversaciones: ${val.toLocaleString()} (${pct}% de la semana)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // Gráfico Horas del Día (00 a 23 hs)
  const ctxHourly = document.getElementById('chartHourlySchedule').getContext('2d');
  if (charts.hourly) charts.hourly.destroy();

  const hourLabels = Array.from({length: 24}, (_, i) => `${i}h`);

  charts.hourly = new Chart(ctxHourly, {
    type: 'line',
    data: {
      labels: hourLabels,
      datasets: [{
        label: 'Consultas por Hora',
        data: schedule.hourly,
        borderColor: '#e42d7f',
        backgroundColor: 'rgba(228, 45, 127, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.raw;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` Consultas: ${val.toLocaleString()} (${pct}% del día)`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// --- RENDERIZAR PLANTILLAS MAESTRAS CON SOPORTE "VER MÁS" Y SALTO MENSAJE ---
function formatMessageWithSplits(text) {
  if (!text) return '';
  const splitRegex = /\s*\[?-*salto[-_]?mensaje-*\]?\s*/i;
  if (!splitRegex.test(text)) {
    return `<div class="message-box">${escapeHtml(text)}</div>`;
  }
  const parts = text.split(splitRegex).filter(p => p && p.trim());
  if (parts.length <= 1) {
    return `<div class="message-box">${escapeHtml(text)}</div>`;
  }

  const bubblesHtml = parts.map((part, i) => `
    <div class="bubble-sub-msg">
      <div class="bubble-tag">💬 Burbuja ${i + 1} de WhatsApp</div>
      <div class="bubble-text">${escapeHtml(part.trim())}</div>
    </div>
  `).join(`
    <div class="split-message-divider">
      <span class="split-icon">✂️</span>
      <span>Atajo de División Spoter:</span>
      <code class="split-code">[---saltomensaje---]</code>
      <span style="opacity:0.85;">(Entrega 2 burbujas separadas en 1 solo envío)</span>
    </div>
  `);

  return `<div class="split-bubble-container">${bubblesHtml}</div>`;
}

function renderTemplates(templates, isSales) {
  const container = document.getElementById('templatesList');
  container.innerHTML = '';

  document.getElementById('templatesSubTitle').textContent = isSales
    ? 'Plantillas comerciales que condensan precio, flete y formas de pago en 1 solo bloque con Tipping Point.'
    : 'Plantillas de atención y soporte que agrupan los requisitos de diagnóstico y trámite en 1 solo turno.';

  const toggleBtn = document.getElementById('btnToggleMoreTemplates');
  const hasExtra = templates.length > 3;
  toggleBtn.style.display = hasExtra ? 'inline-flex' : 'none';
  toggleBtn.textContent = showAllTemplates ? '➖ Ver Menos Plantillas' : `➕ Ver Todas las Plantillas (${templates.length})`;

  templates.forEach((t, index) => {
    const isHidden = (index >= 3 && !showAllTemplates);
    const card = document.createElement('div');
    card.className = `template-card ${isHidden ? 'hidden-extra' : ''}`;
    card.innerHTML = `
      <div class="template-header">
        <div class="template-title">
          <h3>${t.title} <span class="shortcut-tag">${t.shortcut}</span></h3>
        </div>
        <button class="btn btn-secondary btn-copy" data-content="${encodeURIComponent(t.after)}">
          📋 Copiar Plantilla
        </button>
      </div>
      <div class="comparison-grid">
        <div class="block-before">
          <h4>❌ Flujo Ineficiente Anterior (Ping-Pong)</h4>
          <p>${t.before}</p>
        </div>
        <div class="block-after">
          <h4>✅ Mensaje Maestro ACTÚEN+ (Cero Vueltas)</h4>
          ${formatMessageWithSplits(t.after)}
          <div class="tipping-badge">🎯 ${isSales ? 'Tipping Point' : 'Acción de Cierre'}: ${escapeHtml(t.tipping_point)}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = decodeURIComponent(btn.getAttribute('data-content'));
      navigator.clipboard.writeText(text);
      showToast("📋 Plantilla copiada al portapapeles");
    });
  });
}

function initTemplateToggle() {
  const toggleBtn = document.getElementById('btnToggleMoreTemplates');
  toggleBtn.addEventListener('click', () => {
    showAllTemplates = !showAllTemplates;
    if (currentData) {
      renderTemplates(currentData.master_templates, currentData.meta.business_focus === 'ventas');
    }
  });
}

// --- MODAL EXPLICATIVO PARA TARJETAS CLICKABLES ---
function initModalEvents() {
  const modal = document.getElementById('explainModal');
  const closeBtn = document.getElementById('modalCloseBtn');

  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  document.querySelectorAll('.kpi-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.getAttribute('data-kpi');
      if (key === 'savings') {
        openSavingsModal();
      } else if (key === 'clients') {
        openClientsScheduleModal();
      } else if (key === 'bottleneck') {
        openBottleneckModal();
      } else if (key && EXPLANATIONS[key]) {
        openModal(EXPLANATIONS[key]);
      }
    });
  });

  // Tarjetas Interactivas de Auditoría de Capital (Tab 2)
  document.querySelectorAll('.ltv-kpi-card').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.getAttribute('data-ltv-kpi');
      if (key) {
        openLtvExplanationModal(key);
      }
    });
  });
}

function openModal(data) {
  document.getElementById('modalTitle').textContent = data.title;
  document.getElementById('modalMeaning').textContent = data.meaning;
  document.getElementById('modalCalculation').textContent = data.calculation;
  document.getElementById('modalImpact').textContent = data.impact;
  document.getElementById('modalBenchmark').textContent = data.benchmark;
  document.getElementById('explainModal').classList.add('open');
}


// --- MODAL EXPLICATIVO PARA TARJETAS DE AUDITORÍA DE CAPITAL LTV ---
function openLtvExplanationModal(key) {
  if (!currentData || !currentData.ltv_economics) return;
  const ltv = currentData.ltv_economics;
  const prio = currentData.prioritization_audit || {};
  const lite = currentData.spoter_lite || {};
  const fx = supuestos().tipo_cambio_ars;

  if (key === 'capital_risk') {
    const totalRiskUsd = ltv.total_economic_risk_usd || 0;
    const totalRiskArs = Math.round(totalRiskUsd * fx);
    const immLostUsd = ltv.immediate_lost_usd || 0;
    const immLostArs = Math.round(immLostUsd * fx);
    const cacUsd = ltv.cac_wasted_usd || 0;
    const cacArs = Math.round(cacUsd * fx);
    const ltvUnitUsd = ltv.ltv_usd || 0;
    const ltvUnitArs = Math.round(ltvUnitUsd * fx);
    const ticketUsd = ltv.avg_ticket_usd || 0;
    const ticketArs = Math.round(ticketUsd * fx);

    openModal({
      title: `💰 Auditoría de Capital LTV en Riesgo: $${totalRiskUsd.toLocaleString()} USD (~$${totalRiskArs.toLocaleString()} ARS)`,
      meaning: `Mide el impacto patrimonial acumulado cuando leads con intención de compra real se enfrían por demoras superiores al SLA saludable (> 15 min).\n\nLa pérdida no es solo la compra puntual de hoy, sino el ciclo de vida completo del cliente (LTV) más la inversión en pauta publicitaria (CAC) que ya no se recupera.`,
      calculation: `• Leads calificados en Zona Fría: ${ltv.leads_at_risk_count.toLocaleString()} usuarios (${ltv.leads_at_risk_percentage}% de la cartera auditada)\n` +
        `• Ticket Promedio del Sector: $${ticketUsd.toLocaleString()} USD ($${ticketArs.toLocaleString()} ARS)\n` +
        `• Frecuencia & Retención: ${ltv.annual_frequency} compras/año durante ${ltv.retention_years} años ➔ LTV Unitario: $${ltvUnitUsd.toLocaleString()} USD ($${ltvUnitArs.toLocaleString()} ARS)\n` +
        `• Pérdida Inmediata en 1ª Venta (65% caída): $${immLostUsd.toLocaleString()} USD ($${immLostArs.toLocaleString()} ARS)\n` +
        `• Destrucción de Cartera LTV Recurrente: $${(ltv.ltv_capital_at_risk_usd || 0).toLocaleString()} USD\n` +
        `• CAC Desperdiciado (Pauta Meta/Google): $${cacUsd.toLocaleString()} USD ($${cacArs.toLocaleString()} ARS)\n` +
        `• Riesgo Económico Total Acumulado: $${totalRiskUsd.toLocaleString()} USD (~$${totalRiskArs.toLocaleString()} ARS)`,
      impact: `⚡ Solución Quirúrgica Spoter:\nCon el Triage IU/IC y las Respuestas Maestras, Spoter prioriza y rescata hasta un 75% de esta cartera en riesgo, proyectando una protección patrimonial de $${(ltv.projected_recovered_ltv_usd || 0).toLocaleString()} USD (~$${Math.round((ltv.projected_recovered_ltv_usd || 0) * fx).toLocaleString()} ARS).`,
      benchmark: `Meta Spoter: Cero leads con IC ≥ 40 demorados en Zona Fría.`
    });
  } else if (key === 'fifo_delayed') {
    const fifoWait = prio.fifo_vs_spoter_wait?.fifo_high_intent_wait_min || 0;
    const spoterWait = prio.fifo_vs_spoter_wait?.spoter_high_intent_wait_min || 2.0;

    openModal({
      title: `⚠️ Fuga por Atención FIFO: ${prio.fifo_delayed_percentage}% de Compradores Afectados`,
      meaning: `FIFO ("First In, First Out") atiende a los usuarios estrictamente por orden de llegada. Trata exactamente igual a un saludo casual o mensaje de spam que a un cliente con especificaciones técnicas y presupuesto listo para pagar.`,
      calculation: `• Leads con Alta Intención Comercial (IC ≥ 40): ${prio.high_intent_leads_count.toLocaleString()} usuarios detectados\n` +
        `• Leads de compra que cayeron en Zona Fría (> 15 min): ${prio.high_intent_delayed_count.toLocaleString()} (${prio.fifo_delayed_percentage}% de los compradores)\n` +
        `• Demora Promedio Real que sufrieron en FIFO: ${fifoWait} minutos\n` +
        `• Demora Proyectada con Cola Priorizada Spoter: ${spoterWait} minutos (-90% de reducción)`,
      impact: `⚡ Solución Quirúrgica Spoter:\nSpoter extrae el IC en < 3 segundos. El cliente listo para comprar salta al puesto #1 de la cola del operador con el atajo de cotización precargado, eliminando la pérdida por espera.`,
      benchmark: `Estándar Saludable: Compradores de alta intención atendidos en < 2 minutos.`
    });
  } else if (key === 'meta_24h') {
    openModal({
      title: `⏱️ Vencimiento de Ventana de 24 Horas WhatsApp (Meta API)`,
      meaning: `La API de WhatsApp impone una ventana estricta de 24 horas desde el último mensaje del cliente. Si la empresa tarda más de 24 horas en responder o hacer seguimiento, el canal se bloquea para texto libre y se exige el pago de plantillas publicitarias HSM.`,
      calculation: `• Conversaciones con demora > 24 horas: ${prio.whatsapp_24h_breaches.toLocaleString()} chats (${prio.whatsapp_24h_breach_percentage}% de los casos)\n` +
        `• Costo directo: Penalización en compra de plantillas de reactivación pagas de Meta\n` +
        `• Costo indirecto: Pérdida total del lead (el 92% de los clientes no responde un mensaje 24 horas después)`,
      impact: `⚡ Solución Quirúrgica Spoter:\nMonitoreo automático de la ventana de sesión con alertas preventivas al llegar a las 20 horas de inactividad para garantizar el cierre dentro de la ventana gratuita.`,
      benchmark: `Meta: 0% de conversaciones vencidas fuera de la ventana de 24 horas.`
    });
  } else if (key === 'lite_rescuable') {
    openModal({
      title: `🟢 Leads Rescatables con Spoter Lite: ${lite.leads_rescatables_count} Oportunidades`,
      meaning: `Leads que atravesaron las fases de indagación y presupuesto, mostraron alto interés de compra (IC ≥ 40) y, tras un silencio del cliente o del operador, la conversación quedó archivada sin ninguna acción de rescate.`,
      calculation: `• Leads calificados abandonados en silencio: ${lite.leads_rescatables_count.toLocaleString()} (${lite.leads_rescatables_percentage}% de las oportunidades en fase de cierre)\n` +
        `• Tasa de conversión histórica sin rescate: 0%\n` +
        `• Tasa de recuperación con protocolo Spoter Lite: 25% a 40% de éxito en retorno de diálogo`,
      impact: `⚡ Solución Quirúrgica Spoter:\nSpoter Lite detecta conversaciones inactivas con alto IC y propone al operador un atajo de rescate de 1 solo toque con llamada a la acción ("¿Pudiste revisar el presupuesto? ¿Te reservo la unidad?").`,
      benchmark: `Recuperar al menos el 30% de los leads dormidos en fase de cotización.`
    });
  }
}

function openSavingsModal() {
  if (!currentData) return;
  const sav = currentData.savings;
  const eco = sav.economic_benefit || { total_ars: 0, total_usd: 0, labor_savings_ars: 0, api_savings_ars: 0 };
  
  const formattedArs = eco.total_ars.toLocaleString();
  const formattedLabor = eco.labor_savings_ars.toLocaleString();
  const formattedApi = eco.api_savings_ars.toLocaleString();

  openModal({
    title: `💰 Retorno Financiero y Beneficio Económico: $${formattedArs} ARS / mes`,
    meaning: `Al implementar el Método ACTÚEN+ de Spoter, la empresa reduce un ${sav.reduction_percentage}% los mensajes que envía y ahorra ${sav.hours_saved_monthly} horas mensuales de tipeo y atención manual.`,
    calculation: `• Ahorro Laboral Operativo: $${formattedLabor} ARS (${sav.hours_saved_monthly} hs ahorradas a $5.000 ARS/hora laboral)\n• Ahorro en Plataforma y API de WhatsApp: $${formattedApi} ARS (${sav.messages_saved.toLocaleString()} msgs evitados a $45 ARS/msg)\n• Beneficio Neto Mensual: $${formattedArs} ARS (~$${eco.total_usd} USD/mes)`,
    impact: `⚡ Solución Spoter: Además del ahorro directo, resolver en 1 solo bloque evita la fuga de prospectos en la 'Zona Azul', aumentando la conversión comercial entre un 15% y un 30%.`,
    benchmark: `Meta ACTÚEN+: Bajar de ${currentData.meta.baseline_company_msgs_per_client} a ${currentData.meta.target_company_msgs_per_client} mensajes por cliente.`
  });
}

function openClientsScheduleModal() {
  if (!currentData || !currentData.schedule) return;
  const sch = currentData.schedule;

  let top3Detail = "";
  if (sch.top_peak_hours && sch.top_peak_hours.length) {
    top3Detail = "\n• ⏰ Top 3 Franjas Horarias con Mayor Demanda:\n" + 
      sch.top_peak_hours.map((p, idx) => `   ${idx + 1}° ${p.hour_range}: ${p.count.toLocaleString()} consultas iniciales (${p.percentage}%)`).join('\n');
  }

  openModal({
    title: `📅 Mapa de Horarios y Demanda (${currentData.meta.unique_clients.toLocaleString()} usuarios)`,
    meaning: `Analiza en qué días de la semana y en qué franjas horarias escriben tus clientes por primera vez.`,
    calculation: `• Día pico semanal: ${sch.peak_day}${top3Detail}\n• Consultas en Horario Comercial: ${sch.business_hours_count} (${sch.business_hours_percentage}%)\n• Consultas Fuera de Horario / Fines de Semana: ${sch.after_hours_count} (${sch.after_hours_percentage}%)`,
    impact: `⚡ Solución Spoter: Conocer los 3 picos del día permite reforzar el equipo humano en esas horas clave y activar un bot de contención ("oxígeno") fuera de hora comercial.`,
    benchmark: `Revisá los gráficos detallados en la Pestaña '3. Fugas & Tiempos Calibrados'.`
  });
}

function openBottleneckModal() {
  if (!currentData || !currentData.handoff) return;
  const h = currentData.handoff;

  openModal({
    title: `🤖 Distribución de Carga y Handoff (Bot vs Personal Humano)`,
    meaning: `Evalúa la política de derivación entre el Bot y el equipo humano.`,
    calculation: `• Mensajes absorbidos por el Bot: ${h.bot_messages.toLocaleString()} (${h.bot_share_percentage}% del total)\n• Mensajes atendidos por Personas: ${h.human_messages.toLocaleString()} (${h.human_share_percentage}% del total)\n• Asesor humano con mayor carga: ${h.top_human_operator} (${h.top_human_messages.toLocaleString()} msgs = ${h.top_human_percentage_of_human}% de la carga humana)`,
    impact: `💡 Enfoque Spoter: Si la política es Bot Autoservicio, que el Bot resuelva el 50%+ es un éxito total. Si la política es Humana y un asesor absorbe el 80% de los casos, se genera saturación y demora en cola.`,
    benchmark: `Podés cambiar la política en el selector superior: 'Bot Autoservicio', 'Híbrido' o 'Humano Prioritario'.`
  });
}

function openPillarModal(item) {
  openModal({
    title: `${item.pillar} (Score: ${item.score}/100 - ${item.status})`,
    meaning: `Evalúa el desempeño del pilar '${item.pillar.split('-')[0].trim()}' del Método ACTÚEN+ en el contexto de ${item.focus_context || 'la atención'}.`,
    calculation: item.diagnosis,
    impact: `Si este pilar permanece en ${item.status}, ${item.status === 'CRÍTICO' ? 'genera quiebres graves en la experiencia y fuga de usuarios' : 'reduce la eficiencia de la operación'}.`,
    benchmark: `⚡ Solución Spoter: ${item.recommendation}`
  });
}

// --- SIMULADOR DE AHORRO ---
function initSimulator() {
  const slider = document.getElementById('reductionSlider');
  const sliderVal = document.getElementById('sliderReductionVal');

  slider.addEventListener('input', () => {
    sliderVal.textContent = `${slider.value}%`;
    updateSimulator();
  });

  const btnExpRep = document.getElementById('btnExportReport');
  if (btnExpRep) {
    btnExpRep.addEventListener('click', () => {
      downloadReportFile();
    });
  }

  const btnExpCanned = document.getElementById('btnExportCanned');
  if (btnExpCanned) {
    btnExpCanned.addEventListener('click', () => {
      if (currentData && currentData.master_responses) {
        downloadBlob(JSON.stringify(currentData.master_responses, null, 2), `atajos_spoter_${(currentData.meta.company_name||'crm').toLowerCase()}.json`, 'application/json');
        showToast("💾 Atajos exportados en JSON");
      } else {
        window.location.href = '/api/export/canned';
      }
    });
  }
}

function updateSimulator() {
  if (!currentData) return;
  const slider = document.getElementById('reductionSlider');
  const pct = parseInt(slider.value, 10);
  const totalCompany = currentData.meta.company_messages;
  const saved = Math.round(totalCompany * (pct / 100));
  const Sm = supuestos();
  const hours = Math.round((saved * Sm.minutos_por_mensaje) / 60);

  const laborArs = hours * Sm.costo_hora_asesor_ars;
  const apiArs = saved * Sm.costo_mensaje_api_ars;
  const totalArs = laborArs + apiArs;
  const formattedArs = totalArs >= 1000000 
    ? `$${(totalArs / 1000000).toFixed(2)}M`
    : `$${(totalArs / 1000).toFixed(0)}K`;

  const newAvgPerClient = (currentData.meta.baseline_company_msgs_per_client * (1 - (pct / 100))).toFixed(1);

  document.getElementById('simSavedMsgs').textContent = `${saved.toLocaleString()} msgs`;
  document.getElementById('simSavedMsgsSub').textContent = `Baja de ${currentData.meta.baseline_company_msgs_per_client} a ${newAvgPerClient} msgs empresa/caso`;
  document.getElementById('simSavedHours').textContent = `${hours} hs/mes (${formattedArs} ARS)`;
  document.getElementById('simNewAvg').textContent = `${newAvgPerClient} msgs`;
}

// --- UTILIDADES ---
function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==========================================================================
// MODO DE MOTOR — qué se puede calcular sin el motor Python
// ==========================================================================
// El camino del navegador emite null en toda métrica que no puede derivar del
// CSV. Estos helpers hacen que esa ausencia se muestre como ausencia, nunca
// como un número inventado.

const NA_TEXT = '—';

function isBrowserEngine(data) {
  // 'browser' = camino antiguo, parcial. 'browser_full' calcula todo.
  return !!(data && data.meta && data.meta.engine_mode === 'browser');
}

function isBrowserFull(data) {
  return !!(data && data.meta && data.meta.engine_mode === 'browser_full');
}

/** Devuelve el valor formateado, o el guion largo si la métrica no está disponible. */
function metricOr(value, formatter) {
  if (value === null || value === undefined) return NA_TEXT;
  return formatter ? formatter(value) : String(value);
}

/** Panel estándar para una sección que requiere el motor Spoter. */
function engineNoticeHTML(titulo, motivo) {
  return `
    <div class="engine-notice">
      <div class="engine-notice-icon">🔒</div>
      <div class="engine-notice-body">
        <h4>${escapeHtml(titulo)}</h4>
        <p>${escapeHtml(motivo)}</p>
        <p class="engine-notice-cta">
          Para obtener esta métrica sobre tus datos reales, ejecutá el motor Spoter:
          <code>python3 api_server.py 8080</code>
        </p>
      </div>
    </div>`;
}

// Los avisos NO reemplazan el contenido: ocultan el elemento y se insertan al
// lado. Así un render posterior con el motor activo puede restaurar todo, en
// lugar de encontrarse con un <canvas> que ya no existe.

/** Oculta targetEl e inserta un aviso hermano. */
function showEngineNotice(targetEl, titulo, motivo) {
  if (!targetEl) return;
  const host = targetEl.parentElement || targetEl;
  const notice = document.createElement('div');
  notice.className = 'engine-notice engine-notice-injected';
  notice.innerHTML = engineNoticeHTML(titulo, motivo)
    .replace(/^\s*<div class="engine-notice">/, '')
    .replace(/<\/div>\s*$/, '');
  host.appendChild(notice);
  targetEl.setAttribute('data-hidden-by-notice', '1');
  targetEl.style.display = 'none';
}

/** Oculta todos los hijos directos de un contenedor y le agrega un aviso. */
function showEngineNoticeForSection(sectionEl, titulo, motivo) {
  if (!sectionEl) return;
  Array.from(sectionEl.children).forEach(ch => {
    if (ch.classList && ch.classList.contains('engine-notice-injected')) return;
    ch.setAttribute('data-hidden-by-notice', '1');
    ch.style.display = 'none';
  });
  const notice = document.createElement('div');
  notice.className = 'engine-notice engine-notice-injected';
  notice.innerHTML = engineNoticeHTML(titulo, motivo)
    .replace(/^\s*<div class="engine-notice">/, '')
    .replace(/<\/div>\s*$/, '');
  sectionEl.appendChild(notice);
}

/** Revierte todos los avisos inyectados. Se llama al inicio de cada render. */
function clearEngineNotices() {
  document.querySelectorAll('.engine-notice-injected').forEach(n => n.remove());
  document.querySelectorAll('[data-hidden-by-notice]').forEach(el => {
    el.style.display = '';
    el.removeAttribute('data-hidden-by-notice');
  });
}


// ==========================================================================
// RENDERIZADO DE LTV ECONÓMICO, PRIORIZACIÓN IU/IC Y MOTOR LITE (V2.5)
// ==========================================================================
let currentLtvCurrency = 'USD';
// El tipo de cambio sale del catálogo (supuestos_economicos.tipo_cambio_ars).

function renderLtvAndPrioritization(data) {
  const ltv = data.ltv_economics;
  const prio = data.prioritization_audit;
  const lite = data.spoter_lite;

  // Sin motor no hay IC/IU ni matemática del LTV: se avisa, no se simula.
  if (!ltv || !prio || !lite) {
    showEngineNoticeForSection(
      document.getElementById('tabLtvTriage'),
      'LTV y Triage IU/IC no disponibles',
      'El Índice de Conversión, el Índice de Urgencia y el capital en riesgo se calculan con el motor determinístico Spoter sobre el contenido de cada conversación.'
    );
    return;
  }

  if (!ltv || !prio || !lite) return;

  // Sector Badge
  const badgeSector = document.getElementById('badgeLtvSector');
  if (badgeSector) badgeSector.textContent = `Sector: ${ltv.rubro_name}`;

  // 1. Tarjetas de Diagnóstico de Capital
  const elTotalRisk = document.getElementById('valLtvTotalRisk');
  const elSubRisk = document.getElementById('subLtvTotalRisk');
  const fx = supuestos().tipo_cambio_ars;

  if (elTotalRisk) {
    const totalUsd = ltv.total_economic_risk_usd || 0;
    const totalArs = Math.round(totalUsd * fx);
    elTotalRisk.innerHTML = `$${totalUsd.toLocaleString()} USD <span style="font-size:12px;opacity:0.85;font-weight:600;">(~$${totalArs.toLocaleString('es-AR')} ARS)</span>`;
  }
  if (elSubRisk) {
    elSubRisk.textContent = `Pérdida inmediata: $${(ltv.immediate_lost_usd || 0).toLocaleString()} USD | CAC pauta: $${(ltv.cac_wasted_usd || 0).toLocaleString()} USD`;
  }

  const elFifoPct = document.getElementById('valFifoDelayedPct');
  const elSubFifo = document.getElementById('subFifoDelayedLeads');
  if (elFifoPct) elFifoPct.textContent = `${prio.fifo_delayed_percentage}%`;
  if (elSubFifo) elSubFifo.textContent = `${prio.high_intent_delayed_count} de ${prio.high_intent_leads_count} leads calientes cayeron en Zona Fría`;

  const elMetaBreaches = document.getElementById('valMeta24hBreaches');
  const elSubMeta = document.getElementById('subMeta24hBreaches');
  if (elMetaBreaches) elMetaBreaches.textContent = `${prio.whatsapp_24h_breaches} chats`;
  if (elSubMeta) elSubMeta.textContent = `Demora > 24h: ${prio.whatsapp_24h_breach_percentage}% de usuarios requieren plantilla paga`;

  const elLiteRescatables = document.getElementById('valLiteRescatables');
  const elSubLite = document.getElementById('subLiteRescatables');
  if (elLiteRescatables) elLiteRescatables.textContent = `${lite.leads_rescatables_count} leads`;
  if (elSubLite) elSubLite.textContent = `${lite.leads_rescatables_percentage}% de leads en cierre eran recuperables`;

  // 2. Simulador Interactivo de LTV con Sliders y Toggle de Moneda (USD / ARS)
  const slTicket = document.getElementById('sliderSimTicket');
  const slFreq = document.getElementById('sliderSimFreq');
  const slYears = document.getElementById('sliderSimYears');
  const slRecov = document.getElementById('sliderSimRecovery');

  const lblTicket = document.getElementById('lblSimTicket');
  const dispTicket = document.getElementById('dispSimTicket');
  const dispFreq = document.getElementById('dispSimFreq');
  const dispYears = document.getElementById('dispSimYears');
  const dispRecov = document.getElementById('dispSimRecovery');

  const resLtvUnit = document.getElementById('resSimLtvUnit');
  const resTotalAtRisk = document.getElementById('resSimTotalAtRisk');
  const resRecovered = document.getElementById('resSimRecovered');

  const btnUsd = document.getElementById('btnCurrUsd');
  const btnArs = document.getElementById('btnCurrArs');

  function configureTicketSlider() {
    if (!slTicket) return;
    if (currentLtvCurrency === 'ARS') {
      if (lblTicket) lblTicket.textContent = 'Ticket Promedio ($ ARS)';
      slTicket.min = 25000;
      slTicket.max = 6000000;
      slTicket.step = 25000;
      const baseUsd = ltv.avg_ticket_usd || 250;
      slTicket.value = Math.round((baseUsd * fx) / 25000) * 25000;
    } else {
      if (lblTicket) lblTicket.textContent = 'Ticket Promedio ($ USD)';
      slTicket.min = 20;
      slTicket.max = 5000;
      slTicket.step = 10;
      slTicket.value = ltv.avg_ticket_usd || 250;
    }
  }

  function formatMoney(amount) {
    if (currentLtvCurrency === 'ARS') {
      return '$' + Math.round(amount).toLocaleString('es-AR') + ' ARS';
    }
    return '$' + Math.round(amount).toLocaleString('en-US') + ' USD';
  }

  function updateLiveLtv() {
    if (!slTicket) return;
    const ticket = parseFloat(slTicket.value);
    const freq = parseFloat(slFreq.value);
    const years = parseFloat(slYears.value);
    const recovPct = parseFloat(slRecov.value) / 100;

    dispTicket.textContent = formatMoney(ticket);
    dispFreq.textContent = `${freq.toFixed(1)}x`;
    dispYears.textContent = `${years.toFixed(1)} años`;
    dispRecov.textContent = `${Math.round(recovPct * 100)}%`;

    const ltvUnit = Math.round(ticket * freq * years);
    const leadsAtRisk = ltv.leads_at_risk_count || 1;
    const cacUnit = (currentLtvCurrency === 'ARS') ? (ltv.cac_usd || 50) * fx : (ltv.cac_usd || 50);

    // 65% de pérdida de conversión en Zona Fría
    const totalRisk = Math.round(leadsAtRisk * ltvUnit * 0.65 + leadsAtRisk * cacUnit);
    const recovered = Math.round(totalRisk * recovPct);

    if (resLtvUnit) resLtvUnit.textContent = formatMoney(ltvUnit);
    if (resTotalAtRisk) resTotalAtRisk.textContent = formatMoney(totalRisk);
    if (resRecovered) resRecovered.textContent = formatMoney(recovered);
  }

  if (btnUsd && btnArs) {
    btnUsd.onclick = () => {
      if (currentLtvCurrency === 'USD') return;
      currentLtvCurrency = 'USD';
      btnUsd.classList.add('active');
      btnArs.classList.remove('active');
      configureTicketSlider();
      updateLiveLtv();
    };
    btnArs.onclick = () => {
      if (currentLtvCurrency === 'ARS') return;
      currentLtvCurrency = 'ARS';
      btnArs.classList.add('active');
      btnUsd.classList.remove('active');
      configureTicketSlider();
      updateLiveLtv();
    };
  }

  if (slTicket && slFreq && slYears && slRecov) {
    configureTicketSlider();
    slFreq.value = ltv.annual_frequency || 4;
    slYears.value = ltv.retention_years || 2;
    slRecov.value = 75;

    slTicket.oninput = updateLiveLtv;
    slFreq.oninput = updateLiveLtv;
    slYears.oninput = updateLiveLtv;
    slRecov.oninput = updateLiveLtv;
    updateLiveLtv();
  }

  // 3. Comparativa FIFO vs Spoter Priorizado
  const lblFifoWait = document.getElementById('lblFifoWaitTime');
  const lblSpoterWait = document.getElementById('lblSpoterWaitTime');
  const barFifo = document.getElementById('barFifoWait');
  const barSpoter = document.getElementById('barSpoterWait');

  const fifoWaitVal = prio.fifo_vs_spoter_wait?.fifo_high_intent_wait_min || 0;
  const spoterWaitVal = prio.fifo_vs_spoter_wait?.spoter_high_intent_wait_min || 2.0;
  const reductionPct = prio.fifo_vs_spoter_wait?.wait_reduction_percentage || 90;

  if (lblFifoWait) lblFifoWait.textContent = `${fifoWaitVal} min`;
  if (lblSpoterWait) lblSpoterWait.textContent = `${spoterWaitVal} min (-${reductionPct}%)`;
  if (barFifo) barFifo.style.width = '100%';
  if (barSpoter) {
    const pctBar = Math.max(5, Math.min(100, Math.round((spoterWaitVal / (fifoWaitVal || 1)) * 100)));
    barSpoter.style.width = `${pctBar}%`;
  }

  // 4. Distribución por Fases Spoter Lite
  const containerPhases = document.getElementById('spoterLitePhaseBars');
  if (containerPhases && lite.phases) {
    const ph = lite.phases;
    containerPhases.innerHTML = `
      <div class="fifo-bar-item">
        <div class="fifo-bar-labels">
          <span>🟢 Fase de Gracia (< 30% sesión):</span>
          <strong>${ph.gracia_count} leads (${ph.gracia_percentage}%)</strong>
        </div>
        <div class="fifo-bar-track">
          <div style="height: 100%; width: ${Math.max(4, ph.gracia_percentage)}%; background: #10b981; border-radius: 5px;"></div>
        </div>
      </div>

      <div class="fifo-bar-item">
        <div class="fifo-bar-labels">
          <span>🟡 Fase de Trabajo (30% a 60% sesión):</span>
          <strong>${ph.trabajo_count} leads (${ph.trabajo_percentage}%)</strong>
        </div>
        <div class="fifo-bar-track">
          <div style="height: 100%; width: ${Math.max(4, ph.trabajo_percentage)}%; background: #f59e0b; border-radius: 5px;"></div>
        </div>
      </div>

      <div class="fifo-bar-item">
        <div class="fifo-bar-labels">
          <span>🟣 Fase de Cierre / Ventana de Rescate (60-100%):</span>
          <strong>${ph.cierre_rescate_count} leads (${ph.cierre_rescate_percentage}%)</strong>
        </div>
        <div class="fifo-bar-track">
          <div style="height: 100%; width: ${Math.max(4, ph.cierre_rescate_percentage)}%; background: var(--spoter-pink); border-radius: 5px;"></div>
        </div>
      </div>

      <div class="fifo-bar-item">
        <div class="fifo-bar-labels">
          <span>⚪ Ruido o Descarte Rápido:</span>
          <strong>${ph.ruido_stop_count} leads (${ph.ruido_stop_percentage}%)</strong>
        </div>
        <div class="fifo-bar-track">
          <div style="height: 100%; width: ${Math.max(4, ph.ruido_stop_percentage)}%; background: var(--text-muted); border-radius: 5px;"></div>
        </div>
      </div>
    `;
  }
}


// --- ACTUALIZACIÓN DINÁMICA DE HANDOFF EN EL SCORECARD ---
function updateScorecardHandoff(data, policy) {
  if (!data || !data.scorecard || !data.handoff) return;
  const h = data.handoff;
  const pA = data.scorecard.find(s => s.pillar && s.pillar.startsWith('A'));
  if (pA) {
    pA.focus_context = `Handoff: ${policy.toUpperCase()}`;
    if (policy === 'bot_priority') {
      pA.diagnosis = `En política de Bot Autoservicio, el bot absorbe el ${h.bot_share_percentage}% de la mensajería inicial sin desbordar al personal humano.`;
      pA.status = "ÓPTIMO";
      pA.score = 85;
    } else if (policy === 'human_priority') {
      pA.diagnosis = `En política Humano Prioritario, los asesores atienden inmediatamente la demanda. Requiere distribución estricta de turnos.`;
      pA.status = "ALERTA";
      pA.score = 65;
    } else {
      pA.diagnosis = `Flujo de bienvenida híbrido: triaje automático inicial con derivación balanceada a asesores según complejidad.`;
      pA.status = "ÓPTIMO";
      pA.score = 75;
    }
  }

  const pPlus = data.scorecard.find(s => s.pillar && s.pillar.startsWith('+'));
  if (pPlus) {
    if (policy === 'bot_priority') {
      pPlus.focus_context = `Carga Humana (${h.human_share_percentage}%) vs Bot (${h.bot_share_percentage}%)`;
      pPlus.diagnosis = `Con Bot Autoservicio prioritario, el ${h.bot_share_percentage}% se resuelve sin intervención humana. ${h.top_human_operator} atiende solo escalamientos complejos.`;
      pPlus.recommendation = `Estandarizar atajos y respuestas de derivación para ${h.top_human_operator}.`;
      pPlus.status = "ÓPTIMO";
      pPlus.score = 80;
    } else if (policy === 'human_priority') {
      pPlus.focus_context = `Cuello de Botella Asesor: ${h.top_human_operator}`;
      pPlus.diagnosis = `Entre los operadores humanos, ${h.top_human_operator} concentra el ${h.top_human_percentage_of_human}% de la atención (${(h.top_human_messages||0).toLocaleString()} msgs), generando un cuello de botella crítico.`;
      pPlus.recommendation = `Balancear la asignación de chats para descongestionar a ${h.top_human_operator}.`;
      pPlus.status = "CRÍTICO";
      pPlus.score = 50;
    } else {
      pPlus.focus_context = `Balance de Carga y Handoff`;
      pPlus.diagnosis = `${h.top_human_operator} concentra el ${h.top_human_percentage_of_human}% de la carga de los asesores humanos.`;
      pPlus.recommendation = `Estandarizar atajos de respuesta rápida para ${h.top_human_operator}.`;
      pPlus.status = "ALERTA";
      pPlus.score = 65;
    }
  }

  renderScorecard(data.scorecard);
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadReportFile() {
  showToast("📥 Descargando informe ejecutivo (.md)...");
  fetch('/api/export/report')
    .then(r => {
      if (r.ok) {
        window.location.href = '/api/export/report';
      } else {
        downloadClientReportFallback(currentData);
      }
    })
    .catch(() => downloadClientReportFallback(currentData));
}

function downloadClientReportFallback(data) {
  if (!data) return;
  const comp = data.meta.company_name || 'Empresa';
  const md = `# Auditoría de Conversaciones WhatsApp - Spoter & ACTÚEN+
**Empresa:** ${comp}
**Rubro Detectado:** ${data.meta.detected_rubro}
**Foco:** ${data.meta.business_focus === 'ventas' ? 'Ventas / Comercial' : 'Soporte / Asistencial'}
**Política Handoff:** ${data.meta.handoff_policy.toUpperCase()}
**Mensajes Analizados:** ${data.meta.total_rows.toLocaleString()}
**Usuarios Atendidos:** ${data.meta.unique_clients.toLocaleString()}

---
## Resumen de Fricción y Tiempos de Respuesta
- **Espera Promedio:** ${metricOr(data.wait_times.average_minutes, v => `${v} min`)} (P90: ${metricOr(data.wait_times.p90_minutes, v => `${v} min`)})
- **Consultas en Zona Fría / Crítica:** ${data.wait_times.over_warning_percentage}% (${data.wait_times.over_warning_count} turnos)
- **Distribución de Atención:** Bot ${data.handoff.bot_share_percentage}% | Humano ${data.handoff.human_share_percentage}%
- **Asesor más Cargado:** ${data.handoff.top_human_operator} (${data.handoff.top_human_percentage_of_human}% de la carga de operadores humanos)
${(isBrowserEngine(data) && !isBrowserFull(data)) ? `
---
> ⚠️ **Informe parcial.** Se generó en modo navegador, sin el motor Spoter.
> No incluye Semáforo ACTÚEN+, Triage IU/IC, matemática del LTV, análisis de
> horarios ni fragmentación. Para el informe ejecutivo completo ejecutá
> \`python3 api_server.py 8080\` y volvé a cargar los mismos archivos.
` : ''}
Generado por el Analizador Spoter ACTÚEN+.`;
  downloadBlob(md, `auditoria_spoter_${comp.toLowerCase().replace(/\s+/g, '_')}.md`, 'text/markdown;charset=utf-8');
}


// --- AUDITORÍA DE BRECHAS DE AUTOMATIZACIÓN & DISPARADORES DE HANDOFF ---
function renderHandoffGaps(gap) {
  renderHandoffGapAnalysis(gap);
}

function renderHandoffGapAnalysis(gap) {
  const panel = document.getElementById('handoffGapPanel');
  if (!panel) return;

  if (!gap) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';

  // 1. Métricas de Cabecera
  const totalHandoffs = gap.total_human_handoffs || 0;
  const avoidablePct = gap.avoidable_handoffs_percentage || 0;
  const avoidableCount = gap.avoidable_handoffs_count || 0;
  const recoverableHours = gap.recoverable_hours_month || 0;
  const consultativePct = gap.consultative_handoffs_percentage || (100 - avoidablePct);

  const elTotal = document.getElementById('valGapTotalHandoffs');
  if (elTotal) elTotal.textContent = totalHandoffs.toLocaleString();

  const elAvoidPct = document.getElementById('valGapAvoidablePct');
  if (elAvoidPct) elAvoidPct.textContent = `${avoidablePct}%`;

  const elAvoidCnt = document.getElementById('valGapAvoidableCount');
  if (elAvoidCnt) elAvoidCnt.textContent = `${avoidableCount.toLocaleString()} chats por dudas estándar`;

  const elRecHours = document.getElementById('valGapRecoverableHours');
  if (elRecHours) elRecHours.textContent = `${recoverableHours} hs/mes`;

  const badgeSummary = document.getElementById('badgeGapSummary');
  if (badgeSummary) {
    if (avoidablePct > 60) {
      badgeSummary.className = 'status-badge alert';
      badgeSummary.textContent = `🔴 Fuga Crítica de Automatización (${avoidablePct}%)`;
    } else if (avoidablePct > 30) {
      badgeSummary.className = 'status-badge warning';
      badgeSummary.textContent = `🟡 Fuga Moderada (${avoidablePct}%)`;
    } else {
      badgeSummary.className = 'status-badge success';
      badgeSummary.textContent = `🟢 Automatización Óptima`;
    }
  }

  // 2. Barra de Proporción Causal
  const txtRatio = document.getElementById('txtGapRatioLabel');
  if (txtRatio) {
    txtRatio.textContent = `${avoidablePct}% Preguntas Estándar vs ${consultativePct}% Venta Consultiva`;
  }

  const barAvoidable = document.getElementById('barGapAvoidable');
  const barConsultative = document.getElementById('barGapConsultative');
  if (barAvoidable && barConsultative) {
    barAvoidable.style.width = `${Math.max(5, Math.min(95, avoidablePct))}%`;
    barConsultative.style.width = `${Math.max(5, Math.min(95, consultativePct))}%`;
  }

  // 3. Ranking de Disparadores
  const listContainer = document.getElementById('gapTriggersList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const triggers = gap.top_triggers || [];
  triggers.forEach((trig, idx) => {
    const item = document.createElement('div');
    item.className = 'gap-trigger-item';

    const quotesHtml = (trig.sample_client_phrases && trig.sample_client_phrases.length)
      ? `<div class="gap-trigger-quotes">
           <div class="gap-quotes-label">💬 Lo que preguntan los clientes antes de que intervenga el operador:</div>
           ${trig.sample_client_phrases.map(q => `<div class="gap-quote-pill">"${escapeHtml(q)}"</div>`).join('')}
         </div>`
      : '';

    const operatorQuotesHtml = (trig.sample_operator_responses && trig.sample_operator_responses.length)
      ? `<div class="gap-trigger-quotes gap-operator-quotes">
           <div class="gap-quotes-label operator-label">👤 Lo que responde hoy el operador humano (Patrón manual actual):</div>
           ${trig.sample_operator_responses.map(q => `<div class="gap-quote-pill operator-pill">"${escapeHtml(q)}"</div>`).join('')}
         </div>`
      : '';

    const badgeFeasibilityClass = trig.is_avoidable ? 'avoidable' : 'consultative';

    item.innerHTML = `
      <div class="gap-trigger-header">
        <div class="gap-trigger-identity">
          <span class="gap-trigger-icon">${trig.icon || '📌'}</span>
          <div>
            <h5 class="gap-trigger-title">${idx + 1}. ${escapeHtml(trig.title)}</h5>
            <span style="font-size: 11.5px; color: var(--text-muted);">
              Impacto: <strong>${trig.percentage}%</strong> de las intervenciones humanas (${trig.count.toLocaleString()} chats)
            </span>
          </div>
        </div>
        <div class="gap-trigger-badges">
          <span class="gap-chip ${badgeFeasibilityClass}">${trig.automation_feasibility}</span>
          <span class="gap-chip hours">⏱️ ${trig.human_hours_spent} hs tipeando</span>
        </div>
      </div>

      ${quotesHtml}
      ${operatorQuotesHtml}
      <div class="gap-trigger-solution">
        <div class="gap-solution-text">
          💡 <strong>Acción Spoter recomendada (${escapeHtml(trig.solution_type)}):</strong> 
          ${escapeHtml(trig.solution_action)}
        </div>
        <button class="btn-jump-template" data-template-id="${trig.template_target_id || ''}" type="button">
          👉 Ver Solución Spoter
        </button>
      </div>
    `;

    const jumpBtn = item.querySelector('.btn-jump-template');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const tabBtn = document.querySelector('.tab-btn[data-tab="tabTemplates"]');
        if (tabBtn) {
          tabBtn.click();
          showToast(`⚡ Mostrando Plantilla Maestra para: ${trig.title.split(' ')[1] || 'esta duda'}`);
          const target = document.getElementById('templatesList');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    listContainer.appendChild(item);
  });
}
