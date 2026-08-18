# TERS por la Reconstrucción de un nuevo Cali

Landing (maqueta) de campaña solidaria de **TERS** en alianza con **Reconstruyendo el Valle**,
con un contador conectado a la campaña en **VAKI**.

- `index.html` — la página (autocontenida: HTML + CSS + JS).
- `assets/` — logos e imágenes.
- `vaki.json` — el recaudo que muestra la web (lo actualiza el agente).
- `agente-vaki.mjs` — agente que lee el recaudo de la VAKI. Ver `AGENTE-VAKI.md`.
- `.github/workflows/actualizar-vaki.yml` — cron que corre el agente y actualiza `vaki.json`.
- `vercel.json` — config de hosting (no-cache para `vaki.json`).

## Desplegar en Vercel (GitHub → Vercel)

1. **Crea un repo vacío en GitHub** (sin README): https://github.com/new
   - Nombre sugerido: `ters-reconstruyendo-el-valle` · **Private** u **Public**, como prefieras.
2. **Conecta este proyecto y súbelo** (desde la carpeta del proyecto):
   ```bash
   git remote add origin https://github.com/<TU_USUARIO>/ters-reconstruyendo-el-valle.git
   git push -u origin main
   ```
   > El `push` te pedirá autenticarte con GitHub (esa parte la haces tú).
3. **Impórtalo en Vercel:** entra a https://vercel.com/new, elige el repo y dale **Deploy**.
   No hay que configurar nada (es un sitio estático). En segundos tendrás la URL pública.

## Actualización automática del contador

Al subir el repo, el **GitHub Action** (`Actualizar contador VAKI`) corre solo cada 30 min:
lee el recaudo real de la VAKI, actualiza `vaki.json` y, si cambió, hace commit → **Vercel
redespliega solo** y la web muestra el nuevo monto. También puedes dispararlo a mano en la
pestaña **Actions → Actualizar contador VAKI → Run workflow**.

> Requisito en GitHub: **Settings → Actions → General → Workflow permissions → Read and write**
> (para que el Action pueda commitear `vaki.json`).
