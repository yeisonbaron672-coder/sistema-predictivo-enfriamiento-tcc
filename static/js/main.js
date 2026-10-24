// =========================================================================
// TCC: SISTEMA PREDICTIVO DE ENFRIAMIENTO - LÁCTEOS DEL VALLE
// Lógica Frontend, Gráficas Canvas Interactivas y Simulación de Termopar
// =========================================================================

let ultimoResultado = null;
let historialGlobal = [];
let simTimer = null;

// Configuración de escenarios de prueba rápida
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
        if (ultimoResultado) {
            dibujarGraficaEnfriamiento(ultimoResultado);
        }
        if (historialGlobal.length > 0) {
            dibujarGraficaHistorial(historialGlobal);
        }
    });
});

function cargarEscenario(nombre) {
    detenerSimulacionTermopar();
    const esc = ESCENARIOS[nombre];
    if (!esc) return;

    document.querySelectorAll(".btn-chip").forEach(btn => btn.classList.remove("active"));
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
            cargarHistorial();
        }
    } catch (err) {
        console.error("Error comunicando con el servidor Flask:", err);
    }
}

function guardarLoteActual() {
    ejecutarCalculo(null, true);
}

function mostrarErrorBanner(mensaje) {
    const banner = document.getElementById("alert-banner");
    banner.className = "alert-banner alert-danger";
    document.getElementById("alert-icon").textContent = "!";
    document.getElementById("alert-title").textContent = "ERROR DE VALIDACIÓN FÍSICA";
    document.getElementById("alert-message").textContent = mensaje;
    document.getElementById("alert-rec-text").textContent = "Verifique que T₀ > T(t) > T_meta > Tₘ y que t > 0.";
}

function actualizarInterfaz(data) {
    const p = data.parametros;
    const r = data.resultados;
    const s = data.series;

    // 1. Banner de Alerta Temprana
    const banner = document.getElementById("alert-banner");
    const icon = document.getElementById("alert-icon");
    const title = document.getElementById("alert-title");
    const tag = document.getElementById("alert-tag");
    const msg = document.getElementById("alert-message");
    const rec = document.getElementById("alert-rec-text");
    const btnQuickAux = document.getElementById("btn-quick-aux");

    banner.className = `alert-banner alert-${r.nivel}`;
    tag.textContent = `Muestreo en t = ${p.t_muestra} min | ${p.tanque}`;

    if (r.nivel === "danger") {
        icon.textContent = "⚠";
        title.textContent = p.activar_auxiliar
            ? `ALERTA DETECTADA EN t = ${p.t_muestra} MIN (SISTEMA AUXILIAR ACTIVO)`
            : `¡ALERTA TEMPRANA! RIESGO DE PÉRDIDA DE LOTE (${r.estado})`;
        btnQuickAux.style.display = p.activar_auxiliar ? "none" : "inline-block";
    } else if (r.nivel === "warning") {
        icon.textContent = "!";
        title.textContent = `ESTADO DEL CICLO: ${r.estado} (DESGASTE DE COMPRESOR)`;
        btnQuickAux.style.display = p.activar_auxiliar ? "none" : "inline-block";
    } else {
        icon.textContent = "✓";
        title.textContent = `ESTADO DEL CICLO: ${r.estado} (INOCUIDAD GARANTIZADA)`;
        btnQuickAux.style.display = "none";
    }

    msg.textContent = r.mensaje_alerta;
    rec.textContent = r.recomendacion;

    // 2. Tarjetas KPI
    document.getElementById("kpi-k-real").innerHTML = `${r.k_real.toFixed(5)} <small>min⁻¹</small>`;
    document.getElementById("kpi-k-min").textContent = `${r.k_minimo.toFixed(5)} min⁻¹`;

    document.getElementById("kpi-t-pred").innerHTML = `${r.t_predicho.toFixed(2)} <small>min</small>`;
    const diffEl = document.getElementById("kpi-t-diff");
    if (r.diferencia_tiempo > 0) {
        diffEl.innerHTML = `<strong style="color:#dc2626;">+${r.diferencia_tiempo.toFixed(2)} min sobre el límite (${p.t_limite} min)</strong>`;
    } else {
        diffEl.innerHTML = `<strong style="color:#16a34a;">${Math.abs(r.diferencia_tiempo).toFixed(2)} min antes del límite (${p.t_limite} min)</strong>`;
    }

    const tRk4Texto = r.t_predicho_rk4 !== null ? `${r.t_predicho_rk4.toFixed(2)} <small>min</small>` : `> ${s.tiempos[s.tiempos.length - 1]} <small>min</small>`;
    document.getElementById("kpi-t-rk4").innerHTML = tRk4Texto;
    document.getElementById("kpi-temp-limite").innerHTML =
        `Temp. analítica a los ${p.t_limite} min: <strong>${r.T_en_limite.toFixed(2)} °C</strong>`;

    document.getElementById("kpi-eficiencia").textContent = `${r.eficiencia_pct.toFixed(1)}%`;
    const bar = document.getElementById("kpi-eficiencia-bar");
    const widthPct = Math.min(Math.max(r.eficiencia_pct, 10), 100);
    bar.style.width = `${widthPct}%`;
    bar.style.background = r.nivel === "danger" ? "#dc2626" : (r.nivel === "warning" ? "#d97706" : "#16a34a");

    // 3. Visualizador del Tanque
    actualizarVisualizadorTanque(p.T0, p.T_muestra, p.T_meta, p.t_muestra, p.activar_auxiliar);

    // 4. Sustitución Matemática Paso a Paso
    document.getElementById("math-edo-sub").textContent =
        `dT / dt = -${r.k_real.toFixed(5)} · (T - ${p.Tm.toFixed(1)})`;

    document.getElementById("math-t-text").textContent = `t = ${p.t_muestra} min`;
    document.getElementById("math-k-sub").textContent =
        `k = -(1 / ${p.t_muestra}) · ln( [${p.T_muestra.toFixed(1)} - ${p.Tm.toFixed(1)}] / [${p.T0.toFixed(1)} - ${p.Tm.toFixed(1)}] ) = ${r.k_real.toFixed(5)} min⁻¹`;

    document.getElementById("math-t-sub").textContent =
        `t_final = -(1 / ${r.k_real.toFixed(5)}) · ln( [${p.T_meta.toFixed(1)} - ${p.Tm.toFixed(1)}] / [${p.T0.toFixed(1)} - ${p.Tm.toFixed(1)}] ) = ${r.t_predicho.toFixed(2)} min`;

    const errMedio = s.errores_abs.reduce((a, b) => a + b, 0) / s.errores_abs.length;
    document.getElementById("math-rk4-sub").textContent =
        `Paso h = ${p.h_rk4} min | T_RK4(4°C) = ${r.t_predicho_rk4 || "--"} min | Dif. media Analítica vs RK4: ${errMedio.toFixed(5)} °C`;
}

function actualizarVisualizadorTanque(T0, T_actual, T_meta, tiempoActual, auxActivo) {
    document.getElementById("sim-clock").textContent = `t = ${tiempoActual.toFixed(1)} min`;
    document.getElementById("tank-temp-display").textContent = `${T_actual.toFixed(1)}°C`;
    document.getElementById("vis-T0").textContent = `${T0.toFixed(1)} °C`;
    document.getElementById("vis-Tt").textContent = `${T_actual.toFixed(1)} °C`;
    document.getElementById("vis-Tmeta").textContent = `${T_meta.toFixed(1)} °C`;

    const visAux = document.getElementById("vis-aux");
    if (auxActivo) {
        visAux.textContent = "ACTIVO (+45% k)";
        visAux.className = "status-on";
    } else {
        visAux.textContent = "APAGADO";
        visAux.className = "status-off";
    }

    // Gradiente térmico del líquido según temperatura
    const liquid = document.getElementById("tank-liquid");
    if (T_actual >= 52) {
        liquid.style.background = "linear-gradient(180deg, #f97316 0%, #dc2626 100%)";
    } else if (T_actual >= 25) {
        liquid.style.background = "linear-gradient(180deg, #eab308 0%, #f97316 100%)";
    } else {
        liquid.style.background = "linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)";
    }
}

// =========================================================================
// SIMULADOR INTERACTIVO DE CAPTURA DE TERMOPAR (0 -> 5 MIN)
// =========================================================================
function detenerSimulacionTermopar() {
    if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
    }
    const btn = document.getElementById("btn-simular-termopar");
    if (btn) {
        btn.textContent = "▶ Simular Captura de Termopar (0 → 5 min)";
    }
}

function iniciarSimulacionTermopar() {
    if (simTimer) {
        detenerSimulacionTermopar();
        return;
    }
    if (!ultimoResultado) return;

    const btn = document.getElementById("btn-simular-termopar");
    btn.textContent = "⏹ Detener Simulación en Curso";

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
        actualizarVisualizadorTanque(p.T0, tempSim, p.T_meta, tSim, p.activar_auxiliar);
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

    // Ajuste de resolución para pantallas Retina / HiDPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(rect.width, 620);
    const height = 370;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const pad = { top: 24, right: 32, bottom: 44, left: 56 };
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

    // Fondo del área de trazado
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    // Zona sombreada de exceso de tiempo (t > t_limite)
    if (p.t_limite < tMax) {
        const xLim = xToPx(p.t_limite);
        ctx.fillStyle = "rgba(220, 38, 38, 0.05)";
        ctx.fillRect(xLim, pad.top, pad.left + plotW - xLim, plotH);
    }

    // Cuadrícula horizontal (Temperaturas)
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
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

    // Cuadrícula vertical (Tiempos)
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

    // Etiquetas de ejes
    ctx.fillStyle = "#334155";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("Tiempo de Enfriamiento t (minutos)", pad.left + plotW / 2, height - 8);

    ctx.save();
    ctx.translate(16, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Temperatura T (°C)", 0, 0);
    ctx.restore();

    // Línea horizontal de Temperatura Objetivo (4°C)
    const yMeta = yToPx(p.T_meta);
    ctx.save();
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yMeta);
    ctx.lineTo(pad.left + plotW, yMeta);
    ctx.stroke();
    ctx.fillStyle = "#15803d";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Meta Inocuidad (${p.T_meta}°C)`, pad.left + 8, yMeta - 6);
    ctx.restore();

    // Línea vertical de Tiempo Límite (45 min)
    if (p.t_limite <= tMax) {
        const xLim = xToPx(p.t_limite);
        ctx.save();
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(xLim, pad.top);
        ctx.lineTo(xLim, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`Límite (${p.t_limite} min)`, xLim - 6, pad.top + 14);
        ctx.restore();
    }

    // 1. Curva Estándar Límite (gris punteada)
    ctx.save();
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
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

    // 2. Curva Analítica Exacta (Azul)
    ctx.save();
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    s.tiempos.forEach((t, i) => {
        const px = xToPx(t);
        const py = yToPx(s.analitica[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // 3. Curva Numérica RK4 (Violeta)
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    s.tiempos.forEach((t, i) => {
        const px = xToPx(t);
        const py = yToPx(s.rk4[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();

    // Punto de muestreo del termopar en t = t_muestra (ej. 5 min)
    const xMuestra = xToPx(p.t_muestra);
    const yMuestra = yToPx(p.T_muestra);
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(xMuestra, yMuestra, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Termopar (${p.t_muestra}m, ${p.T_muestra}°C)`, xMuestra + 8, yMuestra - 6);

    // Punto donde se alcanza la temperatura meta (4°C)
    if (r.t_predicho <= tMax) {
        const xPred = xToPx(r.t_predicho);
        const yPred = yToPx(p.T_meta);
        ctx.fillStyle = r.nivel === "danger" ? "#dc2626" : "#16a34a";
        ctx.beginPath();
        ctx.arc(xPred, yPred, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = r.nivel === "danger" ? "#b91c1c" : "#15803d";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = xPred > plotW * 0.78 ? "right" : "left";
        const offsetTexto = xPred > plotW * 0.78 ? -8 : 8;
        ctx.fillText(`T=4°C (${r.t_predicho.toFixed(1)} min)`, xPred + offsetTexto, yPred - 10);
    }

    // Si hay simulación en vivo del termopar, dibujar cursor animado
    if (tCursorSim !== null && tempCursorSim !== null) {
        const xSim = xToPx(tCursorSim);
        const ySim = yToPx(tempCursorSim);
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(xSim, ySim, 7, 0, Math.PI * 2);
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
            <td><strong>${t.toFixed(1)} min</strong> ${Math.abs(t - p.t_muestra) < 0.001 ? '<span class="pill pill-warning">Lectura Termopar</span>' : ""}</td>
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
// HISTORIAL DE LOTES Y GRÁFICA DE DEGRADACIÓN DEL FACTOR k
// =========================================================================
async function cargarHistorial() {
    try {
        const resp = await fetch("/api/historial");
        const data = await resp.json();
        historialGlobal = data.historial || [];
        poblarTablaHistorial(historialGlobal);
        dibujarGraficaHistorial(historialGlobal);
    } catch (err) {
        console.error("Error cargando historial:", err);
    }
}

async function limpiarHistorial() {
    try {
        await fetch("/api/historial/limpiar", { method: "POST" });
        cargarHistorial();
    } catch (err) {
        console.error("Error limpiando historial:", err);
    }
}

function poblarTablaHistorial(lista) {
    const tbody = document.getElementById("tabla-historial-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;">Sin lotes registrados. Use "+ Registrar Lote en Historial".</td></tr>`;
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
            <td><strong>${item.k.toFixed(5)}</strong></td>
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

    const lista = [...listaInversa].reverse(); // Orden cronológico

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(rect.width, 400);
    const height = 200;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (lista.length === 0) return;

    const pad = { top: 22, right: 24, bottom: 34, left: 58 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    const kMinRef = lista[0].k_minimo || 0.0703;
    const valoresK = lista.map(d => d.k);
    const yMin = Math.min(...valoresK, kMinRef) * 0.85;
    const yMax = Math.max(...valoresK, kMinRef) * 1.12;

    const xToPx = (idx) => lista.length === 1
        ? pad.left + plotW / 2
        : pad.left + (idx / (lista.length - 1)) * plotW;
    const yToPx = (kVal) => pad.top + plotH - ((kVal - yMin) / (yMax - yMin)) * plotH;

    // Cuadrícula horizontal
    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
        const val = yMin + (i / 3) * (yMax - yMin);
        const py = yToPx(val);
        ctx.beginPath();
        ctx.moveTo(pad.left, py);
        ctx.lineTo(pad.left + plotW, py);
        ctx.stroke();
        ctx.fillText(val.toFixed(4), pad.left - 6, py + 3);
    }

    // Umbral mínimo k_minimo
    const yUmbral = yToPx(kMinRef);
    ctx.save();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yUmbral);
    ctx.lineTo(pad.left + plotW, yUmbral);
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Umbral k mín (${kMinRef.toFixed(4)} min⁻¹)`, pad.left + 6, yUmbral - 5);
    ctx.restore();

    // Línea de evolución de k
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    lista.forEach((item, idx) => {
        const px = xToPx(idx);
        const py = yToPx(item.k);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Puntos de cada lote
    lista.forEach((item, idx) => {
        const px = xToPx(idx);
        const py = yToPx(item.k);

        ctx.fillStyle = item.k < item.k_minimo ? "#dc2626" : "#16a34a";
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#334155";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(item.id, px, pad.top + plotH + 16);
    });
}
