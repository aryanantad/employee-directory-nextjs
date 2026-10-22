
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const otp =
      typeof body.otp === "string" ? body.otp.trim() : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(otp)
    ) {
      return NextResponse.json(
        { message: "Invalid email or sign-in code." },
        { status: 400 }
      );
    }

    const authServiceUrl =
      process.env.AUTH_SERVICE_URL ?? "http://localhost:4001";

    const upstream = await fetch(
      `${authServiceUrl}/api/auth/verify-otp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => ({
      message: "The authentication service returned an invalid response.",
    }));

    const response = NextResponse.json(data, {
      status: upstream.status,
    });

    // Preserve every cookie set by the Auth Service.
    const getSetCookie = upstream.headers.getSetCookie;

    if (typeof getSetCookie === "function") {
      for (const cookie of getSetCookie.call(upstream.headers)) {
        response.headers.append("Set-Cookie", cookie);
      }
    }

    return response;
  } catch (error) {
    console.error("OTP verification proxy failed:", error);

    return NextResponse.json(
      { message: "Could not contact the authentication service. Please try again." },
      { status: 502 }
    );
  }
}
