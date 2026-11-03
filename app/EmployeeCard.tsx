
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Employee = {
  id: number;
  name: string;
  role: string;
  email?: string | null;
  isActive?: boolean;
};

type AppRole = "employee" | "hr" | "manager";

type EmployeeCardProps = {
  employee: Employee;
  appRole?: AppRole;
  canEdit?: boolean;
};

export default function EmployeeCard({
  employee,
  appRole = "employee",
  canEdit = false,
}: EmployeeCardProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [email, setEmail] = useState(employee.email ?? "");

  const isActive = employee.isActive !== false;

  const permissionLabel: Record<AppRole, string> = {
    employee: "Employee",
    hr: "HR",
    manager: "Manager",
  };

  const initials = employee.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  function showError(text: string) {
    setMessage(text);
    setMessageType("error");
  }

  function showSuccess(text: string) {
    setMessage(text);
    setMessageType("success");
  }

  /**
   * Activate or deactivate an employee.
   *
   * The Next.js /api/employees proxy expects the ID in the body
   * and forwards the request to /api/employees/:id.
   */
  async function toggleEmployeeStatus() {
    if (!canEdit || loading) return;

    const nextStatus = !isActive;
    const action = nextStatus ? "activate" : "deactivate";

    const confirmed = window.confirm(
      nextStatus
        ? `Are you sure you want to activate ${employee.name}?`
        : `Are you sure you want to deactivate ${employee.name}? They may lose access to the system.`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: employee.id,
          isActive: nextStatus,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || `Could not ${action} the employee.`
        );
      }

      showSuccess(
        data.message ||
          `Employee ${nextStatus ? "activated" : "deactivated"} successfully.`
      );

      // Refresh the server-rendered employee list.
      router.refresh();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : `Could not ${action} the employee.`
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateEmployee(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canEdit || loading) return;

    if (!name.trim() || !role.trim()) {
      showError("Please enter both employee name and job role.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      showError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      const response = await fetch("/api/employees", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: employee.id,
          name: name.trim(),
          role: role.trim(),
          email: normalizedEmail || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update employee details."
        );
      }

      setEditing(false);
      showSuccess("Employee details saved successfully.");

      router.refresh();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Could not update employee details."
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    setName(employee.name);
    setRole(employee.role);
    setEmail(employee.email ?? "");
    setMessage("");
    setMessageType("");
    setEditing(true);
  }

  function cancelEditing() {
    setName(employee.name);
    setRole(employee.role);
    setEmail(employee.email ?? "");
    setEditing(false);
    setMessage("");
    setMessageType("");
  }

  return (
    <article className="employee-card">
      <div className="employee-avatar" aria-hidden="true">
        {initials || "?"}
      </div>

      <div className="employee-info">
        {editing ? (
          <form
            className="employee-edit-form"
            onSubmit={updateEmployee}
          >
            <h3>Edit Employee</h3>

            <label htmlFor={`employee-name-${employee.id}`}>
              Employee name
            </label>

            <input
              id={`employee-name-${employee.id}`}
              type="text"
              placeholder="Employee name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={loading}
            />

            <label htmlFor={`employee-role-${employee.id}`}>
              Job role
            </label>

            <input
              id={`employee-role-${employee.id}`}
              type="text"
              placeholder="Job role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              required
              disabled={loading}
            />

            <label htmlFor={`employee-email-${employee.id}`}>
              Employee email
            </label>

            <input
              id={`employee-email-${employee.id}`}
              type="email"
              placeholder="employee@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />

            <div className="employee-form-actions">
              <button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2>{employee.name}</h2>

            <p className="employee-detail">
              <span>Job Role</span>
              <strong>{employee.role}</strong>
            </p>

            <p className="employee-detail">
              <span>Email</span>
              <strong>{employee.email || "No email added"}</strong>
            </p>

            <div className="employee-badges">
              <span
                className={`employee-badge employee-badge-${appRole}`}
              >
                {permissionLabel[appRole]}
              </span>

              <span
                className={`employee-badge ${
                  isActive
                    ? "employee-badge-active"
                    : "employee-badge-inactive"
                }`}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </>
        )}
      </div>

      {canEdit && !editing && (
        <div className="employee-actions">
          <button
            type="button"
            className="edit-button"
            onClick={startEditing}
            disabled={loading}
          >
            Edit
          </button>

          <button
            type="button"
            className={
              isActive ? "delete-button" : "activate-button"
            }
            onClick={() => void toggleEmployeeStatus()}
            disabled={loading}
          >
            {loading
              ? "Updating..."
              : isActive
                ? "Deactivate"
                : "Activate"}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`employee-message ${
            messageType === "success"
              ? "employee-list-success"
              : "employee-list-error"
          }`}
          role={messageType === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </article>
  );
}
