# ⚡ Spoter Analizador ACTÚEN+ (v2.6)
### Auditoría conversacional de WhatsApp: fricción, fugas, LTV en riesgo y triage IU/IC

Procesa exportaciones de chats de WhatsApp en CSV y produce un diagnóstico con
números: tiempos de respuesta, fragmentación, ping-pong, distribución bot vs.
asesores, evaluación bajo el **Método ACTÚEN+**, detección automática de rubro
(11 industrias) y foco de negocio, **Índice de Conversión e Índice de Urgencia**,
matemática del **LTV en riesgo** y fases del motor **Spoter Lite**.

**🚀 Demo en vivo:** https://plataformaspoter-glitch.github.io/spoter-actuen/
**📖 Manual de ventas:** https://plataformaspoter-glitch.github.io/spoter-actuen/manual_ventas.html

---

## 🧭 1. Cómo se usa

### Opción A — En el navegador, sin instalar nada

Abrí la demo, arrastrá tus CSV y listo. **El análisis completo corre en la
pestaña**: Semáforo ACTÚEN+, Triage IU/IC, matemática del LTV, Spoter Lite y
clasificación temática incluidos.

Las conversaciones **nunca salen del equipo** — no se sube ningún archivo a
ningún servidor. Es el argumento de privacidad más fuerte del producto y conviene
decirlo en la demo.

### Opción B — Con el motor Python local

Sirve para procesar lotes desde disco, exportar informes por línea de comandos o
integrar el motor en otra herramienta. Produce **exactamente los mismos números**
que el navegador (ver §5).

```bash
python3 api_server.py 8080
```

En macOS hay un lanzador de doble clic: **`Iniciar Analizador.command`**. Cierra
un motor viejo que haya quedado en el puerto, limpia el caché de Python y abre el
navegador recién cuando el servidor responde.

### Requisitos

* **Solo para la opción B:** Python 3.10 o superior. Sin dependencias `pip`: el
  motor y el servidor usan únicamente biblioteca estándar.
* **Navegador moderno** con JavaScript. `Chart.js` y `PapaParse` se cargan desde
  CDN con versión fija.

> ⚠️ **`rubros.json` es obligatorio.** Es la fuente de verdad del catálogo y lo
> consumen los dos motores. Si falta, la aplicación no arranca y avisa
> explícitamente. Al desplegar, copiarlo junto a los HTML.

---

## 🗂️ 2. `rubros.json`: una sola fuente de verdad

Todo dato de negocio vive acá, no en el código. Lo leen `engine.py` y `app.js`,
así que no pueden divergir.

| Sección | Qué define |
| :--- | :--- |
| `rubros` | Los 11 rubros: SLA, modelo de LTV, keywords, categorías, ícono, tipo de cliente |
| `plantillas` | Respuestas maestras por rubro y foco (22 combinaciones) |
| `categorias_gap` | Categorías de derivación a humano con su factibilidad de automatización |
| `supuestos_economicos` | Tipo de cambio, costo hora, costo mensaje, tasas de caída y recuperación |
| `modelo_perdida` | Cómo se calcula el capital en riesgo según el tipo de cliente |
| `entrada` | Alias de columnas y valores aceptados para normalizar CSV de otras plataformas |
| `deteccion_foco`, `deteccion_cierre`, `muestra_frases`, `señales_presenciales` | Umbrales y patrones de las detecciones |
| `pingpong_por_rubro` | Estándar de idas y vueltas calibrado por industria |

**Para cambiar un ticket, un SLA o el tipo de cambio, se edita `rubros.json`.** No
hay que tocar el motor. `tools/generar_rubros_json.py` lo re-emite con formato
consistente, pero el JSON es la autoridad.

---

## 📁 3. Inventario de archivos

```
Analizador ACTUEN/
├── rubros.json                   # ⭐ Fuente única: rubros, plantillas, supuestos. OBLIGATORIO
├── engine.py                     # Motor determinístico (ETL, IC/IU, LTV, Lite, Semáforo, informes)
├── api_server.py                 # Servidor HTTP local. NO se publica: es herramienta de escritorio
├── index.html                    # Aplicación principal
├── app.js                        # Motor del navegador + interfaz. Paridad con engine.py
├── app.css                       # Sistema de diseño (variables, modo claro/oscuro, responsive)
├── sample_data.json              # Lote de prueba anonimizado para la demo
├── manual_ventas.html            # Manual de ventas interactivo
├── MANUAL_DE_VENTAS_ACTUEN_SPOTER.md  # Playbook comercial en Markdown
├── index_v2.4_clasico.html       # Vista clásica de 5 pestañas (comparte app.js)
├── Iniciar Analizador.command    # Lanzador de doble clic para macOS
├── sw.js                         # Desinstala Service Workers residuales de otras PWAs en :8080
├── README.md                     # Este archivo
├── tests/
│   ├── test_engine.py            # 24 tests de regresión (stdlib)
│   └── fixture_demo.csv          # Fixture anonimizado
├── tools/
│   └── generar_rubros_json.py    # Re-emite rubros.json
└── PLAN.md                       # Estado del trabajo y decisiones tomadas
```

**No se publican** `api_server.py`, `PLAN.md`, `tools/` ni `tests/`: el repo es
público y son herramientas locales.

---

## 🔬 4. Qué calcula

### A. Capital en riesgo, con la composición a la vista

Se presenta en **dos bloques separados a propósito**, porque son dos tipos de
plata distintos:

| Bloque | Naturaleza | Escala |
| :--- | :--- | :--- |
| **Ingreso que no se gana** | Proyección sobre el ciclo de vida | Acumulado, USD |
| **Costo que ya se está pagando** | Horas de asesores y mensajería | Mensual, ARS |

No se suman en una sola cifra: mezclar una proyección probabilística con un costo
real da un número más grande pero mucho más fácil de refutar. Cada componente
muestra su fórmula y su supuesto.

### B. Cliente cautivo vs. transaccional

El modelo de pérdida **cambia según el rubro**:

* **Transaccional** (corralón, retail, automotor, inmobiliaria, gastronomía,
  turismo, servicios): el cliente compara y compra donde le respondan. Se arriesga
  el valor de vida completo más el CAC desperdiciado.
* **Cautivo** (salud, seguros, educación, SaaS con contrato): hay contrato,
  carencias o ciclo lectivo, así que una mala atención **no produce una baja
  inmediata**. Se arriesga un ciclo de renovación, con una tasa de caída mucho
  menor y sin CAC desperdiciado — el cliente sigue siendo cliente.

Aplicar el mismo modelo a los dos exagera unos rubros y falsea otros.

### C. Triage IU/IC

* **Índice de Conversión (IC, 0–100):** temperatura del lead a partir de Etapa,
  Intención observable, Engagement, Habilitantes y Reconexión, **leyendo el texto
  de los mensajes**.
* **Índice de Urgencia (IU, 0–100):** ordena la cola del asesor según valor
  estructural, espera contra SLA, compromisos horarios e intención importada.
* **Cuello de botella FIFO:** compara la espera real de los leads calientes contra
  la que tendrían con cola priorizada. El número sale de los datos del cliente, no
  de un valor de folleto.

### D. Semáforo ACTÚEN+

Los 7 pilares puntúan sobre datos del cliente: A y + con el reparto de carga, C
con la fragmentación, T con el SLA del rubro, **U con el IC**, **E con las fases
Spoter Lite** y **N con la tasa de cierres pasivos**.

### E. Demanda presencial

Cuenta las conversaciones donde el cliente menciona el local — ubicación, horario,
retiro, stock, o una demora que vivió ahí — con citas textuales.

> **Lo que deliberadamente no hace:** estimar qué pasa en el mostrador. El CSV no
> lo observa, así que cualquier multiplicador sería un supuesto disfrazado de
> medición. Se muestra demanda presencial medida; el factor de extrapolación, si
> se usa, lo pone el cliente como supuesto propio.

### F. Normalización de entrada

Acepta exports de otras plataformas: alias de columnas (`message`, `phone`,
`from_me`, `timestamp`…), valores de dirección en sus variantes (`Si`, `true`,
`1`, `out`, `saliente`) y fechas en ISO-8601, `dd/mm/aaaa` o epoch.

Un CSV que no se puede interpretar **falla de forma visible**, indicando qué
columna revisar, en vez de producir un informe vacío pero verosímil.

---

## ✅ 5. Verificación

```bash
python3 tests/test_engine.py     # 24 tests, solo biblioteca estándar
```

Cubren normalización de valores y fechas, paridad entre formatos de CSV, error
visible ante un CSV ininterpretable, que el IC lea de verdad el texto, que los
pilares se muevan con los datos, y que los mensajes automáticos no se cuenten como
trabajo humano.

**Paridad entre motores:** el navegador y `engine.py` se verificaron sobre los
mismos archivos con una comparación campo por campo — 17 bloques, 620 campos, cero
diferencias. Hoy esa comparación se corre a mano; automatizarla está pendiente.

---

## 📊 6. Exportación

* **Informe ejecutivo en Markdown** con métricas globales, ahorro económico,
  ping-pong, Semáforo ACTÚEN+, auditoría IU/IC, matemática del LTV y protocolo
  Spoter Lite.
* **Atajos de respuestas maestras en JSON**, listos para importar en WhatsApp
  Business o plataformas de mensajería.
