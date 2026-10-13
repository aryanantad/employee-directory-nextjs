
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Employee = {
  id: number;
  name: string;
  role: string;
};

export default function EmployeeCard({
  employee,
}: {
  employee: Employee;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);

  const router = useRouter();

  async function deleteEmployee() {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${employee.name}?`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/employees", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: employee.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Failed to delete employee.");
        return;
      }

      router.refresh();
    } catch {
      setMessage("Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  }

  async function updateEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !role.trim()) {
      setMessage("Please enter both name and role.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
        console.log("Updating employee:", employee.id, name, role);
      const response = await fetch("/api/employees", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: employee.id,
          name: name.trim(),
          role: role.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Failed to update employee.");
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setMessage("Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="employee-card">
      <div className="employee-avatar">
        {employee.name.charAt(0).toUpperCase()}
      </div>

      <div className="employee-info">
        {editing ? (
          <form onSubmit={updateEmployee}>
            <input
              type="text"
              placeholder="Employee name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Job role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={() => {
                setName(employee.name);
                setRole(employee.role);
                setEditing(false);
                setMessage("");
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h2>{employee.name}</h2>
            <p>{employee.role}</p>
            <span className="employee-badge">Team member</span>
          </>
        )}
      </div>

      {!editing && (
        <div>
          <button
            type="button"
            onClick={() => {
              setName(employee.name);
              setRole(employee.role);
              setEditing(true);
              setMessage("");
            }}
            disabled={loading}
          >
            Edit
          </button>

          <button
            type="button"
            className="delete-button"
            onClick={deleteEmployee}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}

      {message && (
        <p className="employee-message">{message}</p>
      )}
    </article>
  );
}
