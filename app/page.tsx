
import EmployeeForm from "./EmployeeForm";
import EmployeeList from "./EmployeeList";

type Employee = {
  id: number;
  name: string;
  role: string;
};

async function getEmployees(): Promise<Employee[]> {
  const response = await fetch(
    "http://localhost:3000/api/employees",
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Failed to load employees");
  }

  return response.json();
}

export default async function Home() {
  const employees = await getEmployees();

  return (
    <main>
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
    </main>
  );
}
