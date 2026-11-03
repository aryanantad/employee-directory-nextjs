
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authServiceUrl =
      process.env.AUTH_SERVICE_URL || "http://localhost:4001";

    const cookie = request.headers.get("cookie") || "";

    const upstream = await fetch(
      `${authServiceUrl}/api/auth/me`,
      {
        method: "GET",
        headers: {
          Cookie: cookie,
        },
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => ({
      message: "Invalid response from authentication service.",
    }));

    return NextResponse.json(data, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Session verification failed:", error);

    return NextResponse.json(
      { message: "Could not verify your login session." },
      { status: 502 }
    );
  }
}
