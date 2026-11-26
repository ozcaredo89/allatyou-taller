import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture: typeof import('./fixtures/aceites.json') = JSON.parse(
  readFileSync(new URL('./fixtures/aceites.json', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
);

const carpeta = fileURLToPath(new URL('../../docs/presentaciones/aceites/capturas/', import.meta.url));

async function captura(page: Page, archivo: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await mkdir(carpeta, { recursive: true });
  await page.screenshot({ path: `${carpeta}${archivo}.png`, fullPage: false, animations: 'disabled', scale: 'css' });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-26T16:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('taller_auth', JSON.stringify({
      token: 'demo-token', empresaId: '40000000-0000-4000-8000-000000000001',
      empresaNombre: 'Taller Demo', empresaSlug: 'taller-demo', email: 'operario@example.com',
    }));
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const ruta = url.pathname.slice('/api'.length);
    if (ruta === '/inventario/items') return route.fulfill({ json: fixture.productos });
    if (ruta === '/inventario/aceites/resumen') return route.fulfill({ json: fixture.resumen });
    if (ruta === '/inventario/aceites/sugerencia') {
      expect(url.searchParams.get('vehiculo_id')).toBe(fixture.orden.vehiculo_id);
      return route.fulfill({ json: { ...fixture.sugerencia, producto: fixture.productos[2] } });
    }
    if (ruta === '/inventario/pendientes') return route.fulfill({ json: { pendientes: fixture.pendientes, paginas: 1 } });
    if (ruta === `/ingresos/${fixture.orden.id}`) return route.fulfill({
      json: route.request().method() === 'PUT' ? { ...fixture.orden, ...route.request().postDataJSON() } : fixture.orden,
    });
    if (ruta === '/gastos') return route.fulfill({ json: [] });
    if (ruta === '/ingresos/catalogo-items') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  });
});

test('recorrido de Aceites en escritorio', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  test.setTimeout(90_000);
  await page.goto('/taller-demo/inventario');
  await page.getByRole('button', { name: 'Aceites', exact: true }).click();
  const producto = page.getByRole('row', { name: /Aceite 20W-50 mineral/ });
  await expect(producto.getByText('132 cuartos', { exact: true })).toBeVisible();
  await expect(producto.getByText(/Caneca en uso · 60 %/)).toBeVisible();
  await captura(page, '01-inventario-aceites');

  await page.getByRole('button', { name: 'Nuevo aceite' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Código').fill('ACE-1040');
  await modal.getByLabel('Nombre').fill('Aceite 10W-40 semisintético');
  await modal.getByLabel('Viscosidad').fill('10W-40');
  await modal.getByLabel('Base').selectOption('semisintetico');
  await modal.getByLabel(/^Presentación/).selectOption('granel');
  await expect(modal.getByLabel('Capacidad de la caneca (L)')).toHaveValue('208.198');
  await captura(page, '02-nuevo-aceite');
  await modal.getByRole('button', { name: 'Cerrar' }).click();

  await producto.getByRole('button', { name: 'Compra' }).click();
  await modal.getByLabel(/Costo por/).fill('3500000');
  await expect(modal.getByText(/Equivale a 220 cuartos · 55 gal/)).toBeVisible();
  await captura(page, '03-compra-caneca');
  await modal.getByRole('button', { name: 'Cerrar' }).click();

  await page.goto(`/taller-demo/checkout/${fixture.orden.id}`);
  const chip = page.getByRole('button', { name: /Último cambio: 5W-30 · 4 cuartos · 12\/10\/2026/ });
  await expect(chip).toBeVisible();
  await chip.scrollIntoViewIfNeeded();
  await captura(page, '04-checkout-sugerencia');
  await chip.click();
  const linea = page.getByRole('row', { name: /Aceite 5W-30 sintético a granel/ })
    .filter({ has: page.getByRole('cell', { name: '4 cuartos', exact: true }) });
  await expect(linea).toContainText('4 cuartos');
  await expect(linea).toContainText('/ cuarto');
  await expect(linea).toContainText('121.133,2');
  await linea.scrollIntoViewIfNeeded();
  await captura(page, '05-checkout-linea-cuartos');

  await page.getByRole('button', { name: /notificar|enviar.*cotizaci[oó]n/i }).click();
  const mensaje = page.getByRole('dialog', { name: 'Vista previa de WhatsApp' });
  await expect(mensaje).toContainText('Cant: 4 cuartos');
  await expect(mensaje).toContainText('121.133,2');
  await captura(page, '06-whatsapp-cotizacion');

  await page.goto('/taller-demo/inventario');
  await page.getByRole('button', { name: 'Aceites', exact: true }).click();
  await producto.getByRole('button', { name: 'Medir nivel' }).click();
  await modal.getByLabel('Nivel medido con varilla (L)').fill('116.349');
  await modal.getByLabel('Litros usados en órdenes abiertas').fill('3.785');
  await expect(modal.getByText(/Entregas pendientes incluidas: 4 cuartos/)).toBeVisible();
  await expect(modal.getByText(/Ajuste a registrar -1 L/)).toBeVisible();
  await captura(page, '07-medir-nivel');
  await modal.getByRole('button', { name: 'Cerrar' }).click();

  const resumen = page.getByRole('region', { name: 'Resumen de aceites' });
  await expect(resumen).toContainText('5W-30');
  await expect(resumen).toContainText('Merma');
  await expect(resumen).toContainText('Margen promedio por cambio');
  await resumen.scrollIntoViewIfNeeded();
  await captura(page, '08-resumen-aceites');
});

test('catálogo de Aceites en móvil', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/taller-demo/inventario');
  await page.getByRole('button', { name: 'Aceites', exact: true }).click();
  const tarjeta = page.getByRole('article').filter({ hasText: 'Aceite 20W-50 mineral' });
  await expect(tarjeta.getByText('132 cuartos en stock')).toBeVisible();
  await expect(tarjeta.getByRole('progressbar')).toHaveAttribute('aria-label', 'Nivel de la caneca en uso');
  await captura(page, '09-movil-inventario');
});
