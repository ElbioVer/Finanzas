# Puesta en marcha

Son tres pasos: preparar Supabase, publicar la app y entrar desde el celular y la PC. Lleva unos 15 minutos.

## 1. Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (por ejemplo `finanzas`). La región más cercana es **South America (São Paulo)**.
2. En el proyecto, abrí **SQL Editor → New query**, pegá todo el contenido de [`supabase/migrations/0001_inicial.sql`](../supabase/migrations/0001_inicial.sql) y tocá **Run**. Crea las tablas y deja cada fila visible solo para su dueño.
3. En **Project Settings → API** copiá:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

   La clave `anon` es pública por diseño: la seguridad la dan las reglas del paso 2. Nunca uses la clave `service_role` en la app.
4. En **Authentication → URL Configuration** poné en **Site URL** la dirección donde vas a publicar la app (paso 2). Si querés probar en tu PC, agregá también `http://localhost:5173` en **Redirect URLs**.

## 2. Publicar la app (Vercel, gratis)

1. Entrá a [vercel.com](https://vercel.com) con tu cuenta de GitHub y elegí **Add New → Project → elbiover/finanzas**.
2. Framework: **Vite** (lo detecta solo).
3. En **Environment Variables** cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del paso 1.
4. **Deploy**. Te da una dirección tipo `https://finanzas-xxxx.vercel.app`. Volvé al paso 1.4 y ponela como Site URL.

Cada vez que se actualice la rama principal en GitHub, Vercel publica la nueva versión sola.

## 3. Primer ingreso

1. Abrí la dirección de Vercel y tocá **Es la primera vez: crear cuenta**. Usá tu email y una contraseña de al menos 8 caracteres.
2. Confirmá el email que te manda Supabase y volvé a entrar.
3. **Recomendado:** como la app es solo para vos, en Supabase andá a **Authentication → Sign In / Providers → Email** y desactivá **Allow new users to sign up**. Así nadie más puede crearse una cuenta.
4. La primera vez se cargan solos los tópicos (Sueldo, Alquiler, Cuota Auto, Supermercado…) y los medios de pago (Galicia, Efectivo, TC Carrefour, TC Cencosud, TC Naranja). Cambialos cuando quieras desde **Tópicos y alertas**.
5. En **Tarjetas y deudas → Editar tarjeta** cargá el día de cierre y de vencimiento de cada una.

### Instalarla en el celular

- **Android (Chrome):** abrí la dirección, menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
- **iPhone (Safari):** abrí la dirección, botón Compartir → **Agregar a inicio**.

Queda con ícono propio y se abre a pantalla completa. Usá el mismo email y contraseña en la PC y en el celular para ver los mismos datos.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completá con tus datos de Supabase
npm run dev                  # http://localhost:5173
npm test                     # tests de cálculos
npm run build                # chequeo de tipos + build de producción
```

Sin `.env.local` la app arranca en **modo demo**, con datos de ejemplo guardados solo en el navegador.
