
import { NextResponse } from "next/server";

function clearAuthCookies(response: NextResponse) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };

  response.cookies.set("auth_session", "", cookieOptions);
  response.cookies.set("access_token", "", cookieOptions);
  response.cookies.set("refresh_token", "", cookieOptions);
}

export async function POST(request: Request) {
  const authServiceUrl =
    process.env.AUTH_SERVICE_URL ?? "http://localhost:4001";

  try {
    const cookieHeader = request.headers.get("cookie");

    const upstream = await fetch(
      `${authServiceUrl}/api/auth/logout`,
      {
        method: "POST",
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => ({
      message: "Logout request completed.",
    }));

    const response = NextResponse.json(data, {
      status: upstream.status,
    });

    const getSetCookie = upstream.headers.getSetCookie;

    if (typeof getSetCookie === "function") {
      for (const cookie of getSetCookie.call(upstream.headers)) {
        response.headers.append("Set-Cookie", cookie);
      }
    }

    clearAuthCookies(response);

    return response;
  } catch (error) {
    console.error("Logout proxy failed:", error);

    const response = NextResponse.json(
      {
        message:
          "Signed out locally, but the authentication service could not be reached.",
      },
      { status: 502 }
    );

    clearAuthCookies(response);

    return response;
  }
}
