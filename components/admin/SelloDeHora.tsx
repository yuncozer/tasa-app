import { formatClock, formatRelative } from "@/lib/format";

/**
 * "De cuándo es lo que estoy viendo".
 *
 * La app pública lo tiene desde el principio —cada tarjeta de tasa dice su
 * fuente y su antigüedad— y en el panel faltaba, justo donde más decide: aquí
 * se mira una cifra para decidir si se publica, y una lectura de hace dos
 * horas y una de hace dos minutos no valen lo mismo.
 *
 * Lleva la hora **y** el "hace tanto": la hora es lo que se puede contrastar
 * con el post ya publicado, y el relativo es lo que responde de un vistazo la
 * única pregunta que importa, que es si el dato todavía sirve. Es el mismo
 * criterio que gobierna `formatRelative` en la portada.
 *
 * Se calcula en el servidor y no se rehidrata: el texto que llega es el del
 * momento en que se pintó la página, y refrescar es lo que lo actualiza.
 */
export function SelloDeHora({ iso, que }: { iso: string; que: string }) {
  return (
    <p className="text-xs text-muted">
      {que} de las <span className="tabular">{formatClock(iso)}</span> · {formatRelative(iso)}
    </p>
  );
}
