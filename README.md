# Tasapp

Tasas del día y calculadora de conversiones cruzadas para la frontera colombo-venezolana.

En la frontera se comercia con cuatro referencias a la vez y la pregunta habitual no es
"¿cuántos bolívares son 100 $?" sino **"si cambio 100 $ a tasa BCV, ¿cuántos dólares
Binance, euros o pesos me quedan?"**. Tasapp responde eso: muestra las tasas del día y
convierte cualquier monto usando el bolívar como pivote.

Hecho con Next.js 16 (App Router), TypeScript y Tailwind CSS v4. Sin base de datos y sin
dependencias fuera del framework.

## Poner en marcha

```bash
npm install
npm run dev     # http://localhost:3000
```

No hace falta ninguna variable de entorno ni clave de API.

## Cómo calcula

Cada moneda tiene un precio en bolívares (`bsPerUnit`). Convertir es pasar por el bolívar:

```
bs             = monto × tasa(origen)
monto_destino  = bs ÷ tasa(destino)
```

Ejemplo con las tasas del 2 de agosto de 2026:

| Paso | Cálculo | Resultado |
| --- | --- | --- |
| 100 $ a tasa BCV | 100 × 748,7864 | 74.878,64 Bs |
| esos Bs en dólares Binance | 74.878,64 ÷ 846,4575 | 88,46 $ |
| esos Bs en euros BCV | 74.878,64 ÷ 861,1867 | 86,95 € |
| esos Bs en pesos (cruce BCV) | 74.878,64 ÷ 0,23378 | 320.289 COP |
| esos Bs en pesos (cruce Binance) | 74.878,64 ÷ 0,26428 | 283.331 COP |

El peso no cotiza contra el bolívar: su precio en Bs es un cruce vía dólar
(`bsPorPeso = bsPorDólar ÷ pesosPorDólar`). Por eso se publican **dos** cruces, el oficial
y el del mercado P2P, que es el que suele regir en la práctica.

## API REST

| Método | Ruta | Devuelve |
| --- | --- | --- |
| `GET` | `/api/rates` | Todas las tasas. `?refresh=1` salta la caché |
| `GET` | `/api/rates/bcv` | Dólar y euro oficiales |
| `GET` | `/api/rates/binance` | Dólar P2P con compra, venta y punto medio |
| `GET` | `/api/rates/cop` | Pesos por dólar y los dos cruces en Bs |
| `POST` | `/api/convert` | Equivalencias de un monto |
| `GET` | `/api/health` | Estado de cada proveedor (`200` sano, `207` degradado) |

```bash
curl -X POST localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"from":"USD_BCV"}'
```

Bases válidas en `from`: `USD_BCV`, `USD_BINANCE`, `EUR_BCV`, `COP_BCV`, `COP_BINANCE`,
`VES`. Los errores siempre responden `{ "error": "...", "detail": "..." }`.

## Fuentes de datos

| Dato | Fuente | Notas |
| --- | --- | --- |
| Dólar y euro BCV | `https://www.bcv.org.ve/` | Se lee el HTML de la portada. Su certificado TLS está vencido, así que la petición usa `node:https` sin validarlo, acotado a ese host |
| Dólar BCV (respaldo) | `https://ve.dolarapi.com/v1/dolares/oficial` | Solo publica el dólar; cuando entra en juego, el euro queda sin dato |
| Dólar Binance P2P | `POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search` | Endpoint público de la web de Binance. Se toma la mediana recortada de 20 anuncios por lado |
| Pesos por dólar | `https://open.er-api.com/v6/latest/USD` | Plan abierto de ExchangeRate-API, sin clave |

Si el entorno define `HTTPS_PROXY`, la petición al BCV abre el túnel `CONNECT` a mano:
Node no aplica esa variable por su cuenta.

### Sobre las APIs del documento de referencia

El documento de partida proponía otros endpoints que, al verificarlos, ya no servían:

- `bcv.today/en/api/*` → 404, el dominio no expone esa API.
- `bcvapi.tech/api/v1/dolar` → 401, ahora exige registro.
- `v6.exchangerate-api.com` → 403, exige clave; se usa el plan abierto `open.er-api.com`.
- `api.frankfurter.dev` → 404, y Frankfurter solo cubre monedas del BCE (sin COP ni VES).
- `api.exchangerate.host` → exige `access_key`.
- Binance vía SDK → innecesario, el endpoint REST público basta.

## Caché y actualización

`lib/cache.ts` guarda la fotografía de tasas 5 minutos en memoria, deduplica peticiones
simultáneas y, si un proveedor falla, conserva el último valor bueno en lugar de dejar la
tarjeta vacía. El botón "Actualizar tasas" navega con `?actualizar=<marca>` para forzar una
consulta nueva.

Los proveedores se consultan con `Promise.allSettled`: que Binance esté caído no impide ver
la tasa del BCV. Lo que falte se marca en la interfaz como "dato no disponible" y queda
explicado en `/api/health`.

## Estructura

```
app/            páginas y rutas API (App Router, sin carpeta src/)
components/     panel de tasas, calculadora y teclado numérico
lib/            proveedores, agregación, conversión y formato
```
