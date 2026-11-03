import ProfilePicture from "./components/ProfilePicture";
import LogoutButton from "./LogoutButton";
import EmployeeForm from "./EmployeeForm";
import EmployeeList from "./EmployeeList";
import AttendanceLeavePanel from "./components/AttendanceLeavePanel";

import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth";

type Employee = {
  id: number;
  name: string;
  role: string;
  email?: string | null;
  isActive?: boolean;
};

const EMPLOYEE_SERVICE_URL = (
  process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4002"
).replace(/\/$/, "");

async function EmployeeDirectory() {
  await connection();

  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const isHR = user.role === "hr";
  const isManager = user.role === "manager";
  const canViewTeams = user.role === "hr" || user.role === "manager";

  let employees: Employee[] = [];

  // The employee directory endpoint is HR-only.
  // Do not call it for employees or managers.
  if (isHR) {
    const cookieStore = await cookies();

    const cookieNames = cookieStore
      .getAll()
      .map(({ name }) => name);

    const hasAccessToken = cookieNames.includes("access_token");
    const hasAuthSession = cookieNames.includes("auth_session");

    console.log("AUTH COOKIE CHECK:", {
      hasAccessToken,
      hasAuthSession,
    });

    if (!hasAccessToken) {
      console.error("Access token is missing from the request.");
      redirect("/login");
    }

    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    let response: Response;

    try {
      response = await fetch(
        `${EMPLOYEE_SERVICE_URL}/api/employees`,
        {
          method: "GET",
          headers: {
            Cookie: cookieHeader,
          },
          cache: "no-store",
        }
      );
    } catch (error) {
      console.error("Could not connect to Employee Service:", error);
      throw new Error("Employee Service is unavailable.");
    }

    if (response.status === 401) {
      console.error("Employee Service rejected authentication.");
      redirect("/login");
    }

    if (response.status === 403) {
      const errorBody = await response.text();

      console.error("Employee Service access denied:", errorBody);

      throw new Error(`Access denied: ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();

      console.error("Employee Service error:", {
        status: response.status,
        body: errorBody,
      });

      throw new Error(
        `Employee Service returned status ${response.status}: ${errorBody}`
      );
    }

    employees = await response.json();
  }

  // Display text only. Each role sees wording that matches what it can do.
  const roleCopy = isHR
    ? {
        eyebrow: "HR overview",
        title: "People and workplace overview",
        text: "Manage employees, review organization attendance, and keep an eye on leave requests.",
        attendanceValue: "Organization",
        attendanceText: "Read-only view of attendance across the organization",
        leaveValue: "All requests",
        leaveText: "See leave requests from every employee",
        quickTitle: "Organization attendance and leave",
        quickText: "Review attendance records and leave requests in one place.",
      }
    : isManager
      ? {
          eyebrow: "Team dashboard",
          title: "Welcome to your team dashboard",
          text: "Track your own attendance, follow your direct reportees, and approve leave requests.",
          attendanceValue: "My team",
          attendanceText: "Your attendance and your reportees' attendance",
          leaveValue: "Approvals",
          leaveText: "Review pending leave requests from your team",
          quickTitle: "Your team, simplified",
          quickText: "Check in, review your team, and handle approvals from one dashboard.",
        }
      : {
          eyebrow: "My workspace",
          title: "Welcome back",
          text: "Check in, track your hours, and manage your leave in one place.",
          attendanceValue: "Daily",
          attendanceText: "Check in and out and view your attendance history",
          leaveValue: "My leave",
          leaveText: "Apply for leave and follow your requests",
          quickTitle: "Your workspace, simplified",
          quickText: "Access your attendance and leave tools from one dashboard.",
        };

  return (
    <div className="directory-layout">
      <aside className="directory-sidebar">
        <a href="#directory-home" className="directory-brand">
          <span className="directory-brand-mark" aria-hidden="true">
            E
          </span>
          <span>Employee Directory</span>
        </a>

        <div className="directory-sidebar-label">Workspace</div>

        <nav className="directory-nav" aria-label="Directory navigation">
          <a href="#directory-home" className="active" aria-current="page">
            <span aria-hidden="true">▦</span>
            <span>Dashboard</span>
          </a>

          {isHR && (
            <>
              <a href="#employee-list">
                <span aria-hidden="true">♙</span>
                <span>Employee Directory</span>
              </a>

              <a href="#employee-form">
                <span aria-hidden="true">＋</span>
                <span>Add Employee</span>
              </a>
            </>
          )}

          <a href="#attendance">
            <span aria-hidden="true">◷</span>
            <span>Attendance</span>
          </a>

          <a href="#leave-management">
            <span aria-hidden="true">▤</span>
            <span>Leave Management</span>
          </a>

          {canViewTeams && (
            <a href="/teams">
              <span aria-hidden="true">♧</span>
              <span>Teams</span>
            </a>
          )}
        </nav>

        <div className="directory-sidebar-bottom">
          <h3>Account</h3>

          <p className="directory-user-email">{user.email}</p>

          <p className="permission-note">
            Signed in as: <strong>{user.role.toUpperCase()}</strong>
          </p>

          <div className="profile-picture-container">
            <ProfilePicture />
          </div>

          <div className="directory-logout">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="directory-main" id="directory-home">
        <div className="directory-topbar">
          <div className="directory-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span>Dashboard</span>
          </div>

          <div className="directory-status">Connected</div>
        </div>

        <header className="directory-header">
          <div className="directory-header-content">
            <span className="directory-eyebrow">{roleCopy.eyebrow}</span>

            <h1>{roleCopy.title}</h1>

            <p>{roleCopy.text}</p>
          </div>

          {isHR && (
            <div className="directory-header-actions">
              <a href="#employee-form" className="directory-button">
                <span aria-hidden="true">＋</span>
                Add Employee
              </a>
            </div>
          )}
        </header>

        <section className="directory-stats" aria-label="Workspace summary">
          {isHR && (
            <article className="directory-stat-card">
              <div className="directory-stat-top">
                <span className="directory-stat-label">
                  Total employees
                </span>
                <span className="directory-stat-icon" aria-hidden="true">
                  ♙
                </span>
              </div>

              <strong className="directory-stat-value">
                {employees.length}
              </strong>

              <p className="directory-stat-description">
                People in your directory
              </p>
            </article>
          )}

          <article className="directory-stat-card">
            <div className="directory-stat-top">
              <span className="directory-stat-label">Attendance</span>
              <span className="directory-stat-icon" aria-hidden="true">
                ◷
              </span>
            </div>

            <strong className="directory-stat-value">
              {roleCopy.attendanceValue}
            </strong>

            <p className="directory-stat-description">
              {roleCopy.attendanceText}
            </p>
          </article>

          <article className="directory-stat-card">
            <div className="directory-stat-top">
              <span className="directory-stat-label">
                Leave management
              </span>
              <span className="directory-stat-icon" aria-hidden="true">
                ▤
              </span>
            </div>

            <strong className="directory-stat-value">
              {roleCopy.leaveValue}
            </strong>

            <p className="directory-stat-description">
              {roleCopy.leaveText}
            </p>
          </article>
        </section>

        <section className="directory-quick-access">
          <div>
            <h2>{roleCopy.quickTitle}</h2>
            <p>{roleCopy.quickText}</p>
          </div>

          <a href="#attendance">Open attendance →</a>
        </section>

        <div id="attendance">
          <span id="leave-management" aria-hidden="true" />
          <AttendanceLeavePanel role={user.role} />
        </div>

        {isHR && (
          <>
            <section id="employee-form" className="directory-panel">
              <div className="directory-panel-header">
                <div>
                  <span className="directory-panel-label">
                    Get started
                  </span>

                  <h2>Add New Employee</h2>

                  <p>
                    Enter the employee details below to add a team member.
                  </p>
                </div>
              </div>

              <EmployeeForm />
            </section>

            <section id="employee-list" className="directory-panel">
              <div className="directory-panel-header">
                <div>
                  <span className="directory-panel-label">
                    Your people
                  </span>

                  <h2>Team Members</h2>

                  <p>
                    View and manage the people in your directory.
                  </p>
                </div>

                <span className="employee-list-count">
                  {employees.length}{" "}
                  {employees.length === 1 ? "employee" : "employees"}
                </span>
              </div>

              <EmployeeList employees={employees} />
            </section>
          </>
        )}

        <footer className="directory-footer">
          <span>Employee Directory</span>
          <span>Team workspace</span>
        </footer>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="directory-loading">
          <div className="directory-loading-card">
            <div className="directory-loading-spinner" />
            <p>Loading your workspace...</p>
          </div>
        </div>
      }
    >
      <EmployeeDirectory />
    </Suspense>
  );
}
