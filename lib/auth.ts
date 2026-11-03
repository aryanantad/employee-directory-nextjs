
import { cookies } from "next/headers";

export type UserRole = "employee" | "manager" | "hr";

export type AuthenticatedUser = {
  email: string;
  role: UserRole;
};

const AUTH_SERVICE_URL = (
  process.env.AUTH_SERVICE_URL || "http://localhost:4001"
).replace(/\/$/, "");

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();

    const sessionCookie = cookieStore.get("auth_session")?.value;

    if (!sessionCookie) {
      console.log("Authentication: No auth_session cookie found.");
      return null;
    }

    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    const response = await fetch(
      `${AUTH_SERVICE_URL}/api/auth/me`,
      {
        method: "GET",
        headers: {
          Cookie: cookieHeader,
        },
        cache: "no-store",
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Auth Service session check failed:", {
        status: response.status,
        message: data.message,
      });

      return null;
    }

    const user = data.user ?? data;

    if (typeof user.email !== "string" || !user.email) {
      console.error("Auth Service returned no valid user email.");
      return null;
    }

    const allowedRoles: UserRole[] = [
      "employee",
      "manager",
      "hr",
    ];

    if (!allowedRoles.includes(user.role)) {
      console.error("Invalid user role:", user.role);
      return null;
    }

    return {
      email: user.email,
      role: user.role,
    };

  } catch (error) {
    console.error("Authentication check failed:", error);
    return null;
  }
}
