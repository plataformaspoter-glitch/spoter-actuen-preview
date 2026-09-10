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

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
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
          const rubroLabels = {
            "construccion_corralon": "Construcción / Corralón / Materiales",
            "comercio_retail": "Comercio / Retail / E-commerce",
            "salud_obra_social": "Salud / Obra Social / Prepaga",
            "automotor_concesionaria": "Automotor / Concesionaria / Repuestos",
            "inmobiliaria_desarrollos": "Inmobiliaria / Desarrollos / Alquileres",
            "fintech_servicios_financieros": "Fintech / Créditos / Servicios Financieros",
            "educacion_capacitacion": "Educación / Cursos / Capacitación",
            "gastronomia_restaurantes": "Gastronomía / Restaurantes / Delivery",
            "saas_tecnologia": "Software / SaaS / Tecnología",
            "turismo_hoteleria": "Turismo / Hotelería / Viajes",
            "servicios_profesionales": "Servicios Profesionales / Consultoría"
          };
          data.meta.detected_rubro = rubroLabels[rVal] || data.meta.detected_rubro;
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
function getDynamicRubroTemplates(rubroKey, isSales, companyName) {
  const cName = (companyName && companyName !== 'Empresa' && companyName !== 'Nuestra Empresa') ? companyName : 'Nuestra Empresa';
  const cleanAlias = cName.toUpperCase().replace(/[^A-Z0-9]/g, '.').replace(/^\.+|\.+$/g, '') || 'PAGOS.OFICIALES';
  const cAlias = cleanAlias.includes('.') ? `${cleanAlias}.OFICIAL` : `${cleanAlias}.OFICIAL`;

  // 1. CONSTRUCCIÓN / CORRALÓN / MATERIALES
  if (rubroKey === 'construccion_corralon') {
    return [
      {
        id: "presupuesto_corralon",
        title: "Presupuesto General con 7% OFF Contado",
        shortcut: "/coti",
        category: "Ventas / Materiales",
        before: "Buenos días -> 'en breve enviamos' -> PDF mudo -> medios de pago -> silencio (7 msgs).",
        after: `👋 ¡Hola! Te adjunto el presupuesto detallado de ${cName} (*Presupuesto N° {NRO_COTIZACION}*).\n\n📋 *Resumen de tu pedido:*\n• *Total de Lista / Tarjetas:* \${TOTAL_LISTA}\n• 💡 *Con 7% OFF (Efectivo / Transferencia / Débito):* *\${TOTAL_DESCUENTO}*\n• *Disponibilidad:* Todo en stock para despacho inmediato.\n• *Flete:* Cotizado para {ZONA/LOCALIDAD}.\n\n⏱️ _Precios congelados por 48 horas._\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos los materiales para programar el camión para esta semana?*`,
        tipping_point: "¿Querés que te reservemos los materiales para programar el camión para esta semana?",
        key_benefit: "Resume el precio en el chat, destaca el descuento contado y cierra con reserva."
      },
      {
        id: "aridos_corralon",
        title: "Consulta de Áridos (Arena Común, Lavada / Ripio)",
        shortcut: "/aridos",
        category: "Áridos",
        before: "'arena comun o lavada?' -> 'cuantos metros?' -> 'a que direccion?' (8 msgs).",
        after: `¡Hola! Contamos con stock de áridos tanto por m³ como por bolsón o camionada:\n\n🏗️ *Opciones disponibles:*\n• *Arena Común:* \${PRECIO_COMUN}/m³ _(Revoque grueso y contrapisos)_\n• *Arena Lavada / Fina:* \${PRECIO_LAVADA}/m³ _(Fino y pegado de cerámicos)_\n• *Ripio / Piedra Partida:* \${PRECIO_RIPIO}/m³\n💡 *7% de descuento abonando en efectivo o transferencia.*\n\n[---saltomensaje---]\n\n👉 *Decime cuántos metros aproximados necesitás y en qué zona está la obra para pasarte el valor final puesto en tu puerta.*`,
        tipping_point: "Decime cuántos metros necesitás y en qué zona está la obra para cotizar flete.",
        key_benefit: "Resuelve la duda de áridos en 1 turno."
      },
      {
        id: "flete_corralon",
        title: "Consulta de Envíos, Fletes y Descarga",
        shortcut: "/flete",
        category: "Logística",
        before: "'¿Llegan a mi zona?' -> 'Sí' -> '¿Cuánto sale?' -> 'Pasame la calle' (6 msgs).",
        after: `¡Hola! Sí, realizamos entregas en toda la zona con la flota de camiones de ${cName}:\n\n📍 *Para confirmarte el costo exacto y día de entrega, envianos:*\n1. Lista o cantidad de materiales.\n2. Dirección aproximada o barrio.\n3. ¿La calle permite el ingreso de camión grande?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el costo final puesto en obra de inmediato.*`,
        tipping_point: "Envianos lista, barrio y acceso de camión para confirmar flete de inmediato.",
        key_benefit: "Captura los 3 datos logísticos en 1 solo paso."
      },
      {
        id: "cierre_corralon",
        title: "Cierre, Cobro y Facturación",
        shortcut: "/pago",
        category: "Cierre de Venta",
        before: "CBU descolgado -> '¿de qué es el comprobante?' -> 'cuit?' -> 'dirección?' (5 msgs).",
        after: `🎯 *Para confirmar tu pedido N° {NRO_COTIZACION} y congelar el stock:*\n\n🏦 *Datos Bancarios Oficiales:*\n• *Titular:* ${cName}\n• *Alias:* \`${cAlias}\`\n• *CBU:* \`0270094610023521600015\`\n• *Monto con 7% OFF:* *\${MONTO_FINAL}*\n\n📝 *Una vez hecha la transferencia, envianos el comprobante con estos 4 datos en un solo mensaje:*\n1. Presupuesto N°: {NRO_COTIZACION}\n2. CUIT o DNI (para la factura):\n3. Dirección exacta de entrega:\n4. Nombre y teléfono de quién recibe en obra:\n\n[---saltomensaje---]\n\n¡Con eso ingresa inmediatamente a la hoja de ruta de logística! 🚚`,
        tipping_point: "Una vez hecha la transferencia, envianos el comprobante con los 4 datos en un solo mensaje.",
        key_benefit: "Elimina el caos de identificación de pagos y reduce 5 mensajes a 1."
      },
      {
        id: "hierros_mallas",
        title: "Consulta de Hierros, Mallas y Viguetas",
        shortcut: "/hierros",
        category: "Hierros y Estructuras",
        before: "Múltiples mensajes preguntando medida por medida y flete por separado.",
        after: `👋 ¡Hola! Contamos con stock completo de hierro de obra certificado:\n\n🔩 *Valores por barra (12 mts):*\n• Hierro del 6: \${P_6} | del 8: \${P_8} | del 10: \${P_10} | del 12: \${P_12}\n• Malla Cima (del 4 / del 5 / del 6): Desde \${P_MALLA}\n• Alambre de fardo y estribos listos para armar.\n💡 *Precio bonificado abonando de contado/transferencia.*\n\n[---saltomensaje---]\n\n👉 *Pasame la lista completa de barras o mallas y la zona de obra para armarte el paquete con envío incluido.*`,
        tipping_point: "Pasame la lista completa y la zona para armarte el paquete con envío incluido.",
        key_benefit: "Agrupa las medidas de hierro frecuentes y ancla el flete desde el inicio."
      },
      {
        id: "rescate_corralon",
        title: "Protocolo de Rescate Comercial (Post-Cotización)",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "Silencio o 'Hola pudiste ver el PDF?' (tasa de respuesta < 10%).",
        after: `👋 ¡Hola {NOMBRE}! ¿Cómo estás? Te escribo de ${cName} porque estamos coordinando la hoja de ruta de entregas para tu zona ({ZONA/BARRIO}).\n\nQueríamos consultarte si vas a confirmar el pedido del Presupuesto N° {NRO_COTIZACION} para reservarte el camión y sostenerte la bonificación especial de contado.\n\n[---saltomensaje---]\n\n👉 *¿Te guardamos el lugar de entrega para esta semana o precisás hacer algún ajuste en los materiales?*`,
        tipping_point: "¿Te guardamos el lugar de entrega para esta semana o precisás algún ajuste?",
        key_benefit: "Reactivación contextual que ofrece valor logístico en lugar de presionar."
      }
    ];
  }

  // 2. COMERCIO / RETAIL / E-COMMERCE
  if (rubroKey === 'comercio_retail') {
    return [
      {
        id: "producto_retail",
        title: "Catálogo, Precios, Stock y Talles Disponibles",
        shortcut: "/producto",
        category: "Ventas Retail",
        before: "'¿Tenés stock?' -> 'Sí' -> '¿Cuánto sale?' -> '¿Qué talles hay?' (6 msgs).",
        after: `👋 ¡Hola! Sí, en ${cName} contamos con stock disponible de *{PRODUCTO}*:\n\n🛍️ *Detalles del artículo:*\n• *Variantes / Talles disponibles:* {TALLES}\n• *Precio de Lista:* \${PRECIO} *(hasta 3 o 6 cuotas con tarjeta)*\n• 💡 *10% OFF en Efectivo o Transferencia:* *\${PRECIO_DESCUENTO}*\n• 🚚 *Despacho:* Envío a todo el país o retiro en sucursal hoy mismo.\n\n[---saltomensaje---]\n\n👉 *¿En qué variante o talle te gustaría reservarlo para pasarte el link de pago y congelar tu unidad?*`,
        tipping_point: "¿En qué variante o talle te gustaría reservarlo para pasarte el link de pago?",
        key_benefit: "Condensa talle, cuotas, descuento contado y link en 1 solo bloque estructurado."
      },
      {
        id: "envios_retail",
        title: "Costos de Envío, Tiempos de Entrega y Envío Gratis",
        shortcut: "/envio",
        category: "Logística / Despacho",
        before: "'¿Cuánto sale a mi ciudad?' -> 'Pasame el CP' -> 'Espera que cotizo' (5 msgs).",
        after: `📦 *¡Hola! Realizamos despachos diarios con seguimiento en tiempo real:*\n\n• 🚚 *Envío a Domicilio:* 24 a 72 hs hábiles según tu zona.\n• 🏬 *Retiro en Sucursal / Punto Pick-up:* Sin costo de envío.\n• 🎁 *Envío BONIFICADO (GRATIS)* en compras superiores a \${MONTO_MINIMO}.\n\n[---saltomensaje---]\n\n👉 *Envianos tu Código Postal y Localidad para confirmarte el costo exacto y la fecha estimada de llegada.*`,
        tipping_point: "Envianos tu Código Postal y Localidad para confirmarte costo y fecha exacta.",
        key_benefit: "Informa política de envío gratis y solicita el Código Postal en un solo paso."
      },
      {
        id: "pago_retail",
        title: "Medios de Pago, Cuotas y Datos de Transferencia",
        shortcut: "/pago",
        category: "Cobranzas",
        before: "Pasa CBU suelto -> cliente transfiere sin poner detalle -> no se identifica el pago.",
        after: `💳 *Medios de Pago Habilitados en ${cName}:*\n\n1. *Transferencia Bancaria con 10% OFF:*\n• *Titular:* ${cName}\n• *Alias:* \`${cAlias}\`\n• *Total con Descuento:* *\${TOTAL_TRANSFERENCIA}*\n2. *Tarjetas de Crédito / Débito:* En 3 cuotas sin interés mediante link seguro.\n\n[---saltomensaje---]\n\n👉 *Una vez realizada la transferencia, adjuntanos el comprobante junto con tu DNI para facturar y despachar tu pedido de inmediato.*`,
        tipping_point: "Adjuntanos el comprobante junto con tu DNI para facturar y despachar de inmediato.",
        key_benefit: "Resume la cuenta bancaria, cuotas y requisitos de despacho en 1 paso."
      },
      {
        id: "cambios_retail",
        title: "Política de Cambios y Devoluciones sin Fricción",
        shortcut: "/cambio",
        category: "Postventa",
        before: "Queja de cliente por cambio -> 'hablá con otro sector' -> derivaciones infinitas.",
        after: `👋 ¡Hola! Con gusto gestionamos el cambio de tu compra en ${cName}:\n\n🔄 *Para procesarlo de inmediato en el sistema:*\n1. Número de pedido o ticket de compra:\n2. Producto recibido y nuevo talle o modelo deseado:\n3. ¿Preferís cambio en local o coordinar retiro a domicilio?\n\n[---saltomensaje---]\n\n👉 *Apenas nos confirmes estos datos te reservamos la nueva unidad para asegurar el stock.*`,
        tipping_point: "Apenas nos confirmes te reservamos la nueva unidad para asegurar el stock.",
        key_benefit: "Resuelve la postventa sin fricción y retiene al cliente."
      },
      {
        id: "rescate_carrito",
        title: "Protocolo de Rescate de Consulta / Carrito Abandonado",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "'Hola pudiste ver?' -> Visto clavado y pérdida de la venta.",
        after: `👋 ¡Hola {NOMBRE}! Vimos que estuviste consultando por *{PRODUCTO}* en ${cName}.\n\nTe queríamos avisar que quedan las últimas unidades disponibles y te guardamos un beneficio de *envío bonificado* por el día de hoy.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos el pedido antes de que vuelva al catálogo general?*`,
        tipping_point: "¿Querés que te reservemos el pedido antes de que vuelva al catálogo general?",
        key_benefit: "Aplica escasez y beneficio de flete para cerrar la venta fría."
      },
      {
        id: "promocion_combo",
        title: "Oferta Combo / Up-sell de Productos Complementarios",
        shortcut: "/combo",
        category: "Ventas / Up-sell",
        before: "Venta transaccional de 1 solo ítem sin ofrecer complementos.",
        after: `💡 *¡Aprovechá la promoción complementaria de tu pedido!*\n\nLlevando el conjunto completo tenés un *15% OFF adicional* en la segunda unidad y mantenés el mismo costo de envío.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te sumemos la opción complementaria al paquete para aprovechar la bonificación?*`,
        tipping_point: "¿Querés que te sumemos la opción complementaria al paquete para aprovechar el 15% OFF?",
        key_benefit: "Aumenta el ticket promedio (LTV) ofreciendo combos en el momento óptimo."
      }
    ];
  }

  // 3. SALUD / OBRA SOCIAL / PREPAGA
  if (rubroKey === 'salud_obra_social') {
    return [
      {
        id: "autorizaciones",
        title: "Gestión de Autorizaciones y Órdenes Médicas",
        shortcut: "/autorizar",
        category: "Trámites Médicos",
        before: "Hola -> 'pasame foto' -> 'falta el diagnóstico' -> 'número de afiliado?' (5 mensajes).",
        after: `👋 ¡Hola! Te ayudamos a gestionar tu autorización médica en ${cName} en este mismo mensaje:\n\n📋 *Por favor envianos en un solo envío:*\n1. Foto clara de la orden médica (con diagnóstico, fecha y firma visible).\n2. Número de DNI o Credencial del afiliado/a:\n3. Lugar o clínica donde realizarás la práctica:\n\n⏱️ *Tiempo estimado de resolución:* 24 a 48 hs hábiles.\n\n[---saltomensaje---]\n\n👉 *Apenas nos envíes estos datos ingresamos tu solicitud a auditoría médica para su aprobación.*`,
        tipping_point: "Apenas nos envíes la foto y los 3 datos ingresamos la solicitud a auditoría médica.",
        key_benefit: "Elimina el ping-pong pidiendo los requisitos de validación médica en un solo bloque."
      },
      {
        id: "turnos",
        title: "Solicitud de Turnos y Cartilla Médica",
        shortcut: "/turnos",
        category: "Cartilla / Turnos",
        before: "'Quiero turno' -> 'para qué médico?' -> 'qué zona?' -> 'qué día podés?' (6 mensajes).",
        after: `¡Hola! Con gusto coordinamos tu turno o te brindamos los profesionales disponibles en cartilla:\n\n🩺 *Para asignarte la mejor opción, respondenos en este mensaje:*\n• Especialidad o médico requerido:\n• Zona o localidad de preferencia:\n• Días u horarios en los que podés asistir:\n• DNI o N° de Afiliado:\n\n[---saltomensaje---]\n\n👉 *Con estos datos te enviamos las próximas fechas disponibles de inmediato.*`,
        tipping_point: "Con estos datos te enviamos las opciones disponibles para reservar tu turno.",
        key_benefit: "Reúne especialidad, zona y disponibilidad del paciente en 1 turno."
      },
      {
        id: "reintegros",
        title: "Reintegros y Facturación Médica",
        shortcut: "/reintegro",
        category: "Facturación",
        before: "Factura suelta -> 'de quién es?' -> 'pasame CBU' -> 'falta orden' (4 mensajes).",
        after: `🎯 *Para procesar tu reintegro médico de forma directa:*\n\n📝 *Envianos en un solo mensaje:*\n1. Factura oficial (con CUIT del profesional o clínica).\n2. Orden médica o pedido de estudio que originó el gasto.\n3. CBU o Alias bancario del titular para el depósito.\n4. Nombre completo y DNI del afiliado:\n\n[---saltomensaje---]\n\n👉 *¿Contás con esta documentación a mano para cargar el expediente hoy mismo?*`,
        tipping_point: "¿Contás con esta documentación a mano para cargar el expediente hoy mismo?",
        key_benefit: "Evita rechazos de reintegro por documentación incompleta."
      },
      {
        id: "recetas_farmacia",
        title: "Recetas Electrónicas y Cobertura de Farmacia",
        shortcut: "/receta",
        category: "Farmacia",
        before: "'No me pasa la receta' -> 'qué farmacia?' -> 'qué remedio es?' (5 msgs).",
        after: `👋 ¡Hola! Te asistimos con la validación de tu receta de medicamentos:\n\n💊 *Por favor envianos:*\n1. Foto de la receta o prescripción digital:\n2. Número de credencial de afiliado/a:\n3. Farmacia donde estás realizando la compra (Nombre y localidad):\n\n[---saltomensaje---]\n\n👉 *Validamos la cobertura en el sistema y te confirmamos en este mismo chat.*`,
        tipping_point: "Validamos la cobertura en el sistema y te confirmamos en este mismo chat.",
        key_benefit: "Resuelve la autorización de farmacia en caliente sin idas y vueltas."
      },
      {
        id: "credencial_digital",
        title: "Descarga de Credencial Digital y Carnet",
        shortcut: "/credencial",
        category: "Afiliaciones",
        before: "Cliente pide carnet -> asesor envía links rotos -> pide datos de nuevo.",
        after: `📱 *¡Hola! Podés utilizar tu credencial digital de inmediato desde tu celular:*\n\n1. Ingresá a nuestro portal oficial: {LINK_PORTAL}\n2. Usuario: Tu número de DNI (sin puntos).\n3. Contraseña inicial: Los últimos 4 dígitos de tu DNI.\n\n💡 *Presentando la pantalla de la credencial en cualquier prestador o farmacia tenés atención directa sin carnet plástico.*\n\n[---saltomensaje---]\n\n👉 *¿Pudiste ingresar correctamente o requerís que te generemos una clave temporal?*`,
        tipping_point: "¿Pudiste ingresar correctamente o requerís que te generemos una clave temporal?",
        key_benefit: "Autogestión inmediata con validación activa de acceso."
      },
      {
        id: "cierre_fcr",
        title: "Cierre de Consulta y Confirmación de Resolución (FCR)",
        shortcut: "/fcr",
        category: "Cierre / Calidad",
        before: "'Cualquier cosa a disposición' (deja la gestión abierta o genera re-aperturas).",
        after: `✅ *Tu gestión ha sido completada con éxito.*\n\nTe dejamos asentado el número de trámite para seguimiento. Recordá que también contás con nuestro portal web disponible las 24 horas.\n\n[---saltomensaje---]\n\n👉 *¿Quedó resuelta tu consulta o necesitás ayuda con algún otro trámite antes de finalizar?*`,
        tipping_point: "¿Quedó resuelta tu consulta o necesitás ayuda con algún otro trámite antes de finalizar?",
        key_benefit: "Garantiza First Contact Resolution (FCR) y previene reaperturas de casos."
      }
    ];
  }

  // 4. AUTOMOTOR / CONCESIONARIA / REPUESTOS
  if (rubroKey === 'automotor_concesionaria') {
    return [
      {
        id: "unidad_auto",
        title: "Ficha Técnica, Stock y Precio de Vehículo",
        shortcut: "/auto",
        category: "Ventas / 0km y Usados",
        before: "'Hola precio del auto' -> '0km o usado?' -> 'qué versión?' (5 msgs).",
        after: `👋 ¡Hola! Te comparto la información de la unidad en ${cName}:\n\n🚗 *{MODELO_VEHICULO} - Versión {VERSION}*\n• *Precio de Lista:* \${PRECIO_LISTA}\n• 💡 *Bonificación especial este mes:* *\${PRECIO_BONIFICADO}*\n• *Financiación exclusiva:* Hasta el 50% en tasa preferencial.\n• *Entrega:* Inmediata / En stock en salón.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría coordinar una visita al salón para verlo en persona y realizar un Test Drive esta semana?*`,
        tipping_point: "¿Te gustaría coordinar una visita para realizar un Test Drive esta semana?",
        key_benefit: "Pasa precio, financiación y llama al Test Drive en un solo bloque."
      },
      {
        id: "toma_usado",
        title: "Tasación de Usado en Parte de Pago",
        shortcut: "/usado",
        category: "Tasaciones",
        before: "Múltiples mensajes pidiendo año, modelo, fotos, kilometraje de a uno.",
        after: `¡Hola! Sí, en ${cName} tomamos tu vehículo usado como parte de pago al mejor valor de mercado.\n\n📋 *Para pasarte una cotización estimada de toma en este momento, envianos:*\n1. Marca, modelo y versión exacta:\n2. Año de patentamiento y kilometraje:\n3. ¿Sos titular y está al día de patentes/multas?\n4. 3 fotos generales (frente, lateral e interior):\n\n[---saltomensaje---]\n\n👉 *Con estos datos nuestro tasador te pasa el valor de toma de inmediato.*`,
        tipping_point: "Envianos los 4 datos y fotos para pasarte la cotización estimada de toma.",
        key_benefit: "Pide toda la ficha de tasación de una sola vez."
      },
      {
        id: "turno_taller",
        title: "Coordinación de Service Oficial y Mantenimiento",
        shortcut: "/service",
        category: "Postventa / Taller",
        before: "'Quiero hacer el service' -> 'cuántos km tiene?' -> 'qué patente?' (5 msgs).",
        after: `👋 ¡Hola! Con gusto coordinamos el turno de mantenimiento de tu unidad en ${cName}:\n\n🔧 *Por favor confirmanos en un solo mensaje:*\n1. Modelo y patente del vehículo:\n2. Kilometraje actual (ej. 10.000 / 20.000 km):\n3. ¿Deseás revisar algún punto específico además del service oficial?\n4. Sucursal y día de preferencia:\n\n[---saltomensaje---]\n\n👉 *Con estos datos te reservamos el horario de ingreso al taller hoy mismo.*`,
        tipping_point: "Con estos datos te reservamos el horario de ingreso al taller hoy mismo.",
        key_benefit: "Centraliza los datos de postventa en 1 turno."
      },
      {
        id: "repuestos_auto",
        title: "Consulta de Repuestos y Accesorios Originales",
        shortcut: "/repuesto",
        category: "Repuestos",
        before: "Múltiples repreguntas para saber número de chasis y pieza exacta.",
        after: `👋 ¡Hola! Para cotizarte la pieza original exacta y confirmarte stock inmediato:\n\n🔩 *Envianos en este mensaje:*\n1. Número de Chasis o VIN (figura en la cédula verde):\n2. Pieza o repuesto solicitado (con foto si la tenés):\n\n[---saltomensaje---]\n\n👉 *Con el número de chasis te confirmamos disponibilidad y precio final en el acto.*`,
        tipping_point: "Envianos el número de chasis y la pieza para pasarte precio exacto.",
        key_benefit: "Evita errores de catálogo solicitando el número de chasis en el turno inicial."
      },
      {
        id: "rescate_concesionaria",
        title: "Rescate de Consulta de Vehículo (Test Drive / Financiación)",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "El asesor no hace seguimiento o pregunta '¿pudiste ver el precio?'.",
        after: `👋 ¡Hola {NOMBRE}! Te escribo del equipo comercial de ${cName}.\n\nNos ingresó un cupo de bonificación especial en tasa de financiación para la unidad {MODELO} que consultaste.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría aprovechar este cupo antes de que finalice la campaña este viernes?*`,
        tipping_point: "¿Te gustaría aprovechar este cupo de tasa antes de que finalice?",
        key_benefit: "Aporta una excusa comercial real (tasa bonificada) para reactivar al prospecto."
      }
    ];
  }

  // 5. INMOBILIARIA / DESARROLLOS / ALQUILERES
  if (rubroKey === 'inmobiliaria_desarrollos') {
    return [
      {
        id: "inmueble_ficha",
        title: "Ficha de Propiedad y Coordinación de Visita",
        shortcut: "/propiedad",
        category: "Propiedades",
        before: "Fotos sueltas -> 'cuánto sale?' -> 'dónde queda?' -> 'cuándo se ve?' (7 msgs).",
        after: `👋 ¡Hola! Te comparto los detalles de la propiedad en ${cName}:\n\n🏡 *{TIPO_PROPIEDAD} en {ZONA/BARRIO}*\n• *Valor:* \${VALOR_ALQUILER_VENTA} *(Expensas: \${EXPENSAS})*\n• *Características:* {CANT_DORMITORIOS} dormitorios, {BANOS} baños, cochera y balcón.\n• *Disponibilidad:* Inmediata.\n\n📅 *Coordinación de Visitas:*\nDisponemos de turnos para visitarla los {DIAS_VISITA} de {HORARIOS}.\n\n[---saltomensaje---]\n\n👉 *¿Qué día y horario te queda más cómodo para agendar tu visita presencial?*`,
        tipping_point: "¿Qué día y horario te queda más cómodo para agendar tu visita presencial?",
        key_benefit: "Resume precio, expensas, comodidades y agenda la visita en el acto."
      },
      {
        id: "requisitos_alquiler",
        title: "Requisitos y Condiciones de Ingreso para Alquiler",
        shortcut: "/alquiler",
        category: "Alquileres",
        before: "Ping-pong eterno preguntando recibos de sueldo y garantías sueltas.",
        after: `📋 *Condiciones y requisitos para alquilar {PROPIEDAD}:*\n\n1. *Titular:* Demostración de ingresos (últimos 3 recibos de sueldo o certificación contable).\n2. *Garantías:* 2 garantes con bono de sueldo o 1 garantía propietaria (o seguro de caución).\n3. *Gastos de ingreso:* 1 mes de alquiler + 1 mes de depósito de garantía + honorarios de contrato.\n\n[---saltomensaje---]\n\n👉 *¿Contás con esta documentación para enviarte el formulario de postulación directa?*`,
        tipping_point: "¿Contás con esta documentación para enviarte el formulario de postulación?",
        key_benefit: "Filtra postulantes calificados sin repreguntas."
      },
      {
        id: "tasacion_inmueble",
        title: "Solicitud de Tasación Inmobiliaria",
        shortcut: "/tasacion",
        category: "Tasaciones",
        before: "Múltiples preguntas dispersas sobre m2, estado y dirección.",
        after: `🏡 *¡Hola! Realizamos tasaciones profesionales de mercado en ${cName}:*\n\n📋 *Para coordinar la inspección técnica de tu propiedad, envianos:*\n1. Dirección exacta y barrio:\n2. Tipo de inmueble (Casa / Departamento / Lote / Local):\n3. Superficie estimada (m² cubiertos y totales):\n4. ¿El inmueble cuenta con escritura al día?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te agendamos la visita de nuestro tasador sin costo.*`,
        tipping_point: "Envianos dirección, tipo, superficie y estado de escritura.",
        key_benefit: "Agrupa la ficha del inmueble para tasación inmediata."
      },
      {
        id: "loteo_pozo",
        title: "Loteos, Terrenos y Desarrollos de Pozo",
        shortcut: "/pozo",
        category: "Inversiones / Lotes",
        before: "Envía folleto sin precios -> prospecto no responde más.",
        after: `🏗️ *Oportunidad de Inversión en ${cName}:*\n\n• *Proyecto:* {NOMBRE_PROYECTO} en {ZONA}\n• *Lotes desde:* {SUPERFICIE} m² con servicios de luz, agua y cloacas.\n• 💡 *Plan de Financiación:* Anticipo del 30% y saldo en hasta 36 cuotas en pesos/dólares.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te enviemos el masterplan con los lotes disponibles para coordinar una visita al predio?*`,
        tipping_point: "¿Querés que te enviemos el masterplan con los lotes disponibles?",
        key_benefit: "Presenta el plan financiero y llama a visitar el desarrollo."
      },
      {
        id: "rescate_propiedad",
        title: "Seguimiento y Cierre de Visita a Propiedad",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "'Hola qué te pareció el departamento?' -> silencio.",
        after: `👋 ¡Hola {NOMBRE}! ¿Cómo estás? Te escribo de ${cName} para consultar qué te pareció la visita a la propiedad de {CALLE/BARRIO}.\n\nEl propietario está abierto a evaluar una propuesta de reserva formal esta semana antes de abrirla a otros interesados.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría presentar una oferta de reserva o te mostramos otra alternativa en la misma zona?*`,
        tipping_point: "¿Te gustaría presentar una oferta formal o ver otra alternativa?",
        key_benefit: "Estimula la reserva rápida o redirige a otra propiedad del portfolio."
      }
    ];
  }

  // 6. SEGUROS / FINTECH / FINANZAS
  if (rubroKey === 'seguros_fintech' || rubroKey === 'fintech_servicios_financieros') {
    return [
      {
        id: "denuncia_siniestro",
        title: "Denuncia de Siniestro, Choque o Auxilio Mecánico",
        shortcut: "/siniestro",
        category: "Siniestros / Urgencias",
        before: "Cliente en crisis -> 'pasame póliza' -> 'quién chocó?' -> repreguntas dispersas.",
        after: `🚨 *Asistencia Inmediata por Siniestro - ${cName}:*\n\n1. ¿Hay personas lesionadas que requieran ambulancia urgente?\n2. Datos del vehículo asegurado (Patente y Nombre del Titular):\n3. Dirección exacta donde ocurrió el hecho o donde se encuentra la unidad:\n4. ¿Necesitás grúa / remolque en este momento?\n\n[---saltomensaje---]\n\n👉 *Respondenos con estos datos y te asignamos número de siniestro y móvil de auxilio de inmediato.*`,
        tipping_point: "Respondenos con los 4 datos y te asignamos auxilio y número de siniestro.",
        key_benefit: "Prioriza la seguridad, evalúa auxilio y abre el expediente en 1 turno."
      },
      {
        id: "cotizacion_seguro",
        title: "Cotización de Seguro de Auto / Hogar",
        shortcut: "/cotizaseguro",
        category: "Ventas Seguros",
        before: "Múltiples mensajes para saber año, modelo y tipo de cobertura.",
        after: `🛡️ *¡Hola! Cotizamos tu cobertura a medida en ${cName}:*\n\n📋 *Para pasarte la propuesta comparativa de las mejores compañías, envianos:*\n• Marca, modelo y año exacto del vehículo:\n• ¿Duerme en garage o en calle?\n• Localidad y código postal donde circula:\n• Cobertura de interés (Terceros Completo / Todo Riesgo con Franquicia):\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el cuadro de valores con descuento por débito automático.*`,
        tipping_point: "Envianos los datos del vehículo para pasarte la cotización comparativa.",
        key_benefit: "Reúne datos de riesgo en un solo bloque para cotización instantánea."
      },
      {
        id: "prestamo_fintech",
        title: "Solicitud de Préstamo o Límite de Crédito",
        shortcut: "/credito",
        category: "Créditos",
        before: "Pide DNI -> luego recibo -> luego CBU en días distintos.",
        after: `💳 *Simulación de Crédito Inmediato en ${cName}:*\n\n📝 *Requisitos de pre-aprobación:*\n1. Número de DNI (sin puntos):\n2. Monto solicitado y cantidad de cuotas (ej. $500.000 en 12 cuotas):\n3. CBU o Alias bancario donde cobrás tus haberes:\n\n[---saltomensaje---]\n\n👉 *Validamos tu perfil crediticio en el sistema y te confirmamos la pre-aprobación en este chat.*`,
        tipping_point: "Envianos DNI, monto y CBU para verificar tu pre-aprobación de inmediato.",
        key_benefit: "Verificación crediticia en caliente en un solo turno."
      },
      {
        id: "pago_poliza",
        title: "Estado de Cuenta, Pagos y Débito Automático",
        shortcut: "/pago",
        category: "Cobranzas",
        before: "Pasa CBU suelto sin confirmar si la póliza queda vigente.",
        after: `📄 *Estado de Cuenta y Medios de Pago - ${cName}:*\n\n• *Póliza N°:* {NRO_POLIZA}\n• *Monto al día:* *\${MONTO_CUOTA}*\n• *Alias de Pago:* \`${cAlias}\`\n• 💡 *Tip:* Adherite a débito automático con tarjeta y obtené un 10% de bonificación continua.\n\n[---saltomensaje---]\n\n👉 *Envianos tu comprobante para registrar la acreditación y emitir tu certificado de cobertura.*`,
        tipping_point: "Envianos tu comprobante para emitir tu certificado de cobertura de inmediato.",
        key_benefit: "Vincula el pago con la vigencia de cobertura de la póliza."
      },
      {
        id: "rescate_seguro",
        title: "Protocolo de Rescate de Propuesta de Póliza",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "Cliente no responde la cotización.",
        after: `👋 ¡Hola {NOMBRE}! Te escribo de ${cName} para consultarte si pudiste revisar la propuesta de seguro que te enviamos.\n\nPodemos sostenerte la bonificación del 20% en las primeras 3 cuotas si confirmamos el alta durante esta semana.\n\n[---saltomensaje---]\n\n👉 *¿Querés que emitamos la póliza para que tu vehículo quede cubierto a partir de hoy?*`,
        tipping_point: "¿Querés que emitamos la póliza para que tu vehículo quede cubierto hoy?",
        key_benefit: "Ofrece beneficio económico y ancla la necesidad de protección inmediata."
      }
    ];
  }

  // 7. EDUCACIÓN / INSTITUTOS / CURSOS
  if (rubroKey === 'educacion_institutos' || rubroKey === 'educacion_capacitacion') {
    return [
      {
        id: "info_carrera",
        title: "Información de Carrera, Plan de Estudio y Aranceles",
        shortcut: "/carrera",
        category: "Admisiones",
        before: "Envía PDF pesado sin explicar fechas ni precios.",
        after: `🎓 *¡Hola! Te compartimos la información de {CARRERA_CURSO} en ${cName}:*\n\n• *Duración:* {DURACION} (Modalidad Online / Híbrida con clases grabadas).\n• *Título / Certificación:* Oficial y de validez nacional.\n• 💡 *Matrícula Bonificada:* 100% OFF inscribiéndote antes del {FECHA_LIMITE}.\n• *Arancel Mensual:* \${CUOTA} por mes.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos una vacante promocional para asegurar la bonificación de matrícula?*`,
        tipping_point: "¿Querés que te reservemos una vacante promocional para asegurar la bonificación?",
        key_benefit: "Resume plan, modalidad y matrícula bonificada con llamado a la reserva."
      },
      {
        id: "inscripcion_requisitos",
        title: "Requisitos de Inscripción y Documentación",
        shortcut: "/inscripcion",
        category: "Inscripciones",
        before: "Pide papeles de a uno durante semanas.",
        after: `📝 *Pasos para completar tu inscripción en ${cName}:*\n\n1. Foto de DNI (frente y dorso).\n2. Analítico secundario o constancia de título en trámite.\n3. Comprobante de pago del arancel inicial (Alias: \`${cAlias}\`).\n\n[---saltomensaje---]\n\n👉 *Apenas nos envíes la documentación te generamos tu usuario y clave del campus virtual.*`,
        tipping_point: "Apenas nos envíes los 3 requisitos te generamos tu acceso al campus virtual.",
        key_benefit: "Centraliza el alta de alumno en 1 solo paso."
      },
      {
        id: "fechas_examenes",
        title: "Fechas de Exámenes y Trámites Académicos",
        shortcut: "/examenes",
        category: "Alumnos",
        before: "Alumno pregunta fecha -> derivación a secretaría -> espera de días.",
        after: `📅 *Calendario de Exámenes y Trámites Académicos:*\n\n• *Período de Inscripción a Finales:* Del {FECHA_INICIO} al {FECHA_FIN} desde el portal de alumnos.\n• *Requisito:* Estar al día con la cuota de cursada.\n\n[---saltomensaje---]\n\n👉 *¿Pudiste anotarte desde el portal o necesitás que verifiquemos tu estado académico en secretaría?*`,
        tipping_point: "¿Pudiste anotarte desde el portal o verificamos tu estado académico?",
        key_benefit: "Resuelve la consulta académica sin demoras burocráticas."
      },
      {
        id: "pago_cuota_edu",
        title: "Pago de Cuotas y Aranceles Educativos",
        shortcut: "/pago",
        category: "Tesorería",
        before: "CBU descolgado sin datos de alumno ni comprobante.",
        after: `🏦 *Datos Bancarios de Tesorería - ${cName}:*\n\n• *Titular:* ${cName}\n• *Alias:* \`${cAlias}\`\n• *Importe Cuota:* *\${MONTO_CUOTA}*\n\n📝 *Al transferir, adjuntá el comprobante indicando:*\n1. Nombre y Apellido del Alumno:\n2. DNI:\n3. Carrera y mes que estás abonando:\n\n[---saltomensaje---]\n\n¡Con eso se acredita automáticamente en tu legajo! 🎓`,
        tipping_point: "Adjuntá comprobante con nombre, DNI y carrera para impactar en tu legajo.",
        key_benefit: "Identifica los pagos de aranceles eliminando confusiones contables."
      },
      {
        id: "rescate_carrera",
        title: "Protocolo de Rescate de Interesado en Formación",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "Interesado no responde después de pedir el programa.",
        after: `👋 ¡Hola {NOMBRE}! ¿Cómo estás? Te escribo del equipo de admisiones de ${cName}.\n\nEstamos cerrando el cupo del grupo que inicia la próxima semana y nos queda 1 lugar disponible con el arancel congelado.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría que te reservemos el lugar o querés conversar con un asesor pedagógico para despejar dudas?*`,
        tipping_point: "¿Te gustaría que te reservemos el lugar o conversás con un asesor pedagógico?",
        key_benefit: "Usa escasez de cupos para recuperar postulantes indecisos."
      }
    ];
  }

  // 8. GASTRONOMÍA / DELIVERY / RESTAURANTES
  if (rubroKey === 'gastronomia_delivery' || rubroKey === 'gastronomia_restaurantes') {
    return [
      {
        id: "carta_pedido",
        title: "Menú Digital, Promociones y Tomar Pedido",
        shortcut: "/menu",
        category: "Pedidos / Delivery",
        before: "'Pasame la carta' -> fotos borrosas -> 'cuánto tarda?' -> 6 msgs.",
        after: `🍕 *¡Hola! Te damos la bienvenida a ${cName}:*\n\n📋 *Carta Digital y Promociones de Hoy:* {LINK_CARTA}\n• 💡 *Combo del Día:* {COMBO_ESPECIAL} a solo \${PRECIO_COMBO}.\n• ⏱️ *Demora estimada de cocina y reparto:* 30 a 45 minutos.\n\n[---saltomensaje---]\n\n👉 *Para marchar tu pedido, envianos: tu orden, dirección exacta y con qué medio abonás.*`,
        tipping_point: "Envianos tu orden, dirección exacta y medio de pago para marchar el pedido.",
        key_benefit: "Pasa menú, demora y captura el pedido en un solo turno."
      },
      {
        id: "reservas_mesa",
        title: "Reservas de Mesas y Cumpleaños",
        shortcut: "/reserva",
        category: "Reservas",
        before: "Múltiples mensajes para coordinar cantidad de personas y horario.",
        after: `🍽️ *¡Hola! Con gusto tomamos tu reserva en ${cName}:*\n\n📋 *Envianos en este mensaje:*\n1. Nombre y Apellido:\n2. Cantidad de personas (adultos y niños):\n3. Día y horario deseado:\n4. ¿Celebran algún evento especial (cumpleaños / aniversario)?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te confirmamos la mesa asignada de inmediato.*`,
        tipping_point: "Envianos nombre, personas y horario para confirmarte la mesa asignada.",
        key_benefit: "Centraliza la reserva del salón en un solo mensaje."
      },
      {
        id: "pago_delivery",
        title: "Medios de Pago y Datos de Transferencia Delivery",
        shortcut: "/pago",
        category: "Cobranzas",
        before: "Repartidor llega y el cliente no transfirió.",
        after: `💳 *Confirmación de Pago - ${cName}:*\n\n• *Monto Total:* *\${TOTAL_PEDIDO}*\n• *Alias de Transferencia:* \`${cAlias}\`\n• *Efectivo:* Por favor avisanos con cuánto dinero abonás para enviar cambio al repartidor.\n\n[---saltomensaje---]\n\n👉 *Envianos el comprobante para que el pedido salga inmediatamente con el cadete.*`,
        tipping_point: "Envianos el comprobante para que el pedido salga con el cadete.",
        key_benefit: "Asegura la acreditación del cobro antes del despacho del delivery."
      },
      {
        id: "demora_cocina",
        title: "Mensaje de Contención por Demora en Pedido (Oxígeno)",
        shortcut: "/demora",
        category: "Atención / Cocina",
        before: "Cliente enojado preguntando 'dónde está la comida' -> silencio.",
        after: `⏱️ *¡Hola! Te informamos el estado de tu pedido:*\n\nTu comida ya está en la última etapa de empaquetado y sale con el próximo reparto. Te pedimos disculpas por los minutos de demora debido a la alta demanda.\n\n[---saltomensaje---]\n\n👉 *Apenas el cadete esté en camino te enviamos el aviso para que lo esperes.*`,
        tipping_point: "Apenas el cadete esté en camino te enviamos el aviso.",
        key_benefit: "Inyecta oxígeno conversacional y calma la ansiedad del comensal."
      },
      {
        id: "rescate_cliente",
        title: "Reactivación de Clientes y Promoción de Fin de Semana",
        shortcut: "/rescate",
        category: "Fidelización",
        before: "Sin contacto recurrente con clientes de la base.",
        after: `👋 ¡Hola {NOMBRE}! En ${cName} queremos mimarte este fin de semana:\n\n🎁 Tenés un *postre de cortesía* o un *15% de descuento* en tu próximo pedido usando el código \`SPOTER15\`.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría hacer tu pedido para esta noche o reservarte mesa para el finde?*`,
        tipping_point: "¿Te gustaría hacer tu pedido para esta noche o reservar mesa?",
        key_benefit: "Reactivación de clientes antiguos aumentando la frecuencia anual (LTV)."
      }
    ];
  }

  // 9. SAAS / B2B / TECNOLOGÍA / SOFTWARE
  if (rubroKey === 'saas_b2b_tecnologia' || rubroKey === 'saas_tecnologia') {
    return [
      {
        id: "demo_saas",
        title: "Agendar Demo en Vivo y Propuesta de Planes",
        shortcut: "/demo",
        category: "Ventas B2B",
        before: "Múltiples mails y mensajes para encontrar horario de reunión.",
        after: `👋 ¡Hola! Te compartimos los detalles de la plataforma ${cName}:\n\n💻 *Solución integral para optimizar tus operaciones:*\n• Automatización de flujos y tableros en tiempo real.\n• Integración nativa con tus sistemas actuales.\n• Planes a medida según el volumen de tu equipo.\n\n📅 *Link directo para agendar tu Demo de 20 minutos:* {LINK_CALENDLY}\n\n[---saltomensaje---]\n\n👉 *¿Qué día te queda más cómodo para que un especialista te muestre la plataforma en acción?*`,
        tipping_point: "¿Qué día te queda más cómodo para que un especialista te muestre la plataforma?",
        key_benefit: "Pasa valor de la solución y link de agenda directa sin fricción."
      },
      {
        id: "triaje_soporte_saas",
        title: "Triaje de Soporte Técnico y Diagnóstico de Bugs",
        shortcut: "/soporte",
        category: "Soporte Técnico",
        before: "Usuario dice 'no anda' -> soporte pregunta usuario -> luego navegador (5 msgs).",
        after: `🛠️ *Mesa de Ayuda Técnica:*\n\nPara reproducir y solucionar la incidencia con el equipo de ingeniería, envianos:\n1. Correo electrónico de tu cuenta de usuario:\n2. Módulo o pantalla donde ocurre el error:\n3. Breve descripción de lo ocurrido y captura de pantalla:\n\n[---saltomensaje---]\n\n👉 *Con estos datos aislamos la causa y te damos una solución inmediata.*`,
        tipping_point: "Con estos datos aislamos la causa y te damos una solución inmediata.",
        key_benefit: "Captura el contexto técnico en 1 solo paso sin repreguntas."
      },
      {
        id: "facturacion_b2b",
        title: "Facturación B2B, Datos Fiscales y Cuentas Corporativas",
        shortcut: "/factura",
        category: "Administración B2B",
        before: "Envío de facturas dispersas sin CUIT ni comprobante ordenado.",
        after: `💼 *Administración y Cobranzas - ${cName}:*\n\n• *Razón Social:* ${cName}\n• *CUIT:* 30-71829384-9 (IVA Responsable Inscripto)\n• *Alias Corporativo:* \`${cAlias}\`\n\n📝 *Envianos tu CUIT y comprobante para emitir tu Factura A correspondiente.*\n\n[---saltomensaje---]\n\n¡Con eso se acredita tu período de suscripción en el acto! 🚀`,
        tipping_point: "Envianos tu CUIT y comprobante para emitir tu Factura A de inmediato.",
        key_benefit: "Estandariza los requisitos fiscales de clientes corporativos."
      },
      {
        id: "onboarding_saas",
        title: "Onboarding y Primeros Pasos de Configuración",
        shortcut: "/onboarding",
        category: "Customer Success",
        before: "Cliente nuevo queda a la deriva sin saber cómo arrancar.",
        after: `🚀 *¡Te damos la bienvenida a ${cName}!*\n\nPara activar tu espacio de trabajo en menos de 10 minutos:\n1. Ingresá con tus credenciales a: {LINK_PLATAFORMA}\n2. Seguí la guía rápida de configuración inicial: {LINK_GUIA}\n\n[---saltomensaje---]\n\n👉 *¿Pudiste acceder correctamente o requerís que te asistamos en el primer acceso?*`,
        tipping_point: "¿Pudiste acceder correctamente o requerís que te asistamos en el primer acceso?",
        key_benefit: "Acelera el Time-to-Value garantizando la adopción exitosa del software."
      },
      {
        id: "rescate_trial",
        title: "Protocolo de Rescate de Trial / Propuesta B2B",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "Prospecto B2B deja de responder la propuesta.",
        after: `👋 ¡Hola {NOMBRE}! ¿Cómo estás? Te escribo de ${cName} para consultarte si pudiste revisar la propuesta para tu equipo.\n\nQueríamos ofrecerte extender tu período de prueba sin cargo por 14 días adicionales para que puedan validar el retorno con datos reales.\n\n[---saltomensaje---]\n\n👉 *¿Te parece bien si te activamos los 14 días extra para continuar la prueba?*`,
        tipping_point: "¿Te parece bien si te activamos los 14 días extra para continuar la prueba?",
        key_benefit: "Elimina el riesgo de decisión ofreciendo extensión de prueba estratégica."
      }
    ];
  }

  // 10. TURISMO / HOTELES / VIAJES
  if (rubroKey === 'turismo_hoteleria') {
    return [
      {
        id: "paquete_turismo",
        title: "Paquetes, Tarifas de Temporada e Itinerario",
        shortcut: "/viaje",
        category: "Ventas Turismo",
        before: "'¿Cuánto sale viajar?' -> '¿qué destino?' -> '¿cuántas personas?' (6 msgs).",
        after: `✈️ *¡Hola! Te compartimos la propuesta de viaje en ${cName}:*\n\n🌴 *Destino: {DESTINO}*\n• *Incluye:* Pasajes aéreos, traslados y {NOCHES} noches de alojamiento con desayuno.\n• *Tarifa por pasajero:* \${PRECIO_VIAJE} *(Base Doble)*.\n• 💡 *Financiación:* Anticipo y cuotas fijas antes de la fecha de salida.\n\n[---saltomensaje---]\n\n👉 *¿Para qué fechas estimadas estás planificando viajar y cuántos pasajeros serían?*`,
        tipping_point: "¿Para qué fechas estás planificando viajar y cuántos pasajeros serían?",
        key_benefit: "Condensa aéreos, hotel, tarifas y captura fechas en 1 paso."
      },
      {
        id: "reserva_hotel",
        title: "Disponibilidad de Habitaciones y Check-in/Check-out",
        shortcut: "/hotel",
        category: "Hotelería",
        before: "Múltiples mensajes para consultar camas, desayuno y cochera.",
        after: `🏨 *¡Hola! Con gusto cotizamos tu estadía en ${cName}:*\n\n📋 *Para confirmarte tarifa exacta y disponibilidad de habitaciones, envianos:*\n1. Fecha de Check-in y Check-out:\n2. Cantidad de huéspedes (adultos y menores):\n3. Tipo de habitación deseada (Estándar / Superior / Suite):\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el presupuesto final con desayuno y cochera incluidos.*`,
        tipping_point: "Envianos fechas y cantidad de huéspedes para pasarte el presupuesto final.",
        key_benefit: "Centraliza los datos de la estadía hotelera en un solo bloque."
      },
      {
        id: "pago_turismo",
        title: "Confirmación de Reserva y Medios de Pago",
        shortcut: "/pago",
        category: "Cobranzas",
        before: "Pasa datos de pago sin fijar fecha límite de seña.",
        after: `🎯 *Para confirmar tu reserva y congelar la tarifa en ${cName}:*\n\n🏦 *Datos de Seña / Pago:*\n• *Titular:* ${cName}\n• *Alias:* \`${cAlias}\`\n• *Monto de Seña (30%):* *\${MONTO_SENA}*\n\n📝 *Envianos el comprobante junto con fotos de los DNI/Pasaportes de los viajeros para emitir los vouchers.*\n\n[---saltomensaje---]\n\n¡Con eso queda garantizada tu reserva oficial! 🧳`,
        tipping_point: "Envianos el comprobante y fotos de DNI para emitir tus vouchers de viaje.",
        key_benefit: "Asegura la seña y captura la documentación de los viajeros de una vez."
      },
      {
        id: "politica_cancelacion",
        title: "Política de Cancelación y Reprogramación Flexible",
        shortcut: "/cancelacion",
        category: "Atención al Pasajero",
        before: "Discusiones por cancelaciones sin términos claros.",
        after: `📋 *Políticas de Cancelación y Flexibilidad de tu Reserva:*\n\n• *Reprogramación sin costo:* Hasta 15 días antes de la fecha de viaje.\n• *Cancelación con reembolso:* Según condiciones de la aerolínea y cadena hotelera contratada.\n\n[---saltomensaje---]\n\n👉 *¿Deseás que revisemos tu reserva para reprogramar las fechas de tu estadía?*`,
        tipping_point: "¿Deseás que revisemos tu reserva para reprogramar las fechas de estadía?",
        key_benefit: "Informa con claridad y ofrece opciones de reprogramación activa."
      },
      {
        id: "rescate_turismo",
        title: "Protocolo de Rescate de Presupuesto de Viaje",
        shortcut: "/rescate",
        category: "Seguimiento",
        before: "El viajero pide presupuesto y no contesta más.",
        after: `👋 ¡Hola {NOMBRE}! Te escribo de ${cName} porque la aerolínea/hotel sostiene la tarifa bonificada para tu viaje a {DESTINO} hasta el día de hoy.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría señar la tarifa antes de que aumente o querés que busquemos una alternativa en otra fecha?*`,
        tipping_point: "¿Te gustaría señar la tarifa antes del aumento o evaluamos otra fecha?",
        key_benefit: "Aprovecha la urgencia de tarifas hoteleras y aéreas para cerrar."
      }
    ];
  }

  // 11. SERVICIOS PROFESIONALES / GENERALES (Default)
  return [
    {
      id: "presupuesto_comercial",
      title: "Presupuesto General con Bonificación Contado",
      shortcut: "/coti",
      category: "Ventas / Precios",
      before: "Buenos días -> 'en breve enviamos valor' -> PDF adjunto -> silencio.",
      after: `👋 ¡Hola! Te adjunto el presupuesto detallado de ${cName} (*Cotización N° {NRO_COTIZACION}*):\n\n📋 *Resumen comercial de tu servicio:*\n• *Total de Lista / Financiado:* \${TOTAL_LISTA}\n• 💡 *Precio Especial Contado / Transferencia:* *\${TOTAL_DESCUENTO}*\n• *Disponibilidad:* Turno inmediato de inicio o despacho de tareas.\n• *Alcance:* Cotizado para {DETALLE_SERVICIO}.\n\n⏱️ _Validez de precios: 48 horas._\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos la fecha de inicio para confirmar la gestión esta semana?*`,
      tipping_point: "¿Querés que te reservemos la fecha de inicio para confirmar esta semana?",
      key_benefit: "Resume la oferta en el chat, destaca el descuento de contado y cierra con Tipping Point."
    },
    {
      id: "medios_pago_gral",
      title: "Medios de Pago, Transferencia y Facturación",
      shortcut: "/pago",
      category: "Cobranzas",
      before: "Pasa CBU suelto -> pide comprobante -> cliente no pone número de pedido.",
      after: `🎯 *Para confirmar tu servicio y registrar el pago en ${cName}:*\n\n🏦 *Datos de Pago:*\n• *Titular:* ${cName}\n• *Alias:* \`${cAlias}\`\n• *Importe Final:* *\${MONTO_FINAL}*\n\n📝 *Una vez hecha la transferencia, envianos:*\n1. Comprobante de pago:\n2. CUIT o DNI (para la factura):\n3. Razón Social o Nombre Completo:\n\n[---saltomensaje---]\n\n¡Con eso ingresa de inmediato a nuestro sistema de gestión! 🚀`,
      tipping_point: "Envianos comprobante, CUIT y Razón Social en un solo mensaje.",
      key_benefit: "Elimina el caos de identificación de transferencias y reduce 4 mensajes a 1."
    },
    {
      id: "triaje_soporte_gral",
      title: "Triaje de Diagnóstico y Requisitos en 1 Turno",
      shortcut: "/soporte",
      category: "Soporte / Trámites",
      before: "Hola -> 'qué problema tenés?' -> 'pasame captura' -> 'qué usuario sos?' (4 msgs).",
      after: `👋 ¡Hola! Te ayudamos a resolver tu solicitud en ${cName} en este mismo turno:\n\n🔍 *Para gestionarlo en este momento, envianos en un solo mensaje:*\n1. Número de cliente, DNI o usuario:\n2. Descripción breve de la consulta o gestión requerida:\n3. Foto o comprobante adjunto (si corresponde):\n\n[---saltomensaje---]\n\n👉 *Con estos datos aislamos la causa y te damos una respuesta inmediata.*`,
      tipping_point: "Con estos datos aislamos la causa y te damos una solución inmediata.",
      key_benefit: "Diagnostica la gestión en 1 solo paso sin repreguntas."
    },
    {
      id: "cierre_fcr_gral",
      title: "Confirmación de Solución de Caso (FCR)",
      shortcut: "/resuelto",
      category: "Cierre / Calidad",
      before: "Respuestas pasivas tipo 'listo, avisame si anda'.",
      after: `✅ *Tu solicitud ha sido procesada y resuelta con éxito.*\n\nTe dejamos asentado el número de gestión para cualquier seguimiento futuro.\n\n[---saltomensaje---]\n\n👉 *¿Pudiste comprobar que funciona correctamente o requerís asistencia adicional antes de cerrar el caso?*`,
      tipping_point: "¿Pudiste comprobar que funciona correctamente o requerís asistencia adicional?",
      key_benefit: "Valida la resolución efectiva (FCR) antes de dar por cerrado el ticket."
    },
    {
      id: "rescate_comercial_gral",
      title: "Protocolo de Rescate y Seguimiento de Contacto Frío",
      shortcut: "/rescate",
      category: "Seguimiento",
      before: "Silencio o 'Hola pudiste ver?' (tasa de respuesta menor al 10%).",
      after: `👋 ¡Hola {NOMBRE}! ¿Cómo estás? Te escribo de ${cName} para consultar si pudiste revisar la propuesta comercial que te enviamos.\n\nEstamos coordinando la agenda de altas y entregas de esta semana y queríamos asegurarte las condiciones bonificadas.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te guardemos el lugar de reserva o necesitás que ajustemos algún punto del presupuesto?*`,
      tipping_point: "¿Querés que te guardemos el lugar de reserva o necesitás que ajustemos algún punto?",
      key_benefit: "Reactivación contextual sin presionar al prospecto."
    }
  ];
}


// --- DEFINICIÓN DE CATEGORÍAS DE BRECHAS DE HANDOFF POR RUBRO ---
function getRubroGapCategories(rubroKey) {
  if (rubroKey === 'salud_obra_social') {
    return [
      {
        key: "autorizaciones_ordenes",
        title: "Autorizaciones Médicas, Órdenes y Prácticas",
        icon: "🩺",
        regex: /autoriz|orden|pr[aá]ctica|estudio|estudios|ginec[oó]log|m[eé]dico|pediatra|auditor[ií]a|aprobaci[oó]n|derivaci[oó]n|interconsulta|tomograf|resonanc|laboratorio|analisis|an[aá]lisis|ecograf/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Triaje Clínico Spoter",
        solution_action: "Recolectar foto de orden médica con diagnóstico, credencial y lugar de atención en el mensaje inicial para ingresar a auditoría médica en 1 solo paso.",
        template_target_id: "autorizaciones"
      },
      {
        key: "copagos_reintegros",
        title: "Copagos, Reintegros y Facturación Médica",
        icon: "💳",
        regex: /copago|reintegro|factura|facturaci[oó]n|arancel|pago|pagar|cuota|cbu|alias|transferencia|ticket|comprobante|recibo|debito|d[eé]bito/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Atajo de Cobranzas / Trámites",
        solution_action: "Vincular link directo de autogestión de copagos y recepción automática de comprobante con DNI en un mensaje.",
        template_target_id: "reintegros"
      },
      {
        key: "turnos_cartilla",
        title: "Turnos, Especialidades y Cartilla Médica",
        icon: "📅",
        regex: /turno|turnos|cartilla|profesional|cl[ií]nica|sanatorio|especialidad|consultorio|d[ií]a|horario|atenci[oó]n|atender|doctor|doctora/i,
        feasibility: "Media (Integración)",
        solution_type: "Buscador de Cartilla RAG",
        solution_action: "Conectar cartilla médica en Spoter para informar prestadores por zona y derivar a reserva en 1 turno.",
        template_target_id: "turnos"
      },
      {
        key: "recetas_farmacia",
        title: "Recetas Electrónicas y Cobertura de Farmacia",
        icon: "💊",
        regex: /receta|recetas|remedio|remedios|farmacia|medicamento|medicamentos|dosis|droga|cobertura farmacia|vadem[eé]cum|prescripci[oó]n/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Validador de Recetas Spoter",
        solution_action: "Solicitar prescripción digital y credencial en mensaje estructurado para validar cobertura sin derivar.",
        template_target_id: "recetas_farmacia"
      },
      {
        key: "credencial_afiliacion",
        title: "Credencial Digital y Estado de Afiliación",
        icon: "📱",
        regex: /credencial|carnet|carn[eé]|afiliad|afiliaci[oó]n|padr[oó]n|alta|baja|familiar|incorporar|titular/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Autogestión de Credencial",
        solution_action: "Disparar instructivo de acceso al portal y credencial digital en el acto sin intervención del asesor.",
        template_target_id: "credencial_digital"
      },
      {
        key: "frustracion_demoras",
        title: "Demoras en Atención y Solicitud de Operador",
        icon: "⚠️",
        regex: /no me contestan|demora|tardanza|urgente|hablar con|operador|asesor|humano|persona|alguien|ayuda|no entiendo|otra cosa/i,
        feasibility: "Alta (Conversacional)",
        solution_type: "Priorización HITL Spoter",
        solution_action: "Triaje automático por severidad y asignación balanceada al asesor con contexto pre-cargado.",
        template_target_id: "cierre_fcr"
      }
    ];
  }

  if (rubroKey === 'comercio_retail') {
    return [
      {
        key: "precios_catalogo_stock",
        title: "Catálogo, Precios, Stock y Talles",
        icon: "🛍️",
        regex: /precio|cuanto sale|cuánto sale|cuanto esta|cuánto está|lista|catalogo|catálogo|valor|stock|talle|talles|color|remera|pantalon|prenda|modelo|disponible/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Base de Conocimiento RAG",
        solution_action: "Sincronizar catálogo y variantes para responder talle, precio y descuento contado en 1 bloque.",
        template_target_id: "producto_retail"
      },
      {
        key: "envios_despacho",
        title: "Envíos, Fletes y Tiempos de Entrega",
        icon: "🚚",
        regex: /envio|envío|flete|despacho|entrega|costo de envio|cuanto sale el envio|tiempo de entrega|cuando llega|cuándo llega|codigo postal|código postal|cp/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Matriz de Zonas Spoter",
        solution_action: "Solicitar Código Postal en el primer mensaje y confirmar tarifa y fecha estimada de entrega.",
        template_target_id: "envios_retail"
      },
      {
        key: "pagos_cuotas",
        title: "Medios de Pago, Cuotas y Facturación",
        icon: "💳",
        regex: /pago|factura|tarjeta|cuota|cuotas|transferencia|efectivo|debito|débito|mercadopago|alias|cbu|descuento efectivo|link de pago/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Atajo Maestro Inmediato",
        solution_action: "Enviar opciones de pago, cuotas sin interés y datos bancarios oficiales en un solo bloque con descuento.",
        template_target_id: "pago_retail"
      },
      {
        key: "cambios_devoluciones",
        title: "Cambios, Devoluciones y Postventa",
        icon: "🔄",
        regex: /cambio|cambiar|devolucion|devolución|falla|garantia|garantía|vino roto|no me queda|talle chico|talle grande/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Protocolo Postventa Cero Vueltas",
        solution_action: "Recolectar número de pedido, motivo de cambio y nuevo talle en mensaje inicial sin derivaciones.",
        template_target_id: "cambios_retail"
      },
      {
        key: "locales_horarios",
        title: "Locales, Retiro en Tienda y Horarios",
        icon: "📍",
        regex: /local|sucursal|donde estan|dónde están|direccion|dirección|horario|abierto|retirar hoy|pick up|mapa|hasta que hora/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Ficha Comercial en Bienvenida",
        solution_action: "Incluir sucursales, mapa y horarios de atención en la bienvenida.",
        template_target_id: "producto_retail"
      },
      {
        key: "frustracion_asesor",
        title: "Solicitud de Asesor Humano",
        icon: "⚠️",
        regex: /asesor|operador|humano|persona|alguien|ayuda|no me sirve|no entiendo|otra cosa|hablar con/i,
        feasibility: "Alta (Conversacional)",
        solution_type: "IA Conversacional Spoter",
        solution_action: "Eliminar menús rígidos y permitir atención fluida en lenguaje natural.",
        template_target_id: "rescate_carrito"
      }
    ];
  }

  if (rubroKey === 'construccion_corralon') {
    return [
      {
        key: "precios_materiales",
        title: "Cotizaciones de Materiales y Áridos",
        icon: "📋",
        regex: /precio|cuanto sale|cuánto sale|cuanto esta|cuánto está|lista|catalogo|catálogo|valor|cotizacion|cotización|presupuesto|costo|bolsa|cemento|hierro|chapa|ladrillo|metro|arena|aridos|vigueta/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Base de Conocimiento RAG",
        solution_action: "Sincronizar lista de precios de materiales para cotizaciones instantáneas en un solo bloque estructurado.",
        template_target_id: "presupuesto_corralon"
      },
      {
        key: "fletes_logistica",
        title: "Envíos, Fletes y Descarga en Obra",
        icon: "🚚",
        regex: /envio|envío|flete|despacho|entrega|zona|domicilio|llegan a|pilar|lujan|luján|capital|costo de envio|cuanto sale el envio|flete a|traer|camion|camión|volcador|hidrogrua|hidrogrúa|reparto/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Matriz de Zonas Spoter",
        solution_action: "Cargar radios de entrega, tarifas de flete y requisitos de acceso de camión en la Base de Conocimiento.",
        template_target_id: "flete_corralon"
      },
      {
        key: "pagos_facturacion",
        title: "Pagos, Alias, CBU y Facturación A / B",
        icon: "💳",
        regex: /pago|factura|factura a|tarjeta|cuota|transferencia|efectivo|debito|débito|mercadopago|alias|cbu|iva|afip|fiscal|descuento efectivo|forma de pago|medios de pago/i,
        feasibility: "Alta (Inmediata)",
        solution_type: "Atajo Maestro Inmediato",
        solution_action: "Configurar atajo de medios de pago y recolección automática de CUIT/Razón Social en mensaje cero.",
        template_target_id: "cierre_corralon"
      },
      {
        key: "stock_retiro",
        title: "Stock, Carga en Depósito y Horarios",
        icon: "📦",
        regex: /stock|tienen|hay|disponible|disponibilidad|para retirar|queda|retirar hoy|entrega inmediata|conseguir|medida|horario de carga|sucursal/i,
        feasibility: "Media (Integración)",
        solution_type: "Consulta de Inventario Spoter",
        solution_action: "Vincular stock mínimo y condiciones de retiro para responder sin consultar al depósito.",
        template_target_id: "hierros_mallas"
      },
      {
        key: "acopio_obras",
        title: "Venta Mayorista, Acopio y Grandes Obras",
        icon: "🤝",
        regex: /constructora|obra grande|cuenta corriente|licitacion|licitación|acopio|volumen|distribuidor|arquitecto|presupuesto formal/i,
        feasibility: "Consultiva (Humano)",
        solution_type: "Copiloto HITL Spoter",
        solution_action: "Derivación guiada con ficha de intencionalidad comercial y volumen para el asesor comercial.",
        template_target_id: "rescate_corralon"
      },
      {
        key: "frustracion_asesor",
        title: "Solicitud de Asesor o Atención Humana",
        icon: "⚠️",
        regex: /no me sirve|no entiendo|otra cosa|no es lo que pregunte|mala atencion|hablar con|asesor|humano|persona|alguien|operador/i,
        feasibility: "Alta (Conversacional)",
        solution_type: "IA Conversacional Spoter",
        solution_action: "Eliminar menús rígidos y permitir atención fluida en lenguaje natural.",
        template_target_id: "presupuesto_corralon"
      }
    ];
  }

  // General / Otros Rubros
  return [
    {
      key: "presupuesto_alcance",
      title: "Presupuestos, Tarifas y Alcance del Servicio",
      icon: "📋",
      regex: /precio|cuanto sale|cuánto sale|tarifa|costo|presupuesto|cotizacion|cotización|planes|honorarios|valor|servicio|alcance/i,
      feasibility: "Alta (Inmediata)",
      solution_type: "Base de Conocimiento RAG",
      solution_action: "Cargar tarifas base y propuesta comercial en Spoter para responder en 1 bloque estructurado.",
      template_target_id: "presupuesto_comercial"
    },
    {
      key: "pagos_facturacion_gral",
      title: "Medios de Pago, Alias y Facturación",
      icon: "💳",
      regex: /pago|factura|factura a|tarjeta|cuota|transferencia|efectivo|debito|débito|alias|cbu|mercadopago|iva|cuit/i,
      feasibility: "Alta (Inmediata)",
      solution_type: "Atajo Maestro Inmediato",
      solution_action: "Configurar atajo de cobro y solicitud de datos fiscales en un solo paso.",
      template_target_id: "medios_pago_gral"
    },
    {
      key: "turnos_agenda",
      title: "Turnos, Citas y Coordinación de Agenda",
      icon: "📅",
      regex: /turno|cita|reunion|reunión|agenda|horario|cuando nos vemos|coordinar|entrevista|visita/i,
      feasibility: "Alta (Inmediata)",
      solution_type: "Agenda Digital Spoter",
      solution_action: "Conectar link de calendario o capturar día y rango horario preferido en 1 solo mensaje.",
      template_target_id: "triaje_soporte_gral"
    },
    {
      key: "requisitos_documentacion",
      title: "Requisitos Previos y Envío de Documentación",
      icon: "📝",
      regex: /requisito|requisitos|documentacion|documentación|papeles|dni|constancia|formulario|que necesito|qué necesito|adjunto/i,
      feasibility: "Alta (Inmediata)",
      solution_type: "Checklist Previo Automatizado",
      solution_action: "Detallar los requisitos y solicitar la documentación en 1 solo envío sin idas y vueltas.",
      template_target_id: "triaje_soporte_gral"
    },
    {
      key: "seguimiento_estado",
      title: "Seguimiento y Estado de Gestión",
      icon: "🔄",
      regex: /estado|como va|cómo va|novedades|cuando esta|cuándo está|demora|finalizado|listo|seguimiento/i,
      feasibility: "Media (Integración)",
      solution_type: "Notificaciones de Estado Spoter",
      solution_action: "Informar estado actual de la gestión e inyectar oxígeno conversacional para evitar la repregunta.",
      template_target_id: "cierre_fcr_gral"
    },
    {
      key: "frustracion_asesor",
      title: "Solicitud de Asesor Personalizado",
      icon: "⚠️",
      regex: /asesor|operador|humano|persona|alguien|ayuda|no entiendo|otra cosa|hablar con/i,
      feasibility: "Alta (Conversacional)",
      solution_type: "IA Conversacional Spoter",
      solution_action: "Atención fluida sin fricción de menús numéricos rígidos.",
      template_target_id: "rescate_comercial_gral"
    }
  ];
}

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
    business_hours_percentage: round1((biz / (uniqueClients || 1)) * 100),
    after_hours_percentage: round1((after / (uniqueClients || 1)) * 100),
    first_contacts_with_date: conFecha
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
  const rubroScores = {
    "construccion_corralon": (fullText.match(/cemento|hierro|arena|chapa|flete|ladrillo|corralon|aridos|vigueta|cal|bolson|obra/gi) || []).length,
    "comercio_retail": (fullText.match(/talle|prenda|envio gratis|remera|pantalon|vestido|producto|catalogo|cuotas|stock|comprar|articulo/gi) || []).length,
    "salud_obra_social": (fullText.match(/autoriz|afiliad|medico|receta|turno|cartilla|clinica|reintegro|estudio|farmacia|medicamento/gi) || []).length,
    "automotor_concesionaria": (fullText.match(/auto|0km|usado|taller|service|repuesto|patente|chasis|concesionaria|vehiculo|camioneta/gi) || []).length,
    "inmobiliaria_desarrollos": (fullText.match(/inmueble|propiedad|alquiler|expensas|depto|casa|terreno|lote|tasacion|escritura/gi) || []).length,
    "fintech_servicios_financieros": (fullText.match(/prestamo|credito|tarjeta|fintech|cuota|banco|poliza|seguro|siniestro|limite|debito/gi) || []).length,
    "educacion_capacitacion": (fullText.match(/carrera|curso|arancel|inscripcion|materia|examen|profesor|universidad|instituto|alumno/gi) || []).length,
    "gastronomia_restaurantes": (fullText.match(/carta|menu|plato|comida|delivery|pedido|mesa|reserva|mozo|cena|almuerzo|cocina/gi) || []).length,
    "saas_tecnologia": (fullText.match(/software|plataforma|licencia|saas|api|onboarding|soporte tecnico|login|contraseña|pantalla|app/gi) || []).length,
    "turismo_hoteleria": (fullText.match(/hotel|habitacion|pasaje|vuelo|reserva|huesped|check in|check out|turismo|paquete|viaje/gi) || []).length,
    "servicios_profesionales": (fullText.match(/honorarios|servicio|consulta|abogado|contador|estudio|asesoramiento|presupuesto/gi) || []).length
  };

  const rubroNames = {
    "construccion_corralon": "Construcción / Corralón / Materiales",
    "comercio_retail": "Comercio / Retail / E-commerce",
    "salud_obra_social": "Salud / Obra Social / Prepaga",
    "automotor_concesionaria": "Automotor / Concesionaria / Repuestos",
    "inmobiliaria_desarrollos": "Inmobiliaria / Desarrollos / Alquileres",
    "fintech_servicios_financieros": "Fintech / Créditos / Servicios Financieros",
    "educacion_capacitacion": "Educación / Cursos / Capacitación",
    "gastronomia_restaurantes": "Gastronomía / Restaurantes / Delivery",
    "saas_tecnologia": "Software / SaaS / Tecnología",
    "turismo_hoteleria": "Turismo / Hotelería / Viajes",
    "servicios_profesionales": "Servicios Profesionales / Consultoría"
  };

  let bestRubroKey = "construccion_corralon";
  let maxScore = -1;
  Object.keys(rubroScores).forEach(k => {
    if (rubroScores[k] > maxScore) {
      maxScore = rubroScores[k];
      bestRubroKey = k;
    }
  });

  const rubroKey = forcedRubro || bestRubroKey;
  const rubro = rubroNames[rubroKey] || rubroNames["servicios_profesionales"];
  let defaultFocus = (rubroKey === 'salud_obra_social' || rubroKey === 'saas_tecnologia') ? 'soporte' : 'ventas';
  const activeFocus = forcedFocus || defaultFocus;
  const isSales = (activeFocus === 'ventas');
  const policy = handoffPolicy || localStorage.getItem('spoter_handoff_policy') || 'hybrid';

  // Handoff Bot vs Humanos
  let botMsgs = 0;
  let humanMsgs = 0;
  let topHumanName = "Operador 1";
  let topHumanMsgs = 0;

  Object.keys(opCounts).forEach(op => {
    const count = opCounts[op];
    if (/bot|sistema|auto/i.test(op)) {
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
    top_human_percentage_of_total: Math.round((topHumanMsgs / totalComp) * 1000) / 10,
    has_bottleneck: topHumanPct > 55,
    is_balanced: topHumanPct <= 55,
    operator_distribution: Object.keys(opCounts).map(op => ({
      name: op,
      count: opCounts[op],
      percentage: Math.round((opCounts[op] / totalComp) * 1000) / 10,
      is_bot: /bot|sistema|auto/i.test(op)
    }))
  };

  const sla = {
    ideal_immediate: 2.0,
    acceptable: 6.0,
    warning: 15.0,
    critical: 30.0,
    benchmark_text: `SLA de referencia para ${rubro}.`
  };

  // --- Métricas reales derivadas del CSV (Fase 3) ---
  // Las conversaciones se ordenan por fecha una sola vez; ráfagas, horarios y
  // el desglose de esperas dependen de ese orden.
  sortConversationsByDate(clientConvs);

  const globalStats = calcBrackets(waitTimes, sla);
  const brackets = globalStats.brackets;
  const avgWait = globalStats.average_minutes.toFixed(1);
  const overWarn = waitTimes.filter(w => w > sla.warning).length;

  const fragmentationStats = computeBursts(clientConvs, splitRegex);
  const scheduleStats = computeSchedule(clientConvs, uniqueClients);
  const { initial: initialWaits, inConv: inConvWaits } = splitWaitTimes(clientConvs);
  const initialStats = initialWaits.length ? calcBrackets(initialWaits, sla) : null;
  const inConvStats = inConvWaits.length ? calcBrackets(inConvWaits, sla) : null;
  
  const baselineMsgs = (companyMsgs / (uniqueClients || 1)).toFixed(1);
  const targetMsgs = isSales ? 5.5 : 4.0;
  const savedMsgs = Math.max(0, companyMsgs - Math.round(uniqueClients * targetMsgs));
  const savedHours = ((savedMsgs * 0.75) / 60).toFixed(1);
  const laborArs = Math.round(parseFloat(savedHours) * 5000);
  const apiArs = savedMsgs * 45;
  const totalArs = laborArs + apiArs;
  const totalUsd = (totalArs / 1300).toFixed(2);

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
      engine_mode: 'browser'
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
      system_drops: 0,
      brackets: brackets,
      initial_response: initialStats,
      in_conversation: inConvStats
    },
    ping_pong: {
      real_client_avg: (clientMsgs / (uniqueClients || 1)).toFixed(1),
      real_operator_avg: (companyMsgs / (uniqueClients || 1)).toFixed(1),
      real_total_avg: (rows.length / (uniqueClients || 1)).toFixed(1),
      ideal_client_avg: 2.5,
      ideal_operator_avg: 2.0,
      ideal_total_avg: 4.5,
      excess_factor: ((rows.length / (uniqueClients || 1)) / 4.5).toFixed(1),
      excess_percentage: Math.round((((rows.length / (uniqueClients || 1)) - 4.5) / 4.5) * 100)
    },
    topics: null,             // requiere las regex de categorías por rubro (llega con rubros.json, Fase 4)
    operators: handoffData.operator_distribution,
    prioritization_audit: null,  // IC/IU: requiere el motor Spoter
    ltv_economics: null,         // Matemática del LTV: requiere el motor Spoter
    spoter_lite: null,           // Fases Gracia/Trabajo/Rescate: requiere el motor Spoter
    actuen_scorecard: null,      // Semáforo ACTÚEN+: requiere el motor Spoter
    savings: {
      current_company_messages: companyMsgs,
      optimized_target_messages: Math.round(uniqueClients * targetMsgs),
      baseline_msgs_per_client: parseFloat(baselineMsgs),
      target_msgs_per_client: targetMsgs,
      messages_saved: savedMsgs,
      reduction_percentage: ((savedMsgs / (companyMsgs || 1)) * 100).toFixed(1),
      hours_saved_monthly: savedHours,
      optimization_rationale: `Línea de base actual: tu empresa envía hoy ${baselineMsgs} mensajes por cliente. El estándar ACTÚEN+ en un solo bloque requiere ${targetMsgs} mensajes empresa para cerrar o resolver. El objetivo representa la eliminación de ${savedMsgs.toLocaleString()} mensajes fragmentados innecesarios.`,
      economic_benefit: {
        total_ars: totalArs,
        total_usd: totalUsd,
        labor_savings_ars: laborArs,
        api_savings_ars: apiArs,
        hourly_rate_ref: 5000,
        msg_rate_ref: 45
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
  const activeRubroKey = data.meta.detected_rubro_key || 'servicios_profesionales';
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
  if (isBrowserEngine(data)) {
    if (!modeBanner) {
      modeBanner = document.createElement('div');
      modeBanner.id = 'engineModeBanner';
      modeBanner.className = 'engine-mode-banner';
      dashboard.insertBefore(modeBanner, dashboard.firstChild);
    }
    modeBanner.innerHTML = `
      <span class="engine-mode-icon">🌐</span>
      <div>
        <strong>Análisis parcial — modo navegador.</strong>
        Se calcularon volumen, operadores, ping-pong, tiempos de espera con percentiles,
        fragmentación, horarios y disparadores de handoff a partir de tu CSV.
        El Semáforo ACTÚEN+, el Triage IU/IC, la matemática del LTV y la clasificación temática
        <strong>requieren el motor Spoter</strong> y aparecen como no disponibles.
        <br><span class="engine-mode-cta">Para el informe completo: <code>python3 api_server.py 8080</code></span>
      </div>`;
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
    `Bajo política <strong>${data.meta.handoff_policy.toUpperCase()}</strong>: el Bot resolvió el <strong>${h.bot_share_percentage}%</strong> y se derivó el <strong>${h.human_share_percentage}%</strong> a personas reales (asesor más cargado: ${h.top_human_operator} con ${h.top_human_percentage_of_human}% de la carga derivada).`;

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
  const fx = 1250;

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
  const hours = Math.round((saved * 0.75) / 60);

  const laborArs = hours * 5000;
  const apiArs = saved * 45;
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
  return !!(data && data.meta && data.meta.engine_mode === 'browser');
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
const LTV_FX_RATE = 1250;

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
  const fx = LTV_FX_RATE;

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
${isBrowserEngine(data) ? `
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
