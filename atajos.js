/**
 * Formato de atajos compartido por el Analizador (index.html) y el Taller.
 *
 * Un solo lugar para que los dos exporten exactamente lo mismo: JSON con el
 * texto completo y las burbujas separadas, y CSV (atajo;titulo;categoria;mensaje)
 * para las plataformas que importan planillas.
 */
'use strict';

/**
 * Atajos en un formato común para el Analizador y el Taller. Cada atajo trae
 * el texto completo y las burbujas separadas por [---saltomensaje---], para
 * las plataformas que las envían por separado.
 */
function construirAtajos(items, meta = {}) {
  const usados = new Set();
  const atajos = items.map((it, i) => {
    let base = String(it.atajo || `/respuesta${i + 1}`).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/_-]/g, '');
    if (!base.startsWith('/')) base = '/' + base;
    if (base === '/') base = `/respuesta${i + 1}`;
    let atajo = base, n = 2;
    while (usados.has(atajo)) atajo = `${base}${n++}`;
    usados.add(atajo);
    const texto = String(it.texto || '');
    return {
      atajo, titulo: it.titulo || '', categoria: it.categoria || '', texto,
      burbujas: texto.split(/\s*\[---saltomensaje---\]\s*/).map(x => x.trim()).filter(Boolean),
    };
  });
  return { formato: 'spoter-atajos', version: 1, origen: meta.origen || '', empresa: meta.empresa || '', rubro: meta.rubro || '', atajos };
}

/** Los mismos atajos en CSV (atajo;titulo;categoria;mensaje), con comillas estándar. */
function atajosACsv(paquete) {
  const celda = v => `"${String(v).replace(/"/g, '""')}"`;
  return ['atajo;titulo;categoria;mensaje']
    .concat(paquete.atajos.map(a => [a.atajo, a.titulo, a.categoria, a.texto].map(celda).join(';')))
    .join('\r\n');
}

if (typeof module !== 'undefined') module.exports = { construirAtajos, atajosACsv };
