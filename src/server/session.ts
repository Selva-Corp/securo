import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Returns the signed-in user's id or redirects to the login page. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

/** Full user row for the signed-in user. Redirects to login when signed out. */
export async function requireUser() {
  const id = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/login");
  return user;
}
