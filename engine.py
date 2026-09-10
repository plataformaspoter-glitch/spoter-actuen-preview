"""
Motor Analítico Conversacional Multirubro - Método ACTÚEN+ V2.5
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
        self.rubro_catalog = {
            'salud_obra_social': {
                'name': 'Salud / Obra Social / Medicina Prepaga',
                'description': 'Gestión de autorizaciones, turnos médicos, cartilla, recetas y reintegros.',
                'keywords': [r'autoriz', r'afiliad', r'turno', r'm[eé]dic', r'receta', r'cartilla', r'reintegro', r'estudio', r'cl[ií]nic', r'orden', r'cobertura', r'prestador', r'farmacia', r'medicamento', r'plan', r'paciente', r'salud', r'obra social', r'prepaga', r'credencial', r'carnet', r'odontol', r'psicol', r'kinesio'],
                'default_focus': 'soporte',
                'sla': {
                    'ideal_immediate': 2.0,
                    'acceptable': 5.0,
                    'warning': 12.0,
                    'critical': 25.0,
                    'benchmark_text': 'En salud, la contención inicial debe ser < 2 min y la resolución de autorizaciones < 12 min.'
                },
                'ltv_model': {'avg_ticket_usd': 70, 'annual_frequency': 12, 'retention_years': 3.5, 'cac_usd': 95, 'ticket_name': 'Cuota / Copago Mensual', 'concept': 'En salud, perder un afiliado por demora en autorizaciones destruye el valor de años de cuotas.'},
                'categories': {
                    'Autorizaciones y Órdenes Médicas': [r'autoriz', r'orden', r'estudio', r'pr[aá]ctica', r'ecograf', r'resonanc', r'laboratorio', r'an[aá]lisis', r'biopsia'],
                    'Turnos y Cartilla Médica': [r'turno', r'cartilla', r'm[eé]dic', r'especialista', r'profesional', r'consultorio', r'guardia', r'horario'],
                    'Reintegros y Facturación Médica': [r'reintegro', r'factura', r'cbu', r'gasto', r'comprobante', r'reembolso', r'alias'],
                    'Recetas y Farmacia': [r'receta', r'farmacia', r'medicamento', r'remedio', r'dosis', r'descuento farmacia'],
                    'Afiliación, Credenciales y Cuotas': [r'afiliad', r'credencial', r'cuota', r'plan', r'alta', r'baja', r'carnet', r'titular', r'adherente'],
                    'Reclamos y Demoras de Atención': [r'demora', r'reclamo', r'queja', r'urgencia', r'no me atienden', r'espera', r'cancel', r'mal servicio']
                }
            },
            'construccion_corralon': {
                'name': 'Construcción / Corralón / Materiales',
                'description': 'Venta de materiales gruesos, áridos, hierros, terminaciones y logística en obra.',
                'keywords': [r'cemento', r'hierro', r'arena', r'ripio', r'chapa', r'ladrillo', r'cal\b', r'obra', r'flete', r'pallet', r'camionada', r'malla', r'perfil', r'klaukol', r'weber', r'áridos', r'aridos', r'galpon', r'vigueta', r'corralon', r'corralón'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 2.0,
                    'acceptable': 6.0,
                    'warning': 15.0,
                    'critical': 30.0,
                    'benchmark_text': 'En materiales para la construcción, leads que esperan > 15 min cotizan con otro corralón y se pierden.'
                },
                'ltv_model': {'avg_ticket_usd': 850, 'annual_frequency': 4, 'retention_years': 2.0, 'cac_usd': 120, 'ticket_name': 'Presupuesto de Materiales', 'concept': 'En corralones, el cliente compra repetidamente durante la obra y recomienda a otros constructores.'},
                'categories': {
                    'Presupuesto General / Lista de Materiales': [r'presupuesto', r'cotiz', r'lista', r'precio', r'cuanto me sale', r'materiales'],
                    'Envíos, Fletes y Zonas de Obra': [r'envio', r'envío', r'flete', r'llegan', r'entreg', r'descarga', r'camion', r'barrio', r'calle'],
                    'Cemento, Cal y Adhesivos': [r'cemento', r'cal\b', r'klaukol', r'weber', r'loma negra', r'holcim', r'pegamento'],
                    'Chapas, Perfiles y Caños': [r'chapa', r'perfil', r'tubo', r'caño', r'aislante', r'zingueria', r'clavador'],
                    'Áridos (Arena, Ripio, Piedra)': [r'arena', r'ripio', r'piedra', r'camionada', r'm3\b', r'metro cubico', r'anchoris'],
                    'Hierros y Mallas Cima': [r'hierro', r'malla', r'del 8', r'del 10', r'del 12', r'del 6', r'alambre', r'estribo'],
                    'Formas de Pago y Descuentos': [r'pago', r'cuota', r'tarjeta', r'transferencia', r'efectivo', r'descuento', r'debito', r'cheque'],
                    'Reclamos y Contenedores': [r'demora', r'contenedor', r'pedido', r'a que hora vienen', r'reclamo', r'multa', r'falta']
                }
            },
            'automotor_concesionaria': {
                'name': 'Automotor / Concesionaria / Repuestos',
                'description': 'Venta de vehículos 0km, usados, planes de ahorro, service y repuestos.',
                'keywords': [r'auto\b', r'veh[ií]culo', r'concesionari', r'0km', r'usado', r'plan de ahorro', r'cuota plan', r'adjudicad', r'kilometraje', r'repuesto', r'taller', r'service', r'motor', r'chasis', r'test drive', r'patente'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 3.0,
                    'acceptable': 8.0,
                    'warning': 20.0,
                    'critical': 45.0,
                    'benchmark_text': 'El comprador de autos contacta hasta 4 concesionarias; responder antes de 5 min duplica la tasa de visita.'
                },
                'ltv_model': {'avg_ticket_usd': 18000, 'annual_frequency': 0.4, 'retention_years': 5.0, 'cac_usd': 450, 'ticket_name': 'Vehículo / Plan de Ahorro', 'concept': 'En concesionarias, cada cliente genera ingresos por compra, service oficial, repuestos y recompras.'},
                'categories': {
                    'Consulta de Modelos y Stock': [r'modelo', r'version', r'stock', r'color', r'0km', r'usado', r'ficha t[eé]cnica'],
                    'Financiación y Cuotas de Plan': [r'plan', r'cuota', r'financi', r'anticipo', r'tasa', r'cr[eé]dito', r'banco'],
                    'Cotización de Usado en Parte de Pago': [r'usado', r'toma', r'mi auto', r'entrego', r'a[ñn]o', r'km', r'tasaci[oó]n'],
                    'Turnos de Service y Taller': [r'service', r'taller', r'mantenimiento', r'turno', r'aceite', r'frenos', r'garant[ií]a'],
                    'Repuestos y Accesorios': [r'repuesto', r'pieza', r'accesorio', r'bateria', r'cubierta', r'neumatico']
                }
            },
            'inmobiliaria_desarrollos': {
                'name': 'Inmobiliaria / Desarrollos / Alquileres',
                'description': 'Alquileres, venta de propiedades, lotes, tasaciones y desarrollos de pozo.',
                'keywords': [r'inmobiliari', r'alquiler', r'departamento', r'depto', r'casa\b', r'terreno', r'lote', r'propiedad', r'expensas', r'garant[ií]a', r'recibo de sueldo', r'tasaci[oó]n', r'venta', r'escritura', r'pozo'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 3.0,
                    'acceptable': 10.0,
                    'warning': 25.0,
                    'critical': 60.0,
                    'benchmark_text': 'En real estate, el prospecto busca agendar visita o conocer requisitos en el primer contacto.'
                },
                'ltv_model': {'avg_ticket_usd': 45000, 'annual_frequency': 0.25, 'retention_years': 4.0, 'cac_usd': 600, 'ticket_name': 'Propiedad / Alquiler Anual', 'concept': 'En real estate, el prospecto desatendido alquila o compra con otra inmobiliaria y se pierde la comisión y futuras operaciones.'},
                'categories': {
                    'Disponibilidad y Ficha de Propiedades': [r'disponible', r'fotos', r'video', r'ambientes', r'dormitorios', r'zona', r'ubicaci[oó]n'],
                    'Requisitos y Condiciones de Alquiler': [r'requisito', r'alquiler', r'garant[ií]a', r'recibo', r'mes de dep[oó]sito', r'expensas'],
                    'Coordinación de Visitas': [r'visita', r'verla', r'conocer', r'cuando se puede', r'horario', r'agendar'],
                    'Venta, Lotes y Planes de Pozo': [r'venta', r'precio', r'valor', r'cuotas', r'anticipo', r'pozo', r'loteo'],
                    'Tasaciones y Consultas de Propietarios': [r'tasar', r'tasaci[oó]n', r'vender', r'poner en alquiler', r'administraci[oó]n']
                }
            },
            'seguros_fintech': {
                'name': 'Seguros / Fintech / Finanzas',
                'description': 'Pólizas de seguro, denuncias de siniestros, créditos, tarjetas y transferencias.',
                'keywords': [r'seguro', r'p[oó]liza', r'siniestro', r'choque', r'cobertura', r'franquicia', r'cr[eé]dito', r'pr[eé]stamo', r'tarjeta', r'saldo', r'l[ií]mite', r'transferencia', r'banco', r'inter[eé]s', r'cbu'],
                'default_focus': 'soporte',
                'sla': {
                    'ideal_immediate': 1.5,
                    'acceptable': 4.0,
                    'warning': 10.0,
                    'critical': 20.0,
                    'benchmark_text': 'En siniestros o transacciones financieras, el cliente necesita asistencia y contención inmediata.'
                },
                'ltv_model': {'avg_ticket_usd': 45, 'annual_frequency': 12, 'retention_years': 3.0, 'cac_usd': 85, 'ticket_name': 'Póliza Mensual / Préstamo', 'concept': 'En seguros y finanzas, la retención anual multiplica el margen operativo; la desatención dispara el churn.'},
                'categories': {
                    'Denuncias de Siniestros y Choques': [r'siniestro', r'choque', r'accidente', r'robo', r'gr[uú]a', r'auxilio', r'taller'],
                    'Cotización y Contratación de Póliza': [r'cotiz', r'precio', r'cobertura', r'terceros', r'todo riesgo', r'auto', r'hogar'],
                    'Préstamos y Tarjetas de Crédito': [r'prestamo', r'préstamo', r'credito', r'crédito', r'límite', r'requisitos', r'cuotas'],
                    'Consultas de Pagos y Débito Automático': [r'pago', r'cuota', r'debito', r'cobro', r'vencimiento', r'comprobante'],
                    'Gestión de Cuenta y Reclamos': [r'cuenta', r'bloqueo', r'clave', r'reclamo', r'desconozco', r'tarjeta perdida']
                }
            },
            'educacion_institutos': {
                'name': 'Educación / Universidades / Cursos',
                'description': 'Inscripciones a carreras, diplomaturas, fechas de examen, aranceles y títulos.',
                'keywords': [r'carrera', r'curso', r'diplomatura', r'universidad', r'facultad', r'inscripci[oó]n', r'arancel', r'cuota', r'matr[ií]cula', r'alumno', r'profesor', r'examen', r't[ií]tulo', r'modalidad', r'online', r'presencial'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 3.0,
                    'acceptable': 10.0,
                    'warning': 25.0,
                    'critical': 60.0,
                    'benchmark_text': 'En educación, enviar plan de estudios y aranceles en 1 solo mensaje acelera la preinscripción.'
                },
                'ltv_model': {'avg_ticket_usd': 130, 'annual_frequency': 10, 'retention_years': 2.5, 'cac_usd': 150, 'ticket_name': 'Matrícula y Cuota Mensual', 'concept': 'En educación, un alumno inscripto permanece entre 2 y 4 años abonando aranceles continuos.'},
                'categories': {
                    'Planes de Estudio y Modalidades': [r'carrera', r'programa', r'plan de estudio', r'materias', r'duraci[oó]n', r'modalidad', r'virtual'],
                    'Aranceles, Matrículas y Becas': [r'arancel', r'cuota', r'matricula', r'cuanto sale', r'costo', r'beca', r'descuento'],
                    'Proceso de Preinscripción e Ingreso': [r'inscribir', r'inscripcion', r'anotarme', r'requisito', r'fecha limite', r'ingreso'],
                    'Consultas de Alumnos y Exámenes': [r'alumno', r'examen', r'mesa', r'final', r'nota', r'certificado', r'constancia'],
                    'Administración y Pagos': [r'comprobante', r'factura', r'pago de cuota', r'recibo', r'deuda']
                }
            },
            'comercio_retail': {
                'name': 'Comercio / Retail / E-Commerce / Moda',
                'description': 'Venta minorista, indumentaria, calzado, tecnología, catálogo y envíos.',
                'keywords': [r'producto', r'talle', r'stock', r'env[ií]o', r'comprar', r'cat[aá]logo', r'devoluc', r'garant[ií]a', r'carrito', r'pedido', r'remera', r'pantalon', r'zapatilla', r'tienda', r'local'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 2.0,
                    'acceptable': 5.0,
                    'warning': 12.0,
                    'critical': 25.0,
                    'benchmark_text': 'En compras de retail por chat, el 60% de los clientes compra en los primeros 10 min si hay stock y link.'
                },
                'ltv_model': {'avg_ticket_usd': 50, 'annual_frequency': 4.5, 'retention_years': 2.0, 'cac_usd': 28, 'ticket_name': 'Ticket Promedio de Compra', 'concept': 'En e-commerce y retail, el comprador satisfecho recompra de 4 a 6 veces al año y comparte catálogos.'},
                'categories': {
                    'Stock, Talles y Modelos': [r'stock', r'disponible', r'talle', r'color', r'modelo', r'catálogo', r'catalogo', r'medidas'],
                    'Precios, Promociones y Cuotas': [r'precio', r'cuanto sale', r'cuánto sale', r'cuota', r'tarjeta', r'descuento', r'promo', r'efectivo'],
                    'Envíos y Puntos de Retiro': [r'envio', r'envío', r'domicilio', r'sucursal', r'retiro', r'correo', r'codigo postal', r'cp'],
                    'Cambios, Devoluciones y Fallas': [r'cambio', r'devoluc', r'garantia', r'garantía', r'falla', r'rotura', r'talle chico'],
                    'Estado de Pedido y Seguimiento': [r'donde esta mi pedido', r'seguimiento', r'cuando llega', r'despacharon', r'codigo de envio']
                }
            },
            'turismo_hoteleria': {
                'name': 'Turismo / Hotelería / Alquiler Temporario',
                'description': 'Reservas de hoteles, cabañas, paquetes de viaje, excursiones y vuelos.',
                'keywords': [r'hotel', r'caba[ñn]a', r'reserva', r'check-in', r'check-out', r'noche', r'pasaje', r'vuelo', r'paquete', r'turismo', r'excursi[oó]n', r'hospedaje', r'desayuno', r'pileta'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 2.0,
                    'acceptable': 5.0,
                    'warning': 15.0,
                    'critical': 30.0,
                    'benchmark_text': 'En turismo la disponibilidad es volátil; cotizar tarifas y noches de inmediato asegura la seña.'
                },
                'ltv_model': {'avg_ticket_usd': 380, 'annual_frequency': 1.8, 'retention_years': 3.0, 'cac_usd': 75, 'ticket_name': 'Estadía / Paquete Turístico', 'concept': 'En hotelería y turismo, la fidelización asegura temporadas futuras y elimina comisiones de OTAs.'},
                'categories': {
                    'Tarifas y Disponibilidad de Fechas': [r'tarifa', r'precio', r'disponibilidad', r'fecha', r'noche', r'cuanto cuesta', r'personas'],
                    'Servicios y Comodidades del Lugar': [r'desayuno', r'pileta', r'estacionamiento', r'cochera', r'wifi', r'mascota', r'aire'],
                    'Confirmación de Reserva y Seña': [r'reserva', r'seña', r'bloquear', r'confirmar', r'transferencia', r'tarjeta'],
                    'Coordinación de Llegada (Check-in)': [r'check in', r'check-in', r'a que hora', r'llegada', r'llaves', r'direccion', r'como llegar'],
                    'Cancelaciones y Modificaciones': [r'cancelar', r'reprogramar', r'cambio de fecha', r'devolucion']
                }
            },
            'gastronomia_delivery': {
                'name': 'Gastronomía / Restaurantes / Delivery',
                'description': 'Pedidos de comida, reservas de mesa, menús diarios y delivery.',
                'keywords': [r'comida', r'men[uú]', r'carta\b', r'pedido', r'delivery', r'mesa\b', r'reserva mesa', r'pizza', r'hamburguesa', r'sushi', r'empanada', r'plato', r'bebida', r'mozo'],
                'default_focus': 'ventas',
                'sla': {
                    'ideal_immediate': 1.0,
                    'acceptable': 3.0,
                    'warning': 6.0,
                    'critical': 12.0,
                    'benchmark_text': 'En gastronomía, demorar más de 5 min hace que el cliente abra otra app o pida en otro local.'
                },
                'ltv_model': {'avg_ticket_usd': 22, 'annual_frequency': 18, 'retention_years': 1.5, 'cac_usd': 15, 'ticket_name': 'Pedido / Mesa de Restaurante', 'concept': 'En gastronomía, el cliente habitual pide 1 a 2 veces por mes; un mensaje sin responder lo manda a la competencia.'},
                'categories': {
                    'Toma de Pedidos y Delivery': [r'quiero pedir', r'delivery', r'envio', r'para llevar', r'domicilio', r'cuanto demora'],
                    'Carta, Menú y Promociones': [r'menu', r'menú', r'carta', r'precios', r'promos', r'que tienen', r'platos'],
                    'Reservas de Mesas y Eventos': [r'reserva', r'mesa', r'personas', r'cumpleaños', r'horario', r'adentro', r'afuera'],
                    'Medios de Pago y Facturación': [r'pago', r'alias', r'mercado pago', r'efectivo', r'tarjeta', r'posnet'],
                    'Reclamos por Demora o Error en Pedido': [r'demora', r'no llega', r'frio', r'falta', r'vino mal', r'cancelar']
                }
            },
            'saas_b2b_tecnologia': {
                'name': 'Tecnología / SaaS / Servicios B2B',
                'description': 'Software, demos comerciales, soporte técnico, integraciones y licencias.',
                'keywords': [r'software', r'saas', r'plataforma', r'sistema', r'licencia', r'demo', r'integraci[oó]n', r'api\b', r'login', r'usuario', r'contrase[ñn]a', r'ticket', r'error', r'falla', r'bug', r'servidor'],
                'default_focus': 'soporte',
                'sla': {
                    'ideal_immediate': 2.0,
                    'acceptable': 6.0,
                    'warning': 15.0,
                    'critical': 35.0,
                    'benchmark_text': 'En software B2B, las fallas críticas requieren primer contacto en < 5 min para evitar impacto operativo.'
                },
                'ltv_model': {'avg_ticket_usd': 280, 'annual_frequency': 12, 'retention_years': 3.0, 'cac_usd': 350, 'ticket_name': 'Suscripción Mensual B2B', 'concept': 'En software B2B, cada cliente fidelizado genera ingresos recurrentes mensuales e introduce upgrades de licencias.'},
                'categories': {
                    'Soporte Técnico y Reporte de Bugs': [r'no funciona', r'error', r'bug', r'problema', r'falla', r'caido', r'ticket'],
                    'Accesos, Usuarios y Recuperación': [r'login', r'clave', r'contraseña', r'usuario', r'acceso', r'desbloqueo', r'permisos'],
                    'Solicitud de Demo y Presupuestos': [r'demo', r'reunion', r'precio', r'planes', r'cotizar', r'presupuesto', r'probar'],
                    'Facturación, Planes y Upgrades': [r'factura', r'plan', r'upgrade', r'licencias', r'renovacion', r'tarjeta'],
                    'Consultas de Integración y API': [r'api', r'integracion', r'webhook', r'documentacion', r'configuracion']
                }
            },
            'servicios_generales': {
                'name': 'Servicios Profesionales / Atención General',
                'description': 'Atención al cliente, trámites, presupuestos y soporte general multirubro.',
                'keywords': [r'servicio', r'consulta', r'horario', r'turno', r'precio', r'ayuda', r'soporte', r'atenci[oó]n'],
                'default_focus': 'soporte',
                'sla': {
                    'ideal_immediate': 2.5,
                    'acceptable': 7.0,
                    'warning': 15.0,
                    'critical': 35.0,
                    'benchmark_text': 'En atención general, el estándar óptimo de resolución en primer contacto es menor a 8 min.'
                },
                'ltv_model': {'avg_ticket_usd': 120, 'annual_frequency': 4.0, 'retention_years': 2.0, 'cac_usd': 60, 'ticket_name': 'Servicio / Honorario Base', 'concept': 'En servicios profesionales, la confianza inicial determina una relación comercial plurianual.'},
                'categories': {
                    'Consultas Generales y Horarios': [r'horario', r'abierto', r'direccion', r'dirección', r'donde estan', r'ubicación'],
                    'Tarifas y Presupuestos': [r'precio', r'costo', r'cuanto', r'cuánto', r'presupuesto', r'valor'],
                    'Soporte y Asistencia': [r'ayuda', r'soporte', r'no funciona', r'error', r'falla', r'problema'],
                    'Gestión de Cuentas y Trámites': [r'cuenta', r'dni', r'trámite', r'tramite', r'estado', r'document'],
                    'Reclamos y Quejas': [r'reclamo', r'queja', r'demora', r'mal servicio', r'desconozco']
                }
            }
        }

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
        rubro_pingpong_map = {
            'construccion_corralon': (3.5, 3.0),   # 6.5 total (acopio, fletes, listas de materiales)
            'automotor_concesionaria': (4.0, 3.5), # 7.5 total (usado, financiación, service)
            'inmobiliaria_desarrollos': (4.0, 3.5), # 7.5 total (visitas, requisitos, tasación)
            'salud_obra_social': (3.0, 3.0),       # 6.0 total (autorizaciones, cartilla, DNI)
            'seguros_fintech': (3.0, 3.0),         # 6.0 total (pólizas, siniestros)
            'educacion_institutos': (3.5, 3.0),    # 6.5 total (planes de estudio, aranceles)
            'comercio_retail': (3.0, 2.5),         # 5.5 total (stock, talle, envío)
            'turismo_hoteleria': (3.5, 3.0),       # 6.5 total (fechas, comodidades, seña)
            'gastronomia_delivery': (2.5, 2.5),    # 5.0 total (pedido rápido, delivery)
            'saas_b2b_tecnologia': (3.5, 3.0),     # 6.5 total (tickets, demos)
            'servicios_generales': (3.5, 3.0)      # 6.5 total
        }
        ideal_c, ideal_op = rubro_pingpong_map.get(best_rubro_key, (3.5, 3.0))
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
                "est_hours_spent": round((count * 0.75) / 60, 1)
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
            lite_phases=lite_phases
        )

        # 11. Proyección de Ahorro y Beneficio Económico Fundamentado
        # Línea de base real actual
        baseline_company_msgs_per_client = round(company_msgs_count / (unique_clients or 1), 1)
        target_msgs_per_client = 5.0 if final_focus == 'ventas' else 4.0
        
        # Objetivo metodológico
        estimated_opt_company_msgs = int(unique_clients * target_msgs_per_client)
        saved_messages = max(0, company_msgs_count - estimated_opt_company_msgs)
        reduction_percentage = round((saved_messages / (company_msgs_count or 1)) * 100, 1)
        saved_hours = round((saved_messages * 0.75) / 60, 1)

        # Estimación de Beneficio Económico
        hourly_rate_ars = 5000
        msg_cost_ars = 45
        labor_savings_ars = saved_hours * hourly_rate_ars
        api_savings_ars = saved_messages * msg_cost_ars
        total_financial_benefit_ars = labor_savings_ars + api_savings_ars
        total_financial_benefit_usd = round(total_financial_benefit_ars / 1300, 2)

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

            user_text = " ".join([m.get('Texto', '') for m in user_msgs]).lower()

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
            avg_char_len = (sum(len(m.get('Texto', '')) for m in user_msgs) / len(user_msgs)) if user_msgs else 0
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

        conversion_loss_rate = 0.65
        immediate_lost_usd = round(leads_at_risk_count * avg_ticket * conversion_loss_rate)
        ltv_capital_lost_usd = round(leads_at_risk_count * ltv_val * conversion_loss_rate)
        cac_wasted_usd = round(leads_at_risk_count * cac)
        total_economic_risk_usd = ltv_capital_lost_usd + cac_wasted_usd

        projected_recovered_usd = round(total_economic_risk_usd * 0.75)
        exchange_rate_ars = 1250
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

    def _evaluate_actuen_dynamic(self, focus, rubro_name, sla, fragmentation_rate, avg_wait, pct_over_warning, system_drops, bot_welcomes, unique_clients, handoff_data, top_questions, topic_data, ltv_econ=None, lite_phases=None):
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

        # U - Ubicar la Intención
        top_inquiry = topic_data[0]['category'] if topic_data else 'la consulta principal'
        scorecard.append({
            "pillar": "U - Ubicar la Intención",
            "score": 50,
            "status": "ALERTA",
            "focus_context": "Descubrimiento de Macro y Micro-intención",
            "diagnosis": f"En {rubro_name}, el {topic_data[0]['percentage'] if topic_data else 30}% de los usuarios ingresa por '{top_inquiry}'. Actualmente se piden los requisitos en turnos separados en lugar de anticipar la necesidad.",
            "recommendation": f"Diseñar un Blueprint de Micro-intenciones: Al consultar por {top_inquiry.lower()}, solicitar los datos clave en el turno inicial."
        })

        # E - Experiencia Personalizada
        scorecard.append({
            "pillar": "E - Experiencia Personalizada",
            "score": 48,
            "status": "ALERTA",
            "focus_context": "Reactivación y Protocolo de Rescate",
            "diagnosis": f"Falta de protocolo activo para reenganchar conversaciones inactivas. Se detecta abandono sin seguimiento {'comercial del presupuesto' if is_sales else 'del estado del trámite/caso'}.",
            "recommendation": "Protocolo de Rescate: Reactivar al usuario utilizando su nombre y el motivo específico de su consulta, evitando plantillas robóticas."
        })

        # N - Nutrir y Cerrar
        scorecard.append({
            "pillar": "N - Nutrir y Cerrar",
            "score": 42,
            "status": "CRÍTICO",
            "focus_context": "Tipping Point Comercial" if is_sales else "Confirmación de FCR (Resolución)",
            "diagnosis": "Cierres pasivos frecuentes (ej. 'a disposición', 'cualquier duda nos avisas') que dejan el control en el usuario sin forzar el avance.",
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

        scorecard.append({
            "pillar": "+ Optimización Continua",
            "score": 80 if plus_status == "ÓPTIMO" else 50,
            "status": plus_status,
            "focus_context": f"Carga Humana ({handoff_data.get('human_share_percentage', 0)}%) vs Bot ({bot_pct}%)",
            "diagnosis": plus_diag,
            "recommendation": plus_recom
        })

        return scorecard

    def _get_rubro_templates(self, rubro_key, focus, company_name=None):
        is_sales = (focus == 'ventas')
        c_name = company_name if (company_name and company_name != 'Empresa') else (self.company_name or 'Nuestra Empresa')
        clean_alias_base = re.sub(r'[^A-Za-z0-9]', '.', c_name.strip().upper()).strip('.')
        c_alias = f"{clean_alias_base}.OFICIAL" if clean_alias_base and clean_alias_base != 'EMPRESA' else 'PAGOS.OFICIALES'

        # 1. CONSTRUCCIÓN / CORRALÓN / MATERIALES (6 Plantillas)
        if rubro_key == 'construccion_corralon':
            return [
                {
                    "id": "presupuesto_corralon",
                    "title": "Presupuesto General con 7% OFF Contado",
                    "shortcut": "/coti",
                    "category": "Ventas / Materiales",
                    "before": "Buenos días -> 'en breve enviamos' -> PDF mudo -> medios de pago -> silencio (7 msgs).",
                    "after": f"👋 ¡Hola! Te adjunto el presupuesto detallado de {c_name} (*Presupuesto N° {{NRO_COTIZACION}}*).\n\n📋 *Resumen de tu pedido:*\n• *Total de Lista / Tarjetas:* ${{TOTAL_LISTA}}\n• 💡 *Con 7% OFF (Efectivo / Transferencia / Débito):* *${{TOTAL_DESCUENTO}}*\n• *Disponibilidad:* Todo en stock para despacho inmediato.\n• *Flete:* Cotizado para {{ZONA/LOCALIDAD}}.\n\n⏱️ _Precios congelados por 48 horas._\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos los materiales para programar el camión para esta semana?*",
                    "tipping_point": "¿Querés que te reservemos los materiales para programar el camión para esta semana?",
                    "key_benefit": "Resume el precio en el chat, destaca el descuento contado y cierra con reserva."
                },
                {
                    "id": "aridos_corralon",
                    "title": "Consulta de Áridos (Arena Común, Lavada / Ripio)",
                    "shortcut": "/aridos",
                    "category": "Áridos",
                    "before": "'arena comun o lavada?' -> 'cuantos metros?' -> 'a que direccion?' (8 msgs).",
                    "after": "¡Hola! Contamos con stock de áridos tanto por m³ como por bolsón o camionada:\n\n🏗️ *Opciones disponibles:*\n• *Arena Común:* ${PRECIO_COMUN}/m³ _(Revoque grueso y contrapisos)_\n• *Arena Lavada / Fina:* ${PRECIO_LAVADA}/m³ _(Fino y pegado de cerámicos)_\n• *Ripio / Piedra Partida:* ${PRECIO_RIPIO}/m³\n💡 *7% de descuento abonando en efectivo o transferencia.*\n\n[---saltomensaje---]\n\n👉 *Decime cuántos metros aproximados necesitás y en qué zona está la obra para pasarte el valor final puesto en tu puerta.*",
                    "tipping_point": "Decime cuántos metros necesitás y en qué zona está la obra para cotizar flete.",
                    "key_benefit": "Resuelve la duda de áridos en 1 turno."
                },
                {
                    "id": "flete_corralon",
                    "title": "Consulta de Envíos, Fletes y Descarga",
                    "shortcut": "/flete",
                    "category": "Logística",
                    "before": "'¿Llegan a mi zona?' -> 'Sí' -> '¿Cuánto sale?' -> 'Pasame la calle' (6 msgs).",
                    "after": f"¡Hola! Sí, realizamos entregas en toda la zona con la flota de camiones de {c_name}:\n\n📍 *Para confirmarte el costo exacto y día de entrega, envianos:*\n1. Lista o cantidad de materiales.\n2. Dirección aproximada o barrio.\n3. ¿La calle permite el ingreso de camión grande?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el costo final puesto en obra de inmediato.*",
                    "tipping_point": "Envianos lista, barrio y acceso de camión para confirmar flete de inmediato.",
                    "key_benefit": "Captura los 3 datos logísticos en 1 solo paso."
                },
                {
                    "id": "cierre_corralon",
                    "title": "Cierre, Cobro y Facturación",
                    "shortcut": "/pago",
                    "category": "Cierre de Venta",
                    "before": "CBU descolgado -> '¿de qué es el comprobante?' -> 'cuit?' -> 'dirección?' (5 msgs).",
                    "after": f"🎯 *Para confirmar tu pedido N° {{NRO_COTIZACION}} y congelar el stock:*\n\n🏦 *Datos Bancarios Oficiales:*\n• *Titular:* {c_name}\n• *Alias:* `{c_alias}`\n• *CBU:* `0270094610023521600015`\n• *Monto con 7% OFF:* *${{MONTO_FINAL}}*\n\n📝 *Una vez hecha la transferencia, envianos el comprobante con estos 4 datos en un solo mensaje:*\n1. Presupuesto N°: {{NRO_COTIZACION}}\n2. CUIT o DNI (para la factura):\n3. Dirección exacta de entrega:\n4. Nombre y teléfono de quién recibe en obra:\n\n[---saltomensaje---]\n\n¡Con eso ingresa inmediatamente a la hoja de ruta de logística! 🚚",
                    "tipping_point": "Una vez hecha la transferencia, envianos el comprobante con los 4 datos en un solo mensaje.",
                    "key_benefit": "Elimina el caos de identificación de pagos y reduce 5 mensajes a 1."
                },
                {
                    "id": "hierros_mallas",
                    "title": "Consulta de Hierros, Mallas y Viguetas",
                    "shortcut": "/hierros",
                    "category": "Hierros y Estructuras",
                    "before": "Múltiples mensajes preguntando medida por medida y flete por separado.",
                    "after": "👋 ¡Hola! Contamos con stock completo de hierro de obra certificado:\n\n🔩 *Valores por barra (12 mts):*\n• Hierro del 6: ${P_6} | del 8: ${P_8} | del 10: ${P_10} | del 12: ${P_12}\n• Malla Cima (del 4 / del 5 / del 6): Desde ${P_MALLA}\n• Alambre de fardo y estribos listos para armar.\n💡 *Precio bonificado abonando de contado/transferencia.*\n\n[---saltomensaje---]\n\n👉 *Pasame la lista completa de barras o mallas y la zona de obra para armarte el paquete con envío incluido.*",
                    "tipping_point": "Pasame la lista completa y la zona para armarte el paquete con envío incluido.",
                    "key_benefit": "Agrupa las medidas de hierro frecuentes y ancla el flete desde el inicio."
                },
                {
                    "id": "rescate_corralon",
                    "title": "Protocolo de Rescate Comercial (Post-Cotización)",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "Silencio o 'Hola pudiste ver el PDF?' (tasa de respuesta < 10%).",
                    "after": f"👋 ¡Hola {{NOMBRE}}! ¿Cómo estás? Te escribo de {c_name} porque estamos coordinando la hoja de ruta de entregas para tu zona ({{ZONA/BARRIO}}).\n\nQueríamos consultarte si vas a confirmar el pedido del Presupuesto N° {{NRO_COTIZACION}} para reservarte el camión y sostenerte la bonificación especial de contado.\n\n[---saltomensaje---]\n\n👉 *¿Te guardamos el lugar de entrega para esta semana o precisás hacer algún ajuste en los materiales?*",
                    "tipping_point": "¿Te guardamos el lugar de entrega para esta semana o precisás algún ajuste?",
                    "key_benefit": "Reactivación contextual que ofrece valor logístico en lugar de presionar."
                }
            ]

        # 2. COMERCIO / RETAIL / E-COMMERCE (6 Plantillas)
        elif rubro_key == 'comercio_retail':
            return [
                {
                    "id": "producto_retail",
                    "title": "Catálogo, Precios, Stock y Talles Disponibles",
                    "shortcut": "/producto",
                    "category": "Ventas Retail",
                    "before": "'¿Tenés stock?' -> 'Sí' -> '¿Cuánto sale?' -> '¿Qué talles hay?' (6 msgs).",
                    "after": f"👋 ¡Hola! Sí, en {c_name} contamos con stock disponible de *{{PRODUCTO}}*:\n\n🛍️ *Detalles del artículo:*\n• *Variantes / Talles disponibles:* {{TALLES}}\n• *Precio de Lista:* ${{PRECIO}} *(hasta 3 o 6 cuotas con tarjeta)*\n• 💡 *10% OFF en Efectivo o Transferencia:* *${{PRECIO_DESCUENTO}}*\n• 🚚 *Despacho:* Envío a todo el país o retiro en sucursal hoy mismo.\n\n[---saltomensaje---]\n\n👉 *¿En qué variante o talle te gustaría reservarlo para pasarte el link de pago y congelar tu unidad?*",
                    "tipping_point": "¿En qué variante o talle te gustaría reservarlo para pasarte el link de pago?",
                    "key_benefit": "Condensa talle, cuotas, descuento contado y link en 1 solo bloque estructurado."
                },
                {
                    "id": "envios_retail",
                    "title": "Costos de Envío, Tiempos de Entrega y Envío Gratis",
                    "shortcut": "/envio",
                    "category": "Logística / Despacho",
                    "before": "'¿Cuánto sale a mi ciudad?' -> 'Pasame el CP' -> 'Espera que cotizo' (5 msgs).",
                    "after": "📦 *¡Hola! Realizamos despachos diarios con seguimiento en tiempo real:*\n\n• 🚚 *Envío a Domicilio:* 24 a 72 hs hábiles según tu zona.\n• 🏬 *Retiro en Sucursal / Punto Pick-up:* Sin costo de envío.\n• 🎁 *Envío BONIFICADO (GRATIS)* en compras superiores a ${MONTO_MINIMO}.\n\n[---saltomensaje---]\n\n👉 *Envianos tu Código Postal y Localidad para confirmarte el costo exacto y la fecha estimada de llegada.*",
                    "tipping_point": "Envianos tu Código Postal y Localidad para confirmarte costo y fecha exacta.",
                    "key_benefit": "Informa política de envío gratis y solicita el Código Postal en un solo paso."
                },
                {
                    "id": "pago_retail",
                    "title": "Medios de Pago, Cuotas y Datos de Transferencia",
                    "shortcut": "/pago",
                    "category": "Cobranzas",
                    "before": "Pasa CBU suelto -> cliente transfiere sin poner detalle -> no se identifica el pago.",
                    "after": f"💳 *Medios de Pago Habilitados en {c_name}:*\n\n1. *Transferencia Bancaria con 10% OFF:*\n• *Titular:* {c_name}\n• *Alias:* `{c_alias}`\n• *Total con Descuento:* *${{TOTAL_TRANSFERENCIA}}*\n2. *Tarjetas de Crédito / Débito:* En 3 cuotas sin interés mediante link seguro.\n\n[---saltomensaje---]\n\n👉 *Una vez realizada la transferencia, adjuntanos el comprobante junto con tu DNI para facturar y despachar tu pedido de inmediato.*",
                    "tipping_point": "Adjuntanos el comprobante junto con tu DNI para facturar y despachar de inmediato.",
                    "key_benefit": "Resume la cuenta bancaria, cuotas y requisitos de despacho en 1 paso."
                },
                {
                    "id": "cambios_retail",
                    "title": "Política de Cambios y Devoluciones sin Fricción",
                    "shortcut": "/cambio",
                    "category": "Postventa",
                    "before": "Queja de cliente por cambio -> 'hablá con otro sector' -> derivaciones infinitas.",
                    "after": f"👋 ¡Hola! Con gusto gestionamos el cambio de tu compra en {c_name}:\n\n🔄 *Para procesarlo de inmediato en el sistema:*\n1. Número de pedido o ticket de compra:\n2. Producto recibido y nuevo talle o modelo deseado:\n3. ¿Preferís cambio en local o coordinar retiro a domicilio?\n\n[---saltomensaje---]\n\n👉 *Apenas nos confirmes estos datos te reservamos la nueva unidad para asegurar el stock.*",
                    "tipping_point": "Apenas nos confirmes te reservamos la nueva unidad para asegurar el stock.",
                    "key_benefit": "Resuelve la postventa sin fricción y retiene al cliente."
                },
                {
                    "id": "rescate_carrito",
                    "title": "Protocolo de Rescate de Consulta / Carrito Abandonado",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "'Hola pudiste ver?' -> Visto clavado y pérdida de la venta.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! Vimos que estuviste consultando por *{{PRODUCTO}}* en {c_name}.\n\nTe queríamos avisar que quedan las últimas unidades disponibles y te guardamos un beneficio de *envío bonificado* por el día de hoy.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos el pedido antes de que vuelva al catálogo general?*",
                    "tipping_point": "¿Querés que te reservemos el pedido antes de que vuelva al catálogo general?",
                    "key_benefit": "Aplica escasez y beneficio de flete para cerrar la venta fría."
                },
                {
                    "id": "promocion_combo",
                    "title": "Oferta Combo / Up-sell de Productos Complementarios",
                    "shortcut": "/combo",
                    "category": "Ventas / Up-sell",
                    "before": "Venta transaccional de 1 solo ítem sin ofrecer complementos.",
                    "after": "💡 *¡Aprovechá la promoción complementaria de tu pedido!*\n\nLlevando el conjunto completo tenés un *15% OFF adicional* en la segunda unidad y mantenés el mismo costo de envío.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te sumemos la opción complementaria al paquete para aprovechar la bonificación?*",
                    "tipping_point": "¿Querés que te sumemos la opción complementaria al paquete para aprovechar el 15% OFF?",
                    "key_benefit": "Aumenta el ticket promedio (LTV) ofreciendo combos en el momento óptimo."
                }
            ]

        # 3. SALUD / OBRA SOCIAL / PREPAGA (6 Plantillas)
        elif rubro_key == 'salud_obra_social':
            return [
                {
                    "id": "autorizaciones",
                    "title": "Gestión de Autorizaciones y Órdenes Médicas",
                    "shortcut": "/autorizar",
                    "category": "Trámites Médicos",
                    "before": "Hola -> 'pasame foto' -> 'falta el diagnóstico' -> 'número de afiliado?' (5 mensajes).",
                    "after": f"👋 ¡Hola! Te ayudamos a gestionar tu autorización médica en {c_name} en este mismo mensaje:\n\n📋 *Por favor envianos en un solo envío:*\n1. Foto clara de la orden médica (con diagnóstico, fecha y firma visible).\n2. Número de DNI o Credencial del afiliado/a:\n3. Lugar o clínica donde realizarás la práctica:\n\n⏱️ *Tiempo estimado de resolución:* 24 a 48 hs hábiles.\n\n[---saltomensaje---]\n\n👉 *Apenas nos envíes estos datos ingresamos tu solicitud a auditoría médica para su aprobación.*",
                    "tipping_point": "Apenas nos envíes la foto y los 3 datos ingresamos la solicitud a auditoría médica.",
                    "key_benefit": "Elimina el ping-pong pidiendo los requisitos de validación médica en un solo bloque."
                },
                {
                    "id": "turnos",
                    "title": "Solicitud de Turnos y Cartilla Médica",
                    "shortcut": "/turnos",
                    "category": "Cartilla / Turnos",
                    "before": "'Quiero turno' -> 'para qué médico?' -> 'qué zona?' -> 'qué día podés?' (6 mensajes).",
                    "after": "¡Hola! Con gusto coordinamos tu turno o te brindamos los profesionales disponibles en cartilla:\n\n🩺 *Para asignarte la mejor opción, respondenos en este mensaje:*\n• Especialidad o médico requerido:\n• Zona o localidad de preferencia:\n• Días u horarios en los que podés asistir:\n• DNI o N° de Afiliado:\n\n[---saltomensaje---]\n\n👉 *Con estos datos te enviamos las próximas fechas disponibles de inmediato.*",
                    "tipping_point": "Con estos datos te enviamos las opciones disponibles para reservar tu turno.",
                    "key_benefit": "Reúne especialidad, zona y disponibilidad del paciente en 1 turno."
                },
                {
                    "id": "reintegros",
                    "title": "Reintegros y Facturación Médica",
                    "shortcut": "/reintegro",
                    "category": "Facturación",
                    "before": "Factura suelta -> 'de quién es?' -> 'pasame CBU' -> 'falta orden' (4 mensajes).",
                    "after": "🎯 *Para procesar tu reintegro médico de forma directa:*\n\n📝 *Envianos en un solo mensaje:*\n1. Factura oficial (con CUIT del profesional o clínica).\n2. Orden médica o pedido de estudio que originó el gasto.\n3. CBU o Alias bancario del titular para el depósito.\n4. Nombre completo y DNI del afiliado:\n\n[---saltomensaje---]\n\n👉 *¿Contás con esta documentación a mano para cargar el expediente hoy mismo?*",
                    "tipping_point": "¿Contás con esta documentación a mano para cargar el expediente hoy mismo?",
                    "key_benefit": "Evita rechazos de reintegro por documentación incompleta."
                },
                {
                    "id": "recetas_farmacia",
                    "title": "Recetas Electrónicas y Cobertura de Farmacia",
                    "shortcut": "/receta",
                    "category": "Farmacia",
                    "before": "'No me pasa la receta' -> 'qué farmacia?' -> 'qué remedio es?' (5 msgs).",
                    "after": "👋 ¡Hola! Te asistimos con la validación de tu receta de medicamentos:\n\n💊 *Por favor envianos:*\n1. Foto de la receta o prescripción digital:\n2. Número de credencial de afiliado/a:\n3. Farmacia donde estás realizando la compra (Nombre y localidad):\n\n[---saltomensaje---]\n\n👉 *Validamos la cobertura en el sistema y te confirmamos en este mismo chat.*",
                    "tipping_point": "Validamos la cobertura en el sistema y te confirmamos en este mismo chat.",
                    "key_benefit": "Resuelve la autorización de farmacia en caliente sin idas y vueltas."
                },
                {
                    "id": "credencial_digital",
                    "title": "Descarga de Credencial Digital y Carnet",
                    "shortcut": "/credencial",
                    "category": "Afiliaciones",
                    "before": "Cliente pide carnet -> asesor envía links rotos -> pide datos de nuevo.",
                    "after": "📱 *¡Hola! Podés utilizar tu credencial digital de inmediato desde tu celular:*\n\n1. Ingresá a nuestro portal oficial: {LINK_PORTAL}\n2. Usuario: Tu número de DNI (sin puntos).\n3. Contraseña inicial: Los últimos 4 dígitos de tu DNI.\n\n💡 *Presentando la pantalla de la credencial en cualquier prestador o farmacia tenés atención directa sin carnet plástico.*\n\n[---saltomensaje---]\n\n👉 *¿Pudiste ingresar correctamente o requerís que te generemos una clave temporal?*",
                    "tipping_point": "¿Pudiste ingresar correctamente o requerís que te generemos una clave temporal?",
                    "key_benefit": "Autogestión inmediata con validación activa de acceso."
                },
                {
                    "id": "cierre_fcr",
                    "title": "Cierre de Consulta y Confirmación de Resolución (FCR)",
                    "shortcut": "/fcr",
                    "category": "Cierre / Calidad",
                    "before": "'Cualquier cosa a disposición' (deja la gestión abierta o genera re-aperturas).",
                    "after": "✅ *Tu gestión ha sido completada con éxito.*\n\nTe dejamos asentado el número de trámite para seguimiento. Recordá que también contás con nuestro portal web disponible las 24 horas.\n\n[---saltomensaje---]\n\n👉 *¿Quedó resuelta tu consulta o necesitás ayuda con algún otro trámite antes de finalizar?*",
                    "tipping_point": "¿Quedó resuelta tu consulta o necesitás ayuda con algún otro trámite antes de finalizar?",
                    "key_benefit": "Garantiza First Contact Resolution (FCR) y previene reaperturas de casos."
                }
            ]

        # 4. AUTOMOTOR / CONCESIONARIA / REPUESTOS (5 Plantillas)
        elif rubro_key == 'automotor_concesionaria':
            return [
                {
                    "id": "unidad_auto",
                    "title": "Ficha Técnica, Stock y Precio de Vehículo",
                    "shortcut": "/auto",
                    "category": "Ventas / 0km y Usados",
                    "before": "'Hola precio del auto' -> '0km o usado?' -> 'qué versión?' (5 msgs).",
                    "after": f"👋 ¡Hola! Te comparto la información de la unidad en {c_name}:\n\n🚗 *{{MODELO_VEHICULO}} - Versión {{VERSION}}*\n• *Precio de Lista:* ${{PRECIO_LISTA}}\n• 💡 *Bonificación especial este mes:* *${{PRECIO_BONIFICADO}}*\n• *Financiación exclusiva:* Hasta el 50% en tasa preferencial.\n• *Entrega:* Inmediata / En stock en salón.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría coordinar una visita al salón para verlo en persona y realizar un Test Drive esta semana?*",
                    "tipping_point": "¿Te gustaría coordinar una visita para realizar un Test Drive esta semana?",
                    "key_benefit": "Pasa precio, financiación y llama al Test Drive en un solo bloque."
                },
                {
                    "id": "toma_usado",
                    "title": "Tasación de Usado en Parte de Pago",
                    "shortcut": "/usado",
                    "category": "Tasaciones",
                    "before": "Múltiples mensajes pidiendo año, modelo, fotos, kilometraje de a uno.",
                    "after": f"¡Hola! Sí, en {c_name} tomamos tu vehículo usado como parte de pago al mejor valor de mercado.\n\n📋 *Para pasarte una cotización estimada de toma en este momento, envianos:*\n1. Marca, modelo y versión exacta:\n2. Año de patentamiento y kilometraje:\n3. ¿Sos titular y está al día de patentes/multas?\n4. 3 fotos generales (frente, lateral e interior):\n\n[---saltomensaje---]\n\n👉 *Con estos datos nuestro tasador te pasa el valor de toma de inmediato.*",
                    "tipping_point": "Envianos los 4 datos y fotos para pasarte la cotización estimada de toma.",
                    "key_benefit": "Pide toda la ficha de tasación de una sola vez."
                },
                {
                    "id": "turno_taller",
                    "title": "Coordinación de Service Oficial y Mantenimiento",
                    "shortcut": "/service",
                    "category": "Postventa / Taller",
                    "before": "'Quiero hacer el service' -> 'cuántos km tiene?' -> 'qué patente?' (5 msgs).",
                    "after": f"👋 ¡Hola! Con gusto coordinamos el turno de mantenimiento de tu unidad en {c_name}:\n\n🔧 *Por favor confirmanos en un solo mensaje:*\n1. Modelo y patente del vehículo:\n2. Kilometraje actual (ej. 10.000 / 20.000 km):\n3. ¿Deseás revisar algún punto específico además del service oficial?\n4. Sucursal y día de preferencia:\n\n[---saltomensaje---]\n\n👉 *Con estos datos te reservamos el horario de ingreso al taller hoy mismo.*",
                    "tipping_point": "Con estos datos te reservamos el horario de ingreso al taller hoy mismo.",
                    "key_benefit": "Centraliza los datos de postventa en 1 turno."
                },
                {
                    "id": "repuestos_auto",
                    "title": "Consulta de Repuestos y Accesorios Originales",
                    "shortcut": "/repuesto",
                    "category": "Repuestos",
                    "before": "Múltiples repreguntas para saber número de chasis y pieza exacta.",
                    "after": "👋 ¡Hola! Para cotizarte la pieza original exacta y confirmarte stock inmediato:\n\n🔩 *Envianos en este mensaje:*\n1. Número de Chasis o VIN (figura en la cédula verde):\n2. Pieza o repuesto solicitado (con foto si la tenés):\n\n[---saltomensaje---]\n\n👉 *Con el número de chasis te confirmamos disponibilidad y precio final en el acto.*",
                    "tipping_point": "Envianos el número de chasis y la pieza para pasarte precio exacto.",
                    "key_benefit": "Evita errores de catálogo solicitando el número de chasis en el turno inicial."
                },
                {
                    "id": "rescate_concesionaria",
                    "title": "Rescate de Consulta de Vehículo (Test Drive / Financiación)",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "El asesor no hace seguimiento o pregunta '¿pudiste ver el precio?'.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! Te escribo del equipo comercial de {c_name}.\n\nNos ingresó un cupo de bonificación especial en tasa de financiación para la unidad {{MODELO}} que consultaste.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría aprovechar este cupo antes de que finalice la campaña este viernes?*",
                    "tipping_point": "¿Te gustaría aprovechar este cupo de tasa antes de que finalice?",
                    "key_benefit": "Aporta una excusa comercial real (tasa bonificada) para reactivar al prospecto."
                }
            ]

        # 5. INMOBILIARIA / DESARROLLOS / ALQUILERES (5 Plantillas)
        elif rubro_key == 'inmobiliaria_desarrollos':
            return [
                {
                    "id": "inmueble_ficha",
                    "title": "Ficha de Propiedad y Coordinación de Visita",
                    "shortcut": "/propiedad",
                    "category": "Propiedades",
                    "before": "Fotos sueltas -> 'cuánto sale?' -> 'dónde queda?' -> 'cuándo se ve?' (7 msgs).",
                    "after": f"👋 ¡Hola! Te comparto los detalles de la propiedad en {c_name}:\n\n🏡 *{{TIPO_PROPIEDAD}} en {{ZONA/BARRIO}}*\n• *Valor:* ${{VALOR_ALQUILER_VENTA}} *(Expensas: ${{EXPENSAS}})*\n• *Características:* {{CANT_DORMITORIOS}} dormitorios, {{BANOS}} baños, cochera y balcón.\n• *Disponibilidad:* Inmediata.\n\n📅 *Coordinación de Visitas:*\nDisponemos de turnos para visitarla los {{DIAS_VISITA}} de {{HORARIOS}}.\n\n[---saltomensaje---]\n\n👉 *¿Qué día y horario te queda más cómodo para agendar tu visita presencial?*",
                    "tipping_point": "¿Qué día y horario te queda más cómodo para agendar tu visita presencial?",
                    "key_benefit": "Resume precio, expensas, comodidades y agenda la visita en el acto."
                },
                {
                    "id": "requisitos_alquiler",
                    "title": "Requisitos y Condiciones de Ingreso para Alquiler",
                    "shortcut": "/alquiler",
                    "category": "Alquileres",
                    "before": "Ping-pong eterno preguntando recibos de sueldo y garantías sueltas.",
                    "after": "📋 *Condiciones y requisitos para alquilar {PROPIEDAD}:*\n\n1. *Titular:* Demostración de ingresos (últimos 3 recibos de sueldo o certificación contable).\n2. *Garantías:* 2 garantes con bono de sueldo o 1 garantía propietaria (o seguro de caución).\n3. *Gastos de ingreso:* 1 mes de alquiler + 1 mes de depósito de garantía + honorarios de contrato.\n\n[---saltomensaje---]\n\n👉 *¿Contás con esta documentación para enviarte el formulario de postulación directa?*",
                    "tipping_point": "¿Contás con esta documentación para enviarte el formulario de postulación?",
                    "key_benefit": "Filtra postulantes calificados sin repreguntas."
                },
                {
                    "id": "tasacion_inmueble",
                    "title": "Solicitud de Tasación Inmobiliaria",
                    "shortcut": "/tasacion",
                    "category": "Tasaciones",
                    "before": "Múltiples preguntas dispersas sobre m2, estado y dirección.",
                    "after": f"🏡 *¡Hola! Realizamos tasaciones profesionales de mercado en {c_name}:*\n\n📋 *Para coordinar la inspección técnica de tu propiedad, envianos:*\n1. Dirección exacta y barrio:\n2. Tipo de inmueble (Casa / Departamento / Lote / Local):\n3. Superficie estimada (m² cubiertos y totales):\n4. ¿El inmueble cuenta con escritura al día?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te agendamos la visita de nuestro tasador sin costo.*",
                    "tipping_point": "Envianos dirección, tipo, superficie y estado de escritura.",
                    "key_benefit": "Agrupa la ficha del inmueble para tasación inmediata."
                },
                {
                    "id": "loteo_pozo",
                    "title": "Loteos, Terrenos y Desarrollos de Pozo",
                    "shortcut": "/pozo",
                    "category": "Inversiones / Lotes",
                    "before": "Envía folleto sin precios -> prospecto no responde más.",
                    "after": f"🏗️ *Oportunidad de Inversión en {c_name}:*\n\n• *Proyecto:* {{NOMBRE_PROYECTO}} en {{ZONA}}\n• *Lotes desde:* {{SUPERFICIE}} m² con servicios de luz, agua y cloacas.\n• 💡 *Plan de Financiación:* Anticipo del 30% y saldo en hasta 36 cuotas en pesos/dólares.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te enviemos el masterplan con los lotes disponibles para coordinar una visita al predio?*",
                    "tipping_point": "¿Querés que te enviemos el masterplan con los lotes disponibles?",
                    "key_benefit": "Presenta el plan financiero y llama a visitar el desarrollo."
                },
                {
                    "id": "rescate_propiedad",
                    "title": "Seguimiento y Cierre de Visita a Propiedad",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "'Hola qué te pareció el departamento?' -> silencio.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! ¿Cómo estás? Te escribo de {c_name} para consultar qué te pareció la visita a la propiedad de {{CALLE/BARRIO}}.\n\nEl propietario está abierto a evaluar una propuesta de reserva formal esta semana antes de abrirla a otros interesados.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría presentar una oferta de reserva o te mostramos otra alternativa en la misma zona?*",
                    "tipping_point": "¿Te gustaría presentar una oferta formal o ver otra alternativa?",
                    "key_benefit": "Estimula la reserva rápida o redirige a otra propiedad del portfolio."
                }
            ]

        # 6. SEGUROS / FINTECH / FINANZAS (5 Plantillas)
        elif rubro_key == 'seguros_fintech':
            return [
                {
                    "id": "denuncia_siniestro",
                    "title": "Denuncia de Siniestro, Choque o Auxilio Mecánico",
                    "shortcut": "/siniestro",
                    "category": "Siniestros / Urgencias",
                    "before": "Cliente en crisis -> 'pasame póliza' -> 'quién chocó?' -> repreguntas dispersas.",
                    "after": f"🚨 *Asistencia Inmediata por Siniestro - {c_name}:*\n\n1. ¿Hay personas lesionadas que requieran ambulancia urgente?\n2. Datos del vehículo asegurado (Patente y Nombre del Titular):\n3. Dirección exacta donde ocurrió el hecho o donde se encuentra la unidad:\n4. ¿Necesitás grúa / remolque en este momento?\n\n[---saltomensaje---]\n\n👉 *Respondenos con estos datos y te asignamos número de siniestro y móvil de auxilio de inmediato.*",
                    "tipping_point": "Respondenos con los 4 datos y te asignamos auxilio y número de siniestro.",
                    "key_benefit": "Prioriza la seguridad, evalúa auxilio y abre el expediente en 1 turno."
                },
                {
                    "id": "cotizacion_seguro",
                    "title": "Cotización de Seguro de Auto / Hogar",
                    "shortcut": "/cotizaseguro",
                    "category": "Ventas Seguros",
                    "before": "Múltiples mensajes para saber año, modelo y tipo de cobertura.",
                    "after": f"🛡️ *¡Hola! Cotizamos tu cobertura a medida en {c_name}:*\n\n📋 *Para pasarte la propuesta comparativa de las mejores compañías, envianos:*\n• Marca, modelo y año exacto del vehículo:\n• ¿Duerme en garage o en calle?\n• Localidad y código postal donde circula:\n• Cobertura de interés (Terceros Completo / Todo Riesgo con Franquicia):\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el cuadro de valores con descuento por débito automático.*",
                    "tipping_point": "Envianos los datos del vehículo para pasarte la cotización comparativa.",
                    "key_benefit": "Reúne datos de riesgo en un solo bloque para cotización instantánea."
                },
                {
                    "id": "prestamo_fintech",
                    "title": "Solicitud de Préstamo o Límite de Crédito",
                    "shortcut": "/credito",
                    "category": "Créditos",
                    "before": "Pide DNI -> luego recibo -> luego CBU en días distintos.",
                    "after": f"💳 *Simulación de Crédito Inmediato en {c_name}:*\n\n📝 *Requisitos de pre-aprobación:*\n1. Número de DNI (sin puntos):\n2. Monto solicitado y cantidad de cuotas (ej. $500.000 en 12 cuotas):\n3. CBU o Alias bancario donde cobrás tus haberes:\n\n[---saltomensaje---]\n\n👉 *Validamos tu perfil crediticio en el sistema y te confirmamos la pre-aprobación en este chat.*",
                    "tipping_point": "Envianos DNI, monto y CBU para verificar tu pre-aprobación de inmediato.",
                    "key_benefit": "Verificación crediticia en caliente en un solo turno."
                },
                {
                    "id": "pago_poliza",
                    "title": "Estado de Cuenta, Pagos y Débito Automático",
                    "shortcut": "/pago",
                    "category": "Cobranzas",
                    "before": "Pasa CBU suelto sin confirmar si la póliza queda vigente.",
                    "after": f"📄 *Estado de Cuenta y Medios de Pago - {c_name}:*\n\n• *Póliza N°:* {{NRO_POLIZA}}\n• *Monto al día:* *${{MONTO_CUOTA}}*\n• *Alias de Pago:* `{c_alias}`\n• 💡 *Tip:* Adherite a débito automático con tarjeta y obtené un 10% de bonificación continua.\n\n[---saltomensaje---]\n\n👉 *Envianos tu comprobante para registrar la acreditación y emitir tu certificado de cobertura.*",
                    "tipping_point": "Envianos tu comprobante para emitir tu certificado de cobertura de inmediato.",
                    "key_benefit": "Vincula el pago con la vigencia de cobertura de la póliza."
                },
                {
                    "id": "rescate_seguro",
                    "title": "Protocolo de Rescate de Propuesta de Póliza",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "Cliente no responde la cotización.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! Te escribo de {c_name} para consultarte si pudiste revisar la propuesta de seguro que te enviamos.\n\nPodemos sostenerte la bonificación del 20% en las primeras 3 cuotas si confirmamos el alta durante esta semana.\n\n[---saltomensaje---]\n\n👉 *¿Querés que emitamos la póliza para que tu vehículo quede cubierto a partir de hoy?*",
                    "tipping_point": "¿Querés que emitamos la póliza para que tu vehículo quede cubierto hoy?",
                    "key_benefit": "Ofrece beneficio económico y ancla la necesidad de protección inmediata."
                }
            ]

        # 7. EDUCACIÓN / UNIVERSIDADES / CURSOS (5 Plantillas)
        elif rubro_key == 'educacion_institutos':
            return [
                {
                    "id": "info_carrera",
                    "title": "Información de Carrera, Plan de Estudio y Aranceles",
                    "shortcut": "/carrera",
                    "category": "Admisiones",
                    "before": "Envía PDF pesado sin explicar fechas ni precios.",
                    "after": f"🎓 *¡Hola! Te compartimos la información de {{CARRERA_CURSO}} en {c_name}:*\n\n• *Duración:* {{DURACION}} (Modalidad Online / Híbrida con clases grabadas).\n• *Título / Certificación:* Oficial y de validez nacional.\n• 💡 *Matrícula Bonificada:* 100% OFF inscribiéndote antes del {{FECHA_LIMITE}}.\n• *Arancel Mensual:* ${{CUOTA}} por mes.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos una vacante promocional para asegurar la bonificación de matrícula?*",
                    "tipping_point": "¿Querés que te reservemos una vacante promocional para asegurar la bonificación?",
                    "key_benefit": "Resume plan, modalidad y matrícula bonificada con llamado a la reserva."
                },
                {
                    "id": "inscripcion_requisitos",
                    "title": "Requisitos de Inscripción y Documentación",
                    "shortcut": "/inscripcion",
                    "category": "Inscripciones",
                    "before": "Pide papeles de a uno durante semanas.",
                    "after": f"📝 *Pasos para completar tu inscripción en {c_name}:*\n\n1. Foto de DNI (frente y dorso).\n2. Analítico secundario o constancia de título en trámite.\n3. Comprobante de pago del arancel inicial (Alias: `{c_alias}`).\n\n[---saltomensaje---]\n\n👉 *Apenas nos envíes la documentación te generamos tu usuario y clave del campus virtual.*",
                    "tipping_point": "Apenas nos envíes los 3 requisitos te generamos tu acceso al campus virtual.",
                    "key_benefit": "Centraliza el alta de alumno en 1 solo paso."
                },
                {
                    "id": "fechas_examenes",
                    "title": "Fechas de Exámenes y Trámites Académicos",
                    "shortcut": "/examenes",
                    "category": "Alumnos",
                    "before": "Alumno pregunta fecha -> derivación a secretaría -> espera de días.",
                    "after": "📅 *Calendario de Exámenes y Trámites Académicos:*\n\n• *Período de Inscripción a Finales:* Del {FECHA_INICIO} al {FECHA_FIN} desde el portal de alumnos.\n• *Requisito:* Estar al día con la cuota de cursada.\n\n[---saltomensaje---]\n\n👉 *¿Pudiste anotarte desde el portal o necesitás que verifiquemos tu estado académico en secretaría?*",
                    "tipping_point": "¿Pudiste anotarte desde el portal o verificamos tu estado académico?",
                    "key_benefit": "Resuelve la consulta académica sin demoras burocráticas."
                },
                {
                    "id": "pago_cuota_edu",
                    "title": "Pago de Cuotas y Aranceles Educativos",
                    "shortcut": "/pago",
                    "category": "Tesorería",
                    "before": "CBU descolgado sin datos de alumno ni comprobante.",
                    "after": f"🏦 *Datos Bancarios de Tesorería - {c_name}:*\n\n• *Titular:* {c_name}\n• *Alias:* `{c_alias}`\n• *Importe Cuota:* *${{MONTO_CUOTA}}*\n\n📝 *Al transferir, adjuntá el comprobante indicando:*\n1. Nombre y Apellido del Alumno:\n2. DNI:\n3. Carrera y mes que estás abonando:\n\n[---saltomensaje---]\n\n¡Con eso se acredita automáticamente en tu legajo! 🎓",
                    "tipping_point": "Adjuntá comprobante con nombre, DNI y carrera para impactar en tu legajo.",
                    "key_benefit": "Identifica los pagos de aranceles eliminando confusiones contables."
                },
                {
                    "id": "rescate_carrera",
                    "title": "Protocolo de Rescate de Interesado en Formación",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "Interesado no responde después de pedir el programa.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! ¿Cómo estás? Te escribo del equipo de admisiones de {c_name}.\n\nEstamos cerrando el cupo del grupo que inicia la próxima semana y nos queda 1 lugar disponible con el arancel congelado.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría que te reservemos el lugar o querés conversar con un asesor pedagógico para despejar dudas?*",
                    "tipping_point": "¿Te gustaría que te reservemos el lugar o conversás con un asesor pedagógico?",
                    "key_benefit": "Usa escasez de cupos para recuperar postulantes indecisos."
                }
            ]

        # 8. GASTRONOMÍA / DELIVERY / BARES (5 Plantillas)
        elif rubro_key == 'gastronomia_delivery':
            return [
                {
                    "id": "carta_pedido",
                    "title": "Menú Digital, Promociones y Tomar Pedido",
                    "shortcut": "/menu",
                    "category": "Pedidos / Delivery",
                    "before": "'Pasame la carta' -> fotos borrosas -> 'cuánto tarda?' -> 6 msgs.",
                    "after": f"🍕 *¡Hola! Te damos la bienvenida a {c_name}:*\n\n📋 *Carta Digital y Promociones de Hoy:* {{LINK_CARTA}}\n• 💡 *Combo del Día:* {{COMBO_ESPECIAL}} a solo ${{PRECIO_COMBO}}.\n• ⏱️ *Demora estimada de cocina y reparto:* 30 a 45 minutos.\n\n[---saltomensaje---]\n\n👉 *Para marchar tu pedido, envianos: tu orden, dirección exacta y con qué medio abonás.*",
                    "tipping_point": "Envianos tu orden, dirección exacta y medio de pago para marchar el pedido.",
                    "key_benefit": "Pasa menú, demora y captura el pedido en un solo turno."
                },
                {
                    "id": "reservas_mesa",
                    "title": "Reservas de Mesas y Cumpleaños",
                    "shortcut": "/reserva",
                    "category": "Reservas",
                    "before": "Múltiples mensajes para coordinar cantidad de personas y horario.",
                    "after": f"🍽️ *¡Hola! Con gusto tomamos tu reserva en {c_name}:*\n\n📋 *Envianos en este mensaje:*\n1. Nombre y Apellido:\n2. Cantidad de personas (adultos y niños):\n3. Día y horario deseado:\n4. ¿Celebran algún evento especial (cumpleaños / aniversario)?\n\n[---saltomensaje---]\n\n👉 *Con estos datos te confirmamos la mesa asignada de inmediato.*",
                    "tipping_point": "Envianos nombre, personas y horario para confirmarte la mesa asignada.",
                    "key_benefit": "Centraliza la reserva del salón en un solo mensaje."
                },
                {
                    "id": "pago_delivery",
                    "title": "Medios de Pago y Datos de Transferencia Delivery",
                    "shortcut": "/pago",
                    "category": "Cobranzas",
                    "before": "Repartidor llega y el cliente no transfirió.",
                    "after": f"💳 *Confirmación de Pago - {c_name}:*\n\n• *Monto Total:* *${{TOTAL_PEDIDO}}*\n• *Alias de Transferencia:* `{c_alias}`\n• *Efectivo:* Por favor avisanos con cuánto dinero abonás para enviar cambio al repartidor.\n\n[---saltomensaje---]\n\n👉 *Envianos el comprobante para que el pedido salga inmediatamente con el cadete.*",
                    "tipping_point": "Envianos el comprobante para que el pedido salga con el cadete.",
                    "key_benefit": "Asegura la acreditación del cobro antes del despacho del delivery."
                },
                {
                    "id": "demora_cocina",
                    "title": "Mensaje de Contención por Demora en Pedido (Oxígeno)",
                    "shortcut": "/demora",
                    "category": "Atención / Cocina",
                    "before": "Cliente enojado preguntando 'dónde está la comida' -> silencio.",
                    "after": "⏱️ *¡Hola! Te informamos el estado de tu pedido:*\n\nTu comida ya está en la última etapa de empaquetado y sale con el próximo reparto. Te pedimos disculpas por los minutos de demora debido a la alta demanda.\n\n[---saltomensaje---]\n\n👉 *Apenas el cadete esté en camino te enviamos el aviso para que lo esperes.*",
                    "tipping_point": "Apenas el cadete esté en camino te enviamos el aviso.",
                    "key_benefit": "Inyecta oxígeno conversacional y calma la ansiedad del comensal."
                },
                {
                    "id": "rescate_cliente",
                    "title": "Reactivación de Clientes y Promoción de Fin de Semana",
                    "shortcut": "/rescate",
                    "category": "Fidelización",
                    "before": "Sin contacto recurrente con clientes de la base.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! En {c_name} queremos mimarte este fin de semana:\n\n🎁 Tenés un *postre de cortesía* o un *15% de descuento* en tu próximo pedido usando el código `SPOTER15`.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría hacer tu pedido para esta noche o reservarte mesa para el finde?*",
                    "tipping_point": "¿Te gustaría hacer tu pedido para esta noche o reservar mesa?",
                    "key_benefit": "Reactivación de clientes antiguos aumentando la frecuencia anual (LTV)."
                }
            ]

        # 9. SAAS / B2B / TECNOLOGÍA / SOFTWARE (5 Plantillas)
        elif rubro_key == 'saas_b2b_tecnologia':
            return [
                {
                    "id": "demo_saas",
                    "title": "Agendar Demo en Vivo y Propuesta de Planes",
                    "shortcut": "/demo",
                    "category": "Ventas B2B",
                    "before": "Múltiples mails y mensajes para encontrar horario de reunión.",
                    "after": f"👋 ¡Hola! Te compartimos los detalles de la plataforma {c_name}:\n\n💻 *Solución integral para optimizar tus operaciones:*\n• Automatización de flujos y tableros en tiempo real.\n• Integración nativa con tus sistemas actuales.\n• Planes a medida según el volumen de tu equipo.\n\n📅 *Link directo para agendar tu Demo de 20 minutos:* {LINK_CALENDLY}\n\n[---saltomensaje---]\n\n👉 *¿Qué día te queda más cómodo para que un especialista te muestre la plataforma en acción?*",
                    "tipping_point": "¿Qué día te queda más cómodo para que un especialista te muestre la plataforma?",
                    "key_benefit": "Pasa valor de la solución y link de agenda directa sin fricción."
                },
                {
                    "id": "triaje_soporte_saas",
                    "title": "Triaje de Soporte Técnico y Diagnóstico de Bugs",
                    "shortcut": "/soporte",
                    "category": "Soporte Técnico",
                    "before": "Usuario dice 'no anda' -> soporte pregunta usuario -> luego navegador (5 msgs).",
                    "after": "🛠️ *Mesa de Ayuda Técnica:*\n\nPara reproducir y solucionar la incidencia con el equipo de ingeniería, envianos:\n1. Correo electrónico de tu cuenta de usuario:\n2. Módulo o pantalla donde ocurre el error:\n3. Breve descripción de lo ocurrido y captura de pantalla:\n\n[---saltomensaje---]\n\n👉 *Con estos datos aislamos la causa y te damos una solución inmediata.*",
                    "tipping_point": "Con estos datos aislamos la causa y te damos una solución inmediata.",
                    "key_benefit": "Captura el contexto técnico en 1 solo paso sin repreguntas."
                },
                {
                    "id": "facturacion_b2b",
                    "title": "Facturación B2B, Datos Fiscales y Cuentas Corporativas",
                    "shortcut": "/factura",
                    "category": "Administración B2B",
                    "before": "Envío de facturas dispersas sin CUIT ni comprobante ordenado.",
                    "after": f"💼 *Administración y Cobranzas - {c_name}:*\n\n• *Razón Social:* {c_name}\n• *CUIT:* 30-71829384-9 (IVA Responsable Inscripto)\n• *Alias Corporativo:* `{c_alias}`\n\n📝 *Envianos tu CUIT y comprobante para emitir tu Factura A correspondiente.*\n\n[---saltomensaje---]\n\n¡Con eso se acredita tu período de suscripción en el acto! 🚀",
                    "tipping_point": "Envianos tu CUIT y comprobante para emitir tu Factura A de inmediato.",
                    "key_benefit": "Estandariza los requisitos fiscales de clientes corporativos."
                },
                {
                    "id": "onboarding_saas",
                    "title": "Onboarding y Primeros Pasos de Configuración",
                    "shortcut": "/onboarding",
                    "category": "Customer Success",
                    "before": "Cliente nuevo queda a la deriva sin saber cómo arrancar.",
                    "after": f"🚀 *¡Te damos la bienvenida a {c_name}!*\n\nPara activar tu espacio de trabajo en menos de 10 minutos:\n1. Ingresá con tus credenciales a: {LINK_PLATAFORMA}\n2. Seguí la guía rápida de configuración inicial: {LINK_GUIA}\n\n[---saltomensaje---]\n\n👉 *¿Pudiste acceder correctamente o requerís que te asistamos en el primer acceso?*",
                    "tipping_point": "¿Pudiste acceder correctamente o requerís que te asistamos en el primer acceso?",
                    "key_benefit": "Acelera el Time-to-Value garantizando la adopción exitosa del software."
                },
                {
                    "id": "rescate_trial",
                    "title": "Protocolo de Rescate de Trial / Propuesta B2B",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "Prospecto B2B deja de responder la propuesta.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! ¿Cómo estás? Te escribo de {c_name} para consultarte si pudiste revisar la propuesta para tu equipo.\n\nQueríamos ofrecerte extender tu período de prueba sin cargo por 14 días adicionales para que puedan validar el retorno con datos reales.\n\n[---saltomensaje---]\n\n👉 *¿Te parece bien si te activamos los 14 días extra para continuar la prueba?*",
                    "tipping_point": "¿Te parece bien si te activamos los 14 días extra para continuar la prueba?",
                    "key_benefit": "Elimina el riesgo de decisión ofreciendo extensión de prueba estratégica."
                }
            ]

        # 10. TURISMO / HOTELES / AGENCIAS (5 Plantillas)
        elif rubro_key == 'turismo_hoteleria':
            return [
                {
                    "id": "paquete_turismo",
                    "title": "Paquetes, Tarifas de Temporada e Itinerario",
                    "shortcut": "/viaje",
                    "category": "Ventas Turismo",
                    "before": "'¿Cuánto sale viajar?' -> '¿qué destino?' -> '¿cuántas personas?' (6 msgs).",
                    "after": f"✈️ *¡Hola! Te compartimos la propuesta de viaje en {c_name}:*\n\n🌴 *Destino: {{DESTINO}}*\n• *Incluye:* Pasajes aéreos, traslados y {{NOCHES}} noches de alojamiento con desayuno.\n• *Tarifa por pasajero:* ${{PRECIO_VIAJE}} *(Base Doble)*.\n• 💡 *Financiación:* Anticipo y cuotas fijas antes de la fecha de salida.\n\n[---saltomensaje---]\n\n👉 *¿Para qué fechas estimadas estás planificando viajar y cuántos pasajeros serían?*",
                    "tipping_point": "¿Para qué fechas estás planificando viajar y cuántos pasajeros serían?",
                    "key_benefit": "Condensa aéreos, hotel, tarifas y captura fechas en 1 paso."
                },
                {
                    "id": "reserva_hotel",
                    "title": "Disponibilidad de Habitaciones y Check-in/Check-out",
                    "shortcut": "/hotel",
                    "category": "Hotelería",
                    "before": "Múltiples mensajes para consultar camas, desayuno y cochera.",
                    "after": f"🏨 *¡Hola! Con gusto cotizamos tu estadía en {c_name}:*\n\n📋 *Para confirmarte tarifa exacta y disponibilidad de habitaciones, envianos:*\n1. Fecha de Check-in y Check-out:\n2. Cantidad de huéspedes (adultos y menores):\n3. Tipo de habitación deseada (Estándar / Superior / Suite):\n\n[---saltomensaje---]\n\n👉 *Con estos datos te pasamos el presupuesto final con desayuno y cochera incluidos.*",
                    "tipping_point": "Envianos fechas y cantidad de huéspedes para pasarte el presupuesto final.",
                    "key_benefit": "Centraliza los datos de la estadía hotelera en un solo bloque."
                },
                {
                    "id": "pago_turismo",
                    "title": "Confirmación de Reserva y Medios de Pago",
                    "shortcut": "/pago",
                    "category": "Cobranzas",
                    "before": "Pasa datos de pago sin fijar fecha límite de seña.",
                    "after": f"🎯 *Para confirmar tu reserva y congelar la tarifa en {c_name}:*\n\n🏦 *Datos de Seña / Pago:*\n• *Titular:* {c_name}\n• *Alias:* `{c_alias}`\n• *Monto de Seña (30%):* *${{MONTO_SENA}}*\n\n📝 *Envianos el comprobante junto con fotos de los DNI/Pasaportes de los viajeros para emitir los vouchers.*\n\n[---saltomensaje---]\n\n¡Con eso queda garantizada tu reserva oficial! 🧳",
                    "tipping_point": "Envianos el comprobante y fotos de DNI para emitir tus vouchers de viaje.",
                    "key_benefit": "Asegura la seña y captura la documentación de los viajeros de una vez."
                },
                {
                    "id": "politica_cancelacion",
                    "title": "Política de Cancelación y Reprogramación Flexible",
                    "shortcut": "/cancelacion",
                    "category": "Atención al Pasajero",
                    "before": "Discusiones por cancelaciones sin términos claros.",
                    "after": "📋 *Políticas de Cancelación y Flexibilidad de tu Reserva:*\n\n• *Reprogramación sin costo:* Hasta 15 días antes de la fecha de viaje.\n• *Cancelación con reembolso:* Según condiciones de la aerolínea y cadena hotelera contratada.\n\n[---saltomensaje---]\n\n👉 *¿Deseás que revisemos tu reserva para reprogramar las fechas de tu estadía?*",
                    "tipping_point": "¿Deseás que revisemos tu reserva para reprogramar las fechas de estadía?",
                    "key_benefit": "Informa con claridad y ofrece opciones de reprogramación activa."
                },
                {
                    "id": "rescate_turismo",
                    "title": "Protocolo de Rescate de Presupuesto de Viaje",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "El viajero pide presupuesto y no contesta más.",
                    "after": f"👋 ¡Hola {{NOMBRE}}! Te escribo de {c_name} porque la aerolínea/hotel sostiene la tarifa bonificada para tu viaje a {{DESTINO}} hasta el día de hoy.\n\n[---saltomensaje---]\n\n👉 *¿Te gustaría señar la tarifa antes de que aumente o querés que busquemos una alternativa en otra fecha?*",
                    "tipping_point": "¿Te gustaría señar la tarifa antes del aumento o evaluamos otra fecha?",
                    "key_benefit": "Aprovecha la urgencia de tarifas hoteleras y aéreas para cerrar."
                }
            ]

        # 11. SERVICIOS PROFESIONALES / GENERALES (5 Plantillas)
        else:
            return [
                {
                    "id": "presupuesto_comercial",
                    "title": "Presupuesto General con Bonificación Contado",
                    "shortcut": "/coti",
                    "category": "Ventas / Precios",
                    "before": "Buenos días -> 'en breve enviamos valor' -> PDF adjunto -> silencio.",
                    "after": f"👋 ¡Hola! Te adjunto el presupuesto detallado de {c_name} (*Cotización N° {{NRO_COTIZACION}}*):\n\n📋 *Resumen comercial de tu servicio:*\n• *Total de Lista / Financiado:* ${{TOTAL_LISTA}}\n• 💡 *Precio Especial Contado / Transferencia:* *${{TOTAL_DESCUENTO}}*\n• *Disponibilidad:* Turno inmediato de inicio o despacho de tareas.\n• *Alcance:* Cotizado para {{DETALLE_SERVICIO}}.\n\n⏱️ _Validez de precios: 48 horas._\n\n[---saltomensaje---]\n\n👉 *¿Querés que te reservemos la fecha de inicio para confirmar la gestión esta semana?*",
                    "tipping_point": "¿Querés que te reservemos la fecha de inicio para confirmar esta semana?",
                    "key_benefit": "Resume la oferta en el chat, destaca el descuento de contado y cierra con Tipping Point."
                },
                {
                    "id": "medios_pago_gral",
                    "title": "Medios de Pago, Transferencia y Facturación",
                    "shortcut": "/pago",
                    "category": "Cobranzas",
                    "before": "Pasa CBU suelto -> pide comprobante -> cliente no pone número de pedido.",
                    "after": f"🎯 *Para confirmar tu servicio y registrar el pago en {c_name}:*\n\n🏦 *Datos de Pago:*\n• *Titular:* {c_name}\n• *Alias:* `{c_alias}`\n• *Importe Final:* *${{MONTO_FINAL}}*\n\n📝 *Una vez hecha la transferencia, envianos:*\n1. Comprobante de pago:\n2. CUIT o DNI (para la factura):\n3. Razón Social o Nombre Completo:\n\n[---saltomensaje---]\n\n¡Con eso ingresa de inmediato a nuestro sistema de gestión! 🚀",
                    "tipping_point": "Envianos comprobante, CUIT y Razón Social en un solo mensaje.",
                    "key_benefit": "Elimina el caos de identificación de transferencias y reduce 4 mensajes a 1."
                },
                {
                    "id": "triaje_soporte_gral",
                    "title": "Triaje de Diagnóstico y Requisitos en 1 Turno",
                    "shortcut": "/soporte",
                    "category": "Soporte / Trámites",
                    "before": "Hola -> 'qué problema tenés?' -> 'pasame captura' -> 'qué usuario sos?' (4 msgs).",
                    "after": f"👋 ¡Hola! Te ayudamos a resolver tu solicitud en {c_name} en este mismo turno:\n\n🔍 *Para gestionarlo en este momento, envianos en un solo mensaje:*\n1. Número de cliente, DNI o usuario:\n2. Descripción breve de la consulta o gestión requerida:\n3. Foto o comprobante adjunto (si corresponde):\n\n[---saltomensaje---]\n\n👉 *Con estos datos aislamos la causa y te damos una respuesta inmediata.*",
                    "tipping_point": "Con estos datos aislamos la causa y te damos una solución inmediata.",
                    "key_benefit": "Diagnostica la gestión en 1 solo paso sin repreguntas."
                },
                {
                    "id": "cierre_fcr_gral",
                    "title": "Confirmación de Solución de Caso (FCR)",
                    "shortcut": "/resuelto",
                    "category": "Cierre / Calidad",
                    "before": "Respuestas pasivas tipo 'listo, avisame si anda'.",
                    "after": "✅ *Tu solicitud ha sido procesada y resuelta con éxito.*\n\nTe dejamos asentado el número de gestión para cualquier seguimiento futuro.\n\n[---saltomensaje---]\n\n👉 *¿Pudiste comprobar que funciona correctamente o requerís asistencia adicional antes de cerrar el caso?*",
                    "tipping_point": "¿Pudiste comprobar que funciona correctamente o requerís asistencia adicional?",
                    "key_benefit": "Valida la resolución efectiva (FCR) antes de dar por cerrado el ticket."
                },
                {
                    "id": "rescate_comercial_gral",
                    "title": "Protocolo de Rescate y Seguimiento de Contacto Frío",
                    "shortcut": "/rescate",
                    "category": "Seguimiento",
                    "before": "Silencio o 'Hola pudiste ver?' (tasa de respuesta menor al 10%).",
                    "after": f"👋 ¡Hola {{NOMBRE}}! ¿Cómo estás? Te escribo de {c_name} para consultar si pudiste revisar la propuesta comercial que te enviamos.\n\nEstamos coordinando la agenda de altas y entregas de esta semana y queríamos asegurarte las condiciones bonificadas.\n\n[---saltomensaje---]\n\n👉 *¿Querés que te guardemos el lugar de reserva o necesitás que ajustemos algún punto del presupuesto?*",
                    "tipping_point": "¿Querés que te guardemos el lugar de reserva o ajustamos algún punto?",
                    "key_benefit": "Reactivación contextual sin presionar al cliente."
                }
            ]

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
        if rubro_key == 'salud_obra_social':
            return [
                {
                    "key": "autorizaciones_ordenes",
                    "title": "Autorizaciones Médicas, Órdenes y Prácticas",
                    "icon": "🩺",
                    "regex": re.compile(r'autoriz|orden|pr[aá]ctica|estudio|estudios|ginec[oó]log|m[eé]dico|pediatra|auditor[ií]a|aprobaci[oó]n|derivaci[oó]n|interconsulta|tomograf|resonanc|laboratorio|analisis|an[aá]lisis|ecograf', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Triaje Clínico Spoter",
                    "solution_action": "Recolectar foto de orden médica con diagnóstico, credencial y lugar de atención en el mensaje inicial para ingresar a auditoría médica en 1 solo paso.",
                    "template_target_id": "autorizaciones"
                },
                {
                    "key": "copagos_reintegros",
                    "title": "Copagos, Reintegros y Facturación Médica",
                    "icon": "💳",
                    "regex": re.compile(r'copago|reintegro|factura|facturaci[oó]n|arancel|pago|pagar|cuota|cbu|alias|transferencia|ticket|comprobante|recibo|debito|d[eé]bito', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Atajo de Cobranzas / Trámites",
                    "solution_action": "Vincular link directo de autogestión de copagos y recepción automática de comprobante con DNI en un mensaje.",
                    "template_target_id": "reintegros"
                },
                {
                    "key": "turnos_cartilla",
                    "title": "Turnos, Especialidades y Cartilla Médica",
                    "icon": "📅",
                    "regex": re.compile(r'turno|turnos|cartilla|profesional|cl[ií]nica|sanatorio|especialidad|consultorio|d[ií]a|horario|atenci[oó]n|atender|doctor|doctora', re.IGNORECASE),
                    "feasibility": "Media (Integración)",
                    "solution_type": "Buscador de Cartilla RAG",
                    "solution_action": "Conectar cartilla médica en Spoter para informar prestadores por zona y derivar a reserva en 1 turno.",
                    "template_target_id": "turnos"
                },
                {
                    "key": "recetas_farmacia",
                    "title": "Recetas Electrónicas y Cobertura de Farmacia",
                    "icon": "💊",
                    "regex": re.compile(r'receta|recetas|remedio|remedios|farmacia|medicamento|medicamentos|dosis|droga|cobertura farmacia|vadem[eé]cum|prescripci[oó]n', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Validador de Recetas Spoter",
                    "solution_action": "Solicitar prescripción digital y credencial en mensaje estructurado para validar cobertura sin derivar.",
                    "template_target_id": "recetas_farmacia"
                },
                {
                    "key": "credencial_afiliacion",
                    "title": "Credencial Digital y Estado de Afiliación",
                    "icon": "📱",
                    "regex": re.compile(r'credencial|carnet|carn[eé]|afiliad|afiliaci[oó]n|padr[oó]n|alta|baja|familiar|incorporar|titular', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Autogestión de Credencial",
                    "solution_action": "Disparar instructivo de acceso al portal y credencial digital en el acto sin intervención del asesor.",
                    "template_target_id": "credencial_digital"
                },
                {
                    "key": "frustracion_demoras",
                    "title": "Demoras en Atención y Solicitud de Operador",
                    "icon": "⚠️",
                    "regex": re.compile(r'no me contestan|demora|tardanza|urgente|hablar con|operador|asesor|humano|persona|alguien|ayuda|no entiendo|otra cosa', re.IGNORECASE),
                    "feasibility": "Alta (Conversacional)",
                    "solution_type": "Priorización HITL Spoter",
                    "solution_action": "Triaje automático por severidad y asignación balanceada al asesor con contexto pre-cargado.",
                    "template_target_id": "cierre_fcr"
                }
            ]

        elif rubro_key == 'comercio_retail':
            return [
                {
                    "key": "precios_catalogo_stock",
                    "title": "Catálogo, Precios, Stock y Talles",
                    "icon": "🛍️",
                    "regex": re.compile(r'precio|cuanto sale|cuánto sale|cuanto esta|cuánto está|lista|catalogo|catálogo|valor|stock|talle|talles|color|remera|pantalon|prenda|modelo|disponible', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Base de Conocimiento RAG",
                    "solution_action": "Sincronizar catálogo y variantes para responder talle, precio y descuento contado en 1 bloque.",
                    "template_target_id": "producto_retail"
                },
                {
                    "key": "envios_despacho",
                    "title": "Envíos, Fletes y Tiempos de Entrega",
                    "icon": "🚚",
                    "regex": re.compile(r'envio|envío|flete|despacho|entrega|costo de envio|cuanto sale el envio|tiempo de entrega|cuando llega|cuándo llega|codigo postal|código postal|cp', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Matriz de Zonas Spoter",
                    "solution_action": "Solicitar Código Postal en el primer mensaje y confirmar tarifa y fecha estimada de entrega.",
                    "template_target_id": "envios_retail"
                },
                {
                    "key": "pagos_cuotas",
                    "title": "Medios de Pago, Cuotas y Facturación",
                    "icon": "💳",
                    "regex": re.compile(r'pago|factura|tarjeta|cuota|cuotas|transferencia|efectivo|debito|débito|mercadopago|alias|cbu|descuento efectivo|link de pago', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Atajo Maestro Inmediato",
                    "solution_action": "Enviar opciones de pago, cuotas sin interés y datos bancarios oficiales en un solo bloque con descuento.",
                    "template_target_id": "pago_retail"
                },
                {
                    "key": "cambios_devoluciones",
                    "title": "Cambios, Devoluciones y Postventa",
                    "icon": "🔄",
                    "regex": re.compile(r'cambio|cambiar|devolucion|devolución|falla|garantia|garantía|vino roto|no me queda|talle chico|talle grande', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Protocolo Postventa Cero Vueltas",
                    "solution_action": "Recolectar número de pedido, motivo de cambio y nuevo talle en mensaje inicial sin derivaciones.",
                    "template_target_id": "cambios_retail"
                },
                {
                    "key": "locales_horarios",
                    "title": "Locales, Retiro en Tienda y Horarios",
                    "icon": "📍",
                    "regex": re.compile(r'local|sucursal|donde estan|dónde están|direccion|dirección|horario|abierto|retirar hoy|pick up|mapa|hasta que hora', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Ficha Comercial en Bienvenida",
                    "solution_action": "Incluir sucursales, mapa y horarios de atención en la bienvenida.",
                    "template_target_id": "producto_retail"
                },
                {
                    "key": "frustracion_asesor",
                    "title": "Solicitud de Asesor Humano",
                    "icon": "⚠️",
                    "regex": re.compile(r'asesor|operador|humano|persona|alguien|ayuda|no me sirve|no entiendo|otra cosa|hablar con', re.IGNORECASE),
                    "feasibility": "Alta (Conversacional)",
                    "solution_type": "IA Conversacional Spoter",
                    "solution_action": "Eliminar menús rígidos y permitir atención fluida en lenguaje natural.",
                    "template_target_id": "rescate_carrito"
                }
            ]

        elif rubro_key == 'construccion_corralon':
            return [
                {
                    "key": "precios_materiales",
                    "title": "Cotizaciones de Materiales y Áridos",
                    "icon": "📋",
                    "regex": re.compile(r'precio|cuanto sale|cuánto sale|cuanto esta|cuánto está|lista|catalogo|catálogo|valor|cotizacion|cotización|presupuesto|costo|bolsa|cemento|hierro|chapa|ladrillo|metro|arena|aridos|vigueta', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Base de Conocimiento RAG",
                    "solution_action": "Sincronizar lista de precios de materiales para cotizaciones instantáneas en un solo bloque estructurado.",
                    "template_target_id": "presupuesto_corralon"
                },
                {
                    "key": "fletes_logistica",
                    "title": "Envíos, Fletes y Descarga en Obra",
                    "icon": "🚚",
                    "regex": re.compile(r'envio|envío|flete|despacho|entrega|zona|domicilio|llegan a|pilar|lujan|luján|capital|costo de envio|cuanto sale el envio|flete a|traer|camion|camión|volcador|hidrogrua|hidrogrúa|reparto', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Matriz de Zonas Spoter",
                    "solution_action": "Cargar radios de entrega, tarifas de flete y requisitos de acceso de camión en la Base de Conocimiento.",
                    "template_target_id": "flete_corralon"
                },
                {
                    "key": "pagos_facturacion",
                    "title": "Pagos, Alias, CBU y Facturación A / B",
                    "icon": "💳",
                    "regex": re.compile(r'pago|factura|factura a|tarjeta|cuota|transferencia|efectivo|debito|débito|mercadopago|alias|cbu|iva|afip|fiscal|descuento efectivo|forma de pago|medios de pago', re.IGNORECASE),
                    "feasibility": "Alta (Inmediata)",
                    "solution_type": "Atajo Maestro Inmediato",
                    "solution_action": "Configurar atajo de medios de pago y recolección automática de CUIT/Razón Social en mensaje cero.",
                    "template_target_id": "cierre_corralon"
                },
                {
                    "key": "stock_retiro",
                    "title": "Stock, Carga en Depósito y Horarios",
                    "icon": "📦",
                    "regex": re.compile(r'stock|tienen|hay|disponible|disponibilidad|para retirar|queda|retirar hoy|entrega inmediata|conseguir|medida|horario de carga|sucursal', re.IGNORECASE),
                    "feasibility": "Media (Integración)",
                    "solution_type": "Consulta de Inventario Spoter",
                    "solution_action": "Vincular stock mínimo y condiciones de retiro para responder sin consultar al depósito.",
                    "template_target_id": "hierros_mallas"
                },
                {
                    "key": "acopio_obras",
                    "title": "Venta Mayorista, Acopio y Grandes Obras",
                    "icon": "🤝",
                    "regex": re.compile(r'constructora|obra grande|cuenta corriente|licitacion|licitación|acopio|volumen|distribuidor|arquitecto|presupuesto formal', re.IGNORECASE),
                    "feasibility": "Consultiva (Humano)",
                    "solution_type": "Copiloto HITL Spoter",
                    "solution_action": "Derivación guiada con ficha de intencionalidad comercial y volumen para el asesor comercial.",
                    "template_target_id": "rescate_corralon"
                },
                {
                    "key": "frustracion_asesor",
                    "title": "Solicitud de Asesor o Atención Humana",
                    "icon": "⚠️",
                    "regex": re.compile(r'no me sirve|no entiendo|otra cosa|no es lo que pregunte|mala atencion|hablar con|asesor|humano|persona|alguien|operador', re.IGNORECASE),
                    "feasibility": "Alta (Conversacional)",
                    "solution_type": "IA Conversacional Spoter",
                    "solution_action": "Eliminar menús rígidos y permitir atención fluida en lenguaje natural.",
                    "template_target_id": "presupuesto_corralon"
                }
            ]

        # Categorías generales para otros rubros
        return [
            {
                "key": "presupuesto_alcance",
                "title": "Presupuestos, Tarifas y Alcance del Servicio",
                "icon": "📋",
                "regex": re.compile(r'precio|cuanto sale|cuánto sale|tarifa|costo|presupuesto|cotizacion|cotización|planes|honorarios|valor|servicio|alcance', re.IGNORECASE),
                "feasibility": "Alta (Inmediata)",
                "solution_type": "Base de Conocimiento RAG",
                "solution_action": "Cargar tarifas base y propuesta comercial en Spoter para responder en 1 bloque estructurado.",
                "template_target_id": "presupuesto_comercial"
            },
            {
                "key": "pagos_facturacion_gral",
                "title": "Medios de Pago, Alias y Facturación",
                "icon": "💳",
                "regex": re.compile(r'pago|factura|factura a|tarjeta|cuota|transferencia|efectivo|debito|débito|alias|cbu|mercadopago|iva|cuit', re.IGNORECASE),
                "feasibility": "Alta (Inmediata)",
                "solution_type": "Atajo Maestro Inmediato",
                "solution_action": "Configurar atajo de cobro y solicitud de datos fiscales en un solo paso.",
                "template_target_id": "medios_pago_gral"
            },
            {
                "key": "turnos_agenda",
                "title": "Turnos, Citas y Coordinación de Agenda",
                "icon": "📅",
                "regex": re.compile(r'turno|cita|reunion|reunión|agenda|horario|cuando nos vemos|coordinar|entrevista|visita', re.IGNORECASE),
                "feasibility": "Alta (Inmediata)",
                "solution_type": "Agenda Digital Spoter",
                "solution_action": "Conectar link de calendario o capturar día y rango horario preferido en 1 solo mensaje.",
                "template_target_id": "triaje_soporte_gral"
            },
            {
                "key": "requisitos_documentacion",
                "title": "Requisitos Previos y Envío de Documentación",
                "icon": "📝",
                "regex": re.compile(r'requisito|requisitos|documentacion|documentación|papeles|dni|constancia|formulario|que necesito|qué necesito|adjunto', re.IGNORECASE),
                "feasibility": "Alta (Inmediata)",
                "solution_type": "Checklist Previo Automatizado",
                "solution_action": "Detallar los requisitos y solicitar la documentación en 1 solo envío sin idas y vueltas.",
                "template_target_id": "triaje_soporte_gral"
            },
            {
                "key": "seguimiento_estado",
                "title": "Seguimiento y Estado de Gestión",
                "icon": "🔄",
                "regex": re.compile(r'estado|como va|cómo va|novedades|cuando esta|cuándo está|demora|finalizado|listo|seguimiento', re.IGNORECASE),
                "feasibility": "Media (Integración)",
                "solution_type": "Notificaciones de Estado Spoter",
                "solution_action": "Informar estado actual de la gestión e inyectar oxígeno conversacional para evitar la repregunta.",
                "template_target_id": "cierre_fcr_gral"
            },
            {
                "key": "frustracion_asesor",
                "title": "Solicitud de Asesor Personalizado",
                "icon": "⚠️",
                "regex": re.compile(r'asesor|operador|humano|persona|alguien|ayuda|no entiendo|otra cosa|hablar con', re.IGNORECASE),
                "feasibility": "Alta (Conversacional)",
                "solution_type": "IA Conversacional Spoter",
                "solution_action": "Atención fluida sin fricción de menús numéricos rígidos.",
                "template_target_id": "rescate_comercial_gral"
            }
        ]

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
            est_hours = (human_msgs_count * 0.75) / 60.0

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