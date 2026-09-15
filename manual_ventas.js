/**
 * Manual de ventas: interacción y matemática del LTV.
 *
 * Antes la tabla de referencia y la calculadora tenían los números escritos a
 * mano, y se habían separado del catálogo (seguros figuraba con LTV $2.400
 * cuando el catálogo da $1.620; faltaban 4 de los 11 rubros) y aplicaban el
 * modelo transaccional a todos. Ahora todo sale de rubros.json con la misma
 * fórmula que el Analizador: si cambia un ticket o una tasa, cambia acá solo.
 *
 * El cálculo estaba además duplicado en un <script> del <head> que redeclaraba
 * variables: el script de abajo moría con SyntaxError y con él la calculadora,
 * las pestañas SPIN, el acordeón de objeciones y los botones de copiar.
 */
'use strict';

/**
 * Capital en riesgo para N leads perdidos. Espejo del modelo de pérdida de
 * app.js / engine.py: transaccional arriesga el LTV completo más el CAC;
 * cautivo arriesga un ciclo de renovación y no desperdicia CAC.
 */
function calcularPerdida(catalogo, rubroKey, entrada = {}) {
  const rubro = catalogo.rubros[rubroKey];
  const m = rubro.ltv_model;
  const S = catalogo.supuestos_economicos;
  const tipo = rubro.tipo_cliente || 'transaccional';
  const modelo = catalogo.modelo_perdida[tipo];

  const ticket = entrada.ticket != null ? entrada.ticket : m.avg_ticket_usd;
  const freq = entrada.freq != null ? entrada.freq : m.annual_frequency;
  const years = entrada.years != null ? entrada.years : m.retention_years;
  const cac = entrada.cac != null ? entrada.cac : m.cac_usd;
  const leads = entrada.leads != null ? entrada.leads : 10;
  const tasa = rubro.tasa_caida != null ? rubro.tasa_caida : S.tasa_caida_conversion;

  const ltv = Math.round(ticket * freq * years);
  const ciclo = Math.round(ticket * freq);
  const base = modelo.base === 'ciclo_renovacion' ? ciclo : ltv;
  const ingreso = Math.round(leads * base * tasa);
  const cacPerdido = modelo.incluye_cac ? Math.round(leads * cac) : 0;
  const total = ingreso + cacPerdido;
  return {
    tipo, modelo, tasa, ltv, ciclo, base, ingreso, cacPerdido, total,
    recuperable: Math.round(total * S.tasa_recuperacion_spoter),
    tasaRecuperacion: S.tasa_recuperacion_spoter,
  };
}

if (typeof module !== 'undefined') module.exports = { calcularPerdida };

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = n => '$' + Math.round(n).toLocaleString('en-US') + ' USD';
  const num = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  // --- Tema ---------------------------------------------------------------
  const btnTheme = $('btnThemeToggle');
  let temaGuardado = null;
  try { temaGuardado = localStorage.getItem('spoter_manual_theme'); } catch (e) { /* sin almacenamiento */ }
  const tema = temaGuardado || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', tema);
  if (btnTheme) {
    btnTheme.textContent = tema === 'dark' ? '🌙' : '☀️';
    btnTheme.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('spoter_manual_theme', next); } catch (e) { /* sin almacenamiento */ }
      btnTheme.textContent = next === 'dark' ? '🌙' : '☀️';
    });
  }

  // --- Pestañas SPIN ------------------------------------------------------
  const spinBtns = document.querySelectorAll('.spin-btn');
  spinBtns.forEach(btn => btn.addEventListener('click', () => {
    spinBtns.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.spin-content-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = $(btn.getAttribute('data-target'));
    if (target) target.classList.add('active');
  }));

  // --- Acordeón de objeciones --------------------------------------------
  document.querySelectorAll('.objection-header').forEach(h =>
    h.addEventListener('click', () => h.parentElement.classList.toggle('open')));

  // --- Copiar -------------------------------------------------------------
  const toast = $('toastMsg');
  document.querySelectorAll('.btn-copy-mini').forEach(btn => btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-copy');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast.textContent = '📋 Copiado al portapapeles';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }).catch(() => {
      toast.textContent = '⚠️ No se pudo copiar';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    });
  }));

  // --- Índice lateral activo ----------------------------------------------
  const sections = document.querySelectorAll('.playbook-section');
  const navLinks = document.querySelectorAll('.sidebar-link');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 100) current = s.id; });
    navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === `#${current}`));
  });

  // --- LTV: tabla y calculadora desde el catálogo -------------------------
  let catalogo = null;
  let moneda = 'USD';

  function renderTabla() {
    const filas = Object.entries(catalogo.rubros).map(([clave, r]) => {
      const m = r.ltv_model;
      const p = calcularPerdida(catalogo, clave, { leads: 10 });
      const cautivo = p.tipo === 'cautivo';
      return `<tr>
        <td><strong>${r.icon} ${esc(r.name)}</strong><br><span class="ltv-tipo ltv-tipo--${p.tipo}">${cautivo ? 'Cautivo' : 'Transaccional'}</span></td>
        <td>${usd(m.avg_ticket_usd)}<br><span class="ltv-sub">${esc(m.ticket_name)}</span></td>
        <td>${num(m.annual_frequency)} / año</td>
        <td>${num(m.retention_years)} años</td>
        <td class="text-good"><strong>${usd(p.ltv)}</strong></td>
        <td>${cautivo ? `Un ciclo: ${usd(p.ciclo)}` : 'LTV completo'}<br><span class="ltv-sub">caída ${Math.round(p.tasa * 100)}%${cautivo ? ' · sin CAC' : ` · + CAC ${usd(m.cac_usd)}`}</span></td>
        <td class="text-bad"><strong>${usd(p.total)}</strong> en riesgo</td>
      </tr>`;
    }).join('');
    $('tablaLtvCuerpo').innerHTML = filas;
  }

  function leer(id) { return parseFloat($(id).value) || 0; }
  function aUsd(v) { return moneda === 'ARS' ? v / catalogo.supuestos_economicos.tipo_cambio_ars : v; }
  function fmt(vUsd) {
    return moneda === 'ARS'
      ? '$' + Math.round(vUsd * catalogo.supuestos_economicos.tipo_cambio_ars).toLocaleString('es-AR') + ' ARS'
      : usd(vUsd);
  }

  function cargarRubro(clave) {
    const m = catalogo.rubros[clave].ltv_model;
    const fx = moneda === 'ARS' ? catalogo.supuestos_economicos.tipo_cambio_ars : 1;
    $('manInputTicket').value = Math.round(m.avg_ticket_usd * fx);
    $('manInputFreq').value = m.annual_frequency;
    $('manInputYears').value = m.retention_years;
    $('manInputCac').value = Math.round(m.cac_usd * fx);
    calcular();
  }

  function calcular() {
    const clave = $('manSelectRubro').value;
    const p = calcularPerdida(catalogo, clave, {
      ticket: aUsd(leer('manInputTicket')), freq: leer('manInputFreq'), years: leer('manInputYears'),
      cac: aUsd(leer('manInputCac')), leads: leer('manInputLeads'),
    });
    const cautivo = p.tipo === 'cautivo';
    $('manResLtvUnit').textContent = fmt(p.ltv);
    $('manResCapitalDestroyed').textContent = fmt(p.total);
    $('manResCacLost').textContent = cautivo ? 'No aplica' : fmt(p.cacPerdido);
    $('manResRecovered').textContent = fmt(p.recuperable);
    $('lblManRecovered').textContent = `Recuperable con Spoter (${Math.round(p.tasaRecuperacion * 100)}%)`;
    $('manModelo').innerHTML = `<strong>${esc(p.modelo.titulo)}</strong> · se arriesga ${cautivo
      ? `un ciclo de renovación (${fmt(p.ciclo)}) con caída del ${Math.round(p.tasa * 100)}%, sin CAC`
      : `el LTV completo con caída del ${Math.round(p.tasa * 100)}%, más el CAC`}. ${esc(p.modelo.explicacion)}`;
  }

  function cambiarMoneda(nueva) {
    if (nueva === moneda) return;
    const fx = catalogo.supuestos_economicos.tipo_cambio_ars;
    ['manInputTicket', 'manInputCac'].forEach(id => {
      $(id).value = Math.round(nueva === 'ARS' ? leer(id) * fx : leer(id) / fx);
    });
    moneda = nueva;
    $('btnManualUsd').classList.toggle('active', moneda === 'USD');
    $('btnManualArs').classList.toggle('active', moneda === 'ARS');
    $('lblManTicket').textContent = `Ticket Promedio ($ ${moneda}):`;
    $('lblManCac').textContent = `CAC Estimado Pauta ($ ${moneda}):`;
    calcular();
  }

  async function iniciarLtv() {
    try {
      const res = await fetch('rubros.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      catalogo = await res.json();
    } catch (e) {
      $('tablaLtvCuerpo').innerHTML = `<tr><td colspan="7">No se pudo cargar rubros.json (${esc(e.message)}): la tabla y la calculadora necesitan el catálogo.</td></tr>`;
      return;
    }
    const sel = $('manSelectRubro');
    sel.innerHTML = Object.entries(catalogo.rubros)
      .map(([k, r]) => `<option value="${k}">${r.icon} ${esc(r.name)}</option>`).join('');
    sel.value = 'construccion_corralon';
    sel.addEventListener('change', () => cargarRubro(sel.value));
    ['manInputTicket', 'manInputFreq', 'manInputYears', 'manInputLeads', 'manInputCac']
      .forEach(id => $(id).addEventListener('input', calcular));
    $('btnManualUsd').addEventListener('click', () => cambiarMoneda('USD'));
    $('btnManualArs').addEventListener('click', () => cambiarMoneda('ARS'));
    $('fxNota').textContent = `Tipo de cambio de referencia: $${catalogo.supuestos_economicos.tipo_cambio_ars.toLocaleString('es-AR')} ARS por USD (rubros.json).`;
    renderTabla();
    cargarRubro(sel.value);
  }

  iniciarLtv();
}
