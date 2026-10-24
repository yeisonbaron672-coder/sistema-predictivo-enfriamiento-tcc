# Lácteos del Valle — Sistema Predictivo de Enfriamiento

**Aplicación en línea:** [https://sistema-predictivo-enfriamiento-tcc.vercel.app](https://sistema-predictivo-enfriamiento-tcc.vercel.app)

## Módulos Operativos
- **Monitoreo y Predicción:** Captura de lectura del termopar PT100, cálculo automático de la tasa de enfriamiento del compresor ($k$), proyección del tiempo exacto para alcanzar los $4^\circ\text{C}$ y emisión de alertas tempranas ($t \le 45\text{ min}$).
- **Proyección Minuto a Minuto:** Registro detallado de la evolución térmica del tanque y respuesta ante activación de unidad de refrigeración auxiliar.
- **Bitácora de Lotes:** Historial operativo de lotes procesados y monitoreo de desgaste de compresores.

## Ejecución Local
```bash
pip install -r requirements.txt
python app.py
```
Servidor disponible en `http://127.0.0.1:5000`.
