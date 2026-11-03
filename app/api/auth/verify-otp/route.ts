
import { NextRequest, NextResponse } from "next/server";



export async function POST(request: NextRequest) {
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

    const authServiceUrl = (
      process.env.AUTH_SERVICE_URL || "http://localhost:4001"
    ).replace(/\/$/, "");

    const upstream = await fetch(
      `${authServiceUrl}/api/auth/verify-otp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, otp }),
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => ({
      message: "Invalid response from authentication service.",
    }));

    const response = NextResponse.json(data, {
      status: upstream.status,
    });

    // Forward all authentication cookies from Express to the browser.
    const setCookies = upstream.headers.getSetCookie();

    console.log("OTP proxy diagnostics:", {
      upstreamStatus: upstream.status,
      cookieCount: setCookies.length,
      cookieNames: setCookies.map((cookie) =>
        cookie.split("=")[0]
      ),
    });

    for (const cookie of setCookies) {
      response.headers.append("Set-Cookie", cookie);
    }

    if (upstream.ok && setCookies.length === 0) {
      console.error(
        "Login succeeded, but Auth Service returned no Set-Cookie headers."
      );
    }

    return response;
  } catch (error) {
    console.error("OTP verification proxy failed:", error);

    return NextResponse.json(
      { message: "Could not contact the authentication service." },
      { status: 502 }
    );
  }
}
