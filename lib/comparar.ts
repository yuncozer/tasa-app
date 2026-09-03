import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Comparación de secretos que no filtra por dónde difieren **ni cuánto miden**.
 *
 * `timingSafeEqual` exige dos búferes del mismo tamaño, así que compararlos en
 * crudo obliga a mirar la longitud primero y devolver `false` — lo que delata
 * el largo del secreto esperado. Sobre el resumen SHA-256 no: siempre son 32
 * bytes, difieran en lo que difieran.
 *
 * Vive suelto porque lo usan dos guardianes distintos —la cookie de `/admin`
 * y el `CRON_SECRET` de los disparos automáticos— y una copia en cada uno es
 * exactamente como se cuelan las divergencias entre dos cosas que tienen que
 * hacer lo mismo.
 */
export function sonIguales(esperado: string, recibido: string): boolean {
  const resumen = (valor: string) => createHash("sha256").update(valor).digest();
  return timingSafeEqual(resumen(esperado), resumen(recibido));
}
