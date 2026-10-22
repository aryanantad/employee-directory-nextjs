import { NextRequest, NextResponse } from "next/server";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:4001";

function clearAuthCookies(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set("auth_session", "", cookieOptions);
  response.cookies.set("access_token", "", cookieOptions);
  response.cookies.set("refresh_token", "", cookieOptions);
}

export async function POST(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") ?? "";

    if (!/(?:^|;\s*)refresh_token=/.test(cookie)) {
      const response = NextResponse.json(
        { message: "Refresh token is missing. Please sign in again." },
        { status: 401 },
      );

      clearAuthCookies(response);
      return response;
    }

    const upstream = await fetch(
      `${AUTH_SERVICE_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: { cookie },
        cache: "no-store",
      },
    );

    const data = await upstream.json().catch(() => ({
      message: "The authentication service returned an invalid response.",
    }));

    const response = NextResponse.json(data, {
      status: upstream.status,
    });

    // Forward rotated or cleared cookies from the Auth Service.
    for (const value of upstream.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", value);
    }

    // Clear stale cookies only when the Auth Service rejects refresh.
    if (upstream.status === 401 || upstream.status === 403) {
      clearAuthCookies(response);
    }

    return response;
  } catch (error) {
    console.error("Token refresh proxy failed:", error);

    // Preserve existing cookies during a temporary network failure.
    return NextResponse.json(
      { message: "Could not contact the authentication service." },
      { status: 502 },
    );
  }
}