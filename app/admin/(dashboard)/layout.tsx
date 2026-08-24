import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { COOKIE_SESION, esSesionValida } from "@/lib/admin-session";

/**
 * Layout de todas las sub-páginas autenticadas de `/admin` (todo salvo
 * `/admin/login`, que vive fuera de este grupo de rutas a propósito: no
 * comparte sesión ni chrome con el resto).
 *
 * La comprobación de sesión vivía duplicada en cada página — siete copias
 * del mismo `if (!esSesionValida(...)) redirect(...)`. Centralizarla aquí es
 * lo que permite que cada página quede con solo su contenido.
 */
export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (!esSesionValida(cookieStore.get(COOKIE_SESION)?.value)) {
    redirect("/admin/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
