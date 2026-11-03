
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const authServiceUrl = (
      process.env.AUTH_SERVICE_URL || "http://localhost:4001"
    ).replace(/\/$/, "");

    const upstream = await fetch(
      `${authServiceUrl}/api/auth/request-otp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => ({
      message: "Invalid response from authentication service.",
    }));

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("OTP request proxy failed:", error);

    return NextResponse.json(
      { message: "Could not contact the authentication service." },
      { status: 502 }
    );
  }
}
