#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AGENTE VAKI  —  actualiza vaki.json con el recaudo de la campaña
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Qué hace:
 *    Lee cuánto dinero lleva recaudado la campaña en VAKI y escribe el
 *    archivo vaki.json (mismo folder que index.html). La web lee ese
 *    archivo cada 60s, así que el contador se actualiza "solo".
 *
 *  Por qué existe (en vez de leer VAKI desde el navegador):
 *    - VAKI renderiza el monto con JavaScript (Angular): un fetch normal
 *      del HTML NO trae el número.
 *    - Su API propia (api.vaki.co) exige autenticación (Firebase App Check).
 *    - El navegador bloquearía la llamada por CORS.
 *    Por eso el agente corre POR FUERA (servidor / GitHub Action / tu PC)
 *    y deja el dato ya "masticado" en vaki.json.
 *
 *  Dos estrategias (usa la que te funcione; por defecto intenta ambas):
 *    1) ALGOLIA  → rápido, sin navegador. Usa el índice de búsqueda público
 *       de VAKI. Funciona si la campaña aparece en ese índice.
 *    2) NAVEGADOR (Playwright) → abre la página pública real y lee el monto
 *       que se muestra. Es lo más fiable para una campaña nueva.
 *
 *  Uso:
 *    node agente-vaki.mjs
 *  Programarlo (cada 10 min) con cron:
 *    * /10 * * * *  cd /ruta/al/proyecto && /usr/bin/node agente-vaki.mjs
 *  (ver AGENTE-VAKI.md para GitHub Actions y más detalle)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'vaki.json');

// ─── Configuración de la campaña ──────────────────────────────────────────
const SLUG = 'reconstruccion-nuevo-cali-2026';
const PAGE_URL = `https://vaki.co/vaki/${SLUG}`;
const META_FALLBACK = 100000000; // meta (COP) si no se puede leer. Ajústala.

// Índice de búsqueda público de VAKI (search-only key, pensada para ser pública)
const ALGOLIA = {
  appId: 'YAKUXKWQES',
  apiKey: '7addd4eb3fdaca22de8dfe2ab9eac228',
  index: 'vakis',
};

// ─── Estrategia 1: Algolia ────────────────────────────────────────────────
async function viaAlgolia() {
  const url = `https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/${ALGOLIA.index}/query`;
  // Buscamos por varios términos y elegimos el hit cuyo info.url == SLUG.
  for (const query of [SLUG, 'reconstruccion nuevo cali', 'nuevo cali 2026', 'Colombia nos necesita']) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': ALGOLIA.appId,
        'X-Algolia-API-Key': ALGOLIA.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, hitsPerPage: 20 }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    const hit = (data.hits || []).find(h => (h?.info?.url || h?.slug) === SLUG);
    if (hit) {
      const a = hit.analytics || {};
      const goal = (hit.collection_goals || []).map(g => g.amount).filter(Boolean).pop();
      return {
        recaudo: Math.round(a.total_collected ?? 0),
        meta: goal || META_FALLBACK,
        aportes: a.total_vakers ?? 0,
      };
    }
  }
  throw new Error('Algolia: la campaña aún no aparece en el índice por su slug.');
}

// ─── Estrategia 2: navegador headless (Playwright) ────────────────────────
// Requiere:  npm i playwright  &&  npx playwright install chromium
async function viaNavegador() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright no está instalado. Corre: npm i playwright && npx playwright install chromium');
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    // Espera a que aparezca algún valor en pesos y toma todo el texto visible.
    await page.waitForFunction(() => /\$\s?[\d.,]{4,}/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
    const texto = await page.evaluate(() => document.body.innerText);

    // Recaudo: preferimos la cifra en pesos que va justo antes de "Recaudado(s)".
    // Ej: "COP$ 18.040.606\nRecaudados"
    let recaudo = 0;
    const mRec = texto.match(/\$\s*([\d.]+)[\s\S]{0,20}?Recaudad/i);
    if (mRec) {
      recaudo = parseInt(mRec[1].replace(/\./g, ''), 10);
    } else {
      // Respaldo: la MAYOR cifra en pesos de la página.
      const montos = [...texto.matchAll(/\$\s?([\d.]{4,})/g)]
        .map(m => parseInt(m[1].replace(/\./g, ''), 10))
        .filter(Number.isFinite);
      recaudo = montos.length ? Math.max(...montos) : 0;
    }

    // Nº de aportes: "123 Vakers" o "1 – 10 of 123".
    let aportes = 0;
    const mVak = texto.match(/([\d.]+)\s*vak(?:i|er)s/i) || texto.match(/of\s+([\d.]+)/i);
    if (mVak) aportes = parseInt(mVak[1].replace(/\./g, ''), 10);

    if (!recaudo) throw new Error('Navegador: no se pudo leer el monto en la página (revisa el selector/regex).');
    return { recaudo, meta: META_FALLBACK, aportes };
  } finally {
    await browser.close();
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────
async function main() {
  let datos;
  const errores = [];
  for (const [nombre, fn] of [['algolia', viaAlgolia], ['navegador', viaNavegador]]) {
    try {
      datos = await fn();
      console.log(`✓ Datos obtenidos vía ${nombre}:`, datos);
      break;
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`);
    }
  }
  if (!datos) {
    console.error('✗ No se pudo obtener el recaudo. Detalle:\n  - ' + errores.join('\n  - '));
    console.error('  vaki.json NO se modificó.');
    process.exit(1);
  }

  const salida = {
    recaudo: datos.recaudo,
    meta: datos.meta,
    aportes: datos.aportes,
    actualizadoEn: new Date().toISOString(),
  };
  await writeFile(OUT, JSON.stringify(salida, null, 2) + '\n', 'utf8');
  console.log(`✓ vaki.json actualizado → $${salida.recaudo.toLocaleString('es-CO')} (${salida.aportes} aportes)`);
}

main();
