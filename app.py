import math
import sys
from datetime import datetime
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

app = Flask(__name__)
CORS(app)

# Historial inicial simulado de lotes para monitoreo de degradación del factor k
HISTORIAL_LOTES = [
    {
        "id": "LOTE-101",
        "tanque": "Tanque Principal #1",
        "fecha": "2026-10-20 08:30",
        "T0": 72.0,
        "Tm": 1.0,
        "t_muestra": 5.0,
        "T_muestra": 53.2,
        "T_meta": 4.0,
        "t_limite": 45.0,
        "k": 0.06154,
        "k_minimo": 0.07030,
        "t_predicho": 51.4,
        "estado": "ALERTA CRÍTICA",
        "accion": "Refrigeración auxiliar activada / Desvío a respaldo"
    },
    {
        "id": "LOTE-102",
        "tanque": "Tanque Principal #1",
        "fecha": "2026-10-21 10:15",
        "T0": 72.0,
        "Tm": 1.0,
        "t_muestra": 5.0,
        "T_muestra": 49.5,
        "T_meta": 4.0,
        "t_limite": 45.0,
        "k": 0.07621,
        "k_minimo": 0.07030,
        "t_predicho": 41.5,
        "estado": "ÓPTIMO",
        "accion": "Ciclo normal sin intervención"
    },
    {
        "id": "LOTE-103",
        "tanque": "Tanque #2",
        "fecha": "2026-10-22 14:00",
        "T0": 72.0,
        "Tm": 1.0,
        "t_muestra": 5.0,
        "T_muestra": 50.8,
        "T_meta": 4.0,
        "t_limite": 45.0,
        "k": 0.07082,
        "k_minimo": 0.07030,
        "t_predicho": 44.7,
        "estado": "PRECAUCIÓN",
        "accion": "Programar mantenimiento preventivo de compresor"
    },
    {
        "id": "LOTE-104",
        "tanque": "Tanque Principal #1",
        "fecha": "2026-10-23 09:00",
        "T0": 72.0,
        "Tm": 1.0,
        "t_muestra": 5.0,
        "T_muestra": 47.8,
        "T_meta": 4.0,
        "t_limite": 45.0,
        "k": 0.08318,
        "k_minimo": 0.07030,
        "t_predicho": 38.0,
        "estado": "ÓPTIMO",
        "accion": "Ciclo normal sin intervención"
    }
]


def resolver_analitico(T0: float, Tm: float, k: float, t: float) -> float:
    """
    Solución analítica exacta de la Ley de Enfriamiento de Newton:
    T(t) = Tm + (T0 - Tm) * e^(-k * t)
    """
    return Tm + (T0 - Tm) * math.exp(-k * t)


def resolver_rk4(
    T0: float,
    Tm_base: float,
    k: float,
    t_max: float,
    h: float = 1.0,
    variacion_ambiente: float = 0.0,
    activar_auxiliar: bool = False,
    t_activacion_aux: float = 5.0,
    factor_aux: float = 1.45,
):
    """
    Resuelve numéricamente la EDO dT/dt = -k_eff(t) * (T - Tm(t))
    usando el método de Runge-Kutta de cuarto orden (RK4).

    Permite modelar:
    1) Medio refrigerante constante (comparación directa con solución analítica)
    2) Fluctuaciones térmicas en el medio refrigerante Tm(t) = Tm_base + A*sin(w*t)
    3) Encendido del sistema de refrigeración auxiliar tras la alerta temprana en t = t_activacion_aux
    """
    pasos = int(math.ceil(t_max / h))
    tiempos = []
    temps_rk4 = []
    temps_analitica = []
    tms = []
    errores_abs = []

    t = 0.0
    T = T0

    def tm_dinamico(tiempo: float) -> float:
        if variacion_ambiente == 0.0:
            return Tm_base
        # Oscilación térmica por fluctuación del compresor
        return Tm_base + variacion_ambiente * math.sin(2 * math.pi * tiempo / 20.0)

    def k_efectivo(tiempo: float) -> float:
        if activar_auxiliar and tiempo >= t_activacion_aux:
            return k * factor_aux
        return k

    def f(tiempo: float, temp: float) -> float:
        return -k_efectivo(tiempo) * (temp - tm_dinamico(tiempo))

    for _ in range(pasos + 1):
        t_redondeado = round(t, 4)
        T_exacta = resolver_analitico(T0, Tm_base, k, t_redondeado)
        tiempos.append(t_redondeado)
        temps_rk4.append(round(T, 4))
        temps_analitica.append(round(T_exacta, 4))
        tms.append(round(tm_dinamico(t_redondeado), 3))
        errores_abs.append(round(abs(T - T_exacta), 6))

        # Paso RK4
        k1 = f(t, T)
        k2 = f(t + 0.5 * h, T + 0.5 * h * k1)
        k3 = f(t + 0.5 * h, T + 0.5 * h * k2)
        k4 = f(t + h, T + h * k3)

        T = T + (h / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        t += h

    return {
        "tiempos": tiempos,
        "temps_rk4": temps_rk4,
        "temps_analitica": temps_analitica,
        "tms": tms,
        "errores_abs": errores_abs,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/calcular", methods=["POST"])
def calcular_prediccion():
    """
    Endpoint principal que ejecuta los 4 pasos descritos en el TCC:
    1. Captura de datos (T0, Tm, t_muestra, T_muestra)
    2. Cálculo de la constante dinámica k
    3. Predicción algorítmica del tiempo para alcanzar T(t) = T_meta (4°C)
    4. Evaluación de alerta temprana y simulación numérica por RK4
    """
    data = request.get_json(force=True) or {}

    try:
        T0 = float(data.get("T0", 72.0))
        Tm = float(data.get("Tm", 1.0))
        t_muestra = float(data.get("t_muestra", 5.0))
        T_muestra = float(data.get("T_muestra", 48.5))
        T_meta = float(data.get("T_meta", 4.0))
        t_limite = float(data.get("t_limite", 45.0))
        h_rk4 = float(data.get("h_rk4", 1.0))
        variacion_ambiente = float(data.get("variacion_ambiente", 0.0))
        activar_auxiliar = bool(data.get("activar_auxiliar", False))
        tanque = str(data.get("tanque", "Tanque Principal #1"))
        guardar_historial = bool(data.get("guardar_historial", False))
    except (ValueError, TypeError):
        return jsonify({"error": "Todos los parámetros numéricos deben ser válidos."}), 400

    # Validaciones físicas del modelo de enfriamiento
    if t_muestra <= 0:
        return jsonify({"error": "El tiempo de muestreo (t) debe ser mayor a 0 minutos."}), 400
    if Tm >= T_meta:
        return jsonify({
            "error": (
                f"La temperatura del medio refrigerante (Tm = {Tm}°C) debe ser menor "
                f"que la temperatura objetivo ({T_meta}°C) para que sea físicamente posible enfriar hasta {T_meta}°C."
            )
        }), 400
    if not (Tm < T_muestra < T0):
        return jsonify({
            "error": (
                f"La temperatura medida a los {t_muestra} min ({T_muestra}°C) debe ser menor que "
                f"T0 ({T0}°C) y mayor que Tm ({Tm}°C)."
            )
        }), 400
    if h_rk4 <= 0 or h_rk4 > 10:
        h_rk4 = 1.0

    # Paso 2: Cálculo de la Constante Dinámica k en tiempo real
    # k = -(1 / t) * ln((T(t) - Tm) / (T0 - Tm))
    razon_muestra = (T_muestra - Tm) / (T0 - Tm)
    k_real = -(1.0 / t_muestra) * math.log(razon_muestra)

    # Constante k mínima estándar requerida para cumplir en t_limite
    razon_meta = (T_meta - Tm) / (T0 - Tm)
    k_minimo = -(1.0 / t_limite) * math.log(razon_meta)

    # Paso 3: Predicción Algorítmica del tiempo exacto en que T(t) = T_meta (4°C)
    t_predicho = -(1.0 / k_real) * math.log(razon_meta)

    # Temperatura que tendría el tanque en t_limite con el k_real actual
    T_en_limite = resolver_analitico(T0, Tm, k_real, t_limite)

    # Eficiencia térmica relativa respecto al estándar requerido (100% = cumple justo en el límite)
    eficiencia_pct = round((k_real / k_minimo) * 100.0, 1)

    # Paso 4: Sistema de Alertas Tempranas
    diferencia_tiempo = t_predicho - t_limite
    if t_predicho > t_limite:
        estado = "ALERTA CRÍTICA"
        nivel = "danger"
        mensaje_alerta = (
            f"¡ANOMALÍA TÉRMICA DETECTADA EN t = {t_muestra:g} MIN! "
            f"El tiempo proyectado ({t_predicho:.2f} min) excede el límite de inocuidad alimentaria "
            f"({t_limite:g} min) por +{diferencia_tiempo:.2f} min. "
            f"La constante k actual ({k_real:.5f} min⁻¹) es inferior al estándar mínimo ({k_minimo:.5f} min⁻¹)."
        )
        recomendacion = (
            "Encender de inmediato el sistema de refrigeración auxiliar o desviar el flujo de leche "
            "al tanque de respaldo para evitar la proliferación de bacterias termodúricas y la pérdida del lote."
        )
    elif t_predicho >= 0.92 * t_limite:
        estado = "PRECAUCIÓN"
        nivel = "warning"
        mensaje_alerta = (
            f"El tanque alcanzará {T_meta:g}°C en {t_predicho:.2f} min, dentro del límite ({t_limite:g} min), "
            f"pero con margen de seguridad reducido ({ abs(diferencia_tiempo):.2f} min restantes). "
            f"Se observa desgaste moderado en el compresor."
        )
        recomendacion = (
            "Monitorear estrechamente el ciclo actual y programar mantenimiento preventivo "
            "del compresor al finalizar el lote."
        )
    else:
        estado = "ÓPTIMO"
        nivel = "success"
        mensaje_alerta = (
            f"Rendimiento térmico óptimo. La leche alcanzará los {T_meta:g}°C en {t_predicho:.2f} min "
            f"({abs(diferencia_tiempo):.2f} min antes del límite máximo de {t_limite:g} min)."
        )
        recomendacion = "Mantener operación estándar. El factor k se encuentra por encima del umbral de calidad."

    # Simulación numérica RK4 y curva estándar
    t_horizonte = max(math.ceil(max(t_predicho, t_limite) * 1.15), 50)
    t_horizonte = min(t_horizonte, 180)  # Limitar horizonte gráfico razonable

    rk4_resultado = resolver_rk4(
        T0=T0,
        Tm_base=Tm,
        k=k_real,
        t_max=t_horizonte,
        h=h_rk4,
        variacion_ambiente=variacion_ambiente,
        activar_auxiliar=activar_auxiliar,
        t_activacion_aux=t_muestra,
        factor_aux=1.45,
    )

    # Curva ideal de referencia (con k_minimo que llega a T_meta exactamente en t_limite)
    curva_estandar = [
        round(resolver_analitico(T0, Tm, k_minimo, t), 4)
        for t in rk4_resultado["tiempos"]
    ]

    # Calcular en qué minuto llega a T_meta con RK4 (útil cuando se activa auxiliar o hay variación de Tm)
    t_predicho_rk4 = None
    for idx, temp_val in enumerate(rk4_resultado["temps_rk4"]):
        if temp_val <= T_meta:
            if idx == 0:
                t_predicho_rk4 = rk4_resultado["tiempos"][0]
            else:
                # Interpolación lineal entre idx-1 e idx
                t_ant = rk4_resultado["tiempos"][idx - 1]
                t_act = rk4_resultado["tiempos"][idx]
                temp_ant = rk4_resultado["temps_rk4"][idx - 1]
                frac = (temp_ant - T_meta) / (temp_ant - temp_val) if temp_ant != temp_val else 0.0
                t_predicho_rk4 = round(t_ant + frac * (t_act - t_ant), 2)
            break

    # Guardar en historial si el usuario lo solicitó
    nuevo_registro = None
    if guardar_historial:
        nuevo_id = f"LOTE-{101 + len(HISTORIAL_LOTES)}"
        nuevo_registro = {
            "id": nuevo_id,
            "tanque": tanque,
            "fecha": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "T0": round(T0, 2),
            "Tm": round(Tm, 2),
            "t_muestra": round(t_muestra, 2),
            "T_muestra": round(T_muestra, 2),
            "T_meta": round(T_meta, 2),
            "t_limite": round(t_limite, 2),
            "k": round(k_real, 5),
            "k_minimo": round(k_minimo, 5),
            "t_predicho": round(t_predicho, 2),
            "estado": estado,
            "accion": (
                "Refrigeración auxiliar activada"
                if activar_auxiliar
                else ("Requiere auxiliar / respaldo" if estado == "ALERTA CRÍTICA" else "Ciclo normal")
            ),
        }
        HISTORIAL_LOTES.append(nuevo_registro)

    return jsonify({
        "parametros": {
            "tanque": tanque,
            "T0": T0,
            "Tm": Tm,
            "t_muestra": t_muestra,
            "T_muestra": T_muestra,
            "T_meta": T_meta,
            "t_limite": t_limite,
            "h_rk4": h_rk4,
            "variacion_ambiente": variacion_ambiente,
            "activar_auxiliar": activar_auxiliar,
        },
        "resultados": {
            "k_real": round(k_real, 6),
            "k_minimo": round(k_minimo, 6),
            "t_predicho": round(t_predicho, 2),
            "t_predicho_rk4": t_predicho_rk4,
            "T_en_limite": round(T_en_limite, 2),
            "diferencia_tiempo": round(diferencia_tiempo, 2),
            "eficiencia_pct": eficiencia_pct,
            "estado": estado,
            "nivel": nivel,
            "mensaje_alerta": mensaje_alerta,
            "recomendacion": recomendacion,
        },
        "series": {
            "tiempos": rk4_resultado["tiempos"],
            "analitica": rk4_resultado["temps_analitica"],
            "rk4": rk4_resultado["temps_rk4"],
            "estandar": curva_estandar,
            "tm_dinamico": rk4_resultado["tms"],
            "errores_abs": rk4_resultado["errores_abs"],
        },
        "registro_guardado": nuevo_registro,
    })


@app.route("/api/historial", methods=["GET"])
def obtener_historial():
    return jsonify({"historial": list(reversed(HISTORIAL_LOTES))})


@app.route("/api/historial/limpiar", methods=["POST"])
def limpiar_historial():
    HISTORIAL_LOTES.clear()
    return jsonify({"mensaje": "Historial reiniciado correctamente", "historial": []})


if __name__ == "__main__":
    print("=================================================================")
    print(" LÁCTEOS DEL VALLE - CONTROL PREDICTIVO DE ENFRIAMIENTO")
    print(" Servidor activo en: http://127.0.0.1:5000")
    print("=================================================================")
    app.run(debug=True, host="127.0.0.1", port=5000)
