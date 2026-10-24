// =========================================================================
// LÁCTEOS DEL VALLE — SISTEMA DE CONTROL TÉRMICO Y PREDICCIÓN
// Lógica de Interfaz, Gráficas de Ingeniería y Telemetría
// =========================================================================

let ultimoResultado = null;
let historialGlobal = [];
let simTimer = null;

// Iconos vectoriales SVG para diagnóstico
const ICONOS_DIAGNOSTICO = {
    success: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#15803d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#b45309" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
    danger: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#b91c1c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`
};

const TITULOS_VISTAS = {
    "tab-monitoreo": "Monitoreo y Predicción de Enfriamiento",
    "tab-rk4": "Proyección Térmica Minuto a Minuto",
    "tab-bitacora": "Bitácora de Lotes y Control de Degradación Térmica"
};

const ESCENARIOS = {
    optimo: {
        tanque: "Tanque Principal #1",
        T0: 72.0,
        Tm: 1.0,
        t_muestra: 5.0,
        T_muestra: 48.0,
        T_meta: 4.0,
        t_limite: 45.0,
        h_rk4: 1.0,
        variacion_ambiente: 0.0,
        activar_auxiliar: false
    },
    alerta: {
        tanque: "Tanque Principal #1",
        T0: 72.0,
        Tm: 1.0,
        t_muestra: 5.0,
        T_muestra: 53.5,
        T_meta: 4.0,
        t_limite: 45.0,
        h_rk4: 1.0,
        variacion_ambiente: 0.0,
        activar_auxiliar: false
    },
    auxiliar: {
        tanque: "Tanque Principal #1",
        T0: 72.0,
        Tm: 1.0,
        t_muestra: 5.0,
        T_muestra: 53.5,
        T_meta: 4.0,
        t_limite: 45.0,
        h_rk4: 1.0,
        variacion_ambiente: 0.4,
        activar_auxiliar: true
    },
    precaucion: {
        tanque: "Tanque #2",
        T0: 72.0,
        Tm: 1.0,
        t_muestra: 5.0,
        T_muestra: 50.6,
        T_meta: 4.0,
        t_limite: 45.0,
        h_rk4: 1.0,
        variacion_ambiente: 0.0,
        activar_auxiliar: false
    }
};

document.addEventListener("DOMContentLoaded", () => {
    ejecutarCalculo();
    cargarHistorial();

    window.addEventListener("resize", () => {
        if (ultimoResultado) dibujarGraficaEnfriamiento(ultimoResultado);
        if (historialGlobal.length > 0) dibujarGraficaHistorial(historialGlobal);
    });
});

function cambiarVista(tabId, btnEl) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");

    document.querySelectorAll(".view-pane").forEach(pane => pane.classList.remove("active"));
    const target = document.getElementById(tabId);
    if (target) target.classList.add("active");

    const viewTitle = document.getElementById("view-title");
    if (viewTitle && TITULOS_VISTAS[tabId]) {
        viewTitle.textContent = TITULOS_VISTAS[tabId];
    }

    // Redibujar lienzos al hacerse visibles
    setTimeout(() => {
        if (tabId === "tab-monitoreo" && ultimoResultado) {
            dibujarGraficaEnfriamiento(ultimoResultado);
        } else if (tabId === "tab-bitacora" && historialGlobal.length > 0) {
            dibujarGraficaHistorial(historialGlobal);
        }
    }, 20);
}

function cargarEscenario(nombre) {
    detenerSimulacionTermopar();
    const esc = ESCENARIOS[nombre];
    if (!esc) return;

    document.querySelectorAll(".preset-btn").forEach(btn => btn.classList.remove("active"));
    const btnActivo = document.getElementById(`preset-${nombre}`);
    if (btnActivo) btnActivo.classList.add("active");

    document.getElementById("input-tanque").value = esc.tanque;
    document.getElementById("input-T0").value = esc.T0.toFixed(1);
    document.getElementById("input-Tm").value = esc.Tm.toFixed(1);
    document.getElementById("input-t-muestra").value = esc.t_muestra.toFixed(1);
    document.getElementById("input-T-muestra").value = esc.T_muestra.toFixed(1);
    document.getElementById("input-T-meta").value = esc.T_meta.toFixed(1);
    document.getElementById("input-t-limite").value = esc.t_limite.toFixed(1);
    document.getElementById("input-h-rk4").value = esc.h_rk4.toFixed(1);
    document.getElementById("input-variacion").value = esc.variacion_ambiente.toFixed(1);
    document.getElementById("input-auxiliar").checked = esc.activar_auxiliar;

    ejecutarCalculo();
}

function activarAuxiliarRapido() {
    document.getElementById("input-auxiliar").checked = true;
    ejecutarCalculo();
}

function obtenerPayloadFormulario(guardarHistorial = false) {
    return {
        tanque: document.getElementById("input-tanque").value,
        T0: parseFloat(document.getElementById("input-T0").value),
        Tm: parseFloat(document.getElementById("input-Tm").value),
        t_muestra: parseFloat(document.getElementById("input-t-muestra").value),
        T_muestra: parseFloat(document.getElementById("input-T-muestra").value),
        T_meta: parseFloat(document.getElementById("input-T-meta").value),
        t_limite: parseFloat(document.getElementById("input-t-limite").value),
        h_rk4: parseFloat(document.getElementById("input-h-rk4").value),
        variacion_ambiente: parseFloat(document.getElementById("input-variacion").value) || 0.0,
        activar_auxiliar: document.getElementById("input-auxiliar").checked,
        guardar_historial: guardarHistorial
    };
}

async function ejecutarCalculo(event = null, guardarHistorial = false) {
    if (event) event.preventDefault();

    const payload = obtenerPayloadFormulario(guardarHistorial);

    try {
        const resp = await fetch("/api/calcular", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();

        if (!resp.ok) {
            mostrarErrorBanner(data.error || "Error en los parámetros ingresados.");
            return;
        }

        ultimoResultado = data;
        actualizarInterfaz(data);
        dibujarGraficaEnfriamiento(data);
        poblarTablaRK4(data);

        if (guardarHistorial) {
            await cargarHistorial();
            const btnBitacora = document.querySelector('[data-tab="tab-bitacora"]');
            cambiarVista("tab-bitacora", btnBitacora);
        }
    } catch (err) {
        console.error("Error comunicando con el servidor:", err);
    }
}

function guardarLoteActual() {
    ejecutarCalculo(null, true);
}

function mostrarErrorBanner(mensaje) {
    const banner = document.getElementById("alert-banner");
    banner.className = "diagnostic-bar diag-danger";
    document.getElementById("alert-icon-wrap").innerHTML = ICONOS_DIAGNOSTICO.danger;
    document.getElementById("alert-title").textContent = "ERROR DE VALIDACIÓN EN PARÁMETROS";
    document.getElementById("alert-message").textContent = mensaje;
    document.getElementById("alert-rec-text").textContent = "Verifique que T₀ > T(t) > T_obj > Tₘ y que t > 0.";
}

function actualizarInterfaz(data) {
    const p = data.parametros;
    const r = data.resultados;
    const s = data.series;

    document.getElementById("header-unit-label").textContent = p.tanque;

    // 1. Barra de Diagnóstico
    const banner = document.getElementById("alert-banner");
    const iconWrap = document.getElementById("alert-icon-wrap");
    const title = document.getElementById("alert-title");
    const tag = document.getElementById("alert-tag");
    const msg = document.getElementById("alert-message");
    const rec = document.getElementById("alert-rec-text");
    const btnQuickAux = document.getElementById("btn-quick-aux");

    banner.className = `diagnostic-bar diag-${r.nivel}`;
    iconWrap.innerHTML = ICONOS_DIAGNOSTICO[r.nivel] || ICONOS_DIAGNOSTICO.success;
    tag.textContent = `Lectura t = ${p.t_muestra.toFixed(1)} min · ${p.tanque}`;

    if (r.nivel === "danger") {
        title.textContent = p.activar_auxiliar
            ? "DESVIACIÓN TÉRMICA EN CORRECCIÓN (UNIDAD AUXILIAR ACTIVA)"
            : "ALERTA DE PROCESO: TIEMPO PROYECTADO EXCEDE LÍMITE DE 45 MIN";
        btnQuickAux.style.display = p.activar_auxiliar ? "none" : "inline-flex";
    } else if (r.nivel === "warning") {
        title.textContent = "PRECAUCIÓN OPERATIVA: MARGEN DE ENFRIAMIENTO REDUCIDO";
        btnQuickAux.style.display = p.activar_auxiliar ? "none" : "inline-flex";
    } else {
        title.textContent = "PROCESO DENTRO DE PARÁMETROS NORMATIVOS";
        btnQuickAux.style.display = "none";
    }

    msg.textContent = r.mensaje_alerta;
    rec.textContent = r.recomendacion;

    // 2. Indicadores (KPIs)
    document.getElementById("kpi-k-real").innerHTML = `${r.k_real.toFixed(5)} <small>min⁻¹</small>`;
    document.getElementById("kpi-k-min").textContent = `${r.k_minimo.toFixed(5)} min⁻¹`;

    document.getElementById("kpi-t-pred").innerHTML = `${r.t_predicho.toFixed(2)} <small>min</small>`;
    const diffEl = document.getElementById("kpi-t-diff");
    if (r.diferencia_tiempo > 0) {
        diffEl.innerHTML = `<strong style="color:#b91c1c;">+${r.diferencia_tiempo.toFixed(2)} min sobre el límite (${p.t_limite}m)</strong>`;
    } else {
        diffEl.innerHTML = `<strong style="color:#15803d;">${Math.abs(r.diferencia_tiempo).toFixed(2)} min de margen (${p.t_limite}m)</strong>`;
    }

    const tRk4Texto = r.t_predicho_rk4 !== null
        ? `${r.t_predicho_rk4.toFixed(2)} <small>min</small>`
        : `> ${s.tiempos[s.tiempos.length - 1]} <small>min</small>`;
    document.getElementById("kpi-t-rk4").innerHTML = tRk4Texto;
    document.getElementById("kpi-temp-limite").innerHTML =
        `Temp. proyectada a ${p.t_limite} min: <strong>${r.T_en_limite.toFixed(2)} °C</strong>`;

    document.getElementById("kpi-eficiencia").textContent = `${r.eficiencia_pct.toFixed(1)}%`;
    const bar = document.getElementById("kpi-eficiencia-bar");
    const widthPct = Math.min(Math.max(r.eficiencia_pct, 10), 100);
    bar.style.width = `${widthPct}%`;
    bar.style.background = r.nivel === "danger" ? "#b91c1c" : (r.nivel === "warning" ? "#b45309" : "#15803d");

    // 3. Esquema Técnico SVG
    actualizarEsquemaTanque(p.T0, p.T_muestra, p.T_meta, p.t_muestra, p.activar_auxiliar);
}

function actualizarEsquemaTanque(T0, T_actual, T_meta, tiempoActual, auxActivo) {
    document.getElementById("sim-clock").textContent = `t = ${tiempoActual.toFixed(1)} min`;
    document.getElementById("tank-temp-display").textContent = `${T_actual.toFixed(1)}°C`;
    document.getElementById("vis-T0").textContent = `${T0.toFixed(1)} °C`;
    document.getElementById("vis-Tt").textContent = `${T_actual.toFixed(1)} °C`;
    document.getElementById("vis-Tmeta").textContent = `${T_meta.toFixed(1)} °C`;

    const visAux = document.getElementById("vis-aux");
    if (auxActivo) {
        visAux.textContent = "ACTIVO (+45%)";
        visAux.className = "badge-on";
    } else {
        visAux.textContent = "INACTIVO";
        visAux.className = "badge-off";
    }

    const svgLiquid = document.getElementById("svg-tank-liquid");
    if (svgLiquid) {
        if (T_actual >= 52) {
            svgLiquid.setAttribute("fill", "#b91c1c");
        } else if (T_actual >= 25) {
            svgLiquid.setAttribute("fill", "#d97706");
        } else {
            svgLiquid.setAttribute("fill", "#0f4c81");
        }
    }
}

// =========================================================================
// SIMULADOR INTERACTIVO DE SONDA TERMOPAR (0 -> 5 MIN)
// =========================================================================
function detenerSimulacionTermopar() {
    if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
    }
    const btnText = document.getElementById("btn-sim-text");
    if (btnText) {
        btnText.textContent = "Simular Termopar (0 → 5 min)";
    }
}

function iniciarSimulacionTermopar() {
    if (simTimer) {
        detenerSimulacionTermopar();
        return;
    }
    if (!ultimoResultado) return;

    // Asegurar que la vista principal esté activa
    const btnMonitoreo = document.querySelector('[data-tab="tab-monitoreo"]');
    cambiarVista("tab-monitoreo", btnMonitoreo);

    const btnText = document.getElementById("btn-sim-text");
    if (btnText) btnText.textContent = "Detener Simulación";

    const p = ultimoResultado.parametros;
    const k = ultimoResultado.resultados.k_real;
    let tSim = 0.0;
    const tFin = p.t_muestra;
    const paso = tFin / 25.0;

    simTimer = setInterval(() => {
        tSim += paso;
        if (tSim >= tFin) {
            tSim = tFin;
            detenerSimulacionTermopar();
        }
        const tempSim = p.Tm + (p.T0 - p.Tm) * Math.exp(-k * tSim);
        actualizarEsquemaTanque(p.T0, tempSim, p.T_meta, tSim, p.activar_auxiliar);
        dibujarGraficaEnfriamiento(ultimoResultado, tSim, tempSim);
    }, 90);
}

// =========================================================================
// GRÁFICA CANVAS 1: CURVA DE ENFRIAMIENTO T(t) vs TIEMPO
// =========================================================================
function dibujarGraficaEnfriamiento(data, tCursorSim = null, tempCursorSim = null) {
    const canvas = document.getElementById("coolingChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(rect.width, 580);
    const height = 390;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 22, right: 28, bottom: 42, left: 54 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const p = data.parametros;
    const r = data.resultados;
    const s = data.series;

    const tMax = s.tiempos[s.tiempos.length - 1];
    const yMin = Math.min(0, p.Tm - 2);
    const yMax = Math.max(p.T0 + 5, 75);

    const xToPx = (t) => pad.left + (t / tMax) * plotW;
    const yToPx = (temp) => pad.top + plotH - ((temp - yMin) / (yMax - yMin)) * plotH;

    // Fondo técnico
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    // Zona fuera de límite normativo (t > t_limite)
    if (p.t_limite < tMax) {
        const xLim = xToPx(p.t_limite);
        ctx.fillStyle = "rgba(185, 28, 28, 0.04)";
        ctx.fillRect(xLim, pad.top, pad.left + plotW - xLim, plotH);
    }

    // Cuadrícula horizontal
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";

    const pasosY = 6;
    for (let i = 0; i <= pasosY; i++) {
        const valY = yMin + (i / pasosY) * (yMax - yMin);
        const py = yToPx(valY);
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + plotW, py);
        ctx.stroke();
        ctx.fillText(`${valY.toFixed(0)}°C`, pad.left - 8, py + 4);
    }

    // Cuadrícula vertical
    ctx.textAlign = "center";
    const pasoT = tMax <= 60 ? 5 : 10;
    for (let t = 0; t <= tMax; t += pasoT) {
        const px = xToPx(t);
        ctx.beginPath();
        ctx.moveTo(px, pad.top);
        ctx.lineTo(px, pad.top + plotH);
        ctx.stroke();
        ctx.fillText(`${t}m`, px, pad.top + plotH + 18);
    }

    // Marco del gráfico
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Títulos de ejes
    ctx.fillStyle = "#334155";
    ctx.font = "600 11.5px 'Inter', sans-serif";
    ctx.fillText("Tiempo de Proceso t (minutos)", pad.left + plotW / 2, height - 8);

    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Temperatura (°C)", 0, 0);
    ctx.restore();

    // Línea de consigna (4°C)
    const yMeta = yToPx(p.T_meta);
    ctx.save();
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yMeta);
    ctx.lineTo(pad.left + plotW, yMeta);
    ctx.stroke();
    ctx.fillStyle = "#15803d";
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Consigna (${p.T_meta.toFixed(1)} °C)`, pad.left + 8, yMeta - 6);
    ctx.restore();

    // Línea vertical de límite (45 min)
    if (p.t_limite <= tMax) {
        const xLim = xToPx(p.t_limite);
        ctx.save();
        ctx.strokeStyle = "#b91c1c";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(xLim, pad.top);
        ctx.lineTo(xLim, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = "#b91c1c";
        ctx.font = "600 11px 'Inter', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`Límite (${p.t_limite} min)`, xLim - 6, pad.top + 14);
        ctx.restore();
    }

    // 1. Curva límite estándar
    ctx.save();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    s.tiempos.forEach((t, i) => {
        const px = xToPx(t);
        const py = yToPx(s.estandar[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // 2. Curva Analítica Exacta
    ctx.save();
    ctx.strokeStyle = "#0f4c81";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    s.tiempos.forEach((t, i) => {
        const px = xToPx(t);
        const py = yToPx(s.analitica[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // 3. Curva Numérica RK4
    ctx.save();
    ctx.strokeStyle = "#6d28d9";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([7, 4]);
    ctx.beginPath();
    s.tiempos.forEach((t, i) => {
        const px = xToPx(t);
        const py = yToPx(s.rk4[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // Punto de lectura del termopar (t = 5 min)
    const xMuestra = xToPx(p.t_muestra);
    const yMuestra = yToPx(p.T_muestra);
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(xMuestra, yMuestra, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`PT100 (${p.t_muestra}m, ${p.T_muestra}°C)`, xMuestra + 8, yMuestra - 6);

    // Punto proyectado de llegada a 4°C
    if (r.t_predicho <= tMax) {
        const xPred = xToPx(r.t_predicho);
        const yPred = yToPx(p.T_meta);
        ctx.fillStyle = r.nivel === "danger" ? "#b91c1c" : "#15803d";
        ctx.beginPath();
        ctx.arc(xPred, yPred, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = r.nivel === "danger" ? "#b91c1c" : "#15803d";
        ctx.font = "600 11px 'JetBrains Mono', monospace";
        ctx.textAlign = xPred > plotW * 0.78 ? "right" : "left";
        const offsetTexto = xPred > plotW * 0.78 ? -8 : 8;
        ctx.fillText(`t = ${r.t_predicho.toFixed(1)}m`, xPred + offsetTexto, yPred - 9);
    }

    // Cursor de simulación en vivo
    if (tCursorSim !== null && tempCursorSim !== null) {
        const xSim = xToPx(tCursorSim);
        const ySim = yToPx(tempCursorSim);
        ctx.fillStyle = "#b91c1c";
        ctx.beginPath();
        ctx.arc(xSim, ySim, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// =========================================================================
// TABLA COMPARATIVA ANALÍTICA VS RUNGE-KUTTA (RK4)
// =========================================================================
function poblarTablaRK4(data) {
    const tbody = document.getElementById("tabla-rk4-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const p = data.parametros;
    const s = data.series;

    s.tiempos.forEach((t, i) => {
        const tr = document.createElement("tr");
        if (Math.abs(t - p.t_muestra) < 0.001) {
            tr.className = "row-sample";
        } else if (Math.abs(s.analitica[i] - p.T_meta) < 0.6) {
            tr.className = "row-goal";
        }

        tr.innerHTML = `
            <td><strong>${t.toFixed(1)} min</strong> ${Math.abs(t - p.t_muestra) < 0.001 ? '<span class="pill pill-warning">Muestreo PT100</span>' : ""}</td>
            <td>${s.analitica[i].toFixed(3)} °C</td>
            <td><strong>${s.rk4[i].toFixed(3)} °C</strong></td>
            <td>${s.estandar[i].toFixed(3)} °C</td>
            <td>${s.tm_dinamico[i].toFixed(2)} °C</td>
            <td>${s.errores_abs[i].toFixed(6)} °C</td>
        `;
        tbody.appendChild(tr);
    });
}

// =========================================================================
// BITÁCORA DE LOTES Y GRÁFICA DE TENDENCIA DE k
// =========================================================================
async function cargarHistorial() {
    try {
        const resp = await fetch("/api/historial");
        const data = await resp.json();
        historialGlobal = data.historial || [];
        poblarTablaHistorial(historialGlobal);
        dibujarGraficaHistorial(historialGlobal);
    } catch (err) {
        console.error("Error cargando bitácora:", err);
    }
}

async function limpiarHistorial() {
    try {
        await fetch("/api/historial/limpiar", { method: "POST" });
        cargarHistorial();
    } catch (err) {
        console.error("Error limpiando bitácora:", err);
    }
}

function poblarTablaHistorial(lista) {
    const tbody = document.getElementById("tabla-historial-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;">Sin registros en la bitácora.</td></tr>`;
        return;
    }

    lista.forEach(item => {
        let pillClass = "pill-success";
        if (item.estado === "ALERTA CRÍTICA") pillClass = "pill-danger";
        else if (item.estado === "PRECAUCIÓN") pillClass = "pill-warning";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${item.id}</strong></td>
            <td>${item.tanque}</td>
            <td>${item.T_muestra.toFixed(1)} °C</td>
            <td><strong>${item.k.toFixed(5)} min⁻¹</strong></td>
            <td>${item.t_predicho.toFixed(1)} min</td>
            <td><span class="pill ${pillClass}">${item.estado}</span></td>
            <td>${item.accion}</td>
        `;
        tbody.appendChild(tr);
    });
}

function dibujarGraficaHistorial(listaInversa) {
    const canvas = document.getElementById("historyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const lista = [...listaInversa].reverse();

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(rect.width, 460);
    const height = 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (lista.length === 0) return;

    const pad = { top: 22, right: 26, bottom: 34, left: 62 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    const kMinRef = lista[0].k_minimo || 0.0703;
    const valoresK = lista.map(d => d.k);
    const yMin = Math.min(...valoresK, kMinRef) * 0.85;
    const yMax = Math.max(...valoresK, kMinRef) * 1.12;

    const xToPx = (idx) => lista.length === 1
        ? pad.left + plotW / 2
        : pad.left + (idx / (lista.length - 1)) * plotW;
    const yToPx = (kVal) => pad.top + plotH - ((kVal - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "10.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
        const val = yMin + (i / 3) * (yMax - yMin);
        const py = yToPx(val);
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + plotW, py);
        ctx.stroke();
        ctx.fillText(val.toFixed(4), pad.left - 8, py + 3);
    }

    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Línea de umbral k_minimo
    const yUmbral = yToPx(kMinRef);
    ctx.save();
    ctx.strokeStyle = "#b91c1c";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yUmbral);
    ctx.lineTo(pad.left + plotW, yUmbral);
    ctx.stroke();
    ctx.fillStyle = "#b91c1c";
    ctx.font = "600 10.5px 'Inter', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Umbral mínimo (${kMinRef.toFixed(4)} min⁻¹)`, pad.left + 8, yUmbral - 5);
    ctx.restore();

    // Trazado de k
    ctx.strokeStyle = "#0f4c81";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    lista.forEach((item, idx) => {
        const px = xToPx(idx);
        const py = yToPx(item.k);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();

    lista.forEach((item, idx) => {
        const px = xToPx(idx);
        const py = yToPx(item.k);

        ctx.fillStyle = item.k < item.k_minimo ? "#b91c1c" : "#15803d";
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#334155";
        ctx.font = "10.5px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(item.id, px, pad.top + plotH + 17);
    });
}
