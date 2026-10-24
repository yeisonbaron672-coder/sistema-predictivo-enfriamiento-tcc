# Sistema Predictivo de Enfriamiento — Lácteos del Valle (TCC)

🌐 **Demo en vivo (Vercel):** [https://sistema-predictivo-enfriamiento-tcc.vercel.app](https://sistema-predictivo-enfriamiento-tcc.vercel.app)

**Universidad de Cartagena – Campus Cereté**  
**Facultad de Ingeniería · Ingeniería de Software (2026-2)**  
- **Tutor:** Ing. Luis Gorrostola  
- **CIPA:** Ingenieros  
- **Integrantes:** Yeison Barón, Jorge Angúlo, Sergio Argumedo y Jason Pereira  

## Descripción
Aplicación web desarrollada en **Python (Flask)**, **HTML5/CSS3** y **JavaScript** que modela matemáticamente el enfriamiento de leche pasteurizada ($72^\circ\text{C} \to 4^\circ\text{C}$) mediante la **Ley de Enfriamiento de Newton** y el método numérico **Runge-Kutta de 4to Orden (RK4)**:

$$\frac{dT}{dt} = -k(T - T_m) \quad \Longrightarrow \quad T(t) = T_m + (T_0 - T_m)e^{-kt}$$

## Ejecución Local
```bash
pip install -r requirements.txt
python app.py
```
Abrir en el navegador: `http://127.0.0.1:5000`
