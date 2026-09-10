# ⚡ Spoter Analizador ACTÚEN+ — Preview

Sitio de **vista previa**. La versión en producción vive en
[spoter-actuen](https://plataformaspoter-glitch.github.io/spoter-actuen/).

Este preview existe para validar dos correcciones antes de llevarlas a producción:

### 1. El modo navegador ya no inventa números

Sin backend —que es el caso de GitHub Pages— el análisis corre íntegramente en el
navegador. Antes ese camino devolvía constantes presentadas como mediciones, así que
cualquier CSV producía el mismo diagnóstico. Ahora el resultado lleva una marca de
procedencia (`engine_mode`) y **toda métrica que el navegador no puede calcular se
muestra como no disponible**, nunca como un número inventado.

**Se calcula de verdad, a partir de tu CSV:** volumen y clientes únicos, detección de
rubro, distribución bot vs. asesores, ping-pong, ahorro proyectado, tiempos de espera
con percentiles, fragmentación por ráfagas, distribución horaria y semanal, y los
disparadores reales de derivación a humano.

**Requiere el motor Spoter:** Semáforo ACTÚEN+, Triage IU/IC, matemática del LTV y
clasificación temática. Aparecen con un aviso explícito.

### 2. Los datos del demo son sintéticos

El lote de prueba ya no contiene datos de un cliente real: empresa, teléfono,
nombres de operadores y frases de conversación son ficticios.

---

## Informe completo

Para obtener las métricas que requieren el motor, se corre localmente:

```bash
python3 api_server.py 8080
```

El servidor no se publica en este sitio.

## Verificación de paridad

Las métricas calculadas en el navegador se validaron contra el motor Python sobre el
mismo archivo: **cero diferencias** en tasa de fragmentación y clases de ráfaga,
percentiles global / primera respuesta / en conversación, las cinco franjas de SLA y
las distribuciones completas de 24 horas y 7 días.
