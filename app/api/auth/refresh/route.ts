
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

async function refreshTokens(request: NextRequest) {
  const cookie = request.headers.get("cookie") ?? "";

  if (!/(?:^|;\s*)refresh_token=/.test(cookie)) {
    return {
      status: 401,
      data: { message: "Refresh token is missing. Please sign in again." },
      setCookies: [] as string[],
    };
  }

  const upstream = await fetch(
    `${AUTH_SERVICE_URL}/api/auth/refresh`,
    {
      method: "POST",
      headers: { Cookie: cookie },
      cache: "no-store",
    },
  );

  const data = await upstream.json().catch(() => ({
    message: "The authentication service returned an invalid response.",
  }));

  return {
    status: upstream.status,
    data,
    setCookies: upstream.headers.getSetCookie(),
  };
}

// Existing API behavior: POST /api/auth/refresh returns JSON.
export async function POST(request: NextRequest) {
  try {
    const result = await refreshTokens(request);

    const response = NextResponse.json(result.data, {
      status: result.status,
    });

    for (const setCookie of result.setCookies) {
      response.headers.append("Set-Cookie", setCookie);
    }

    if (result.status === 401 || result.status === 403) {
      clearAuthCookies(response);
    }

    return response;
  } catch (error) {
    console.error("Token refresh proxy failed:", error);

    return NextResponse.json(
      { message: "Could not contact the authentication service." },
      { status: 502 },
    );
  }
}

// Browser redirect behavior: GET /api/auth/refresh?returnTo=/
export async function GET(request: NextRequest) {
  try {
    const result = await refreshTokens(request);

    const requestedPath = request.nextUrl.searchParams.get("returnTo");
    // Only allow local absolute paths; reject protocol-relative URLs.
    const returnTo =
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/";

    const response =
      result.status >= 200 && result.status < 300
        ? NextResponse.redirect(new URL(returnTo, request.url))
        : NextResponse.redirect(new URL("/login", request.url));

    for (const setCookie of result.setCookies) {
      response.headers.append("Set-Cookie", setCookie);
    }

    if (result.status === 401 || result.status === 403) {
      clearAuthCookies(response);
    }

    if (result.status >= 500) {
      console.error("Auth Service refresh failed:", result.data);
    }

    return response;
  } catch (error) {
    console.error("Token refresh redirect failed:", error);

    // Keep existing cookies if the Auth Service is temporarily unavailable.
    return NextResponse.redirect(new URL("/login?error=refresh", request.url));
  }
}
