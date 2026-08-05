import { NextResponse } from "next/server";
import { COOKIE_SESION } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
  response.cookies.delete(COOKIE_SESION);
  return response;
}
