/**
 * La capa de IA del taller: solo aparece con sesión iniciada.
 *
 * El taller sigue funcionando igual sin esto (gratis, instantáneo y sin que
 * nada salga del equipo). Este archivo agrega el botón "Mejorar con IA" a cada
 * tarjeta y muestra el resultado con su verificación: qué escribió la IA, qué
 * cambió por pilar y qué marcadores hay que completar.
 */
'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let sesion = null;

  async function estadoDeSesion() {
    // En GitHub Pages no hay servidor: ni se pregunta, así la consola queda limpia.
    if (/\.github\.io$/i.test(location.hostname)) return null;
    try {
      const r = await fetch('/api/sesion');
      if (!r.ok) return null;
      const d = await r.json();
      return d.sesion ? d : null;
    } catch (e) {
      return null;   // sin backend (la demo pública), el taller queda como siempre
    }
  }

  function barraDeSesion() {
    const caja = document.createElement('div');
    caja.className = 'tl-sesion';
    caja.innerHTML = `
      <span>Conectado como <strong>${esc(sesion.email)}</strong>${sesion.rol === 'admin' ? ' · admin' : ''}</span>
      <span class="tl-sesion-cupo" id="tlCupo"></span>
      <span style="display:flex; gap:8px">
        ${sesion.rol === 'admin' ? '<a class="btn btn-secondary" href="admin.html" style="text-decoration:none">⚙️ Administración</a>' : ''}
        <button class="btn btn-secondary" id="tlSalir">Cerrar sesión</button>
      </span>`;
    document.querySelector('.tl-metodo').before(caja);
    $('tlSalir').addEventListener('click', async () => {
      await fetch('/api/sesion', { method: 'DELETE' });
      location.reload();
    });
    mostrarCupo(sesion.cuota);
  }

  function mostrarCupo(cuota) {
    if (!cuota) return;
    $('tlCupo').textContent = cuota.puede_usar_ia
      ? `${cuota.respuestas_restantes} mejoras con IA este mes · US$${cuota.presupuesto_restante_usd.toFixed(2)} disponibles`
      : `Sin cupo de IA: ${cuota.motivo}`;
  }

  /** Agrega los botones a cada tarjeta, cada vez que el taller vuelve a dibujar. */
  function agregarBotones() {
    document.querySelectorAll('.tl-card .tl-acciones').forEach(acciones => {
      if (acciones.querySelector('.tl-ia')) return;
      const mejorar = document.createElement('button');
      mejorar.className = 'btn btn-secondary tl-ia';
      mejorar.textContent = '✨ Mejorar con IA';
      mejorar.title = 'Reescribe esta respuesta con IA y la verifica con las reglas del método';
      acciones.appendChild(mejorar);

      const preguntar = document.createElement('button');
      preguntar.className = 'btn btn-secondary tl-tutor-abrir';
      preguntar.textContent = '🎓 Preguntar';
      preguntar.title = 'Preguntá por qué falla un pilar o qué le falta a esta respuesta';
      acciones.appendChild(preguntar);
    });
  }

  // --- Tutor: preguntas sobre el diagnóstico de una respuesta --------------
  const SUGERENCIAS = ['¿Por qué falla ese pilar?', '¿Qué le falta a esta respuesta?', '¿Cómo la cierro mejor?'];

  function abrirTutor(card) {
    let chat = card.querySelector('.tl-tutor');
    if (chat) { chat.hidden = !chat.hidden; if (!chat.hidden) chat.querySelector('input').focus(); return; }

    chat = document.createElement('div');
    chat.className = 'tl-tutor';
    chat.innerHTML = `
      <div class="tl-tutor-hilo"></div>
      <div class="tl-tutor-sugerencias">${SUGERENCIAS.map(s => `<button type="button" class="tl-tutor-sug">${esc(s)}</button>`).join('')}</div>
      <form class="tl-tutor-form">
        <input type="text" placeholder="Preguntá sobre esta respuesta…" maxlength="500" aria-label="Pregunta para el tutor">
        <button class="btn btn-secondary" type="submit">Enviar</button>
      </form>
      <p class="tl-sub">Explica el diagnóstico; no inventa datos de tu negocio. El semáforo sale de las reglas, no de la IA.</p>`;
    card.querySelector('.tl-grid').appendChild(chat);

    chat.querySelectorAll('.tl-tutor-sug').forEach(b => b.addEventListener('click', () => {
      chat.querySelector('input').value = b.textContent;
      chat.querySelector('form').requestSubmit();
    }));
    chat.querySelector('form').addEventListener('submit', ev => {
      ev.preventDefault();
      preguntar(card, chat);
    });
    chat.querySelector('input').focus();
  }

  function burbuja(hilo, de, texto) {
    const div = document.createElement('div');
    div.className = `tl-tutor-msg tl-tutor-msg--${de}`;
    div.textContent = texto;
    hilo.appendChild(div);
    hilo.scrollTop = hilo.scrollHeight;
    return div;
  }

  async function preguntar(card, chat) {
    const input = chat.querySelector('input');
    const pregunta = input.value.trim();
    if (!pregunta) return;
    const hilo = chat.querySelector('.tl-tutor-hilo');
    const idx = Number(card.dataset.resp);
    const estado = window.estadoDelTaller && window.estadoDelTaller();

    input.value = '';
    burbuja(hilo, 'cliente', pregunta);
    const esperando = burbuja(hilo, 'tutor', 'Pensando…');

    // Se manda lo que ya se conversó, para que no repregunte lo mismo.
    const historial = [...hilo.querySelectorAll('.tl-tutor-msg')].slice(0, -2).map(m => ({
      de: m.classList.contains('tl-tutor-msg--tutor') ? 'tutor' : 'cliente', texto: m.textContent,
    }));

    try {
      const r = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pregunta,
          respuesta: (estado && estado.respuestas[idx]) || '',
          rubro: (estado && estado.rubro) || null,
          historial,
        }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        esperando.textContent = datos.error || 'No se pudo responder.';
        if (datos.cuota) mostrarCupo(datos.cuota);
        return;
      }
      esperando.textContent = datos.respuesta;
      if (datos.origen !== 'ia') esperando.classList.add('tl-tutor-msg--aviso');
      mostrarCupo(datos.cuota);
    } catch (e) {
      esperando.textContent = 'No se pudo contactar al servidor.';
    }
  }

  function pilarLinea(letra, texto) {
    return `<li><b>${esc(letra)}</b> ${esc(texto)}</li>`;
  }

  function render(card, datos) {
    const caja = card.querySelector('.tl-ia-resultado') || document.createElement('div');
    caja.className = 'tl-ia-resultado';
    const deIa = datos.origen === 'ia';
    const cambios = Object.entries(datos.cambios || {}).filter(([, v]) => v);

    caja.innerHTML = `
      <div class="tl-ia-cabecera">
        <span class="tl-ia-sello ${deIa ? 'tl-ia-sello--ok' : 'tl-ia-sello--borrador'}">
          ${deIa ? '✨ Versión con IA · verificada por las reglas' : '📐 Borrador del método'}
        </span>
        <span class="tl-score">${datos.puntaje_original} → <strong>${deIa ? datos.puntaje_ia : datos.puntaje_borrador}</strong> / ${datos.maximo} pilares</span>
      </div>
      ${deIa ? '' : `<p class="tl-ia-motivo">La IA no pasó el control, así que se muestra el borrador:<br>${(datos.motivo || []).map(m => `• ${esc(m)}`).join('<br>')}</p>`}
      <pre class="tl-ia-texto">${esc(datos.respuesta)}</pre>
      ${datos.version_corta ? `<details class="tl-ia-extra"><summary>Versión corta</summary><pre class="tl-ia-texto">${esc(datos.version_corta)}</pre></details>` : ''}
      ${cambios.length ? `<details class="tl-ia-extra" open><summary>Qué cambió</summary><ul class="tl-ia-cambios">${cambios.map(([l, t]) => pilarLinea(l, t)).join('')}</ul></details>` : ''}
      ${(datos.marcadores || []).length ? `<details class="tl-ia-extra" open><summary>Completá antes de enviar</summary><ul class="tl-ia-cambios">${datos.marcadores.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}
      <div class="tl-acciones" style="margin-top:10px">
        <button class="btn btn-primary tl-ia-copiar">📋 Copiar esta versión</button>
        <button class="btn btn-secondary tl-ia-guardar">💾 Guardar en mi biblioteca</button>
      </div>`;
    if (!card.contains(caja)) card.querySelector('.tl-grid').appendChild(caja);

    caja.querySelector('.tl-ia-guardar').addEventListener('click', ev => {
      const idx = Number(card.dataset.resp);
      const estado = window.estadoDelTaller && window.estadoDelTaller();
      guardar(ev.target, {
        texto: datos.respuesta,
        original: (estado && estado.respuestas[idx]) || '',
        rubro: datos.rubro,
        origen: datos.origen === 'ia' ? 'ia' : 'borrador',
        atajo: card.querySelector('.tl-atajo-input') ? card.querySelector('.tl-atajo-input').value : '',
        titulo: card.querySelector('.tl-intencion') ? card.querySelector('.tl-intencion').textContent.trim() : '',
      });
    });

    caja.querySelector('.tl-ia-copiar').addEventListener('click', async ev => {
      try {
        await navigator.clipboard.writeText(datos.respuesta);
        ev.target.textContent = '✅ Copiada';
      } catch (e) { ev.target.textContent = '⚠️ No se pudo copiar'; }
      setTimeout(() => { ev.target.textContent = '📋 Copiar esta versión'; }, 1800);
    });
  }

  async function mejorar(card, boton) {
    const idx = Number(card.dataset.resp);
    const entrada = (window.estadoDelTaller && window.estadoDelTaller().respuestas[idx]) || '';
    const rubro = (window.estadoDelTaller && window.estadoDelTaller().rubro) || null;
    if (!entrada) return;

    boton.disabled = true;
    boton.textContent = '✨ Pensando…';
    try {
      const r = await fetch('/api/redactar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuesta: entrada, rubro }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(datos.error || 'No se pudo mejorar la respuesta.');
        if (datos.cuota) mostrarCupo(datos.cuota);
        return;
      }
      render(card, datos);
      mostrarCupo(datos.cuota);
    } catch (e) {
      alert('No se pudo contactar al servidor.');
    } finally {
      boton.disabled = false;
      boton.textContent = '✨ Mejorar con IA';
    }
  }

  // --- Biblioteca guardada en el servidor ---------------------------------
  async function guardar(boton, datos) {
    const etiqueta = boton.textContent;
    boton.disabled = true;
    boton.textContent = '💾 Guardando…';
    try {
      const r = await fetch('/api/respuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) { alert(cuerpo.error || 'No se pudo guardar.'); return; }
      boton.textContent = '✅ Guardada';
      await cargarGuardadas();
    } catch (e) {
      alert('No se pudo contactar al servidor.');
    } finally {
      boton.disabled = false;
      setTimeout(() => { boton.textContent = etiqueta; }, 1800);
    }
  }

  function historial(r) {
    const v = r.versiones || [];
    if (v.length < 2) return '';
    const puntajes = v.map(x => `${x.puntaje}`).join(' → ');
    return `<span class="tl-sub">Historial: ${esc(puntajes)} de ${r.maximo} pilares</span>`;
  }

  async function cargarGuardadas() {
    const caja = $('guardadasIA');
    if (!caja) return;
    let respuestas = [];
    try {
      const r = await fetch('/api/respuestas');
      if (!r.ok) return;
      ({ respuestas } = await r.json());
    } catch (e) { return; }

    if (!respuestas.length) { caja.hidden = true; caja.innerHTML = ''; return; }
    caja.hidden = false;
    caja.innerHTML = `
      <header class="tl-res-head">
        <h3>💾 Mis respuestas guardadas <span class="tl-sub">(${respuestas.length})</span></h3>
        <button class="btn btn-secondary" id="btnGuardadasJson">⬇️ Descargar atajos</button>
      </header>
      ${respuestas.map(r => `
        <article class="tl-bib-item" data-id="${esc(r.id)}">
          <header>
            <code>${esc(r.atajo || '')}</code>
            <strong>${esc(r.titulo || '')}</strong>
            <span class="tl-sub">${r.puntaje}/${r.maximo} pilares · ${esc(r.origen === 'ia' ? 'con IA' : 'del método')}</span>
            ${historial(r)}
          </header>
          <pre class="tl-ia-texto">${esc(r.texto)}</pre>
          <div class="tl-acciones">
            <button class="btn btn-secondary tl-guardada-copiar">📋 Copiar</button>
            <button class="btn btn-secondary tl-guardada-borrar">🗑️ Borrar</button>
          </div>
        </article>`).join('')}`;

    caja.querySelectorAll('.tl-guardada-copiar').forEach(b => b.addEventListener('click', async ev => {
      const texto = ev.target.closest('.tl-bib-item').querySelector('pre').textContent;
      try { await navigator.clipboard.writeText(texto); ev.target.textContent = '✅ Copiada'; }
      catch (e) { ev.target.textContent = '⚠️ No se pudo'; }
      setTimeout(() => { ev.target.textContent = '📋 Copiar'; }, 1800);
    }));
    caja.querySelectorAll('.tl-guardada-borrar').forEach(b => b.addEventListener('click', async ev => {
      const item = ev.target.closest('.tl-bib-item');
      if (!confirm('¿Borrar esta respuesta guardada?')) return;
      await fetch('/api/respuestas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.dataset.id }) });
      await cargarGuardadas();
    }));
    $('btnGuardadasJson').addEventListener('click', () => {
      // Mismo formato que exporta el Analizador y el taller sin sesión.
      const paquete = construirAtajos(respuestas.map(r => ({
        atajo: r.atajo, titulo: r.titulo, categoria: 'Taller ACTÚEN+', texto: r.texto,
      })), { origen: 'biblioteca', rubro: (respuestas[0] || {}).rubro });
      const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mis_atajos_spoter.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  // --- Bibliotecario: el lote completo ------------------------------------
  function botonBiblioteca() {
    const barra = $('barraPrompt');
    if (!barra || barra.querySelector('#btnBibliotecaIA')) return;
    const caja = document.createElement('div');
    caja.className = 'tl-exportar';
    caja.innerHTML = `
      <p><strong>¿Y el conjunto?</strong> El Bibliotecario mira todas juntas: cuáles se repiten, cuáles se
        contradicen, qué atajos le faltan a tu rubro y por dónde empezar.</p>
      <button class="btn btn-primary" id="btnBibliotecaIA">📚 Revisar toda la biblioteca con IA</button>`;
    barra.appendChild(caja);
    $('btnBibliotecaIA').addEventListener('click', revisarBiblioteca);
  }

  function listaTextos(items, etiqueta) {
    return items.map(x => `
      <article class="tl-bib-item">
        <header>
          <code>${esc(x.atajo || '')}</code>
          <strong>${esc(x.titulo || '')}</strong>
          ${x.puntaje != null ? `<span class="tl-sub">${x.puntaje}/5 pilares</span>` : ''}
        </header>
        ${x.por_que ? `<p class="tl-sub">${esc(x.por_que)}</p>` : ''}
        ${x.cuando ? `<p class="tl-sub">Cuándo usarla: ${esc(x.cuando)}</p>` : ''}
        ${Array.isArray(x.respuestas) && x.respuestas.length
          ? `<p class="tl-sub">Reemplaza a: ${x.respuestas.map(n => `respuesta ${Number(n) + 1}`).join(', ')}</p>` : ''}
        <pre class="tl-ia-texto">${esc(x.texto || '')}</pre>
        <button class="btn btn-secondary tl-bib-copiar" data-texto="${esc(x.texto || '')}">📋 Copiar</button>
      </article>`).join('') || `<p class="tl-sub">Sin ${etiqueta}.</p>`;
  }

  function renderBiblioteca(datos) {
    const caja = $('bibliotecaIA');
    caja.hidden = false;
    if (datos.origen === 'sin_resultado') {
      caja.innerHTML = `<h3>📚 Revisión de la biblioteca</h3>
        <p class="tl-ia-motivo">No se pudo completar: ${(datos.motivo || []).map(esc).join(' · ')}</p>`;
      return;
    }
    caja.innerHTML = `
      <h3>📚 Revisión de la biblioteca</h3>
      ${datos.completo ? '' : '<p class="tl-ia-motivo">Algunas propuestas no pasaron el control de las reglas y se descartaron. Lo que ves acá sí lo pasó.</p>'}
      ${datos.orden_de_trabajo.length ? `<section><h4>Por dónde empezar</h4><ol class="tl-bib-orden">${
        datos.orden_de_trabajo.map(p => `<li><strong>${esc(p.paso || '')}</strong>${p.por_que ? ` — ${esc(p.por_que)}` : ''}</li>`).join('')}</ol></section>` : ''}
      ${datos.contradicciones.length ? `<section><h4>Se contradicen</h4><ul class="tl-bib-orden">${
        datos.contradicciones.map(c => `<li>${(c.respuestas || []).map(n => `Respuesta ${Number(n) + 1}`).join(' y ')}: ${esc(c.problema || '')}</li>`).join('')}</ul></section>` : ''}
      <section><h4>Respuestas unificadas</h4>${listaTextos(datos.grupos, 'respuestas para unificar')}</section>
      <section><h4>Atajos que te faltan</h4>${listaTextos(datos.faltantes, 'faltantes')}</section>
      ${datos.reglas_de_uso.length ? `<section><h4>Reglas para el equipo</h4><ul class="tl-bib-orden">${
        datos.reglas_de_uso.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}
      ${datos.descartados.length ? `<details class="tl-ia-extra"><summary>Qué se descartó y por qué (${datos.descartados.length})</summary>
        <ul class="tl-bib-orden">${datos.descartados.map(d => `<li><code>${esc(d.atajo)}</code>: ${esc((d.fallas || []).join('; '))}</li>`).join('')}</ul></details>` : ''}`;

    caja.querySelectorAll('.tl-bib-copiar').forEach(b => b.addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(ev.target.dataset.texto); ev.target.textContent = '✅ Copiada'; }
      catch (e) { ev.target.textContent = '⚠️ No se pudo copiar'; }
      setTimeout(() => { ev.target.textContent = '📋 Copiar'; }, 1800);
    }));
    caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function revisarBiblioteca() {
    const estado = window.estadoDelTaller && window.estadoDelTaller();
    if (!estado || estado.respuestas.length < 2) {
      alert('Pegá al menos dos respuestas para revisar la biblioteca.');
      return;
    }
    const boton = $('btnBibliotecaIA');
    boton.disabled = true;
    boton.textContent = '📚 Revisando…';
    try {
      const r = await fetch('/api/biblioteca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: estado.respuestas, rubro: estado.rubro }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(datos.error || 'No se pudo revisar la biblioteca.');
        if (datos.cuota) mostrarCupo(datos.cuota);
        return;
      }
      renderBiblioteca(datos);
      mostrarCupo(datos.cuota);
    } catch (e) {
      alert('No se pudo contactar al servidor.');
    } finally {
      boton.disabled = false;
      boton.textContent = '📚 Revisar toda la biblioteca con IA';
    }
  }

  async function iniciar() {
    sesion = await estadoDeSesion();
    if (!sesion) return;
    document.body.classList.add('con-sesion');
    barraDeSesion();
    agregarBotones();
    botonBiblioteca();
    cargarGuardadas();
    // El taller redibuja las tarjetas mientras se escribe: hay que reponerlos.
    new MutationObserver(() => { agregarBotones(); botonBiblioteca(); }).observe($('resultados'), { childList: true });
    $('resultados').addEventListener('click', ev => {
      const mejora = ev.target.closest('.tl-ia');
      if (mejora) { mejorar(mejora.closest('.tl-card'), mejora); return; }
      const tutor = ev.target.closest('.tl-tutor-abrir');
      if (tutor) abrirTutor(tutor.closest('.tl-card'));
    });
  }

  document.addEventListener('DOMContentLoaded', () => { setTimeout(iniciar, 300); });
})();
