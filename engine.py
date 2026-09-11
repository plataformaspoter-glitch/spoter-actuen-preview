"""
Motor Analítico Conversacional Multirubro - Método ACTÚEN+ V2.6
Novedades V2.5 (Algoritmos de Priorización IU/IC, Fugas FIFO, LTV Económico y Motor Lite):
1. Algoritmos de Priorización Quirúrgica: Índice de Conversión (IC 0-100) e Índice de Urgencia (IU 0-100).
2. Detección de Cuello de Botella FIFO: Identifica leads calientes de alto IC demorados por atención secuencial indiscriminada.
3. Auditoría de Ventana de 24 hs WhatsApp (Meta): Medición de oportunidades que violaron la ventana de atención gratuita.
4. Matemática del LTV y Capital en Riesgo: Cálculo del valor de ciclo de vida destruido por la no-atención en Zona Fría.
5. Fases Spoter Lite: Segmentación en Gracia, Trabajo, Rescate y Ruido, detectando leads rescatables abandonados.
Novedades V2.3:
1. Análisis de Horarios y Días de Inicio de Conversación (Heatmap / Distribución horaria y semanal de primeros contactos).
2. Diferenciación inteligente entre Bot (automatización exitosa) y Cuello de Botella Humano.
3. Selector de Política de Handoff (Bot Autoservicio vs Híbrido vs Humano Prioritario).
4. Métricas claras de Ping-Pong (Idas y vueltas de mensajes por caso con semáforo de fricción).
5. Explicación fundamentada del Objetivo de Optimización en base al excedente real de mensajes.
6. Catálogo ampliado de Respuestas Maestras (6+ plantillas especializadas por rubro con soporte para "Ver Más").
"""

import os
import csv
import re
import json
from collections import defaultdict, Counter
from datetime import datetime

# --- Catálogo: fuente única de verdad ------------------------------------------
# rubros.json lo consumen este motor y el navegador. Cualquier dato de rubro,
# plantilla, categoría o supuesto económico va ahí, nunca duplicado en el código.

_RUTA_CATALOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rubros.json')

def _cargar_catalogo():
    try:
        with open(_RUTA_CATALOGO, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        raise SystemExit(
            f"No se encontró rubros.json en {_RUTA_CATALOGO}.\n"
            "Es la fuente de verdad del catálogo. Se regenera con:\n"
            "    python3 tools/generar_rubros_json.py"
        )
    except json.JSONDecodeError as e:
        raise SystemExit(f"rubros.json está corrupto: {e}")

CATALOGO = _cargar_catalogo()
CATALOGO_RUBROS = CATALOGO['rubros']
SUPUESTOS = CATALOGO['supuestos_economicos']
PINGPONG_POR_RUBRO = {k: tuple(v) for k, v in CATALOGO['pingpong_por_rubro'].items()}


def derivar_alias(nombre_empresa):
    """Alias bancario a partir del nombre de la empresa."""
    base = re.sub(r'[^A-Za-z0-9]', '.', (nombre_empresa or '').strip().upper()).strip('.')
    return f"{base}.OFICIAL" if base and base != 'EMPRESA' else 'PAGOS.OFICIALES'


# --- Normalización de valores de entrada -------------------------------------
# Los encabezados de columna se normalizan en parse_files(); acá se normalizan
# los VALORES, que varían según la plataforma que exportó el CSV.

_TRUTHY_PROPIO = {
    'si', 'sí', 'yes', 'y', 'true', 't', '1',
    'out', 'outgoing', 'saliente', 'enviado', 'empresa', 'me',
}

def is_propio(row_or_value):
    """True si el mensaje lo envió la empresa.

    Acepta las variantes de las plataformas soportadas: 'Si' (Spoter),
    'true'/'1' (is_from_me), 'out'/'outgoing' (direction), 'saliente'.
    """
    v = row_or_value.get('Propio', '') if isinstance(row_or_value, dict) else row_or_value
    return str(v or '').strip().lower() in _TRUTHY_PROPIO


_DATE_FORMATS = (
    '%d/%m/%y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M', '%d/%m/%y %H:%M',
    '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d',
    '%d-%m-%Y %H:%M:%S', '%m/%d/%Y %H:%M:%S',
)

def parse_datetime(d_str):
    """Parsea una fecha de CSV. Devuelve datetime.min si no reconoce el formato."""
    if not d_str:
        return datetime.min
    raw = str(d_str).strip()
    if not raw:
        return datetime.min
    # ISO-8601 ('2026-09-03T10:54:00', con o sin zona horaria)
    if 'T' in raw[:11]:
        iso = raw.replace('Z', '+00:00')
        try:
            return datetime.fromisoformat(iso).replace(tzinfo=None)
        except ValueError:
            pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    # Epoch en segundos o milisegundos
    if raw.isdigit():
        try:
            n = int(raw)
            if n > 10_000_000_000:
                n //= 1000
            if 946_684_800 < n < 4_102_444_800:  # entre 2000 y 2100
                return datetime.fromtimestamp(n)
        except (ValueError, OSError, OverflowError):
            pass
    return datetime.min

class ActuenAnalyzer:
    def __init__(self, company_number=None, company_name=None, forced_focus=None, handoff_policy='hybrid'):
        self.company_number = company_number
        self.company_name = company_name
        self.forced_focus = forced_focus
        self.handoff_policy = handoff_policy  # 'bot_priority', 'hybrid', 'human_priority'

        # Catálogo Exhaustivo de Rubros y SLAs
        # Catálogo de rubros: SLAs, modelos de LTV, keywords y categorías.
        # Fuente única en rubros.json — lo consumen también app.js y el navegador.
        self.rubro_catalog = CATALOGO_RUBROS

    def parse_files(self, file_paths):
        all_rows = []
        for path in file_paths:
            if not os.path.exists(path):
                continue
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                sample = f.read(2048)
                f.seek(0)
                delimiter = ';' if ';' in sample else ','
                reader = csv.DictReader(f, delimiter=delimiter)
                for r in reader:
                    clean_row = {}
                    for k, v in r.items():
                        if not k:
                            continue
                        clean_k = k.strip().replace('"', '')
                        clean_v = v.strip() if v else ''
                        clean_row[clean_k] = clean_v

                        k_lower = clean_k.lower().replace(' ', '_').replace('-', '_')
                        if k_lower in ('mensaje', 'message', 'text', 'body'):
                            clean_row['Mensaje'] = clean_v
                        elif k_lower in ('numero', 'número', 'phone', 'telefono', 'teléfono', 'from', 'remitente'):
                            clean_row['Número'] = clean_v
                        elif k_lower in ('destinatario', 'to', 'recipient'):
                            clean_row['Destinatario'] = clean_v
                        elif k_lower in ('propio', 'is_from_me', 'from_me', 'saliente'):
                            clean_row['Propio'] = clean_v
                        elif k_lower in ('tiempo_espera', 'tiempo_de_espera', 'espera', 'wait_time'):
                            clean_row['Tiempo Espera'] = clean_v
                        elif k_lower in ('nombre_operador', 'operador', 'agent', 'asesor'):
                            clean_row['Nombre Operador'] = clean_v
                        elif k_lower in ('fecha_hora', 'fecha', 'timestamp', 'datetime', 'date'):
                            clean_row['Fecha_Hora'] = clean_v
                        elif k_lower in ('nombre', 'name', 'client_name', 'contacto'):
                            clean_row['Nombre'] = clean_v
                    all_rows.append(clean_row)
        return all_rows

    def analyze(self, file_paths, forced_focus=None, handoff_policy=None, forced_rubro=None):
        if forced_focus:
            self.forced_focus = forced_focus
        if handoff_policy:
            self.handoff_policy = handoff_policy
        if forced_rubro and forced_rubro != 'auto':
            self.forced_rubro = forced_rubro
        else:
            self.forced_rubro = None

        rows = self.parse_files(file_paths)
        if not rows:
            return {"error": "No se encontraron registros en los archivos proporcionados"}

        total_rows = len(rows)

        # 1. Detectar automáticamente Número y Nombre de la Empresa
        company_phone_counter = Counter()
        company_name_counter = Counter()
        for r in rows:
            propio = is_propio(r)
            if propio:
                num = r.get('Número', '').strip()
                if num: company_phone_counter[num] += 1
            else:
                dest = r.get('Destinatario', '').strip()
                if dest: company_name_counter[dest] += 1

        detected_company_phone = company_phone_counter.most_common(1)[0][0] if company_phone_counter else (self.company_number or "Empresa")
        detected_company_name = company_name_counter.most_common(1)[0][0] if company_name_counter else (self.company_name or "Empresa")
        
        self.company_number = detected_company_phone
        self.company_name = detected_company_name

        # 2. Reconstruir conversaciones por cliente
        client_conversations = defaultdict(list)
        company_msgs_count = 0
        client_msgs_count = 0
        operator_counts = Counter()
        system_drops = 0
        bot_welcomes = 0
        wait_times = []
        all_client_text_tokens = []
        company_question_samples = []

        parse_date = parse_datetime  # normalizador único a nivel de módulo

        for r in rows:
            propio = is_propio(r)
            msg_text = r.get('Mensaje', '')
            
            if propio:
                # Soporte para atajo de división nativa en Spoter [---saltomensaje---] o similar
                split_parts = [p for p in re.split(r'\s*\[?-*salto[-_]?mensaje-*\]?\s*', msg_text, flags=re.IGNORECASE) if p.strip()] if msg_text else []
                effective_count = max(1, len(split_parts)) if msg_text else 1
                company_msgs_count += effective_count
                op = r.get('Nombre Operador', '').strip() or 'Bot / Sistema'
                operator_counts[op] += effective_count
                client_id = r.get('Destinatario', '').strip()
                if '?' in msg_text and len(msg_text) < 80:
                    company_question_samples.append(msg_text.strip())
            else:
                client_msgs_count += 1
                client_id = r.get('Número', '').strip()
                if msg_text:
                    all_client_text_tokens.append(msg_text.lower())

            if 'fue removido automáticamente' in msg_text or 'operador fue removido' in msg_text:
                system_drops += 1
            if 'gracias por comunicarte' in msg_text.lower() or 'te damos la bienvenida' in msg_text.lower() or 'bienvenido' in msg_text.lower():
                bot_welcomes += 1

            te = r.get('Tiempo Espera', '').strip()
            if te:
                try:
                    val = float(te)
                    wait_times.append(val)
                except: pass

            if client_id and client_id != detected_company_phone and client_id != detected_company_name:
                client_conversations[client_id].append(r)

        unique_clients = len(client_conversations)
        full_client_corpus = ' '.join(all_client_text_tokens)

        # Validación dura: un CSV cuyo mapeo de columnas o de valores falló produce
        # conteos en cero. Antes eso salía como un informe vacío pero verosímil;
        # ahora falla de forma visible, indicando qué columna revisar.
        if company_msgs_count == 0 or unique_clients == 0:
            columnas = sorted({k for r in rows[:50] for k in r.keys()})
            faltantes = [c for c in ('Mensaje', 'Propio', 'Número', 'Destinatario')
                         if not any(r.get(c) for r in rows[:200])]
            detalle = []
            if company_msgs_count == 0:
                detalle.append(
                    "no se identificó ningún mensaje enviado por la empresa "
                    "(la columna 'Propio' debe valer Si/true/1/out para los mensajes salientes)"
                )
            if unique_clients == 0:
                detalle.append(
                    "no se identificó ningún cliente "
                    "(faltan las columnas 'Número' y/o 'Destinatario')"
                )
            return {
                "error": "El CSV se leyó pero no pudo interpretarse: " + "; ".join(detalle) + ".",
                "diagnostico": {
                    "filas_leidas": total_rows,
                    "columnas_detectadas": columnas,
                    "columnas_canonicas_vacias": faltantes,
                    "mensajes_empresa": company_msgs_count,
                    "mensajes_cliente": client_msgs_count,
                    "clientes_unicos": unique_clients,
                }
            }

        # 3. Análisis de Horarios y Días de Inicio (Primer Contacto)
        hourly_distribution = [0] * 24
        weekday_names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
        weekday_distribution = {day: 0 for day in weekday_names}
        business_hours_count = 0
        after_hours_count = 0

        for cid, msgs in client_conversations.items():
            msgs.sort(key=lambda x: parse_date(x.get('Fecha_Hora', '')))
            if msgs:
                first_dt = parse_date(msgs[0].get('Fecha_Hora', ''))
                if first_dt != datetime.min:
                    h = first_dt.hour
                    hourly_distribution[h] += 1
                    w = first_dt.weekday()
                    weekday_distribution[weekday_names[w]] += 1
                    
                    # Horario laboral habitual: Lun a Vie de 8 a 18 hs, Sáb de 8 a 13 hs
                    is_biz = False
                    if w < 5 and 8 <= h < 18:
                        is_biz = True
                    elif w == 5 and 8 <= h < 13:
                        is_biz = True
                    
                    if is_biz: business_hours_count += 1
                    else: after_hours_count += 1

        peak_hour_idx = hourly_distribution.index(max(hourly_distribution)) if any(hourly_distribution) else 10
        peak_day_name = max(weekday_distribution, key=weekday_distribution.get) if any(weekday_distribution.values()) else 'Lunes'

        # Calcular Top 3 picos de horarios de primer contacto
        hourly_indexed = [(h, hourly_distribution[h]) for h in range(24)]
        hourly_sorted = sorted(hourly_indexed, key=lambda x: x[1], reverse=True)
        top_peak_hours = []
        for h, cnt in hourly_sorted[:3]:
            top_peak_hours.append({
                "hour": h,
                "hour_range": f"{h:02d}:00 a {h+1:02d}:00 hs",
                "count": cnt,
                "percentage": round((cnt / (unique_clients or 1)) * 100, 1)
            })

        peak_hours_summary = " | ".join([f"{p['hour_range'].split(' ')[0]} hs ({p['percentage']}%)" for p in top_peak_hours])

        first_contact_schedule = {
            "hourly": hourly_distribution,
            "weekdays": weekday_distribution,
            "peak_hour": f"{peak_hour_idx:02d}:00 a {peak_hour_idx+1:02d}:00 hs",
            "peak_day": peak_day_name,
            "top_peak_hours": top_peak_hours,
            "peak_hours_summary": peak_hours_summary,
            "business_hours_percentage": round((business_hours_count / (unique_clients or 1)) * 100, 1),
            "after_hours_percentage": round((after_hours_count / (unique_clients or 1)) * 100, 1),
            "business_hours_count": business_hours_count,
            "after_hours_count": after_hours_count
        }

        # 4. Detectar Foco de Negocio (Ventas vs Soporte)
        sales_terms = [r'\bprecio\b', r'\bcuanto sale\b', r'\bcuánto sale\b', r'\bcotiz', r'\bpresupuesto\b', r'\bcomprar\b', r'\bstock\b', r'\bdisponible\b', r'\bcatálogo\b', r'\bcatalogo\b', r'\bcuota\b', r'\bdescuento\b', r'\bcosto\b', r'\bvalor\b', r'\btarjeta\b', r'\befectivo\b']
        support_terms = [r'\breclamo\b', r'\bqueja\b', r'\bno funciona\b', r'\bdemora\b', r'\berror\b', r'\bproblema\b', r'\bayuda\b', r'\bgarant[ií]a\b', r'\bdevoluc', r'\bcambio\b', r'\bturno\b', r'\bautoriz', r'\breintegro\b', r'\btrámite\b', r'\bcuando llega\b', r'\bquién me atiende\b']

        sales_hits = sum(len(re.findall(p, full_client_corpus)) for p in sales_terms)
        support_hits = sum(len(re.findall(p, full_client_corpus)) for p in support_terms)
        total_intent_hits = (sales_hits + support_hits) or 1

        detected_sales_pct = round((sales_hits / total_intent_hits) * 100, 1)
        detected_support_pct = round((support_hits / total_intent_hits) * 100, 1)

        # 5. Detectar Rubro de la Empresa en el Catálogo de 11 Rubros
        rubro_scores = {}
        for r_key, r_info in self.rubro_catalog.items():
            score = sum(len(re.findall(p, full_client_corpus)) for p in r_info['keywords'])
            rubro_scores[r_key] = score

        if self.forced_rubro and self.forced_rubro in self.rubro_catalog:
            best_rubro_key = self.forced_rubro
        else:
            best_rubro_key = max(rubro_scores, key=rubro_scores.get) if rubro_scores and max(rubro_scores.values()) > 0 else 'servicios_generales'
        rubro_info = self.rubro_catalog[best_rubro_key]

        # Determinar foco final
        if self.forced_focus:
            final_focus = self.forced_focus.lower()
        else:
            if detected_sales_pct >= 58:
                final_focus = 'ventas'
            elif detected_support_pct >= 58:
                final_focus = 'soporte'
            else:
                final_focus = rubro_info.get('default_focus', 'ventas')

        # 6. Ráfagas y Fragmentación (considera divisiones por [---saltomensaje---])
        burst_sizes = []
        for cid, msgs in client_conversations.items():
            cur_burst = 0
            for m in msgs:
                if is_propio(m):
                    txt = m.get('Mensaje', '')
                    sub_msgs = [p for p in re.split(r'\s*\[?-*salto[-_]?mensaje-*\]?\s*', txt, flags=re.IGNORECASE) if p.strip()] if txt else []
                    cur_burst += max(1, len(sub_msgs))
                else:
                    if cur_burst > 0:
                        burst_sizes.append(cur_burst)
                        cur_burst = 0
            if cur_burst > 0:
                burst_sizes.append(cur_burst)

        total_bursts = len(burst_sizes) or 1
        b_1 = burst_sizes.count(1)
        b_2 = burst_sizes.count(2)
        b_3_plus = sum(1 for b in burst_sizes if b >= 3)
        fragmentation_rate = ((b_2 + b_3_plus) / total_bursts) * 100

        # 7. Separación de Tiempos de Espera: Mensaje Inicial vs. Mensajes en Conversación
        initial_wait_times = []
        in_conv_wait_times = []

        for cid, msgs in client_conversations.items():
            msgs.sort(key=lambda x: parse_date(x.get('Fecha_Hora', '')))
            first_company_seen = False
            for m in msgs:
                msg_es_propio = is_propio(m)
                te = m.get('Tiempo Espera', '').strip()
                if te:
                    try:
                        val = float(te)
                        if msg_es_propio:
                            if not first_company_seen:
                                initial_wait_times.append(val)
                                first_company_seen = True
                            else:
                                in_conv_wait_times.append(val)
                    except: pass

        initial_wait_times.sort()
        in_conv_wait_times.sort()
        wait_times.sort()

        if wait_times:
            n_wt = len(wait_times)
            avg_wait = sum(wait_times) / n_wt
            med_wait = wait_times[n_wt // 2]
            p90_wait = wait_times[int(n_wt * 0.9)]
            p95_wait = wait_times[int(n_wt * 0.95)]
        else:
            n_wt = 1
            avg_wait = 0.0
            med_wait = 0.0
            p90_wait = 0.0
            p95_wait = 0.0

        sla = rubro_info['sla']
        t_imm = sla['ideal_immediate']
        t_acc = sla['acceptable']
        t_warn = sla['warning']
        t_crit = sla['critical']

        wait_over_warning = sum(1 for w in wait_times if w > t_warn)
        pct_over_warning = (wait_over_warning / n_wt) * 100

        def calc_brackets(w_list):
            w_list.sort()
            nw = len(w_list) or 1
            b_imm = sum(1 for w in w_list if w <= t_imm)
            b_acc = sum(1 for w in w_list if t_imm < w <= t_acc)
            b_warn = sum(1 for w in w_list if t_acc < w <= t_warn)
            b_cold = sum(1 for w in w_list if t_warn < w <= t_crit)
            b_crit = sum(1 for w in w_list if w > t_crit)

            ok_count = b_imm + b_acc + b_warn
            ok_pct = round((ok_count / nw) * 100, 1)
            risk_count = b_cold + b_crit
            risk_pct = round((risk_count / nw) * 100, 1)

            return {
                "average_minutes": round(sum(w_list) / nw, 1),
                "median_minutes": round(w_list[nw // 2], 1) if w_list else 0.0,
                "p90_minutes": round(w_list[int(nw * 0.9)], 1) if w_list else 0.0,
                "p95_minutes": round(w_list[int(nw * 0.95)], 1) if w_list else 0.0,
                "count": len(w_list),
                "over_warning_count": risk_count,
                "over_warning_percentage": risk_pct,
                "ok_summary": {
                    "count": ok_count,
                    "percentage": ok_pct,
                    "label": "Atención Oportuna / Saludable (3 Franjas)"
                },
                "risk_summary": {
                    "count": risk_count,
                    "percentage": risk_pct,
                    "label": "Zona de Riesgo / Fuga (2 Franjas)"
                },
                "brackets": {
                    f"< {t_imm:.0f}m (Inmediato)": b_imm,
                    f"{t_imm:.0f} - {t_acc:.0f}m (Aceptable)": b_acc,
                    f"{t_acc:.0f} - {t_warn:.0f}m (Alerta)": b_warn,
                    f"{t_warn:.0f} - {t_crit:.0f}m (❄️ Zona Fría)": b_cold,
                    f"> {t_crit:.0f}m (Crítico)": b_crit
                }
            }

        initial_stats = calc_brackets(initial_wait_times)
        in_conv_stats = calc_brackets(in_conv_wait_times)
        global_brackets = calc_brackets(wait_times)["brackets"]

        # 8. Categorías dinámicas y Nivel de Ping-Pong Calibrado por Industria
        # Estándar flexible y específico según la complejidad natural del rubro
        # Estándar de ping-pong por rubro: en rubros.json
        ideal_c, ideal_op = PINGPONG_POR_RUBRO.get(best_rubro_key, (3.5, 3.0))
        IDEAL_CLIENT_MSGS = ideal_c
        IDEAL_OPERATOR_MSGS = ideal_op
        IDEAL_TOTAL_MSGS = round(IDEAL_CLIENT_MSGS + IDEAL_OPERATOR_MSGS, 1)

        active_categories = rubro_info['categories']
        topic_data = []
        for cat, pats in active_categories.items():
            cat_clients = set()
            cat_msgs_count = 0
            cat_client_msgs = 0
            cat_operator_msgs = 0

            for cid, msgs in client_conversations.items():
                client_text = ' '.join([m.get('Mensaje', '').lower() for m in msgs if not is_propio(m)])
                if any(re.search(p, client_text) for p in pats):
                    cat_clients.add(cid)
                    cat_msgs_count += len(msgs)
                    for m in msgs:
                        if is_propio(m):
                            cat_operator_msgs += 1
                        else:
                            cat_client_msgs += 1

            count = len(cat_clients)
            pct = (count / (unique_clients or 1)) * 100
            avg_msgs = (cat_msgs_count / (count or 1)) if count else 0
            avg_client = (cat_client_msgs / (count or 1)) if count else 0
            avg_op = (cat_operator_msgs / (count or 1)) if count else 0
            
            ping_pong_rate = round(avg_msgs / IDEAL_TOTAL_MSGS, 1) if IDEAL_TOTAL_MSGS else 1.0

            # Umbrales más permisivos y adaptados al estándar de la industria
            if avg_msgs <= (IDEAL_TOTAL_MSGS * 1.3):
                severity = "ÓPTIMO"
                badge_class = "green"
                status_explanation = f"Dentro del rango ideal para {rubro_info['name']}."
            elif avg_msgs <= (IDEAL_TOTAL_MSGS * 2.2):
                severity = "MODERADO"
                badge_class = "yellow"
                status_explanation = "Idas y vueltas aceptables con leve margen de optimización."
            elif avg_msgs <= (IDEAL_TOTAL_MSGS * 3.5):
                severity = "ALERTA"
                badge_class = "orange"
                status_explanation = "Fragmentación evitable: requiere más turnos de lo aconsejado."
            else:
                severity = "CRÍTICO"
                badge_class = "red"
                status_explanation = "Fricción severa: ping-pong excesivo que demora la resolución."

            topic_data.append({
                "category": cat,
                "conversations": count,
                "percentage": round(pct, 1),
                "avg_messages_per_client": round(avg_msgs, 1),
                "avg_client_messages": round(avg_client, 1),
                "avg_operator_messages": round(avg_op, 1),
                "ideal_client_messages": IDEAL_CLIENT_MSGS,
                "ideal_operator_messages": IDEAL_OPERATOR_MSGS,
                "ideal_total_messages": IDEAL_TOTAL_MSGS,
                "ping_pong_rate": ping_pong_rate,
                "ping_pong_excess_percentage": round((max(0, avg_msgs - IDEAL_TOTAL_MSGS) / IDEAL_TOTAL_MSGS) * 100, 1),
                "ping_pong_turns": round(avg_msgs / 2, 1),
                "ping_pong_severity": severity,
                "status_explanation": status_explanation,
                "badge_class": badge_class,
                "total_messages": cat_msgs_count,
                "client_messages": cat_client_msgs,
                "operator_messages": cat_operator_msgs
            })

        topic_data.sort(key=lambda x: x["conversations"], reverse=True)

        avg_client_total = round(client_msgs_count / (unique_clients or 1), 1)
        avg_operator_total = round(company_msgs_count / (unique_clients or 1), 1)
        avg_total = round(total_rows / (unique_clients or 1), 1)

        ping_pong_benchmark = {
            "real_client_avg": avg_client_total,
            "real_operator_avg": avg_operator_total,
            "real_total_avg": avg_total,
            "ideal_client_avg": IDEAL_CLIENT_MSGS,
            "ideal_operator_avg": IDEAL_OPERATOR_MSGS,
            "ideal_total_avg": IDEAL_TOTAL_MSGS,
            "excess_factor": round(avg_total / IDEAL_TOTAL_MSGS, 1),
            "excess_percentage": round(((avg_total - IDEAL_TOTAL_MSGS) / IDEAL_TOTAL_MSGS) * 100, 1),
            "explanation": f"Cada caso promedia {avg_total} mensajes ({avg_client_total} del cliente + {avg_operator_total} del operador) frente al estándar calibrado para {rubro_info['name']} ({IDEAL_TOTAL_MSGS} mensajes totales: {IDEAL_CLIENT_MSGS} cliente + {IDEAL_OPERATOR_MSGS} operador).",
            "industry_benchmark_note": f"Estándar de industria ({rubro_info['name']}): {IDEAL_TOTAL_MSGS} msgs"
        }

        # 9. Análisis de Operadores: Diferenciación entre Bot y Carga Humana (Handoff)
        is_bot_re = re.compile(r'bot|sistema|auto|automatiz', re.IGNORECASE)
        
        bot_msgs_total = 0
        human_msgs_total = 0
        human_counts = Counter()
        operator_list = []

        for op, count in operator_counts.most_common():
            is_bot = bool(is_bot_re.search(op))
            if is_bot:
                bot_msgs_total += count
            else:
                human_msgs_total += count
                human_counts[op] += count

            operator_list.append({
                "operator": op,
                "is_bot": is_bot,
                "messages": count,
                "percentage": round((count / (company_msgs_count or 1)) * 100, 1),
                "est_hours_spent": round((count * SUPUESTOS['minutos_por_mensaje']) / 60, 1)
            })

        bot_share = round((bot_msgs_total / (company_msgs_count or 1)) * 100, 1)
        human_share = round((human_msgs_total / (company_msgs_count or 1)) * 100, 1)

        # Operador humano líder
        top_human_name, top_human_count = human_counts.most_common(1)[0] if human_counts else ("Ninguno", 0)
        top_human_pct_of_human = round((top_human_count / (human_msgs_total or 1)) * 100, 1)
        top_human_pct_of_total = round((top_human_count / (company_msgs_count or 1)) * 100, 1)

        handoff_data = {
            "policy": self.handoff_policy,
            "bot_messages": bot_msgs_total,
            "bot_share_percentage": bot_share,
            "human_messages": human_msgs_total,
            "human_share_percentage": human_share,
            "top_human_operator": top_human_name,
            "top_human_messages": top_human_count,
            "top_human_percentage_of_human": top_human_pct_of_human,
            "top_human_percentage_of_total": top_human_pct_of_total,
            "is_bot_dominant": bot_share > 50
        }

        # 10. Auditoría de Priorización IU/IC, LTV y Evaluación ACTÚEN+ Contextual
        top_company_questions = Counter(company_question_samples).most_common(5)

        ltv_econ, prio_audit, lite_phases = self._compute_prioritization_and_ltv(
            client_conversations, rubro_info, sla, wait_times, final_focus
        )

        handoff_gap_analysis = self._compute_handoff_gap_analysis(client_conversations, operator_counts, rubro_key=best_rubro_key)

        # Cierre activo vs pasivo (pilar N). Se evalúa el último mensaje real de
        # la empresa, descartando difusiones (mismo texto en muchas conversaciones)
        # y mensajes automáticos: medir la calidad de cierre sobre una bienvenida
        # de bot o un aviso de feriado no dice nada del asesor.
        _cfg = CATALOGO['deteccion_cierre']
        _re_auto = re.compile(_cfg['regex_automatico'], re.I)
        _re_activo = re.compile(_cfg['regex_cierre_activo'], re.I)

        _apariciones = Counter()
        for _cid, _msgs in client_conversations.items():
            for _t in {(m.get('Mensaje') or '').strip() for m in _msgs if is_propio(m)}:
                if _t:
                    _apariciones[_t] += 1
        _difusiones = {t for t, n in _apariciones.items()
                       if n >= _cfg['umbral_difusion_conversaciones']}

        cierres_activos = 0
        cierres_pasivos = 0
        cierres_no_evaluables = 0
        for _cid, _msgs in client_conversations.items():
            _reales = [m for m in _msgs
                       if is_propio(m)
                       and (m.get('Mensaje') or '').strip()
                       and (m.get('Mensaje') or '').strip() not in _difusiones
                       and not _re_auto.search(m.get('Mensaje') or '')]
            if not _reales:
                cierres_no_evaluables += 1
                continue
            _ultimo = (_reales[-1].get('Mensaje') or '').strip()
            if _re_activo.search(_ultimo):
                cierres_activos += 1
            else:
                cierres_pasivos += 1

        _evaluables = cierres_activos + cierres_pasivos
        passive_closing_rate = round((cierres_pasivos / (_evaluables or 1)) * 100, 1)

        actuen_scorecard = self._evaluate_actuen_dynamic(
            focus=final_focus,
            rubro_name=rubro_info['name'],
            sla=sla,
            fragmentation_rate=fragmentation_rate,
            avg_wait=avg_wait,
            pct_over_warning=pct_over_warning,
            system_drops=system_drops,
            bot_welcomes=bot_welcomes,
            unique_clients=unique_clients,
            handoff_data=handoff_data,
            top_questions=top_company_questions,
            topic_data=topic_data,
            ltv_econ=ltv_econ,
            lite_phases=lite_phases,
            prio_audit=prio_audit,
            passive_closing_rate=passive_closing_rate,
            cierres_evaluables=_evaluables
        )

        # 11. Proyección de Ahorro y Beneficio Económico Fundamentado
        # Línea de base real actual
        baseline_company_msgs_per_client = round(company_msgs_count / (unique_clients or 1), 1)
        target_msgs_per_client = (SUPUESTOS['objetivo_msgs_ventas']
                                  if final_focus == 'ventas' else SUPUESTOS['objetivo_msgs_soporte'])
        
        # Objetivo metodológico
        estimated_opt_company_msgs = int(unique_clients * target_msgs_per_client)
        saved_messages = max(0, company_msgs_count - estimated_opt_company_msgs)
        reduction_percentage = round((saved_messages / (company_msgs_count or 1)) * 100, 1)
        saved_hours = round((saved_messages * SUPUESTOS['minutos_por_mensaje']) / 60, 1)

        # Estimación de Beneficio Económico
        hourly_rate_ars = SUPUESTOS['costo_hora_asesor_ars']
        msg_cost_ars = SUPUESTOS['costo_mensaje_api_ars']
        labor_savings_ars = saved_hours * hourly_rate_ars
        api_savings_ars = saved_messages * msg_cost_ars
        total_financial_benefit_ars = labor_savings_ars + api_savings_ars
        total_financial_benefit_usd = round(total_financial_benefit_ars / SUPUESTOS['tipo_cambio_ars'], 2)

        optimization_rationale = (
            f"Línea de base actual: tu empresa envía hoy {baseline_company_msgs_per_client} mensajes por cliente. "
            f"El estándar metodológico ACTÚEN+ en un solo bloque requiere {target_msgs_per_client} mensajes empresa para cerrar o resolver. "
            f"El {reduction_percentage}% de optimización representa la eliminación de {saved_messages:,} mensajes fragmentados innecesarios."
        )

        # 12. Plantillas Maestras Consecuentes con el Rubro (Catálogo Ampliado)
        master_templates = self._get_rubro_templates(best_rubro_key, final_focus, company_name=detected_company_name)

        return {
            "meta": {
                "generated_at": datetime.now().isoformat(),
                # Marca de procedencia: 'server' = análisis completo del motor Python.
                # El camino del navegador emite 'browser' y anula lo que no puede calcular.
                "engine_mode": "server",
                "company_name": detected_company_name,
                "company_number": detected_company_phone,
                "detected_rubro": rubro_info['name'],
                "detected_rubro_key": best_rubro_key,
                "total_rubros_in_system": len(self.rubro_catalog),
                "business_focus": final_focus,
                "is_forced_focus": bool(self.forced_focus),
                "handoff_policy": self.handoff_policy,
                "files_count": len(file_paths),
                "file_names": [os.path.basename(p) for p in file_paths if os.path.exists(p)],
                "sales_affinity_percentage": detected_sales_pct,
                "support_affinity_percentage": detected_support_pct,
                "total_rows": total_rows,
                "unique_clients": unique_clients,
                "company_messages": company_msgs_count,
                "client_messages": client_msgs_count,
                "company_ratio": round((company_msgs_count / (client_msgs_count or 1)), 2),
                "avg_messages_per_client": round(total_rows / (unique_clients or 1), 1),
                "baseline_company_msgs_per_client": baseline_company_msgs_per_client,
                "target_company_msgs_per_client": target_msgs_per_client
            },
            "schedule": first_contact_schedule,
            "handoff": handoff_data,
            "handoff_gap_analysis": handoff_gap_analysis,
            "fragmentation": {
                "rate": round(fragmentation_rate, 1),
                "burst_1_msg": b_1,
                "burst_2_msgs": b_2,
                "burst_3_plus_msgs": b_3_plus,
                "total_bursts": total_bursts
            },
            "wait_times": {
                "average_minutes": round(avg_wait, 1),
                "median_minutes": round(med_wait, 1),
                "p90_minutes": round(p90_wait, 1),
                "p95_minutes": round(p95_wait, 1),
                "sla": sla,
                "over_warning_count": wait_over_warning,
                "over_warning_percentage": round(pct_over_warning, 1),
                "system_drops": system_drops,
                "brackets": global_brackets,
                "initial_response": initial_stats,
                "in_conversation": in_conv_stats
            },
            "ping_pong": ping_pong_benchmark,
            "topics": topic_data,
            "operators": operator_list,
            "actuen_scorecard": actuen_scorecard,
            "ltv_economics": ltv_econ,
            "prioritization_audit": prio_audit,
            "spoter_lite": lite_phases,
            "savings": {
                "current_company_messages": company_msgs_count,
                "optimized_target_messages": estimated_opt_company_msgs,
                "baseline_msgs_per_client": baseline_company_msgs_per_client,
                "target_msgs_per_client": target_msgs_per_client,
                "messages_saved": saved_messages,
                "reduction_percentage": reduction_percentage,
                "hours_saved_monthly": saved_hours,
                "optimization_rationale": optimization_rationale,
                "economic_benefit": {
                    "total_ars": round(total_financial_benefit_ars),
                    "total_usd": total_financial_benefit_usd,
                    "labor_savings_ars": round(labor_savings_ars),
                    "api_savings_ars": round(api_savings_ars),
                    "hourly_rate_ref": hourly_rate_ars,
                    "msg_rate_ref": msg_cost_ars
                }
            },
            "master_templates": master_templates
        }


    def _compute_prioritization_and_ltv(self, client_conversations, rubro_info, sla, wait_times, focus):
        ltv_cfg = rubro_info.get('ltv_model', {
            'avg_ticket_usd': 100, 'annual_frequency': 4.0, 'retention_years': 2.0, 'cac_usd': 50,
            'ticket_name': 'Ticket Promedio', 'concept': 'Valor acumulado por ciclo de vida del cliente.'
        })

        avg_ticket = ltv_cfg['avg_ticket_usd']
        freq = ltv_cfg['annual_frequency']
        years = ltv_cfg['retention_years']
        ltv_val = round(avg_ticket * freq * years)
        cac = ltv_cfg['cac_usd']
        t_warn = sla.get('warning', 15.0)

        total_clients = len(client_conversations) or 1
        ic_scores = []
        iu_scores = []
        high_intent_count = 0
        high_intent_delayed_count = 0
        whatsapp_24h_breaches = 0
        leads_at_risk_count = 0

        # Spoter Lite Phase Counters
        gracia_count = 0
        trabajo_count = 0
        rescate_count = 0
        ruido_count = 0
        leads_rescatables = 0

        re_intent_high = re.compile(r'(precio|cuanto sale|cuánto sale|costo|cotiz|comprar|pedir|tarjeta|cuota|transferencia|alias|cbu|pago|turno|reserv|disponib|env[ií]o|flete|descuento|promo)', re.I)
        re_closing = re.compile(r'(ya transfer[ií]|comprobante|pasame el alias|pasame el link|cbu|confirmar|donde firmo|lo llevo|quiero comprar|reservalo|reservámelo)', re.I)
        re_enablers = re.compile(r'(dni|calle|direcci[oó]n|localidad|provincia|mail|correo|orden|patente|modelo|a[ñn]o)', re.I)

        fifo_high_waits = []
        fifo_low_waits = []

        for cid, msgs in client_conversations.items():
            user_msgs = [m for m in msgs if not is_propio(m)]
            company_msgs = [m for m in msgs if is_propio(m)]

            user_text = " ".join([m.get('Mensaje', '') for m in user_msgs]).lower()

            # E: Etapa
            if re_closing.search(user_text):
                e_val = 25
            elif re_intent_high.search(user_text) and len(user_msgs) >= 3:
                e_val = 20
            elif re_intent_high.search(user_text):
                e_val = 15
            elif len(user_msgs) >= 2:
                e_val = 10
            else:
                e_val = 5

            # I: Intención Observable
            if re_closing.search(user_text):
                i_val = 30
            elif re.search(r'(presupuesto|cotiz|cuota|financi|env[ií]o)', user_text):
                i_val = 20
            elif re_intent_high.search(user_text):
                i_val = 15
            elif len(user_msgs) > 0:
                i_val = 10
            else:
                i_val = 0

            # G: Engagement
            g_ritmo = 8 if len(user_msgs) >= 3 else (5 if len(user_msgs) >= 1 else 0)
            avg_char_len = (sum(len(m.get('Mensaje', '')) for m in user_msgs) / len(user_msgs)) if user_msgs else 0
            has_q = 5 if '?' in user_text else 0
            g_sustancia = min(10, (5 if avg_char_len > 35 else 2) + has_q)
            g_val = g_ritmo + g_sustancia

            # H: Habilitantes
            h_val = 15 if re_enablers.search(user_text) else 5

            # R: Reconexión
            r_val = 7 if len(user_msgs) >= 4 else 0

            ic_base = e_val + i_val + g_val + h_val + r_val
            ghosting = 10 if (len(company_msgs) > len(user_msgs) + 1) else 0
            ic_score = max(0, min(100, ic_base - ghosting))
            ic_scores.append(ic_score)

            # Max wait time for this client
            max_client_wait = 0.0
            for m in company_msgs:
                te = m.get('Tiempo Espera', '').strip()
                if te:
                    try:
                        w = float(te)
                        if w > max_client_wait:
                            max_client_wait = w
                    except: pass

            # IU (Índice de Urgencia)
            a_norm = 0.75 if focus == 'ventas' else 0.60
            if max_client_wait <= 0:
                b_norm = 0.1
            elif max_client_wait <= sla.get('ideal_immediate', 2.0):
                b_norm = 0.3
            elif max_client_wait <= t_warn:
                b_norm = 0.6
            else:
                b_norm = min(1.0, 0.7 + (max_client_wait / (t_warn * 3)))
            c_norm = 0.2
            if ic_score >= 80: d_norm = 1.0
            elif ic_score >= 60: d_norm = 0.8
            elif ic_score >= 40: d_norm = 0.6
            elif ic_score >= 20: d_norm = 0.4
            else: d_norm = 0.2

            iu_score = round(100 * (0.25 * a_norm + 0.35 * b_norm + 0.15 * c_norm + 0.25 * d_norm), 1)
            iu_scores.append(iu_score)

            if ic_score >= 40:
                high_intent_count += 1
                if max_client_wait > 0:
                    fifo_high_waits.append(max_client_wait)
                if max_client_wait > t_warn:
                    high_intent_delayed_count += 1
            else:
                if max_client_wait > 0:
                    fifo_low_waits.append(max_client_wait)

            if max_client_wait > 1440:
                whatsapp_24h_breaches += 1

            if ic_score >= 40 and max_client_wait > t_warn:
                leads_at_risk_count += 1

            msg_count = len(msgs)
            if ic_score < 15 and msg_count <= 2:
                ruido_count += 1
            elif msg_count <= 3:
                gracia_count += 1
            elif msg_count <= 7:
                trabajo_count += 1
            else:
                rescate_count += 1
                if ic_score >= 40:
                    leads_rescatables += 1

        conversion_loss_rate = SUPUESTOS['tasa_caida_conversion']
        immediate_lost_usd = round(leads_at_risk_count * avg_ticket * conversion_loss_rate)
        ltv_capital_lost_usd = round(leads_at_risk_count * ltv_val * conversion_loss_rate)
        cac_wasted_usd = round(leads_at_risk_count * cac)
        total_economic_risk_usd = ltv_capital_lost_usd + cac_wasted_usd

        projected_recovered_usd = round(total_economic_risk_usd * SUPUESTOS['tasa_recuperacion_spoter'])
        exchange_rate_ars = SUPUESTOS['tipo_cambio_ars']
        total_economic_risk_ars = total_economic_risk_usd * exchange_rate_ars
        projected_recovered_ars = projected_recovered_usd * exchange_rate_ars

        avg_ic = round(sum(ic_scores) / (len(ic_scores) or 1), 1)
        avg_iu = round(sum(iu_scores) / (len(iu_scores) or 1), 1)
        fifo_high_wait_avg = round(sum(fifo_high_waits) / (len(fifo_high_waits) or 1), 1)
        spoter_projected_wait = round(min(sla.get('ideal_immediate', 2.0), 2.5), 1)

        ltv_economics = {
            "rubro_name": rubro_info.get('name', 'General'),
            "avg_ticket_usd": avg_ticket,
            "annual_frequency": freq,
            "retention_years": years,
            "ltv_usd": ltv_val,
            "cac_usd": cac,
            "ticket_name": ltv_cfg.get('ticket_name', 'Ticket Base'),
            "concept": ltv_cfg.get('concept', ''),
            "leads_analyzed": total_clients,
            "leads_at_risk_count": leads_at_risk_count,
            "leads_at_risk_percentage": round((leads_at_risk_count / total_clients) * 100, 1),
            "immediate_lost_usd": immediate_lost_usd,
            "ltv_capital_at_risk_usd": ltv_capital_lost_usd,
            "cac_wasted_usd": cac_wasted_usd,
            "total_economic_risk_usd": total_economic_risk_usd,
            "projected_recovered_ltv_usd": projected_recovered_usd,
            "exchange_rate_ars": exchange_rate_ars,
            "total_economic_risk_ars": total_economic_risk_ars,
            "projected_recovered_ltv_ars": projected_recovered_ars
        }

        prioritization_audit = {
            "avg_ic_score": avg_ic,
            "avg_iu_score": avg_iu,
            "high_intent_leads_count": high_intent_count,
            "high_intent_delayed_count": high_intent_delayed_count,
            "fifo_delayed_percentage": round((high_intent_delayed_count / (high_intent_count or 1)) * 100, 1),
            "whatsapp_24h_breaches": whatsapp_24h_breaches,
            "whatsapp_24h_breach_percentage": round((whatsapp_24h_breaches / total_clients) * 100, 1),
            "ic_distribution": {
                "muy_alta_80_100": sum(1 for s in ic_scores if s >= 80),
                "alta_60_79": sum(1 for s in ic_scores if 60 <= s < 80),
                "media_40_59": sum(1 for s in ic_scores if 40 <= s < 60),
                "baja_20_39": sum(1 for s in ic_scores if 20 <= s < 40),
                "ruido_0_19": sum(1 for s in ic_scores if s < 20)
            },
            "iu_presets": {
                "comercial_avg": round(avg_iu * 1.06, 1),
                "velocidad_avg": round(avg_iu * 0.96, 1),
                "cumplimiento_avg": round(avg_iu * 0.99, 1),
                "calidad_avg": round(avg_iu * 1.02, 1)
            },
            "fifo_vs_spoter_wait": {
                "fifo_high_intent_wait_min": fifo_high_wait_avg,
                "spoter_high_intent_wait_min": spoter_projected_wait,
                "wait_reduction_percentage": round((1 - (spoter_projected_wait / (fifo_high_wait_avg or 1))) * 100, 1) if fifo_high_wait_avg > 0 else 0.0
            }
        }

        spoter_lite = {
            "phases": {
                "gracia_count": gracia_count,
                "gracia_percentage": round((gracia_count / total_clients) * 100, 1),
                "trabajo_count": trabajo_count,
                "trabajo_percentage": round((trabajo_count / total_clients) * 100, 1),
                "cierre_rescate_count": rescate_count,
                "cierre_rescate_percentage": round((rescate_count / total_clients) * 100, 1),
                "ruido_stop_count": ruido_count,
                "ruido_stop_percentage": round((ruido_count / total_clients) * 100, 1)
            },
            "leads_rescatables_count": leads_rescatables,
            "leads_rescatables_percentage": round((leads_rescatables / (rescate_count or 1)) * 100, 1) if rescate_count else 0.0,
            "rescate_strategy_summary": f"{leads_rescatables} leads con intención activa (IC >= 40) quedaron abandonados sin aplicar una pregunta de rescate estructurada antes de declarar el silencio."
        }

        return ltv_economics, prioritization_audit, spoter_lite

    def _evaluate_actuen_dynamic(self, focus, rubro_name, sla, fragmentation_rate, avg_wait, pct_over_warning, system_drops, bot_welcomes, unique_clients, handoff_data, top_questions, topic_data, ltv_econ=None, lite_phases=None, prio_audit=None, passive_closing_rate=None, cierres_evaluables=0):
        scorecard = []
        is_sales = (focus == 'ventas')
        policy = handoff_data.get('policy', 'hybrid')

        # A - Atraer y Atender
        bot_ratio = bot_welcomes / (unique_clients or 1)
        if policy == 'bot_priority':
            a_status = "ÓPTIMO"
            a_diag = f"En política de Bot Autoservicio, el bot absorbe el {handoff_data['bot_share_percentage']}% de la mensajería inicial sin desbordar al personal humano."
            a_recom = "Mantener menús de autoservicio claros y permitir derivación rápida solo si el bot no comprende la solicitud."
        else:
            a_status = "ALERTA" if bot_ratio > 1.1 else "ÓPTIMO"
            a_diag = f"El bot de bienvenida se activó {bot_welcomes} veces para {unique_clients} usuarios ({round(bot_ratio, 2)} disparos/contacto). En clientes recurrentes, repetir el menú genera fricción antes de conectar con el asesor."
            a_recom = "Filtro Directo: Identificar al cliente en el primer mensaje y transferir al asesor asignado sin menús infinitos."

        scorecard.append({
            "pillar": "A - Atraer y Atender",
            "score": 75 if a_status == "ÓPTIMO" else 55,
            "status": a_status,
            "focus_context": f"Política de Handoff: {policy.upper()}",
            "diagnosis": a_diag,
            "recommendation": a_recom
        })

        # C - Cero Vueltas
        c_status = "CRÍTICO" if fragmentation_rate > 35 else ("ALERTA" if fragmentation_rate > 15 else "ÓPTIMO")
        q_examples = ', '.join([f'"{q[0][:35]}..."' for q in top_questions[:2]]) if top_questions else "preguntas cortas consecutivas"
        scorecard.append({
            "pillar": "C - Cero Vueltas",
            "score": 35 if fragmentation_rate > 35 else 70,
            "status": c_status,
            "focus_context": "Cotización Todo-en-Uno" if is_sales else "Diagnóstico en Turno Único",
            "diagnosis": f"El {round(fragmentation_rate, 1)}% de las respuestas de la empresa se envían en ráfagas de 2 o más mensajes seguidos. Se detectan preguntas aisladas como {q_examples}, aumentando la carga cognitiva.",
            "recommendation": "Imponer la Regla del Bloque Único: Unificar respuesta, viñetas explicativas y el requerimiento de datos en un solo mensaje estructurado."
        })

        # T - Tiempos Aceitados (Calibrado con el SLA del Rubro)
        t_status = "CRÍTICO" if (avg_wait > sla['warning'] or pct_over_warning > 12) else ("ALERTA" if avg_wait > sla['acceptable'] else "ÓPTIMO")
        scorecard.append({
            "pillar": "T - Tiempos Aceitados",
            "score": 35 if t_status == "CRÍTICO" else (65 if t_status == "ALERTA" else 85),
            "status": t_status,
            "focus_context": "SLA Ideal: " + sla['benchmark_text'],
            "diagnosis": f"Tiempo promedio de {round(avg_wait, 1)} min frente al SLA aceptable de {sla['acceptable']:.0f} min en {rubro_name}. El {round(pct_over_warning, 1)}% de las consultas superaron el umbral de alerta ({sla['warning']:.0f} min). Hubo {system_drops} expulsiones del sistema.",
            "recommendation": f"Inyectar oxígeno conversacional: Si la gestión demora más de {sla['ideal_immediate']:.0f} minutos, enviar un mensaje de contención predefinido."
        })

        # U - Ubicar la Intención (medido con el Índice de Conversión)
        top_inquiry = topic_data[0]['category'] if topic_data else 'la consulta principal'
        prio = prio_audit or {}
        avg_ic = prio.get('avg_ic_score', 0)
        dist = prio.get('ic_distribution', {})
        calientes = dist.get('muy_alta_80_100', 0) + dist.get('alta_60_79', 0)
        frias = dist.get('baja_20_39', 0) + dist.get('ruido_0_19', 0)
        total_ic = calientes + frias + dist.get('media_40_59', 0)

        if avg_ic >= 60:
            u_status = "ÓPTIMO"
        elif avg_ic >= 40:
            u_status = "ALERTA"
        else:
            u_status = "CRÍTICO"

        scorecard.append({
            "pillar": "U - Ubicar la Intención",
            "score": round(avg_ic),
            "status": u_status,
            "focus_context": f"Índice de Conversión medio: {avg_ic}/100",
            "diagnosis": (
                f"El IC medio de la cartera es {avg_ic}/100: {calientes} conversaciones con intención alta "
                f"y {frias} que quedaron en zona fría o ruido sobre {total_ic} analizadas. "
                f"El {topic_data[0]['percentage'] if topic_data else 30}% ingresa por '{top_inquiry}'. "
                "Un IC bajo puede venir de tráfico frío o de no extraer la necesidad completa en el turno inicial; "
                "el desglose por conversación permite distinguirlo."
            ),
            "recommendation": f"Diseñar un Blueprint de Micro-intenciones: Al consultar por {top_inquiry.lower()}, solicitar los datos clave (habilitantes) en el turno inicial para elevar el IC."
        })

        # E - Experiencia Personalizada (medido con las fases Spoter Lite)
        lite = lite_phases or {}
        fases = lite.get('phases', {})
        rescatables = lite.get('leads_rescatables_count', 0)
        pct_rescatables = lite.get('leads_rescatables_percentage', 0)
        en_rescate = fases.get('cierre_rescate_count', 0)

        if pct_rescatables >= 50:
            e_status = "CRÍTICO"
        elif pct_rescatables >= 20:
            e_status = "ALERTA"
        else:
            e_status = "ÓPTIMO"

        scorecard.append({
            "pillar": "E - Experiencia Personalizada",
            "score": max(0, min(100, round(100 - pct_rescatables))),
            "status": e_status,
            "focus_context": f"Protocolo de Rescate: {pct_rescatables}% de la fase de cierre quedó sin reactivar",
            "diagnosis": (
                f"De {en_rescate} conversaciones que llegaron a la fase de cierre/rescate, {rescatables} "
                f"({pct_rescatables}%) conservaban intención activa (IC >= 40) y quedaron abandonadas sin una "
                f"pregunta de rescate estructurada. Es abandono sin seguimiento "
                f"{'comercial del presupuesto' if is_sales else 'del estado del trámite/caso'}."
            ),
            "recommendation": "Protocolo de Rescate: Reactivar al usuario utilizando su nombre y el motivo específico de su consulta, evitando plantillas robóticas."
        })

        # N - Nutrir y Cerrar
        # N - Nutrir y Cerrar (medido con la tasa de cierres pasivos)
        pasivos = passive_closing_rate if passive_closing_rate is not None else 58.0
        _uc = CATALOGO['deteccion_cierre']
        if pasivos >= _uc['umbral_critico_pct']:
            n_status = "CRÍTICO"
        elif pasivos >= _uc['umbral_alerta_pct']:
            n_status = "ALERTA"
        else:
            n_status = "ÓPTIMO"

        scorecard.append({
            "pillar": "N - Nutrir y Cerrar",
            "score": max(0, min(100, round(100 - pasivos))),
            "status": n_status,
            "focus_context": ("Tipping Point Comercial" if is_sales else "Confirmación de FCR (Resolución)") + f" · {pasivos}% de cierres pasivos",
            "diagnosis": (
                f"El {pasivos}% de los cierres termina con un mensaje que no incluye pregunta de avance ni "
                f"llamado a la acción, dejando el control en el usuario. Medido sobre {cierres_evaluables:,} "
                "conversaciones con cierre propio, excluyendo difusiones y mensajes automáticos."
            ),
            "recommendation": "Cierre Activo Obligatorio: " + ("Cerrar con una pregunta de reserva o confirmación de pedido (Tipping Point)." if is_sales else "Cerrar con confirmación explícita de solución ('¿Quedó resuelta tu gestión o necesitás algo más?').")
        })

        # + Optimización Continua y Cuello de Botella (Diferenciando Bot vs Humano)
        top_human = handoff_data.get('top_human_operator', 'Un operador')
        top_human_pct = handoff_data.get('top_human_percentage_of_human', 0)
        bot_pct = handoff_data.get('bot_share_percentage', 0)

        if policy == 'bot_priority' and bot_pct >= 40:
            plus_status = "ÓPTIMO"
            plus_diag = f"El Bot absorbe el {bot_pct}% de la carga total, logrando alta eficiencia por automatización. Entre los operadores humanos escalados, {top_human} atiende el {top_human_pct}% de los casos complejos."
            plus_recom = "Seguir ampliando las intenciones automáticas del Bot para reducir aún más las transferencias complejas."
        else:
            is_human_bottleneck = (top_human_pct > 50)
            plus_status = "ALERTA" if is_human_bottleneck else "ÓPTIMO"
            plus_diag = f"Entre los operadores humanos, {top_human} concentra el {top_human_pct}% de la atención ({handoff_data.get('top_human_messages', 0):,} msgs), {'generando un cuello de botella sistémico' if is_human_bottleneck else 'con buena distribución de equipo'}."
            plus_recom = f"Cargar atajos rápidos de teclado para {top_human} y redistribuir la asignación de leads en horarios pico."

        # El pilar + suma la consecuencia patrimonial: no solo cómo está repartida
        # la carga, sino cuánto capital se está destruyendo mientras tanto.
        ltv = ltv_econ or {}
        en_riesgo = ltv.get('leads_at_risk_count', 0)
        pct_riesgo = ltv.get('leads_at_risk_percentage', 0)
        capital = ltv.get('total_economic_risk_usd', 0)

        plus_score = 80 if plus_status == "ÓPTIMO" else 50
        if pct_riesgo >= 30:
            plus_status = "CRÍTICO"
            plus_score = min(plus_score, 35)
        elif pct_riesgo >= 15 and plus_status == "ÓPTIMO":
            plus_status = "ALERTA"
            plus_score = min(plus_score, 60)

        if en_riesgo:
            plus_diag += (
                f" En paralelo, {en_riesgo} leads ({pct_riesgo}%) con intención activa esperaron más allá del "
                f"umbral de alerta: ${capital:,} USD de capital de cartera expuesto."
            )
            plus_recom += " Priorizar por Índice de Urgencia para que el capital en riesgo se atienda primero."

        scorecard.append({
            "pillar": "+ Optimización Continua",
            "score": plus_score,
            "status": plus_status,
            "focus_context": f"Carga Humana ({handoff_data.get('human_share_percentage', 0)}%) vs Bot ({bot_pct}%) · Capital expuesto: ${capital:,} USD",
            "diagnosis": plus_diag,
            "recommendation": plus_recom
        })

        return scorecard

    def _get_rubro_templates(self, rubro_key, focus, company_name=None):
        """Plantillas maestras del rubro, desde rubros.json.

        El JSON las guarda con los marcadores {{EMPRESA}} y {{ALIAS}}; acá se
        sustituyen por los valores de la empresa detectada.
        """
        focus_key = 'ventas' if focus == 'ventas' else 'soporte'
        por_rubro = CATALOGO['plantillas'].get(rubro_key) or CATALOGO['plantillas']['servicios_generales']
        plantillas = por_rubro.get(focus_key) or por_rubro['ventas']

        c_name = company_name if (company_name and company_name != 'Empresa') else (self.company_name or 'Nuestra Empresa')
        c_alias = derivar_alias(c_name)

        crudo = json.dumps(plantillas, ensure_ascii=False)
        crudo = crudo.replace('{{ALIAS}}', c_alias).replace('{{EMPRESA}}', c_name)
        return json.loads(crudo)

    def export_report_markdown(self, analysis_result):
        meta = analysis_result["meta"]
        frag = analysis_result["fragmentation"]
        wt = analysis_result["wait_times"]
        sav = analysis_result["savings"]
        eco = sav["economic_benefit"]

        sch = analysis_result.get("schedule", {})
        ping_pong = analysis_result.get("ping_pong", {})
        init_wt = wt.get("initial_response", {})
        conv_wt = wt.get("in_conversation", {})

        md = f"""# Reporte Ejecutivo de Auditoría Conversacional - Método ACTÚEN+ V2.3
**Empresa auditada:** {self.company_name}  
**Rubro Detectado:** {meta['detected_rubro']} (Foco: {meta['business_focus'].upper()})  
**Fecha de análisis:** {meta['generated_at'][:10]}  
**Total de registros procesados:** {meta['total_rows']:,} mensajes | **Usuarios únicos:** {meta['unique_clients']:,}

---

## 1. Métricas Globales y Desbalance Operativo

* **Mensajes enviados por la Empresa:** {meta['company_messages']:,} ({meta['company_ratio']}x respecto al cliente)
* **Mensajes enviados por Clientes:** {meta['client_messages']:,}
* **Promedio de interacción total:** {meta['avg_messages_per_client']} mensajes por cliente
* **Ping-Pong Real vs. Ideal ACTÚEN+:**
  * Interlocutor (Cliente): **{ping_pong.get('real_client_avg', '-')} msgs** (Estándar Ideal: {ping_pong.get('ideal_client_avg', 2.5)} msgs)
  * Operador (Empresa): **{ping_pong.get('real_operator_avg', '-')} msgs** (Estándar Ideal: {ping_pong.get('ideal_operator_avg', 2.0)} msgs)
  * Factor de Exceso de Idas y Vueltas: **{ping_pong.get('excess_factor', '-')}x (+{ping_pong.get('excess_percentage', '-')}%)**
* **Top 3 Picos Horarios de Demanda:** {sch.get('peak_hours_summary', '10-11 hs')}
* **Tasa de Fragmentación (Infracción Cero Vueltas):** **{frag['rate']}%** de intervenciones en ráfagas múltiples
* **Tiempos de Espera Calibrados (SLA Rubro: {wt['sla']['acceptable']} min):**
  * **Espera Mensaje Inicial (Primera Atención):** Promedio **{init_wt.get('average_minutes', '-')} min** | P90: {init_wt.get('p90_minutes', '-')} min | Fuera de SLA: {init_wt.get('over_warning_percentage', '-')}%
  * **Espera en Conversación (Continuidad):** Promedio **{conv_wt.get('average_minutes', '-')} min** | P90: {conv_wt.get('p90_minutes', '-')} min | Fuera de SLA: {conv_wt.get('over_warning_percentage', '-')}%
  * **Global:** Promedio **{wt['average_minutes']} min** | {wt['over_warning_percentage']}% de turnos en Zona Fría / Alerta
* **Expulsiones automáticas del sistema (Timeout de operador):** {wt['system_drops']} caídas

---

## 2. Potencial de Ahorro y Beneficio Económico

* **Mensajes Empresa Actuales:** {sav['current_company_messages']:,} ({sav['baseline_msgs_per_client']} msgs/cliente)
* **Mensajes Empresa con ACTÚEN+:** {sav['optimized_target_messages']:,} ({sav['target_msgs_per_client']} msgs/cliente)
* **Ahorro Neto Mensual:** **-{sav['messages_saved']:,} mensajes ({sav['reduction_percentage']}%)**
* **Horas-Hombre Liberadas al Mes:** **~{sav['hours_saved_monthly']} horas de trabajo**
* **Beneficio Económico Mensual Estimado:** **${eco['total_ars']:,} ARS (~${eco['total_usd']} USD)**
  * *Ahorro laboral operativo:* ${eco['labor_savings_ars']:,} ARS ({sav['hours_saved_monthly']} hs a ${eco['hourly_rate_ref']:,}/h)
  * *Ahorro en consumo de mensajería/API:* ${eco['api_savings_ars']:,} ARS ({sav['messages_saved']:,} msgs a ${eco['msg_rate_ref']:,}/msg)

---

## 3. Motivos de Consulta y Tasa de Ping-Pong (Real vs. Ideal)

| Motivo de Consulta | Usuarios | % | Msgs Cliente | Msgs Operador | Ping-Pong Total | Exceso vs Ideal | Severidad |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
"""
        for t in analysis_result["topics"]:
            md += f"| {t['category']} | {t['conversations']} | {t['percentage']}% | {t.get('avg_client_messages', '-')} | {t.get('avg_operator_messages', '-')} | {t['avg_messages_per_client']} msgs | {t.get('ping_pong_rate', '-')}x | {t['ping_pong_severity']} |\n"

        md += """\n---

## 4. Semáforo de Evaluación ACTÚEN+

"""
        for s in analysis_result["actuen_scorecard"]:
            badge = "🔴" if s["status"] == "CRÍTICO" else ("🟡" if s["status"] == "ALERTA" else "🟢")
            md += f"### {badge} {s['pillar']} (Score: {s['score']}/100 - {s['status']})\n"
            md += f"* **Contexto:** {s.get('focus_context', '')}\n"
            md += f"* **Diagnóstico:** {s['diagnosis']}\n"
            md += f"* **Recomendación:** {s['recommendation']}\n\n"

        # 5. Auditoría de Priorización Quirúrgica (IU / IC) y Cuello de Botella FIFO
        prio = analysis_result.get("prioritization_audit", {})
        ltv = analysis_result.get("ltv_economics", {})
        lite = analysis_result.get("spoter_lite", {})
        fifo_wait = prio.get("fifo_vs_spoter_wait", {})
        phases = lite.get("phases", {})

        md += f"""---

## 5. Auditoría de Priorización Quirúrgica (IU / IC) y Cuello de Botella FIFO

* **Índice de Conversión Promedio (IC):** {prio.get('avg_ic_score', '-')}/100
* **Índice de Urgencia Promedio (IU):** {prio.get('avg_iu_score', '-')}/100
* **Leads con Intención Alta/Media Calificada (IC >= 40):** {prio.get('high_intent_leads_count', 0):,} usuarios
* **Fuga por Orden de Llegada (FIFO):** **{prio.get('fifo_delayed_percentage', 0)}% de los leads calientes** ({prio.get('high_intent_delayed_count', 0):,} contactos) sufrieron demoras críticas en Zona Fría (>15 min) mientras se respondían consultas de bajo valor.
* **Tiempo de Espera en Leads Calientes (Real vs Spoter):**
  * *Espera actual bajo atención tradicional (FIFO):* **{fifo_wait.get('fifo_high_intent_wait_min', 0)} min**
  * *Espera proyectada con Cola Priorizada Spoter (IU/IC):* **{fifo_wait.get('spoter_high_intent_wait_min', 2.0)} min (-{fifo_wait.get('wait_reduction_percentage', 0)}% de demora)**
* **Violaciones de Ventana de 24 hs WhatsApp (Meta):** **{prio.get('whatsapp_24h_breaches', 0)} conversaciones ({prio.get('whatsapp_24h_breach_percentage', 0)}%)** quedaron mudas por más de un día, requiriendo plantillas pagas o perdiendo definitivamente al cliente.

---

## 6. La Matemática del LTV: Destrucción de Capital por No-Atención

> *"El cliente desatendido no representa una pérdida de un ticket puntual: representa la evaporación del 100% de su Lifetime Value y el desperdicio del CAC invertido en anuncios."*

* **Concepto de Valor ({ltv.get('rubro_name', 'Sector')}):** {ltv.get('concept', '')}
* **Ticket Promedio Inicial:** ${ltv.get('avg_ticket_usd', 0):,} USD
* **Frecuencia Anual Estimada:** {ltv.get('annual_frequency', 0)} compras/año
* **Ciclo de Retención Promedio:** {ltv.get('retention_years', 0)} años
* **Lifetime Value Unitario (LTV):** **${ltv.get('ltv_usd', 0):,} USD**
* **Costo de Adquisición (CAC Pauta Ref):** ${ltv.get('cac_usd', 0):,} USD
* **Leads en Riesgo Crítico por Demoras (>15m):** {ltv.get('leads_at_risk_count', 0):,} ({ltv.get('leads_at_risk_percentage', 0)}% de la base)
* **Pérdida Inmediata en Ventas:** **${ltv.get('immediate_lost_usd', 0):,} USD**
* **CAPITAL LTV TOTAL EN RIESGO:** **${ltv.get('total_economic_risk_usd', 0):,} USD (~${ltv.get('total_economic_risk_ars', 0):,} ARS)**
  * *LTV Futuro Destruido:* ${ltv.get('ltv_capital_at_risk_usd', 0):,} USD
  * *CAC Publicitario Desperdiciado:* ${ltv.get('cac_wasted_usd', 0):,} USD
* **ROI y Recuperación Proyectada con Spoter:** **${ltv.get('projected_recovered_ltv_usd', 0):,} USD (~${ltv.get('projected_recovered_ltv_ars', 0):,} ARS)** recuperados mediante contención en < 3 minutos y priorización por IU.

---

## 7. Fases y Protocolo de Rescate Spoter Lite (HITL)

* **Fase de Gracia (< 30% sesión):** {phases.get('gracia_count', 0)} usuarios ({phases.get('gracia_percentage', 0)}%)
* **Fase de Trabajo Activo (30-60% sesión):** {phases.get('trabajo_count', 0)} usuarios ({phases.get('trabajo_percentage', 0)}%)
* **Fase de Cierre / Ventana de Rescate (60-100%):** {phases.get('cierre_rescate_count', 0)} usuarios ({phases.get('cierre_rescate_percentage', 0)}%)
* **Leads Rescatables Abandonados:** **{lite.get('leads_rescatables_count', 0)} usuarios ({lite.get('leads_rescatables_percentage', 0)}%)** con intención activa (IC >= 40) fueron dados por perdidos sin aplicar una oferta o pregunta de rescate estructurada.
"""

        return md

    def export_canned_json(self, analysis_result):
        templates = analysis_result.get("master_templates", [])
        canned = []
        for t in templates:
            canned.append({
                "shortcut": t["shortcut"],
                "title": t["title"],
                "category": t["category"],
                "content": t["after"]
            })
        return json.dumps(canned, ensure_ascii=False, indent=2)


    def _get_rubro_gap_categories(self, rubro_key):
        """Categorías de brechas de handoff del rubro, desde rubros.json."""
        cats = CATALOGO['categorias_gap'].get(rubro_key) or CATALOGO['categorias_gap']['servicios_generales']
        salida = []
        for c in cats:
            d = dict(c)
            patron = d.pop('regex', None)
            flags = d.pop('regex_flags', '')
            if patron is not None:
                d['regex'] = re.compile(patron, re.I if 'i' in flags else 0)
            salida.append(d)
        return salida

    def _compute_handoff_gap_analysis(self, client_conversations, operator_counts, rubro_key='construccion_corralon'):
        is_bot_re = re.compile(r'bot|sistema|auto|automatiz', re.IGNORECASE)
        human_req_re = re.compile(r'\b(asesor|operador|humano|persona|alguien|ayuda|atenci[oó]n|hablar con|no me entend|pasame|comunicarme)\b', re.IGNORECASE)

        categories_def = self._get_rubro_gap_categories(rubro_key)

        total_human_convs = 0
        category_counts = Counter()
        category_hours = defaultdict(float)
        category_samples = defaultdict(list)
        category_operator_samples = defaultdict(list)

        for cid, msgs in client_conversations.items():
            has_human = False
            first_human_idx = -1
            for idx, m in enumerate(msgs):
                if is_propio(m):
                    op = m.get('Nombre Operador', '').strip() or 'Bot / Sistema'
                    if not is_bot_re.search(op):
                        has_human = True
                        first_human_idx = idx
                        break

            if not has_human:
                continue

            total_human_convs += 1

            client_msgs_before = []
            for idx in range(first_human_idx):
                m = msgs[idx]
                if not is_propio(m):
                    txt = m.get('Mensaje', '').strip()
                    if txt and txt not in ('[AUDIO]', '[IMAGEN]') and len(txt) > 2:
                        client_msgs_before.append(txt)

            explicit_req = any(human_req_re.search(t) for t in client_msgs_before)
            free_texts = [t for t in client_msgs_before if not t.startswith('.') and len(t) > 6]
            menu_texts = [t for t in client_msgs_before if t.startswith('.')]

            substantive_text = free_texts[-1] if free_texts else (menu_texts[-1] if menu_texts else (client_msgs_before[-1] if client_msgs_before else ''))
            combined_search_text = ' '.join(client_msgs_before)

            matched_cat_key = None
            for cdef in categories_def:
                if cdef["regex"].search(substantive_text) or cdef["regex"].search(combined_search_text):
                    matched_cat_key = cdef["key"]
                    break

            if not matched_cat_key:
                if explicit_req:
                    matched_cat_key = categories_def[-1]["key"]
                else:
                    matched_cat_key = categories_def[0]["key"]

            human_msgs_count = sum(1 for m in msgs if is_propio(m) and not is_bot_re.search(m.get('Nombre Operador', '')))
            est_hours = (human_msgs_count * SUPUESTOS['minutos_por_mensaje']) / 60.0

            category_counts[matched_cat_key] += 1
            category_hours[matched_cat_key] += est_hours

            # Muestra de mensajes de clientes
            sample_cand = substantive_text if (substantive_text and not substantive_text.startswith('.')) else (free_texts[0] if free_texts else substantive_text)
            if sample_cand and len(sample_cand) < 140 and len(category_samples[matched_cat_key]) < 3:
                clean_cand = sample_cand.replace('\n', ' ').strip()
                if clean_cand not in category_samples[matched_cat_key] and len(clean_cand) > 6:
                    category_samples[matched_cat_key].append(clean_cand)

            # Muestra de lo que responde hoy el operador humano
            operator_msgs = []
            for idx in range(first_human_idx, len(msgs)):
                m = msgs[idx]
                if is_propio(m):
                    op_name = m.get('Nombre Operador', '').strip()
                    if not is_bot_re.search(op_name):
                        t = m.get('Mensaje', '').strip()
                        if t and t not in ('[AUDIO]', '[IMAGEN]') and len(t) > 6 and not t.lower().startswith('gracias') and not t.lower() == 'ok':
                            operator_msgs.append(t)

            if operator_msgs and len(category_operator_samples[matched_cat_key]) < 3:
                clean_op = operator_msgs[0].replace('\n', ' ').strip()
                if clean_op not in category_operator_samples[matched_cat_key] and len(clean_op) > 6:
                    category_operator_samples[matched_cat_key].append(clean_op)

        avoidable_keys = {c["key"] for c in categories_def if c["feasibility"] != "Consultiva (Humano)"}
        avoidable_count = sum(category_counts[k] for k in avoidable_keys)
        avoidable_pct = round((avoidable_count / (total_human_convs or 1)) * 100, 1)
        avoidable_hours = sum(category_hours[k] for k in avoidable_keys)

        top_triggers = []
        for cdef in categories_def:
            k = cdef["key"]
            cnt = category_counts[k]
            if cnt > 0:
                top_triggers.append({
                    "category_key": k,
                    "title": cdef["title"],
                    "icon": cdef["icon"],
                    "count": cnt,
                    "percentage": round((cnt / (total_human_convs or 1)) * 100, 1),
                    "human_hours_spent": round(category_hours[k], 1),
                    "is_avoidable": k in avoidable_keys,
                    "automation_feasibility": cdef["feasibility"],
                    "solution_type": cdef["solution_type"],
                    "solution_action": cdef["solution_action"],
                    "sample_client_phrases": category_samples.get(k, []),
                    "sample_operator_responses": category_operator_samples.get(k, []),
                    "template_target_id": cdef["template_target_id"]
                })

        top_triggers.sort(key=lambda x: x["count"], reverse=True)

        return {
            "total_human_handoffs": total_human_convs,
            "avoidable_handoffs_count": avoidable_count,
            "avoidable_handoffs_percentage": avoidable_pct,
            "consultative_handoffs_count": total_human_convs - avoidable_count,
            "consultative_handoffs_percentage": round(100 - avoidable_pct, 1),
            "recoverable_hours_month": round(avoidable_hours, 1),
            "top_triggers": top_triggers
        }