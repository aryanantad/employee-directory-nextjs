
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";

const EMPLOYEE_SERVICE_URL =
  process.env.EMPLOYEE_SERVICE_URL || "http://127.0.0.1:4002";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://127.0.0.1:4001";

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function cookieValueFromSetCookie(
  setCookie: string,
  name: string,
): string | null {
  const firstPart = setCookie.split(";", 1)[0];
  const separator = firstPart.indexOf("=");

  if (separator < 0 || firstPart.slice(0, separator) !== name) {
    return null;
  }

  const value = firstPart.slice(separator + 1);

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function replaceCookie(
  cookieHeader: string,
  name: string,
  value: string,
): string {
  const parts = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const separator = part.indexOf("=");
      return separator < 0 || part.slice(0, separator) !== name;
    });

  parts.push(`${name}=${encodeURIComponent(value)}`);
  return parts.join("; ");
}

async function forwardProfileRequest(
  request: Request,
  method: "GET" | "POST",
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { message: "Please sign in again." },
      { status: 401 },
    );
  }

  try {
    const cookieStore = await cookies();

    let cookieHeader = request.headers.get("cookie") ?? "";
    let accessToken =
      readCookie(cookieHeader, "access_token") ??
      cookieStore.get("access_token")?.value ??
      null;

    if (!cookieHeader) {
      cookieHeader = cookieStore
        .getAll()
        .map(({ name, value }) => `${name}=${value}`)
        .join("; ");
    }

    if (!accessToken) {
      return NextResponse.json(
        { message: "No access token found. Please sign in again." },
        { status: 401 },
      );
    }

    // Preserve the original multipart upload body for the retry.
    let body: FormData | undefined;

    if (method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { message: "Please select an image file." },
          { status: 400 },
        );
      }

      body = new FormData();
body.set("file", file, file.name || "profile-image");
    }

    const sendRequest = (token: string) =>
      fetch(`${EMPLOYEE_SERVICE_URL}/api/profile-picture`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: cookieHeader,
        },
        ...(body ? { body } : {}),
        cache: "no-store",
      });

    let serviceResponse = await sendRequest(accessToken);
    let refreshedCookies: string[] = [];

    if (serviceResponse.status === 401) {
      const refreshResponse = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/refresh`,
        {
          method: "POST",
          headers: { Cookie: cookieHeader },
          cache: "no-store",
        },
      );

      const getSetCookie = refreshResponse.headers.getSetCookie;

      if (typeof getSetCookie === "function") {
        refreshedCookies = getSetCookie.call(refreshResponse.headers);
      }

      if (!refreshResponse.ok) {
        const response = NextResponse.json(
          { message: "Your session has expired. Please sign in again." },
          { status: 401 },
        );

        for (const cookie of refreshedCookies) {
          response.headers.append("Set-Cookie", cookie);
        }

        return response;
      }

      let newAccessToken: string | null = null;

      for (const cookie of refreshedCookies) {
        const value = cookieValueFromSetCookie(cookie, "access_token");

        if (value !== null) {
          newAccessToken = value;
        }

        const newRefreshToken = cookieValueFromSetCookie(
          cookie,
          "refresh_token",
        );

        if (newRefreshToken !== null) {
          cookieHeader = replaceCookie(
            cookieHeader,
            "refresh_token",
            newRefreshToken,
          );
        }
      }

      if (!newAccessToken) {
        return NextResponse.json(
          { message: "Token refresh did not return a new access token." },
          { status: 502 },
        );
      }

      cookieHeader = replaceCookie(
        cookieHeader,
        "access_token",
        newAccessToken,
      );

      accessToken = newAccessToken;

      // Retry once with the new access token.
      serviceResponse = await sendRequest(accessToken);
    }

    const responseBody = await serviceResponse.text();

    const response = new Response(responseBody, {
      status: serviceResponse.status,
      headers: {
        "Content-Type":
          serviceResponse.headers.get("content-type") ??
          "application/json",
      },
    });

    for (const cookie of refreshedCookies) {
      response.headers.append("Set-Cookie", cookie);
    }

    return response;
  } catch (error) {
    console.error("Profile-picture request failed:", error);

    return NextResponse.json(
      { message: "Could not contact the required service." },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  return forwardProfileRequest(request, "GET");
}

export async function POST(request: Request) {
  return forwardProfileRequest(request, "POST");
}
