/**
 * Subida de archivos con progreso, para los formularios de `/admin/noticia`.
 *
 * Todo lo demás en el proyecto habla con el servidor por `fetch()`, pero
 * `fetch()` **no expone el progreso de subida**: entrega el cuerpo y solo avisa
 * cuando llega la respuesta. Para una foto da igual, pero un video de varios MB
 * desde el teléfono deja al admin mirando un texto fijo sin saber si avanza.
 * `XMLHttpRequest` sí emite `upload.onprogress`, y es la única razón por la que
 * aquí se usa la API vieja.
 *
 * Lo que se puede medir es solo el primer tramo — del teléfono a nuestro
 * servidor. El segundo —servidor → Cloudinary y, en el video, la marca— es una
 * petición abierta de la que el navegador no recibe ningún avance, así que se
 * declara como fase aparte en vez de inventarle un porcentaje.
 */

/** En qué punto va la subida. `procesando` es el tramo sin cifra posible. */
export type FaseSubida = { tipo: "enviando"; porcentaje: number } | { tipo: "procesando" };

/** Reconstruye el mensaje de error que devuelven las rutas de `/api/admin/*`. */
function leerError(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { error?: string; detail?: string };
    if (body?.error) return `${body.error}${body.detail ? `: ${body.detail}` : ""}`;
  } catch {
    // Cuerpo vacío o no-JSON: queda el código de estado, que ya dice algo.
  }
  return `Error ${xhr.status}`;
}

/**
 * Sube un archivo a `/api/admin/subir-media` informando el avance, y devuelve
 * su `public_id` de Cloudinary.
 *
 * `alAvanzar` se llama con `enviando` mientras viajan los bytes y una última
 * vez con `procesando` en cuanto termina el envío: ese es el instante exacto en
 * que el servidor empieza a hablar con Cloudinary.
 */
export function subirMediaConProgreso(
  archivo: File,
  tipo: "image" | "video",
  alAvanzar: (fase: FaseSubida) => void,
): Promise<string> {
  const form = new FormData();
  form.set("archivo", archivo);
  form.set("tipo", tipo);

  return new Promise((resolve, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/subir-media");

    xhr.upload.addEventListener("progress", (evento) => {
      // Sin `lengthComputable` no hay total contra el que medir: se queda en la
      // fase sin cifra, que es preferible a mostrar un número falso.
      if (!evento.lengthComputable) return;
      alAvanzar({ tipo: "enviando", porcentaje: Math.round((evento.loaded / evento.total) * 100) });
    });

    // El envío terminó pero la respuesta no ha llegado: aquí es donde el
    // servidor sube a Cloudinary y aplica la marca.
    xhr.upload.addEventListener("load", () => alAvanzar({ tipo: "procesando" }));

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        rechazar(new Error(leerError(xhr)));
        return;
      }
      try {
        const { publicId } = JSON.parse(xhr.responseText) as { publicId: string };
        resolve(publicId);
      } catch {
        rechazar(new Error("El servidor devolvió una respuesta inesperada"));
      }
    });

    xhr.addEventListener("error", () => rechazar(new Error("No se pudo conectar con el servidor")));
    xhr.addEventListener("abort", () => rechazar(new Error("Subida cancelada")));

    xhr.send(form);
  });
}
