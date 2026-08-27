# Sistema de estilos de La Tasa

Cómo se ve y se comporta esta interfaz, y **por qué**. Una regla sin motivo se
rompe en el primer apuro, así que aquí cada una viene con el suyo.

Léelo antes de escribir interfaz nueva. La fuente de verdad de los valores es
[`app/globals.css`](app/globals.css); este documento explica cuándo usar cada uno.

## 1. Principios

La app se usa **de pie, en un negocio, en un teléfono y con señal intermitente**.
De ahí sale todo lo demás:

- **Tema oscuro fijo.** No hay modo claro ni `prefers-color-scheme`: un solo tema
  que se lee igual a plena luz y de noche, sin parpadeos al cargar.
- **El número manda.** En cada pantalla hay una cifra que el usuario vino a buscar;
  es el elemento más grande y de mayor contraste de su bloque. Todo lo demás
  —etiqueta, fuente, hora— es contexto en `--muted`.
- **Se toca, no se apunta.** Objetivos grandes, respuesta táctil inmediata
  (`active:scale-95`) y cero dependencia del `hover`.
- **Cada dato dice de dónde viene y cuándo.** Fuente y antigüedad son parte del
  componente, no letra pequeña opcional.

## 2. Color

Los nueve tokens viven en `:root` y se exponen a Tailwind en el bloque `@theme
inline`. **El estándar para código nuevo son las utilidades cortas** de la última
columna, que Tailwind v4 genera solas desde ese bloque.

| Token | Valor | Rol | Utilidad |
| --- | --- | --- | --- |
| `--background` | `#0b1120` | Fondo de la app. Ya está en `body`; casi nunca hace falta escribirlo | `bg-background` |
| `--surface` | `#131c2f` | Superficie de contenido: tarjetas, listas, display, avisos | `bg-surface` |
| `--surface-strong` | `#1b273f` | Control elevado **sobre** una superficie: las teclas del teclado numérico | `bg-surface-strong` |
| `--border` | `#26324c` | Todo borde y todo divisor | `border-border-soft` |
| `--foreground` | `#f1f5f9` | Texto principal. Heredado de `body`; solo se escribe para recuperarlo dentro de un bloque en `--muted` | `text-foreground` |
| `--muted` | `#94a3b8` | Texto secundario: etiquetas, fuentes, ayudas, controles no seleccionados | `text-muted` |
| `--accent` | `#34d399` | Lo vivo: marca, resultado en bolívares, selección, foco | `text-accent` / `bg-accent` |
| `--accent-strong` | `#10b981` | Reservado (ver §11) | `text-accent-strong` |
| `--warning` | `#fbbf24` | Dato ausente o desactualizado. **Nunca decorativo** | `text-warning` |

Reglas:

- **Prohibido el color crudo de Tailwind.** Nada de `bg-slate-800`, `text-gray-400`
  ni `#hex` sueltos. Si un color no está en la tabla, la conversación es sobre
  añadir un token, no sobre escribirlo a mano. Hoy el proyecto cumple esto al 100 %
  y es lo que hace posible cambiar la paleta entera desde un solo archivo.
- **Opacidad para los tintes**, no tokens nuevos: `bg-accent/15`, `border-accent/40`.
  Los valores en uso están en §9.
- `--warning` es semántico: si algo se pinta ámbar, el usuario debe entender que
  **ese número no es de fiar ahora mismo**.

> El código existente escribe `bg-[color:var(--surface)]`. Es exactamente lo mismo
> —las utilidades cortas leen esas variables— así que ambas sintaxis conviven sin
> riesgo. Lo nuevo va corto; lo viejo se migra cuando se toque por otro motivo.

## 3. Tipografía

Una sola familia: **Geist Sans**, cargada en [`app/layout.tsx`](app/layout.tsx) y
aplicada desde `body`. No se declara `font-sans` en los componentes.

La escala se elige **por rol**, no por tamaño:

| Rol | Clases | Dónde |
| --- | --- | --- |
| Título de la app | `text-3xl font-bold leading-none tracking-tight` | [`app/page.tsx`](app/page.tsx) |
| Encabezado de sección | `text-sm font-semibold uppercase tracking-wide text-muted` | `RatePanel`, `Calculator`, `ConversionResults` |
| Cifra protagonista (display) | `tabular text-4xl font-semibold sm:text-5xl` | display de la calculadora |
| Cifra de tarjeta | `tabular text-2xl font-semibold sm:text-3xl` | `RateCard` con un solo monto |
| Cifra apilada | `tabular text-lg font-semibold sm:text-xl` | `RateCard` con compra y venta |
| Símbolo anexo a la cifra | `font-normal text-muted`, `text-lg` junto al display y `text-sm` en todo lo demás | `$`, `Bs` |
| Nombre / etiqueta | `text-sm font-medium` | nombre de moneda, chips |
| Meta y ayuda | `text-xs` | fuente, hora, notas, tooltips |
| Letra pequeña | `text-xs leading-relaxed text-muted` | `Footer` |

Reglas:

- **`.tabular` es obligatorio en todo número que el usuario compare** —tasas,
  montos, equivalencias—. Sin `font-variant-numeric: tabular-nums` los dígitos
  cambian de ancho y las columnas bailan al teclear.
- **`leading-none` en las cifras grandes.** El interlineado por defecto les deja un
  hueco que rompe la alineación con su etiqueta.
- **El símbolo nunca compite con el número**: siempre `font-normal` y en `--muted`.
- **No inventes tamaños fuera de la escala de Tailwind.** Un `text-[10px]` es señal
  de que el contenedor está mal, no de que falte un tamaño.
- Geist Mono se carga y se expone como `--font-mono`, pero **no se usa**: para
  alinear números ya está `.tabular`. Ver §11.

## 4. Espaciado y layout

- **Contenedor de página** (uno solo, en [`app/page.tsx`](app/page.tsx)):

  ```
  mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 sm:px-6
  pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]
  ```

  El `env(safe-area-inset-*)` no es opcional: instalada en iPhone la app se dibuja
  bajo la barra de estado y sin eso la hora se monta sobre el nombre.

- **Escala de separación**, de fuera hacia dentro:

  | `gap` | Separa |
  | --- | --- |
  | `gap-6` | Bloques de la página (avisos, cabecera, tasas, calculadora, pie) |
  | `gap-5` | Zonas dentro de la calculadora |
  | `gap-3` | Encabezado de sección y su contenido |
  | `gap-2` | Ítems hermanos: tarjetas, filas, teclas, chips |
  | `gap-1` / `gap-1.5` | Ícono y su texto |

- **Padding**: `px-4 py-3` en superficies de contenido (`sm:py-4` cuando la tarjeta
  lleva una cifra grande); `px-3 py-1` en píldoras; `px-2 py-2` en chips.

- **Breakpoints: solo `sm:` y `lg:`.** `md:` no se usa en todo el proyecto y no
  debe aparecer: la app tiene dos formas —una columna en el teléfono, dos en
  pantalla ancha— y añadir un tercer punto de quiebre multiplica lo que hay que
  revisar sin resolver nada.

- **No declares un breakpoint que repite el valor base.** `sm:gap-2` sobre un
  `gap-2` no hace nada y sugiere una intención que no existe.

## 5. Radios, bordes y sombras

| Rol | Clase | Token |
| --- | --- | --- |
| Superficie (tarjeta, lista, display, aviso) | `rounded-2xl` | `rounded-superficie` |
| Control (tecla, chip, botón rectangular) | `rounded-xl` | `rounded-control` |
| Píldora (acción secundaria, cerrar) | `rounded-full` | — |

Dos radios con intención, no tres por accidente: **la superficie contiene, el
control se toca**. Los tokens `--radius-superficie` y `--radius-control` valen
exactamente lo mismo que `rounded-2xl` y `rounded-xl`, así que ambas escrituras son
válidas; el nombre solo hace explícito cuál toca.

- **Todo borde es de 1px**: `border border-border-soft`. No hay `border-2` y no
  debería haberlo — el contraste lo pone el color de fondo, no el grosor.
- **Sombras solo en capas flotantes.** Hoy la única es el `shadow-lg` del tooltip.
  Una tarjeta que ya se distingue por fondo y borde no necesita sombra, y en tema
  oscuro apenas se percibe: es peso sin beneficio.

## 6. Interacción

- **Respuesta táctil**: `transition active:scale-95` en **todo** lo que se pueda
  tocar. Es la única confirmación inmediata que tiene el usuario; sin ella, con
  señal lenta, la app parece colgada.
- **`hover:` no se usa.** El público es móvil; lo que en escritorio se resuelve con
  `hover` aquí se resuelve con estado visible (color, borde, `aria-pressed`).
- **Foco**: hay una regla global en `globals.css` (`:focus-visible` → contorno de
  2px en `--accent`). No declares foco por componente salvo que el contorno choque
  con algo; `:focus-visible` solo se activa con teclado, así que tocar una tecla no
  deja el contorno pegado.
- **Deshabilitado**: `disabled:opacity-50`, un solo valor. Y siempre el atributo
  `disabled` real, no solo el estilo: una moneda sin tasa **no debe poder
  seleccionarse**.
- **Área táctil mínima 44 px.** Se consigue con padding, no con `min-h-*`. Para un
  ícono pequeño e inevitable —el `Info` de las ayudas— el ancla del tooltip amplía
  la zona con `after:absolute after:-inset-2`; reutiliza ese componente en vez de
  repetir el truco.
- **Ícono de ayuda**: siempre `size-3.5 opacity-60` dentro de un `<Tooltip>`. La
  ayuda cuelga de un ícono visible porque **nadie adivina que un texto suelto se
  toca**.

## 7. Recetas

Bloques listos para copiar. Si una pantalla nueva necesita algo que no está aquí,
lo correcto es añadirlo a esta lista, no improvisarlo.

**Superficie / tarjeta**

```
rounded-2xl border border-border-soft bg-surface px-4 py-3 sm:py-4
```

**Fila de lista** (dentro de un `<ul>` con `divide-y divide-border-soft
overflow-hidden rounded-2xl border border-border-soft bg-surface`)

```
flex items-center justify-between gap-3 px-4 py-3
```

**Control principal / tecla**

```
tabular rounded-xl border border-border-soft bg-surface-strong py-4 text-2xl
font-semibold transition active:scale-95 active:bg-accent/20 sm:py-5
```

**Chip de selección**

```
rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50
seleccionado:  border-accent bg-accent/15 text-accent
normal:        border-border-soft bg-surface text-muted
```

**Píldora secundaria**

```
rounded-full border border-border-soft px-3 py-1 text-xs font-medium text-muted
transition active:scale-95 disabled:opacity-50
```

**Tarjeta de métrica** (`components/admin/TarjetaMetrica.tsx`, para filas de
cifras en `/admin/analiticas`)

```
flex h-full flex-col gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-4
etiqueta:  min-h-8 text-xs font-semibold uppercase leading-4 tracking-wide text-muted
ícono:     size-7 rounded-xl bg-accent/10 text-accent   (el glifo, size-3.5)
cifra:     tabular text-2xl font-semibold leading-none sm:text-3xl
apoyo:     mt-auto text-xs leading-4 text-muted
```

Se lee en fila, no de una en una, y de ahí sus dos reglas propias: `h-full`
más el `mt-auto` del apoyo alinean las cifras entre sí aunque una etiqueta
ocupe dos líneas y la de al lado una, y el `min-h-8` reserva esas dos líneas
para que la cifra no baile. **La etiqueta tiene que caber en dos líneas al
ancho más angosto en que se use** —en una fila de cinco columnas eso son unos
110 px— o vuelve el desnivel: es más corto renombrar la etiqueta ("La Parada",
no "Al post de La Parada", que además ya lo dice el `/laparada` de abajo) que
recortar el texto por CSS.

**Bloque destacado (resultado)**

```
rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3
```

**Barra de progreso** (`BarraProgreso`, debajo del control que disparó la acción)

```
pista:    h-1 w-full overflow-hidden rounded-full bg-surface-strong
relleno:  h-full rounded-full bg-accent   (+ width en % si hay porcentaje)
etiqueta: text-xs text-muted   ·   cifra: tabular text-xs text-muted
```

Con porcentaje solo cuando el porcentaje es real. Cuando no se puede medir, el
relleno pasa a `barra-splash w-1/3` —la misma animación indeterminada del
splash, con su `prefers-reduced-motion` ya resuelto— y el texto dice qué está
pasando. Inventar una cifra rompe la regla de §8.

**Aviso de dato ausente (superficie)**

```
rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3
```

**Franja de estado (barra fina, fija arriba)**

```
sticky top-[env(safe-area-inset-top)] z-10 -mx-4 border-b border-warning/40
bg-warning/15 px-4 py-2 text-center text-xs font-medium text-warning backdrop-blur
sm:-mx-6 sm:px-6
```

## 8. Estados del dato

| Estado | Cómo se ve |
| --- | --- |
| Normal | Tarjeta en `--surface`, cifra en `--foreground`, fuente y hora en `--muted` |
| Destacado (el resultado en Bs) | Borde y fondo en `--accent`, cifra en `--accent` |
| No disponible | Tarjeta en tinte `--warning`, texto explícito «Dato no disponible ahora mismo» — **nunca un guion, un cero ni un espacio en blanco** |
| Sin conexión | Franja `--warning` fija arriba, con la antigüedad de los datos |

Dos reglas que no son estéticas:

- **La antigüedad siempre visible.** Se escribe en lenguaje llano («hace 3 horas»,
  «vigente mañana») porque la pregunta real del usuario no es qué hora se publicó,
  sino si el número todavía sirve. El formateo vive en
  [`lib/format.ts`](lib/format.ts) y se arma a mano, no con `Intl.DateTimeFormat`
  (rompía la hidratación).
- **La tasa de frontera es una aproximación** y la interfaz no puede presentarla
  como cotización en firme. Ni copy, ni jerarquía visual, ni color deben sugerir lo
  contrario. El aviso legal del pie no se quita ni se suaviza.

## 9. Tintes de opacidad en uso

| Tinte | Uso |
| --- | --- |
| `/40` | Borde de un bloque teñido (acento o aviso) |
| `/20` | Fondo momentáneo al presionar una tecla |
| `/15` | Fondo de chip seleccionado; fondo de franja delgada |
| `/10` | Fondo de bloque destacado |
| `/5` | Fondo de superficie amplia en aviso |

Una superficie grande necesita un tinte más suave que una franja delgada para pesar
lo mismo: por eso el aviso de tarjeta va en `/5` y la barra de sin conexión en `/15`.

## 10. Accesibilidad (lo que ya es estándar aquí)

- Cada sección con `aria-labelledby` apuntando a su encabezado.
- El resultado que cambia al teclear va en `<output aria-live="polite">`.
- Los chips de selección llevan `aria-pressed`.
- Toda tecla o botón sin texto legible lleva `aria-label` («Borrar último dígito»,
  «Coma decimal», «No mostrar más»).
- Banderas y logos son decorativos: `alt=""` y `aria-hidden="true"`.
- La animación del splash se detiene con `prefers-reduced-motion`.

## 11. Deuda conocida

Desviaciones reales del estándar de arriba, con archivo y línea. **No están rotas**
—la app se ve bien— pero cada una es una decisión que se tomó dos veces distinto.
Se corrigen cuando se toque el archivo por otro motivo, no en una pasada aparte.

| Dónde | Qué hay | Qué dice el estándar |
| --- | --- | --- |
| [`Tooltip.tsx:40`](components/Tooltip.tsx) | `!rounded-lg` (tercer radio, con `!`) | `rounded-2xl` — es una superficie flotante |
| [`Keypad.tsx:40`](components/Keypad.tsx) | Botón «Limpiar» en `--surface`, pegado a teclas en `--surface-strong` | Es un control: `--surface-strong` |
| [`Calculator.tsx:92`](components/Calculator.tsx) | `disabled:opacity-40` | `disabled:opacity-50` (como la línea 74 del mismo archivo) |
| [`ConversionResults.tsx:37`](components/ConversionResults.tsx) y [`:73`](components/ConversionResults.tsx) | Símbolo anexo en `text-base` y en `text-xs` | `text-sm` |
| [`RateCard.tsx:122`](components/RateCard.tsx) y [`:140`](components/RateCard.tsx) | Ícono `Info` en `size-3` | `size-3.5` |
| [`RateCard.tsx:131`](components/RateCard.tsx) | `text-[10px] lg:text-sm` (único tamaño arbitrario del proyecto, y escala con `lg:` en vez de `sm:`) | `text-xs sm:text-sm` |
| [`RatePanel.tsx:29`](components/RatePanel.tsx) | `sm:gap-2` y `lg:grid-cols-2` repiten el valor base | Borrar ambas: no hacen nada |
| `--accent-strong` | Definido y expuesto, sin un solo consumidor | Darle rol (p. ej. presionado del acento) o retirarlo |
| `--font-mono` | Geist Mono se carga en `layout.tsx` y nunca se usa | Retirar la carga o justificar el peso |

---

Al añadir un componente: reutiliza una receta de §7, saca los colores de §2, elige
el radio por rol en §5, pon `active:scale-95` en todo lo tocable y `.tabular` en
todo número. Si te hace falta un valor que no está aquí, el paso es discutir el
token — no escribirlo suelto.
