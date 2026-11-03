"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmployeeCard from "./EmployeeCard";

type Employee = {
  id: number;
  name: string;
  role: string;
  email?: string | null;
  managerId?: number | null;
  isActive?: boolean;
};

type AppRole = "employee" | "hr" | "manager";
type AssignableRole = AppRole;

type RoleAssignment = {
  email: string;
  role: AppRole;
};

const AUTH_API = "http://localhost:4001/api/auth";

function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "employee" ||
    value === "hr" ||
    value === "manager"
  );
}

function roleLabel(role: AppRole): string {
  switch (role) {
    case "hr":
      return "HR";
    case "manager":
      return "Manager";
    default:
      return "Employee";
  }
}

export default function EmployeeList({
  employees,
}: {
  employees: Employee[];
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [myRole, setMyRole] = useState<AppRole | null>(null);
  const [myEmail, setMyEmail] = useState("");
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [roleChecked, setRoleChecked] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  const [selectedRoles, setSelectedRoles] = useState<
    Record<string, AssignableRole>
  >({});

  const [selectedManagers, setSelectedManagers] = useState<
    Record<number, string>
  >({});

  const [savingManagerFor, setSavingManagerFor] = useState<number | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRoles = useCallback(async () => {
    setError("");

    try {
      const meResponse = await fetch(`${AUTH_API}/me`, {
        credentials: "include",
        cache: "no-store",
      });

      const meData = await meResponse.json();

      if (!meResponse.ok) {
        setMyRole(null);
        setMyEmail("");
        setAssignments([]);
        setError(meData.message || "Please log in again.");
        return;
      }

      const currentRole = meData.user?.role ?? meData.role;

      const currentEmail = normalizeEmail(
        meData.user?.email ?? meData.email
      );

      if (!isAppRole(currentRole)) {
        setMyRole(null);
        setMyEmail(currentEmail);
        setAssignments([]);
        setError("Could not determine your application permission.");
        return;
      }

      setMyRole(currentRole);
      setMyEmail(currentEmail);

      // Only HR can view all employee application permissions.
      if (currentRole !== "hr") {
        setAssignments(
          currentEmail
            ? [{ email: currentEmail, role: currentRole }]
            : []
        );
        return;
      }

      setLoadingRoles(true);

      const rolesResponse = await fetch(`${AUTH_API}/roles`, {
        credentials: "include",
        cache: "no-store",
      });

      const rolesData = await rolesResponse.json();

      if (!rolesResponse.ok) {
        throw new Error(
          rolesData.message ||
            "Could not load application permissions."
        );
      }

      const roleList: RoleAssignment[] = Array.isArray(rolesData.roles)
        ? rolesData.roles.filter(
            (item: unknown): item is RoleAssignment => {
              if (!item || typeof item !== "object") {
                return false;
              }

              const assignment = item as RoleAssignment;

              return (
                typeof assignment.email === "string" &&
                isAppRole(assignment.role)
              );
            }
          )
        : [];

      setAssignments(roleList);

      setSelectedRoles((previous) => {
        const next = { ...previous };

        for (const assignment of roleList) {
          const email = normalizeEmail(assignment.email);
          next[email] = assignment.role;
        }

        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to the Auth Service."
      );
    } finally {
      setLoadingRoles(false);
      setRoleChecked(true);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const roleByEmail = new Map(
    assignments.map((assignment) => [
      normalizeEmail(assignment.email),
      assignment.role,
    ])
  );

  function getEmployeeRole(employee: Employee): AppRole {
    const email = normalizeEmail(employee.email);

    if (email && email === myEmail && myRole) {
      return myRole;
    }

    // HR can see every employee's assigned application role.
    if (myRole === "hr" && email) {
      return roleByEmail.get(email) ?? "employee";
    }

    return "employee";
  }

  const searchText = search.trim().toLowerCase();

  const filteredEmployees = employees.filter((employee) => {
    return (
      employee.name.toLowerCase().includes(searchText) ||
      employee.role.toLowerCase().includes(searchText) ||
      normalizeEmail(employee.email).includes(searchText)
    );
  });

  async function handleAssignRole(
    employee: Employee,
    role: AssignableRole
  ) {
    const email = normalizeEmail(employee.email);

    if (myRole !== "hr") {
      setError("Only HR can assign application permissions.");
      return;
    }

    if (!email) {
      setError("Add an email address to this employee first.");
      return;
    }

    // Protect the currently configured HR account from demotion.
    if (email === myEmail && role !== "hr") {
      setError("The configured HR account cannot be demoted.");
      return;
    }

    setMessage("");
    setError("");
    setSavingEmail(email);

    try {
      const response = await fetch(`${AUTH_API}/roles`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not save the permission."
        );
      }

      setMessage(
        `${email} is now assigned the ${roleLabel(role)} permission.`
      );

      await loadRoles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the permission."
      );
    } finally {
      setSavingEmail(null);
    }
  }

  async function handleAssignManager(
    employee: Employee,
    managerId: number | null
  ) {
    if (myRole !== "hr") {
      setError("Only HR can assign reporting managers.");
      return;
    }

    if (managerId === employee.id) {
      setError("An employee cannot be their own reporting manager.");
      return;
    }

    setMessage("");
    setError("");
    setSavingManagerFor(employee.id);

    try {
      const response = await fetch("/api/employees", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: employee.id,
          managerId,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Could not update the reporting manager."
        );
      }

      setSelectedManagers((previous) => ({
        ...previous,
        [employee.id]: String(managerId ?? ""),
      }));

      setMessage(
        data.message ||
          `Reporting manager updated for ${employee.name}.`
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the reporting manager."
      );
    } finally {
      setSavingManagerFor(null);
    }
  }

  return (
    <section className="employee-list-section">
      <h2 className="section-title">Our Team</h2>

      <div className="employee-search">
        <input
          type="search"
          placeholder="Search by name, job role, or email..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search employees by name, job role, or email"
        />
      </div>

      <p className="employee-count">
        Showing {filteredEmployees.length} of {employees.length} employees
      </p>

      {roleChecked && myRole && (
        <p className="permission-note">
          Signed in as: <strong>{roleLabel(myRole)}</strong>
        </p>
      )}

      {!roleChecked && <p>Checking your permissions...</p>}

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

      {filteredEmployees.length === 0 ? (
        <p className="employee-empty">
          No employees found. Try another search.
        </p>
      ) : (
        <div className="employee-list">
          {filteredEmployees.map((employee) => {
            const email = normalizeEmail(employee.email);
            const assignedRole = getEmployeeRole(employee);

            const selectedRole: AssignableRole =
              selectedRoles[email] ?? assignedRole;

            const isSaving = savingEmail === email;
            const isProtectedHR =
              email === myEmail && assignedRole === "hr";

            const managerOptions = employees.filter(
              (candidate) =>
                candidate.id !== employee.id &&
                candidate.isActive !== false &&
                getEmployeeRole(candidate) === "manager"
            );

            const selectedManagerId =
              selectedManagers[employee.id] ??
              String(employee.managerId ?? "");

            const currentManager = employees.find(
              (candidate) => candidate.id === employee.managerId
            );

            return (
              <div className="employee-list-item" key={employee.id}>
                <EmployeeCard
                  employee={employee}
                  appRole={assignedRole}
                  canEdit={myRole === "hr"}
                />

                {myRole === "hr" && (
                  <>
                    <div className="permission-panel">
                      <h3>Application Permissions</h3>

                      <p>
                        <strong>Email:</strong>{" "}
                        {email || "No email added"}
                      </p>

                      <p>
                        <strong>Current permission:</strong>{" "}
                        {roleLabel(assignedRole)}
                      </p>

                      {!email ? (
                        <p className="permission-note">
                          Add an email address to this employee before
                          assigning a permission.
                        </p>
                      ) : isProtectedHR ? (
                        <p className="permission-note">
                          The configured HR account is protected and
                          cannot be demoted.
                        </p>
                      ) : (
                        <div className="permission-controls">
                          <label htmlFor={`permission-${employee.id}`}>
                            Assign permission
                          </label>

                          <select
                            id={`permission-${employee.id}`}
                            value={selectedRole}
                            disabled={isSaving}
                            onChange={(event) => {
                              const value = event.target.value;

                              if (!isAppRole(value)) {
                                return;
                              }

                              setSelectedRoles((previous) => ({
                                ...previous,
                                [email]: value,
                              }));
                            }}
                          >
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="hr">HR</option>
                          </select>

                          <button
                            type="button"
                            disabled={
                              isSaving || selectedRole === assignedRole
                            }
                            onClick={() =>
                              void handleAssignRole(employee, selectedRole)
                            }
                          >
                            {isSaving ? "Saving..." : "Save Permission"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="permission-panel">
                      <h3>Reporting Manager</h3>

                      <p>
                        <strong>Current manager:</strong>{" "}
                        {currentManager
                          ? currentManager.name
                          : "No manager assigned"}
                      </p>

                      <label htmlFor={`manager-${employee.id}`}>
                        Assign reporting manager
                      </label>

                      <select
                        id={`manager-${employee.id}`}
                        value={selectedManagerId}
                        disabled={savingManagerFor === employee.id}
                        onChange={(event) =>
                          setSelectedManagers((previous) => ({
                            ...previous,
                            [employee.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">No reporting manager</option>

                        {managerOptions.map((manager) => (
                          <option
                            key={manager.id}
                            value={String(manager.id)}
                          >
                            {manager.name}
                            {manager.email ? ` (${manager.email})` : ""}
                          </option>
                        ))}
                      </select>

                      {managerOptions.length === 0 && (
                        <p className="permission-note">
                          No active employees currently have the Manager
                          application permission.
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={
                          savingManagerFor === employee.id ||
                          selectedManagerId ===
                            String(employee.managerId ?? "")
                        }
                        onClick={() =>
                          void handleAssignManager(
                            employee,
                            selectedManagerId === ""
                              ? null
                              : Number(selectedManagerId)
                          )
                        }
                      >
                        {savingManagerFor === employee.id
                          ? "Saving..."
                          : "Save Reporting Manager"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {myRole === "hr" && (
        <div className="assigned-roles-section">
          <h2>Assigned Roles</h2>

          {loadingRoles ? (
            <p>Refreshing permissions...</p>
          ) : assignments.length === 0 ? (
            <p>No role assignments have been saved yet.</p>
          ) : (
            <div className="assigned-roles-list">
              {assignments.map((assignment) => (
                <div
                  className="assigned-role-row"
                  key={normalizeEmail(assignment.email)}
                >
                  <span>{assignment.email}</span>

                  <span className={`role-tag role-tag-${assignment.role}`}>
                    {roleLabel(assignment.role)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}