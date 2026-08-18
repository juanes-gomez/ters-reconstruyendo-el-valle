# Agente VAKI — cómo actualizar el contador en vivo

La web (`index.html`) muestra cuánto lleva recaudado la campaña leyendo el archivo
**`vaki.json`** cada 60 segundos. Ese archivo lo actualiza un **agente** que corre por
fuera del navegador: `agente-vaki.mjs`.

```
  agente-vaki.mjs   →  escribe  →  vaki.json   →  lee  →  index.html (cada 60s)
   (cron / Action)                (mismo sitio)          (sin CORS, "en vivo")
```

## ¿Por qué no lee la web directamente de VAKI?

- VAKI muestra el monto con JavaScript (app Angular): descargar el HTML **no** trae la cifra.
- Su API propia (`api.vaki.co`) **exige autenticación** (Firebase App Check) → responde 401.
- El navegador, además, **bloquea por CORS** cualquier llamada directa a otro dominio.

Por eso el agente corre aparte, obtiene el dato y lo deja "masticado" en `vaki.json`, que
es del **mismo origen** que la web (sin CORS).

## Dos formas de obtener el dato (el agente intenta ambas)

1. **Algolia** (rápido, sin navegador). VAKI tiene un índice de búsqueda público
   (`vakis`) con una *search-only key* pensada para ser pública. Trae `total_collected`
   (recaudo), `total_vakers` (aportes) y la meta. Funciona **si** la campaña ya aparece en
   ese índice por su slug. *(Verificado: la key funciona y expone esos campos; a la fecha
   esta campaña, por ser nueva, todavía no se recupera limpio por slug — por eso existe la
   opción 2.)*
2. **Navegador headless (Playwright)** — lo más fiable para una campaña nueva. Abre la
   página pública real y lee el monto que se muestra (la mayor cifra en pesos).

## Instalación y prueba

```bash
cd "/Users/juanes/Desktop/PAGINA TERS"

# Solo si vas a usar la opción navegador:
npm init -y
npm i playwright
npx playwright install chromium

# Corre el agente una vez:
node agente-vaki.mjs
```

Si funciona, verás algo como `✓ vaki.json actualizado → $12.345.678 (321 aportes)` y el
archivo `vaki.json` quedará con la cifra y la fecha.

> Nota: para que la web **lea** `vaki.json` no basta con abrir el archivo con doble clic
> (`file://` bloquea el fetch). Sirve la carpeta con un servidor local:
> ```bash
> python3 -m http.server 8080
> # abre http://localhost:8080
> ```
> Al abrir con `file://`, la web usa los valores de respaldo (`CONFIG` en index.html).

## Programarlo para que se actualice continuamente

**Opción A — cron (servidor o Mac encendido), cada 10 minutos:**
```cron
*/10 * * * * cd "/Users/juanes/Desktop/PAGINA TERS" && /usr/bin/node agente-vaki.mjs >> agente.log 2>&1
```

**Opción B — GitHub Actions** (si el sitio vive en un repo / GitHub Pages). Crea
`.github/workflows/vaki.yml`:
```yaml
name: Actualizar VAKI
on:
  schedule:
    - cron: '*/15 * * * *'   # cada 15 min
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i playwright && npx playwright install --with-deps chromium
      - run: node agente-vaki.mjs
      - run: |
          git config user.name "vaki-bot"
          git config user.email "bot@users.noreply.github.com"
          git add vaki.json
          git commit -m "chore: actualizar recaudo VAKI" || echo "sin cambios"
          git push
```

## Qué ajustar

- **Meta** (`META_FALLBACK` en `agente-vaki.mjs`) si Algolia no la trae.
- El **slug** de la campaña (`SLUG`) si cambia.
- Si la opción navegador lee mal el número, ajusta la regex / el selector en la función
  `viaNavegador()` (el HTML de VAKI puede cambiar con el tiempo).

## Alternativa más simple

Si no quieres montar el agente todavía, edita a mano los valores en **`vaki.json`**
(o en el objeto `CONFIG` dentro de `index.html`) y la web los mostrará igual.
