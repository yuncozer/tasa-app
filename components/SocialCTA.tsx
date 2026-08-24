import { MessageCircle } from "lucide-react";
import { enlaceWhatsapp, perfilInstagram } from "@/lib/atajos";

/**
 * Llamado a seguir la cuenta, entre la calculadora y el pie.
 *
 * Va aparte del `Footer` a propósito: el aviso legal y la fecha de consulta son
 * letra pequeña que nadie viene a leer, y meter aquí la invitación a Instagram
 * la enterraba al fondo de la página. El canal de WhatsApp solo aparece si
 * `ENLACE_WHATSAPP` está configurado — mismo respaldo que ya usa `/wa`.
 *
 * El copy no promete "tiempo real": el Binance de esta misma pantalla puede
 * moverse entre visita y visita, así que decir que las redes "avisan" apenas
 * cambia sería una promesa que la app no cumple. Lo que sí es cierto es que
 * ahí se publican los posts del día y las noticias de la economía fronteriza,
 * que es lo que de verdad se gana siguiendo la cuenta.
 */
export function SocialCTA() {
  const whatsapp = enlaceWhatsapp();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
      <p className="text-center text-sm font-medium text-foreground">
        📲 Tasas del día y noticias clave de interés económico
      </p>

      <div className={`grid gap-2 ${whatsapp ? "grid-cols-2" : "grid-cols-1"}`}>
        <a
          href={perfilInstagram()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/15 px-3 py-3 text-sm font-semibold text-accent transition active:scale-95"
        >
          <img src="/SVG/instagram-icon.svg" width={18} height={18} alt="" aria-hidden="true" />
          Instagram
        </a>

        {whatsapp && (
          <a
            href="/wa"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/15 px-3 py-3 text-sm font-semibold text-accent transition active:scale-95"
          >
            <MessageCircle className="size-[18px]" aria-hidden="true" />
            Canal de WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
