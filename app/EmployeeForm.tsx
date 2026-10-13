
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmployeeForm() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, role })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Something went wrong");
        return;
      }

      setName("");
      setRole("");
      setMessage("Employee added successfully!");

      router.refresh();
    } catch {
      setMessage("Could not connect to the API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Add New Employee</h2>

      <input
        type="text"
        placeholder="Employee Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

      <br />
      <br />

      <input
        type="text"
        placeholder="Job Role"
        value={role}
        onChange={(event) => setRole(event.target.value)}
        required
      />

      <br />
      <br />

      <button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add Employee"}
      </button>

      <p>{message}</p>
    </form>
  );
}
