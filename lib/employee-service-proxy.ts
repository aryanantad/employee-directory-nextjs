import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const EMPLOYEE_SERVICE_URL =
  process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4002";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:4001";

type ProxyMethod = "GET" | "POST" | "PUT" | "DELETE";

function readCookie(
  cookieHeader: string,
  name: string,
): string | null {
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

  if (
    separator < 0 ||
    firstPart.slice(0, separator) !== name
  ) {
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

      return (
        separator < 0 ||
        part.slice(0, separator) !== name
      );
    });

  parts.push(`${name}=${encodeURIComponent(value)}`);

  return parts.join("; ");
}

export async function forwardEmployeeServiceRequest(
  request: Request,
  method: ProxyMethod,
  apiPath: string,
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { message: "Please sign in first." },
      { status: 401 },
    );
  }

  try {
    let cookieHeader = request.headers.get("cookie") ?? "";
    let accessToken = readCookie(cookieHeader, "access_token");

    const headers = new Headers({
      "Content-Type": "application/json",
    });

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const options: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    if (method !== "GET") {
      options.body = await request.text();
    }

    const targetUrl = new URL(
      `/api/${apiPath.replace(/^\/+/, "")}`,
      EMPLOYEE_SERVICE_URL,
    );

    let serviceResponse = await fetch(
      targetUrl.toString(),
      options,
    );

    let refreshedCookies: string[] = [];

    if (serviceResponse.status === 401 && cookieHeader) {
      const refreshResponse = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/refresh`,
        {
          method: "POST",
          headers: { cookie: cookieHeader },
          cache: "no-store",
        },
      );

      refreshedCookies =
        refreshResponse.headers.getSetCookie();

      if (!refreshResponse.ok) {
        const response = NextResponse.json(
          {
            message:
              "Your session has expired. Please sign in again.",
          },
          { status: 401 },
        );

        for (const cookie of refreshedCookies) {
          response.headers.append("Set-Cookie", cookie);
        }

        return response;
      }

      let newAccessToken: string | null = null;

      for (const cookie of refreshedCookies) {
        const newAccess = cookieValueFromSetCookie(
          cookie,
          "access_token",
        );

        if (newAccess !== null) {
          newAccessToken = newAccess;
        }

        const newRefresh = cookieValueFromSetCookie(
          cookie,
          "refresh_token",
        );

        if (newRefresh !== null) {
          cookieHeader = replaceCookie(
            cookieHeader,
            "refresh_token",
            newRefresh,
          );
        }
      }

      if (!newAccessToken) {
        const response = NextResponse.json(
          {
            message:
              "Token refresh did not return a new access token.",
          },
          { status: 502 },
        );

        for (const cookie of refreshedCookies) {
          response.headers.append("Set-Cookie", cookie);
        }

        return response;
      }

      accessToken = newAccessToken;

      cookieHeader = replaceCookie(
        cookieHeader,
        "access_token",
        newAccessToken,
      );

      const retryHeaders = new Headers(options.headers);

      retryHeaders.set("cookie", cookieHeader);
      retryHeaders.set(
        "Authorization",
        `Bearer ${accessToken}`,
      );

      serviceResponse = await fetch(targetUrl.toString(), {
        ...options,
        headers: retryHeaders,
      });
    }

    const responseBody = await serviceResponse.text();

    const response = new Response(responseBody, {
      status: serviceResponse.status,
      headers: {
        "Content-Type":
          serviceResponse.headers.get("content-type") ||
          "application/json",
      },
    });

    for (const cookie of refreshedCookies) {
      response.headers.append("Set-Cookie", cookie);
    }

    return response;
  } catch (error) {
    console.error(
      "Employee Service proxy request failed:",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Employee Service is unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}