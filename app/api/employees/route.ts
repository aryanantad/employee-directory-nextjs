
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const EMPLOYEE_SERVICE_URL =
  process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4002";

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:4001";

type EmployeeMethod = "GET" | "POST" | "PUT" | "DELETE";

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
    .filter((part) => part.slice(0, part.indexOf("=")) !== name);

  parts.push(`${name}=${encodeURIComponent(value)}`);
  return parts.join("; ");
}

async function forwardRequest(
  request: Request,
  method: EmployeeMethod,
) {
  // Keep the existing database-backed session check.
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

    const options: RequestInit = {
      method,
      headers: new Headers({
        "Content-Type": "application/json",
      }),
      cache: "no-store",
    };

    const headers = options.headers as Headers;

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    if (method !== "GET") {
      options.body = await request.text();
    }

    const targetUrl = new URL(`${EMPLOYEE_SERVICE_URL}/api/employees`);

    if (method === "PUT" || method === "DELETE") {
      if (typeof options.body === "string" && options.body) {
        try {
          const data = JSON.parse(options.body);

          if (data.id !== undefined) {
            targetUrl.pathname += `/${encodeURIComponent(String(data.id))}`;
          }
        } catch {
          // Let Employee Service handle invalid JSON.
        }
      }
    }

    let employeeResponse = await fetch(targetUrl.toString(), options);
    let refreshedCookies: string[] = [];

    // Refresh and retry only when the access token is rejected.
    if (employeeResponse.status === 401 && cookieHeader) {
      const refreshResponse = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/refresh`,
        {
          method: "POST",
          headers: { cookie: cookieHeader },
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

      // Read the newly issued access token from Set-Cookie.
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

      const retryHeaders = new Headers(options.headers);
      retryHeaders.set("cookie", cookieHeader);
      retryHeaders.set("Authorization", `Bearer ${newAccessToken}`);

      employeeResponse = await fetch(targetUrl.toString(), {
        ...options,
        headers: retryHeaders,
      });
    }

    const responseBody = await employeeResponse.text();

    const response = new Response(responseBody, {
      status: employeeResponse.status,
      headers: {
        "Content-Type":
          employeeResponse.headers.get("content-type") ||
          "application/json",
      },
    });

    // Save rotated tokens in the browser.
    for (const cookie of refreshedCookies) {
      response.headers.append("Set-Cookie", cookie);
    }

    return response;
  } catch (error) {
    console.error("Employee Service request failed:", error);

    return NextResponse.json(
      { message: "Employee Service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return forwardRequest(request, "GET");
}

export async function POST(request: Request) {
  return forwardRequest(request, "POST");
}

export async function PUT(request: Request) {
  return forwardRequest(request, "PUT");
}

export async function DELETE(request: Request) {
  return forwardRequest(request, "DELETE");
}
