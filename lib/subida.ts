/**
 * Subida de archivos con progreso, para los formularios de `/admin/noticia`.
 *
 * El archivo va **directo del navegador a Cloudinary**, no a través de nuestro
 * servidor. No es una optimización: en Vercel el cuerpo de una petición a una
 * función tiene un tope de unos 4,5 MB, así que un video de teléfono —18 MB
 * para minuto y pico a 720p— moría con un 413 emitido por la plataforma, antes
 * de llegar a ningún código nuestro y por tanto sin mensaje que explicara nada.
 * Cloudinary acepta hasta el tope real de `subirMedia` (100 MB).
 *
 * Nuestro servidor sigue siendo quien autoriza: `/api/admin/firmar-subida`
 * comprueba la cookie de sesión y devuelve una firma de un solo uso. El
 * `CLOUDINARY_API_SECRET` nunca llega al navegador.
 *
 * Todo lo demás en el proyecto habla con el servidor por `fetch()`, pero
 * `fetch()` **no expone el progreso de subida**: entrega el cuerpo y solo avisa
 * cuando llega la respuesta. Para una foto da igual, pero un video de varios MB
 * desde el teléfono deja al admin mirando un texto fijo sin saber si avanza.
 * `XMLHttpRequest` sí emite `upload.onprogress`, y es la única razón por la que
 * aquí se usa la API vieja.
 *
 * Lo que se puede medir es solo el viaje de los bytes. Lo que sigue —Cloudinary
 * procesando el archivo antes de responder— es una espera de la que el
 * navegador no recibe ningún avance, así que se declara como fase aparte en vez
 * de inventarle un porcentaje.
 */

/** En qué punto va la subida. `procesando` es el tramo sin cifra posible. */
export type FaseSubida = { tipo: "enviando"; porcentaje: number } | { tipo: "procesando" };

/** Permiso de subida que emite `/api/admin/firmar-subida`. */
interface PermisoSubida {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  maxBytes: number;
}

/** Reconstruye el mensaje de error que devuelven las rutas de `/api/admin/*`. */
function leerErrorPropio(texto: string, status: number): string {
  try {
    const body = JSON.parse(texto) as { error?: string; detail?: string };
    if (body?.error) return `${body.error}${body.detail ? `: ${body.detail}` : ""}`;
  } catch {
    // Cuerpo vacío o no-JSON: queda el código de estado, que ya dice algo.
  }
  return `Error ${status}`;
}

/**
 * Reconstruye el mensaje de error de Cloudinary, que tiene otra forma que la
 * de nuestras rutas (`{ error: { message } }`). Se muestra tal cual porque es
 * lo que le dice al admin si reintentar o cambiar el archivo — un formato que
 * no soporta, por ejemplo.
 */
function leerErrorCloudinary(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // Igual que arriba: sin cuerpo legible queda el código de estado.
  }
  return `Cloudinary respondió ${xhr.status}`;
}

/** Pide el permiso de subida, que es también donde se comprueba la sesión. */
async function pedirPermiso(): Promise<PermisoSubida> {
  const response = await fetch("/api/admin/firmar-subida", { method: "POST" });
  const texto = await response.text();
  if (!response.ok) throw new Error(leerErrorPropio(texto, response.status));
  return JSON.parse(texto) as PermisoSubida;
}

/**
 * Sube un archivo a Cloudinary informando el avance, y devuelve su `public_id`.
 *
 * `alAvanzar` se llama con `enviando` mientras viajan los bytes y una última
 * vez con `procesando` en cuanto termina el envío: ese es el instante en que
 * Cloudinary empieza a procesar el archivo.
 */
export async function subirMediaConProgreso(
  archivo: File,
  tipo: "image" | "video",
  alAvanzar: (fase: FaseSubida) => void,
): Promise<string> {
  const permiso = await pedirPermiso();

  // El tope lo decide el servidor y viaja en el permiso, pero quien lo aplica
  // es el navegador: al no ver ya el archivo, el servidor no puede medirlo.
  // Comprobarlo aquí evita un viaje entero para acabar en un rechazo.
  if (archivo.size > permiso.maxBytes) {
    const mb = Math.round(permiso.maxBytes / (1024 * 1024));
    throw new Error(`El archivo supera el tamaño máximo permitido (${mb} MB)`);
  }

  const form = new FormData();
  form.set("file", archivo);
  form.set("api_key", permiso.apiKey);
  form.set("timestamp", String(permiso.timestamp));
  form.set("signature", permiso.signature);

  return new Promise((resolve, rechazar) => {
    const xhr = new XMLHttpRequest();
    // El `resource_type` va en la ruta, no en el cuerpo: por eso no forma parte
    // de lo firmado y aun así Cloudinary lo respeta.
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${permiso.cloudName}/${tipo}/upload`);

    xhr.upload.addEventListener("progress", (evento) => {
      // Sin `lengthComputable` no hay total contra el que medir: se queda en la
      // fase sin cifra, que es preferible a mostrar un número falso.
      if (!evento.lengthComputable) return;
      alAvanzar({ tipo: "enviando", porcentaje: Math.round((evento.loaded / evento.total) * 100) });
    });

    // El envío terminó pero la respuesta no ha llegado: aquí es donde
    // Cloudinary procesa el archivo.
    xhr.upload.addEventListener("load", () => alAvanzar({ tipo: "procesando" }));

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        rechazar(new Error(leerErrorCloudinary(xhr)));
        return;
      }
      try {
        const { public_id: publicId } = JSON.parse(xhr.responseText) as { public_id: string };
        resolve(publicId);
      } catch {
        rechazar(new Error("Cloudinary devolvió una respuesta inesperada"));
      }
    });

    xhr.addEventListener("error", () => rechazar(new Error("No se pudo conectar con Cloudinary")));
    xhr.addEventListener("abort", () => rechazar(new Error("Subida cancelada")));

    xhr.send(form);
  });
}
