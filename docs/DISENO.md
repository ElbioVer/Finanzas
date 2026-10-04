# Finanzas: diseño inicial

App personal para controlar ingresos y egresos del mes, con tarjetas de crédito, gastos fijos, cuotas y escaneo de tickets. Se usa desde el celular y desde la PC con los mismos datos.

Prototipo navegable: [`prototipo/index.html`](../prototipo/index.html) (abrilo en el navegador).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Sincronización | Supabase (base de datos Postgres + login) |
| Usuarios | Uno solo |
| Monedas | Pesos y dólares |
| Cuotas | Sí, con proyección de meses futuros |
| Sueldo | Mensual (más aguinaldo en junio y diciembre) |
| Escaneo de tickets | OCR gratis en el dispositivo + IA (Claude) opcional |
| Alertas | Dentro de la app, notificaciones push y Google Calendar |
| Estilo | Oscuro y moderno |

## Plataforma

Una sola aplicación web instalable (**PWA**). En el celular se instala desde Chrome o Safari con "Agregar a pantalla de inicio" y queda como una app más, con ícono y notificaciones. En la PC se usa desde el navegador. No hace falta publicarla en Play Store ni App Store.

## Stack

- **Frontend:** React + TypeScript + Vite, PWA con service worker (funciona sin conexión y sincroniza al volver).
- **Backend:** Supabase
  - Postgres con Row Level Security (cada fila es tuya y nadie más la lee).
  - Auth con email (link mágico) o Google.
  - Storage para guardar las fotos de los tickets.
  - Edge Functions para: lectura de tickets con IA (la API key nunca llega al navegador), envío de notificaciones push y sincronización con Google Calendar.
  - `pg_cron` para tareas diarias (revisar vencimientos, aviso de cierre de mes, actualizar el dólar).
- **OCR gratis:** Tesseract.js, corre en el propio dispositivo.
- **OCR con IA:** API de Claude con visión, a través de una Edge Function. Devuelve comercio, fecha, total, ítems y CUIT en JSON.
- **Cotización del dólar:** API pública (por ejemplo dolarapi.com) leída una vez por día. Se puede elegir tarjeta, MEP, oficial o manual.
- **Hosting:** Vercel o Netlify (gratis), con dominio propio opcional.

## Pantallas

1. **Inicio:** cuánto te queda en el mes, ingresos, egresos (fijos + tarjetas + gastos directos), alertas activas, próximos vencimientos, gasto por tópico contra su tope y proyección de cuotas de los próximos 6 meses.
2. **Movimientos:** lista del mes con filtros (ingresos, egresos) y búsqueda. Cada movimiento muestra tópico, medio de pago, moneda y cuota.
3. **Tarjetas y deudas:** una ficha por tarjeta (Carrefour, Cencosud, Naranja) con cierre, vencimiento, saldo en pesos y dólares, mínimo, lo que vas a pagar y cuotas activas. Abajo, los gastos fijos (alquiler, cuota del auto) para marcar como pagados.
4. **Cierre de mes:** asistente paso a paso. Por cada tarjeta pide fecha de cierre, vencimiento, total en pesos, total en dólares, pago mínimo y cuánto vas a pagar (total, mínimo u otro monto). Avisa cuánto queda financiado. Por cada gasto fijo pide vencimiento y monto.
5. **Escanear ticket:** foto con la cámara (o archivo en la PC), lectura con OCR o IA, revisión de los datos, elección de tópico, medio de pago (débito, efectivo o tarjeta) y cuotas.
6. **Tópicos y alertas:** alta y baja de tópicos con tope mensual, configuración de alertas y del tipo de dólar.

Más un formulario rápido de **nuevo movimiento** (ingreso o egreso) accesible desde Inicio y Movimientos.

## Modelo de datos (Supabase)

```sql
-- Tópicos: Alquiler, Supermercado, Gimnasio, etc.
categories (id, user_id, name, kind['ingreso'|'egreso'], is_fixed, monthly_cap, color, archived)

-- Medios de pago: Débito, Efectivo, cada tarjeta
payment_methods (id, user_id, name, kind['debito'|'efectivo'|'credito'|'banco'],
                 issuer, last4, closing_day, due_day, color, archived)

-- Movimientos sueltos (ingresos y gastos)
transactions (id, user_id, date, description, amount, currency['ARS'|'USD'],
              type['ingreso'|'egreso'], category_id, payment_method_id,
              installment_plan_id null, receipt_id null, statement_id null, created_at)

-- Compras en cuotas: genera una transacción por mes
installment_plans (id, user_id, description, total_amount, currency,
                   installments, first_statement_month, payment_method_id, category_id)

-- Resumen mensual de cada tarjeta (lo que pide el cierre de mes)
card_statements (id, user_id, payment_method_id, period['2026-11'],
                 closing_date, due_date, total_ars, total_usd, minimum_payment,
                 planned_payment, planned_kind['total'|'minimo'|'otro'],
                 paid_amount null, paid_at null)

-- Gastos fijos recurrentes y su instancia de cada mes
recurring_expenses (id, user_id, name, category_id, default_amount, currency, due_day, active)
recurring_instances (id, recurring_id, period, due_date, amount, paid_at null)

-- Tickets escaneados
receipts (id, user_id, image_path, ocr_engine['tesseract'|'claude'], raw_text,
          parsed_json, confidence, created_at)

-- Alertas y configuración
alerts (id, user_id, kind, ref_table, ref_id, fire_at, sent_at, read_at, message)
settings (user_id, fx_source, fx_manual, notify_push, notify_calendar,
          month_close_day, alert_days_before int[])
push_subscriptions (id, user_id, endpoint, keys_json, device_name)
```

## Cómo se calcula el mes

- **Ingresos:** sueldo + ingresos extra del mes.
- **Egresos:** gastos fijos del mes + lo que vas a pagar de cada tarjeta (según elijas total, mínimo u otro) + gastos con débito y efectivo.
- **Te queda:** ingresos − egresos.
- Los consumos con tarjeta no se restan dos veces: van al resumen y se descuentan cuando pagás el resumen.
- Los dólares se convierten con la cotización elegida para los totales, pero se guardan y se muestran en su moneda original.

## Alertas

| Alerta | Cuándo | Por dónde |
|---|---|---|
| Vencimiento próximo | 3 días y 1 día antes (configurable) | App, push, Google Calendar |
| Cierre de mes | El día 28 (configurable) | App, push |
| Tope de tópico | Al llegar al 80% y al 100% | App, push |
| Pago del mínimo | Al elegir mínimo en el cierre | App |
| Resumen sin cargar | Pasó la fecha de cierre de una tarjeta y no cargaste el resumen | App, push |

Google Calendar: al guardar el cierre de mes se crea (o actualiza) un evento por vencimiento con recordatorio. Requiere autorizar la app con tu cuenta de Google una sola vez.

## Escaneo de tickets

1. Foto con la cámara trasera, recortada y comprimida en el dispositivo.
2. **OCR gratis:** Tesseract.js extrae el texto y reglas simples detectan total, fecha, CUIT y comercio.
3. **Con IA:** la foto va a una Edge Function que llama a Claude y devuelve JSON con comercio, fecha, total, ítems y CUIT. Se usa cuando lo elegís, o se sugiere cuando el OCR tiene baja confianza.
4. La app propone el tópico según el comercio y recuerda tus elecciones (si Coto fue Supermercado, la próxima vez lo propone solo).
5. Elegís medio de pago y cuotas. Si es con tarjeta, se suma al próximo resumen y a la proyección de cuotas.

## Plan por etapas

1. **Base:** proyecto, login, tópicos, medios de pago, movimientos, pantalla de Inicio. Instalable en el celular.
2. **Tarjetas:** resúmenes, cierre de mes, cuotas y proyección, gastos fijos.
3. **Alertas:** avisos en la app, push y Google Calendar.
4. **Tickets:** OCR con Tesseract y lectura con IA.
5. **Extras:** dólar automático, gráficos históricos, exportar a Excel, presupuesto anual con aguinaldo.

## Pendiente de definir

- Días de cierre y vencimiento reales de cada tarjeta (el prototipo usa valores inventados).
- Banco donde cobrás el sueldo y con el que pagás con débito.
- Tipo de dólar para convertir los consumos en USD.
- Si ya tenés cuenta en Supabase y una API key de Anthropic, o las creamos juntos.
