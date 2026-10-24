# Lácteos del Valle — Sistema Predictivo de Enfriamiento

**Aplicación en línea:** [https://sistema-predictivo-enfriamiento-tcc.vercel.app](https://sistema-predictivo-enfriamiento-tcc.vercel.app)

## Descripción Técnica
Sistema de monitoreo termodinámico y control de calidad para procesos de pasteurización y enfriamiento lácteo ($72^\circ\text{C} \to 4^\circ\text{C}$). Implementa la **Ley de Enfriamiento de Newton** junto con integración numérica **Runge-Kutta de 4to Orden (RK4)**:

$$\frac{dT}{dt} = -k(T - T_m) \quad \Longrightarrow \quad T(t) = T_m + (T_0 - T_m)e^{-kt}$$

### Módulos
- **Estimación dinámica de transferencia térmica ($k$):** Cálculo en tiempo real del coeficiente de decaimiento a partir de lecturas tempranas de termopar.
- **Proyección de tiempo a consigna ($4^\circ\text{C}$):** Determinación anticipada de cumplimiento del umbral microbiológico ($45\text{ min}$).
- **Integración numérica RK4:** Simulación ante fluctuaciones del medio refrigerante y activación de enfriamiento auxiliar.
- **Bitácora de lotes:** Seguimiento histórico del coeficiente $k$ para mantenimiento preventivo de compresores.

## Ejecución Local
```bash
pip install -r requirements.txt
python app.py
```
Servidor disponible en `http://127.0.0.1:5000`.
