
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const EMPLOYEE_SERVICE_URL =
  process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4002";

async function forwardRequest(
  request: Request,
  method: "GET" | "POST" | "PUT" | "DELETE",
) {
  // Keep the existing Next.js authentication check.
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { message: "Please sign in first." },
      { status: 401 },
    );
  }

  try {
    const headers = new Headers({
      "Content-Type": "application/json",
    });

    // Forward the session cookie so Employee Service can verify it
    // with Auth Service.
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("cookie", cookie);
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
  `${EMPLOYEE_SERVICE_URL}/api/employees`,
);

if (method === "PUT" || method === "DELETE") {
  const body = options.body;

  if (typeof body === "string" && body) {
    try {
      const data = JSON.parse(body);

      if (data.id !== undefined) {
        targetUrl.pathname += `/${encodeURIComponent(String(data.id))}`;
      }
    } catch {
      // Leave invalid JSON for the Employee Service to handle.
    }
  }
}

const response = await fetch(targetUrl.toString(), options);
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      },
    });
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
