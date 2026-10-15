
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("auth_session")?.value;

  if (!sessionToken) {
    return null;
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.authSession.delete({
        where: { id: session.id },
      });
    }

    return null;
  }

  return { email: session.email };
}
