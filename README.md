# Track·Tag — Rastreo de bultos

Web para trazabilidad de bultos: código, ubicación origen/destino, cantidad, estado (cambiado / por cambiar) y fotografía.

## Stack

- **Frontend**: HTML/CSS/JS plano, sin frameworks ni build — `index.html` (consulta pública) + `admin.html` (carga de datos).
- **Backend**: Cloudflare Pages Functions — `functions/api/read.js` (lectura) y `functions/api/write.js` (escritura).
- **Base de datos**: Cloudflare KV — un solo registro (`records`) con el snapshot completo en JSON.
- **Seguridad**: `ADMIN_KEY` como variable de entorno secreta, exigida solo para escribir.

## Estructura

```
/
├── index.html              Consulta pública (solo búsqueda)
├── admin.html               Panel administrador (carga + búsqueda + contadores)
├── assets/
│   ├── style.css
│   └── app.js
├── functions/
│   └── api/
│       ├── read.js          GET /api/read  (público)
│       └── write.js         POST /api/write (protegido con ADMIN_KEY)
└── wrangler.toml             Referencia para desarrollo local
```

## 1. Subir el código a GitHub

```bash
cd track-tag
git init
git add .
git commit -m "Primer commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/track-tag.git
git push -u origin main
```

## 2. Crear el proyecto en Cloudflare Pages

1. En el dashboard de Cloudflare → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Elegí el repositorio recién creado.
3. Configuración de build:
   - **Framework preset**: None
   - **Build command**: (vacío)
   - **Build output directory**: `/`
4. Deploy. A partir de acá, cada `git push` a `main` dispara un deploy automático.

## 3. Crear el namespace de KV

1. **Workers & Pages** → **KV** → **Create namespace** → nombralo, por ejemplo, `track-tag-data`.
2. Andá al proyecto de Pages → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**:
   - **Variable name**: `INVENTORY_KV`
   - **KV namespace**: el que acabás de crear.
3. Guardá y volvé a desplegar (Settings → Deployments → Retry deployment) para que el binding tome efecto.

## 4. Configurar la clave de administrador

1. En el proyecto de Pages → **Settings** → **Environment variables**.
2. Agregá una variable **secreta**:
   - **Name**: `ADMIN_KEY`
   - **Value**: la clave que quieras usar para autorizar la carga de datos (ej: una contraseña larga y aleatoria).
3. Aplicá a **Production** (y **Preview** si vas a probar en ramas).
4. Volvé a desplegar para que tome efecto.

Esa misma clave es la que se ingresa en el campo **"Clave de administrador"** dentro de `admin.html` antes de guardar un registro. No se guarda en el servidor: viaja en cada solicitud en el header `X-Admin-Key` y el backend la compara contra `ADMIN_KEY`.

## Uso

### Consulta pública (`/`)
Solo hay una barra de búsqueda. Al ingresar un código, devuelve todos los registros que coincidan (parcial, sin importar mayúsculas), con su fotografía, ubicaciones, cantidad y estado.

### Panel administrador (`/admin.html`)
- Formulario para cargar: **código, ubicación origen, cantidad, ubicación destino**, checkbox **CAMBIADO** y foto (cámara o galería, se comprime automáticamente antes de enviarse).
- Botón **Guardar registro** (requiere la clave de administrador).
- Buscador por código que muestra los registros existentes con su fotografía.
- Contadores en vivo de **Cambiado** vs **Por cambiar**, sobre el total de la base.

## Notas y límites a tener en cuenta

- **Tamaño de KV**: cada valor de KV admite hasta 25 MB. Como todo el snapshot vive en una sola clave (`records`), las fotos se comprimen a ~1100px / JPEG calidad 0.72 en el navegador antes de guardarse, pero igual conviene monitorear el crecimiento. Si el volumen de registros con foto crece mucho (miles de registros), lo ideal a futuro es mover las imágenes a **Cloudflare R2** y guardar solo la URL en KV — el resto de la arquitectura no cambiaría.
- **Concurrencia**: como se lee y reescribe todo el arreglo en cada guardado, si dos personas guardan exactamente al mismo tiempo puede perderse una escritura (last-write-wins). Para el volumen típico de un equipo chico no debería ser un problema.
- La página pública nunca ve ni pide la `ADMIN_KEY` — solo puede leer.

## Desarrollo local (opcional)

```bash
npm install -g wrangler
wrangler pages dev . --kv INVENTORY_KV
```

Actualizá el `id` del namespace en `wrangler.toml` con el ID real que te da Cloudflare al crear el namespace.
