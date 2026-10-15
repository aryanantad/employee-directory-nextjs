
import LogoutButton from "./LogoutButton";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";
import EmployeeForm from "./EmployeeForm";
import EmployeeList from "./EmployeeList";

type Employee = {
  id: number;
  name: string;
  role: string;
};

const EMPLOYEE_SERVICE_URL =
  process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4002";

async function EmployeeDirectory() {
  await connection();

  // Check whether the user has a valid session.
  const user = await getAuthenticatedUser();

  // Send signed-out users to the login page.
  if (!user) {
    redirect("/login");
  }

  // Forward the logged-in user's cookie to Employee Service.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  let employees: Employee[] = [];

  try {
    const response = await fetch(
      `${EMPLOYEE_SERVICE_URL}/api/employees`,
      {
        headers: {
          Cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );

    if (response.status === 401) {
      redirect("/login");
    }

    if (!response.ok) {
      throw new Error(
        `Employee Service returned status ${response.status}`,
      );
    }

    employees = await response.json();
  } catch (error) {
    console.error("Failed to fetch employees:", error);
    throw error;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">TEAM MANAGEMENT</p>
          <h1>Employee Directory</h1>
          <p>Manage your team members in one place.</p>
          <p>Signed in as: {user.email}</p>
          <LogoutButton />
        </div>

        <div className="team-count">
          <span>{employees.length}</span>
          <small>Employees</small>
        </div>
      </header>

      <EmployeeForm />
      <EmployeeList employees={employees} />
    </>
  );
}

export default function Home() {
  return (
    <main>
      <Suspense fallback={<p>Loading employees...</p>}>
        <EmployeeDirectory />
      </Suspense>
    </main>
  );
}
