
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AUTH_API = "http://localhost:4001/api/auth";

export default function EmployeeForm() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [canAddEmployee, setCanAddEmployee] = useState(false);

  const router = useRouter();

  useEffect(() => {
    async function checkPermission() {
      try {
        const response = await fetch(`${AUTH_API}/me`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          setCanAddEmployee(false);
          setError(data.message || "Please log in again.");
          return;
        }

        const currentRole = data.user?.role ?? data.role;

        setCanAddEmployee(currentRole === "hr");

        if (currentRole !== "hr") {
          setError("Only HR can add employees.");
        }
      } catch {
        setCanAddEmployee(false);
        setError("Could not verify your application permissions.");
      } finally {
        setCheckingPermission(false);
      }
    }

    void checkPermission();
  }, []);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canAddEmployee) {
      setError("Only HR can add employees.");
      return;
    }

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not add employee.");
      }

      setName("");
      setRole("");
      setMessage("Employee added successfully!");

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while adding the employee."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingPermission) {
    return <p>Checking your permissions...</p>;
  }

  if (!canAddEmployee) {
    return (
      <section className="employee-form-section">
        <h2 className="section-title">Add New Employee</h2>
        <p className="employee-list-error" role="alert">
          {error || "You do not have permission to add employees."}
        </p>
      </section>
    );
  }

  return (
    <section className="employee-form-section">
      <form onSubmit={handleSubmit}>
        <h2 className="section-title">Add New Employee</h2>

        <input
          type="text"
          placeholder="Employee Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Job Role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          required
        />

        {error && (
          <p className="employee-list-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="employee-list-success" role="status">
            {message}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Adding..." : "Add Employee"}
        </button>
      </form>
    </section>
  );
}
