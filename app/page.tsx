
import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import EmployeeForm from "./EmployeeForm";
import EmployeeList from "./EmployeeList";

type Employee = {
  id: number;
  name: string;
  role: string;
};

async function EmployeeDirectory() {
  await connection();

  const employees: Employee[] = await prisma.employee.findMany({
    orderBy: { id: "asc" },
  });

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">TEAM MANAGEMENT</p>
          <h1>Employee Directory</h1>
          <p>Manage your team members in one place.</p>
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
