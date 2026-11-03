"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: number;
  name: string;
  email?: string;
  role?: string;
};

type TeamMember = {
  employeeId: number;
  employee: Employee;
};

type Team = {
  id: number;
  name: string;
  description: string | null;
  leaderEmployeeId: number | null;
  leader: Employee | null;
  members: TeamMember[];
  _count?: { members: number };
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [selectedLeaders, setSelectedLeaders] = useState<
    Record<number, string>
  >({});
  const [selectedMembers, setSelectedMembers] = useState<
    Record<number, string>
  >({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [teamResponse, employeeResponse] = await Promise.all([
        fetch("/api/teams", { cache: "no-store" }),
        fetch("/api/employees", { cache: "no-store" }),
      ]);

      if (!teamResponse.ok) {
        throw new Error(
          teamResponse.status === 401
            ? "Your session has expired. Please log in again."
            : `Unable to load teams (${teamResponse.status}).`
        );
      }

      if (!employeeResponse.ok) {
        throw new Error(
          `Unable to load employees (${employeeResponse.status}).`
        );
      }

      const teamData: Team[] = await teamResponse.json();
      const employeeData: Employee[] = await employeeResponse.json();

      setTeams(teamData);
      setEmployees(employeeData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function sendRequest(
    url: string,
    method: string,
    body?: unknown
  ) {
    const response = await fetch(url, {
      method,
      headers: body === undefined
        ? {}
        : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        data?.error || data?.message || `Request failed (${response.status}).`
      );
    }

    return data;
  }

  async function handleCreateTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (editingId !== null) {
        await sendRequest(`/api/teams/${editingId}`, "PUT", {
          name: name.trim(),
          description: description.trim(),
        });
        setMessage("Team updated successfully.");
      } else {
        await sendRequest("/api/teams", "POST", {
          name: name.trim(),
          description: description.trim(),
        });
        setMessage("Team created successfully.");
      }

      setName("");
      setDescription("");
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save the team."
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(team: Team) {
    setEditingId(team.id);
    setName(team.name);
    setDescription(team.description ?? "");
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setDescription("");
  }

  async function assignLeader(team: Team) {
    const rawValue = selectedLeaders[team.id] ?? "";
    const leaderEmployeeId = rawValue ? Number(rawValue) : null;

    setError("");
    setMessage("");

    try {
      await sendRequest(`/api/teams/${team.id}`, "PUT", {
        leaderEmployeeId,
      });
      setMessage("Team leader updated.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to assign the leader."
      );
    }
  }

  async function addMember(team: Team) {
    const rawValue = selectedMembers[team.id];

    if (!rawValue) {
      setError("Select an employee before adding a member.");
      return;
    }

    setError("");
    setMessage("");

    try {
      await sendRequest(`/api/teams/${team.id}/members`, "POST", {
        employeeId: Number(rawValue),
      });

      setSelectedMembers((previous) => ({
        ...previous,
        [team.id]: "",
      }));

      setMessage("Employee added to the team.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add the member."
      );
    }
  }

  async function removeMember(team: Team, employee: Employee) {
    if (
      !window.confirm(
        `Remove ${employee.name} from ${team.name}?`
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await sendRequest(
        `/api/teams/${team.id}/members/${employee.id}`,
        "DELETE"
      );

      setMessage("Member removed successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to remove the member."
      );
    }
  }

  async function deleteTeam(team: Team) {
    if (
      !window.confirm(
        `Delete "${team.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await sendRequest(`/api/teams/${team.id}`, "DELETE");

      if (editingId === team.id) {
        cancelEditing();
      }

      setMessage("Team deleted successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete the team."
      );
    }
  }

  return (
    <main className="teams-page">
      <div className="teams-wrap">
        <a href="/" className="back-link">
          ← Back to Employee Directory
        </a>

        <header className="teams-header">
          <p className="directory-eyebrow">Workspace management</p>

          <h1>Team Management</h1>

          <p>Create teams, assign leaders, and organize your employees.</p>
        </header>

        {error && (
          <div role="alert" className="teams-alert teams-alert-error">
            {error}
            {error.toLowerCase().includes("session") && (
              <p>
                <a href="/login">Log in again</a>
              </p>
            )}
          </div>
        )}

        {message && (
          <div role="status" className="teams-alert teams-alert-success">
            {message}
          </div>
        )}

        <section className="teams-stats">
          <article className="teams-stat">
            <p>Total teams</p>
            <strong>{teams.length}</strong>
          </article>

          <article className="teams-stat">
            <p>Employees available</p>
            <strong>{employees.length}</strong>
          </article>

          <article className="teams-stat">
            <p>Team memberships</p>
            <strong>
              {teams.reduce(
                (total, team) =>
                  total + (team._count?.members ?? team.members.length),
                0
              )}
            </strong>
          </article>
        </section>

        <section className="teams-card teams-form-card">
          <h2>{editingId !== null ? "Edit team" : "Create a team"}</h2>

          <form onSubmit={handleCreateTeam} className="teams-form">
            <label htmlFor="team-name">Team name</label>

            <input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Development Team"
              required
              maxLength={100}
            />

            <label htmlFor="team-description">Description</label>

            <textarea
              id="team-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this team do?"
              rows={3}
            />

            <div className="teams-actions">
              <button
                type="submit"
                disabled={saving || loading}
                className="btn btn-primary"
              >
                {saving
                  ? "Saving..."
                  : editingId !== null
                    ? "Save changes"
                    : "Create team"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section>
          <div className="teams-list-head">
            <h2>Your teams</h2>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="btn btn-soft"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="teams-card">Loading teams...</div>
          ) : teams.length === 0 ? (
            <div className="teams-card teams-empty">
              <h3>No teams yet</h3>
              <p className="teams-muted">
                Create your first team using the form above.
              </p>
            </div>
          ) : (
            <div className="teams-grid">
              {teams.map((team) => {
                const memberIds = team.members.map(
                  (membership) => membership.employeeId
                );

                const availableEmployees = employees.filter(
                  (employee) => !memberIds.includes(employee.id)
                );

                return (
                  <article key={team.id} className="teams-card team-card">
                    <div className="team-card-head">
                      <div>
                        <h3>{team.name}</h3>

                        <p className="teams-muted">
                          {team.description || "No description provided."}
                        </p>
                      </div>

                      <span className="teams-count">
                        {team._count?.members ?? team.members.length} members
                      </span>
                    </div>

                    <hr className="teams-divider" />

                    <label
                      htmlFor={`leader-${team.id}`}
                      className="teams-label"
                    >
                      Team leader
                    </label>

                    <div className="teams-inline">
                      <select
                        id={`leader-${team.id}`}
                        value={
                          selectedLeaders[team.id] ??
                          (team.leaderEmployeeId?.toString() ?? "")
                        }
                        onChange={(event) =>
                          setSelectedLeaders((previous) => ({
                            ...previous,
                            [team.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">No leader</option>
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void assignLeader(team)}
                        className="btn btn-soft"
                      >
                        Save
                      </button>
                    </div>

                    <h4>Members</h4>

                    {team.members.length === 0 ? (
                      <p className="teams-muted" style={{ marginBottom: 14 }}>
                        No members assigned yet.
                      </p>
                    ) : (
                      <ul className="member-list">
                        {team.members.map((membership) => (
                          <li
                            key={membership.employeeId}
                            className="member-item"
                          >
                            <div>
                              <strong>{membership.employee.name}</strong>
                              <span>
                                {membership.employee.email ||
                                  membership.employee.role ||
                                  ""}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                void removeMember(team, membership.employee)
                              }
                              aria-label={`Remove ${membership.employee.name}`}
                              className="btn btn-sm btn-danger"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <label
                      htmlFor={`member-${team.id}`}
                      className="teams-label"
                    >
                      Add an employee
                    </label>

                    <div className="teams-inline">
                      <select
                        id={`member-${team.id}`}
                        value={selectedMembers[team.id] ?? ""}
                        onChange={(event) =>
                          setSelectedMembers((previous) => ({
                            ...previous,
                            [team.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select employee</option>
                        {availableEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => void addMember(team)}
                        disabled={availableEmployees.length === 0}
                        className="btn btn-primary"
                      >
                        Add
                      </button>
                    </div>

                    <div className="teams-actions">
                      <button
                        type="button"
                        onClick={() => startEditing(team)}
                        className="btn btn-outline"
                      >
                        Edit team
                      </button>

                      <button
                        type="button"
                        onClick={() => void deleteTeam(team)}
                        className="btn btn-danger"
                      >
                        Delete team
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="teams-footer">
          Employee Directory · Team Management
        </footer>
      </div>
    </main>
  );
}
