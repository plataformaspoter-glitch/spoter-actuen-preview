/**
 * Modo día y noche, para todas las páginas.
 *
 * La elección es UNA sola en todo el producto: se guarda en
 * `spoter_actuen_theme` y se aplica poniendo `data-theme` en el <html>, que es
 * contra lo que están escritas las variables de color. Quien no eligió nunca
 * hereda lo que tenga puesto su sistema operativo.
 *
 * Se carga en el <head> y sin `defer` a propósito: si corriera al final del
 * cuerpo, la página se dibujaría clara y pasaría a oscura de golpe. El botón se
 * conecta cuando el DOM está listo, que es más tarde.
 */
'use strict';

(function () {
  const CLAVE = 'spoter_actuen_theme';

  // En una ventana privada, o con el almacenamiento bloqueado, leer o escribir
  // tira excepción: el tema no es motivo para romper una página.
  const leer = () => { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } };
  const guardar = valor => { try { localStorage.setItem(CLAVE, valor); } catch (e) { /* sin almacenamiento */ } };
  const delSistema = () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  // El tema vive acá y no se lee de vuelta del DOM: así alternar no depende de
  // que el atributo se haya podido escribir.
  let tema = leer() === 'dark' || leer() === 'light' ? leer() : delSistema();

  function aplicar(nuevo) {
    tema = nuevo === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', tema);
    const boton = document.getElementById('btnTheme');
    if (!boton) return;
    boton.textContent = tema === 'dark' ? '🌙' : '☀️';
    boton.setAttribute('aria-label', tema === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche');
    boton.setAttribute('aria-pressed', tema === 'dark' ? 'true' : 'false');
  }

  function alternar() {
    guardar(tema === 'dark' ? 'light' : 'dark');
    aplicar(tema === 'dark' ? 'light' : 'dark');
  }

  function conectar() {
    const boton = document.getElementById('btnTheme');
    if (boton) boton.addEventListener('click', alternar);
    aplicar(tema);            // ahora sí existe el botón: se le pone el ícono
  }

  aplicar(tema);              // antes de que se dibuje nada
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', conectar);
  else conectar();

  // Si lo cambian en otra pestaña, esta lo sigue sin recargar.
  window.addEventListener('storage', ev => {
    if (ev && ev.key === CLAVE && ev.newValue) aplicar(ev.newValue);
  });

  window.temaSpoter = { aplicar, alternar, actual: () => tema };
})();
