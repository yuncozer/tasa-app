/**
 * Los enlaces cortos del dominio propio: `/hoy`, `/ig` y `/wa`.
 *
 * Aquí solo viven los destinos **fijos** y sus valores por defecto, sin nada de
 * servidor, para que los pueda leer tanto una página como `next.config.ts`.
 * El destino cambiante —a qué post apunta `/hoy`— lo resuelve `lib/enlaces.ts`,
 * que sí habla con Supabase.
 *
 * Los valores por defecto están en el código y no solo en el entorno a
 * propósito: un despliegue sin variables configuradas tiene que seguir
 * llevando al perfil en vez de romper el build o mandar a ninguna parte.
 */

export const PERFIL_INSTAGRAM = "https://www.instagram.com/latasa.online";

export function perfilInstagram(): string {
  return process.env.PERFIL_INSTAGRAM_URL || PERFIL_INSTAGRAM;
}

/**
 * Sin respaldo en el código, al contrario que el perfil: un número de WhatsApp
 * no se puede adivinar, y uno inventado mandaría a un chat ajeno. Si no está
 * configurado, `/wa` simplemente no existe (404) — ver `next.config.ts`.
 */
export function enlaceWhatsapp(): string | undefined {
  return process.env.ENLACE_WHATSAPP || undefined;
}
