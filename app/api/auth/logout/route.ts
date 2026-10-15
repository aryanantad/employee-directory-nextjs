
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionCookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("auth_session="));

    const token = sessionCookie
      ? decodeURIComponent(sessionCookie.slice("auth_session=".length))
      : "";

    if (token) {
      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      await prisma.authSession.deleteMany({
        where: { tokenHash },
      });
    }

    const response = NextResponse.json({
      message: "Signed out successfully.",
    });

    response.cookies.set("auth_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("Logout failed:", error);
    return NextResponse.json(
      { message: "Could not sign out. Please try again." },
      { status: 500 }
    );
  }
}
