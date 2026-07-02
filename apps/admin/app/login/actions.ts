"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const submittedSecret = String(formData.get("secret") ?? "");
  const adminSecret = process.env.ADMIN_SECRET ?? "";

  if (!adminSecret || submittedSecret !== adminSecret) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set("admin_auth", adminSecret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/");
}
