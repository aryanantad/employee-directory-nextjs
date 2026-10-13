
"use client";

import { useState } from "react";
import EmployeeCard from "./EmployeeCard";

type Employee = {
  id: number;
  name: string;
  role: string;
};

export default function EmployeeList({
  employees,
}: {
  employees: Employee[];
}) {
  const [search, setSearch] = useState("");

  const filteredEmployees = employees.filter((employee) => {
    const searchText = search.toLowerCase().trim();

    return (
      employee.name.toLowerCase().includes(searchText) ||
      employee.role.toLowerCase().includes(searchText)
    );
  });

  return (
    <section>
      <h2 className="section-title">Our Team</h2>

      <input
        type="search"
        placeholder="Search by name or job role..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search employees by name or job role"
      />

      <p>
        Showing {filteredEmployees.length} of {employees.length} employees
      </p>

      {filteredEmployees.length === 0 ? (
        <p>No employees found. Try another search.</p>
      ) : (
        filteredEmployees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
          />
        ))
      )}
    </section>
  );
}
