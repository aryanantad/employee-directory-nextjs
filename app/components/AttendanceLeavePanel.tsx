"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_EMPLOYEE_API_URL || "http://localhost:4002"
).replace(/\/$/, "");

type UserRole = "employee" | "manager" | "hr";

type AttendanceRecord = {
  id: string;
  attendanceDate: string;
  checkIn: string;
  checkOut?: string | null;
  status: string;
  employee?: {
    id: number;
    name: string;
    email: string;
    role?: string;
  };
};

type TodayAttendanceResponse = {
  attendance: AttendanceRecord | null;
};

type LeaveType = {
  id: string;
  name: string;
  description?: string | null;
  isPaid?: boolean;
};

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  decisionRemark?: string | null;
  leaveType?: {
    id?: string;
    name: string;
    isPaid?: boolean;
  };
  employee?: {
    id: number;
    name: string;
    email: string;
  };
  reviewer?: {
    id: number;
    name: string;
    email: string;
  } | null;
};

type Props = {
  role: UserRole;
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let token: string | null = null;

  if (typeof window !== "undefined") {
    for (const key of [
      "accessToken",
      "access_token",
      "authToken",
      "token",
      "jwt",
    ]) {
      token = localStorage.getItem(key);
      if (token) break;
    }
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error(
      "Your session is not recognized by the backend. Please sign in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data as T;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString();
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
}

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case "approved":
    case "present":
    case "completed":
      return "pill-success";

    case "rejected":
    case "absent":
      return "pill-danger";

    case "pending":
    case "late":
      return "pill-warning";

    default:
      return "";
  }
}

export default function AttendanceLeavePanel({ role }: Props) {
  const isHR = role === "hr";
  const isManager = role === "manager";

  const canTakeAttendanceAction = role !== "hr";
  const canApplyLeave = role !== "hr";

  const [tab, setTab] = useState<"attendance" | "leave">("attendance");

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [today, setToday] = useState<AttendanceRecord | null>(null);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<LeaveRequest[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // HR sees organization attendance.
      // Managers see team attendance.
      // Employees see their own attendance.
      const attendanceRequest: Promise<AttendanceRecord[]> = isHR
        ? apiRequest<AttendanceRecord[]>("/api/attendance/organization")
        : isManager
          ? apiRequest<AttendanceRecord[]>("/api/attendance/team")
          : apiRequest<AttendanceRecord[]>("/api/attendance");

      // HR sees all organization leave requests.
      // Employees and managers see their own requests.
      const leaveRequest: Promise<LeaveRequest[]> = isHR
        ? apiRequest<LeaveRequest[]>("/api/leaves?all=true")
        : apiRequest<LeaveRequest[]>("/api/leaves");

      const [
        attendanceData,
        todayData,
        leaveData,
        typeData,
        teamLeaveData,
      ] = await Promise.all([
        attendanceRequest,
        apiRequest<TodayAttendanceResponse>("/api/attendance/today"),
        leaveRequest,
        canApplyLeave
          ? apiRequest<LeaveType[]>("/api/leave-types")
          : Promise.resolve([]),
        isManager
          ? apiRequest<LeaveRequest[]>("/api/leaves/team")
          : Promise.resolve([]),
      ]);

      let attendanceRecords = Array.isArray(attendanceData)
        ? attendanceData
        : [];

      // The team attendance endpoint returns reportees.
      // Add the manager's own attendance separately.
      if (isManager) {
        const ownAttendance = await apiRequest<AttendanceRecord[]>(
          "/api/attendance"
        );

        attendanceRecords = [
          ...(Array.isArray(ownAttendance) ? ownAttendance : []),
          ...attendanceRecords,
        ];

        // Remove duplicate records.
        attendanceRecords = Array.from(
          new Map(
            attendanceRecords.map((record) => [record.id, record])
          ).values()
        );
      }

      setAttendance(attendanceRecords);
      setToday(todayData.attendance ?? null);

      setLeaves(Array.isArray(leaveData) ? leaveData : []);

      setTeamLeaves(
        Array.isArray(teamLeaveData) ? teamLeaveData : []
      );

      setLeaveTypes(Array.isArray(typeData) ? typeData : []);

      if (Array.isArray(typeData) && typeData.length > 0) {
        setLeaveTypeId((current) => current || typeData[0].id);
      } else {
        setLeaveTypeId("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load attendance and leave data."
      );
    } finally {
      setLoading(false);
    }
  }, [isHR, isManager, canApplyLeave]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Lets the sidebar links (#attendance and #leave-management)
  // open the matching tab. Display behavior only; no data is touched.
  useEffect(() => {
    function syncTabFromHash() {
      if (window.location.hash === "#leave-management") {
        setTab("leave");
      } else if (window.location.hash === "#attendance") {
        setTab("attendance");
      }
    }

    function handleLinkClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const href = target?.closest?.("a")?.getAttribute("href");

      if (href === "#leave-management") {
        setTab("leave");
      } else if (href === "#attendance") {
        setTab("attendance");
      }
    }

    syncTabFromHash();

    window.addEventListener("hashchange", syncTabFromHash);
    document.addEventListener("click", handleLinkClick);

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
      document.removeEventListener("click", handleLinkClick);
    };
  }, []);

  async function handleAttendance(
    action: "check-in" | "check-out"
  ) {
    if (!canTakeAttendanceAction) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest<{ message?: string }>(
        `/api/attendance/${action}`,
        {
          method: "POST",
        }
      );

      setSuccess(result.message || `Successfully ${action}.`);

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Attendance action failed."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeaveSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!canApplyLeave) return;

    setError("");
    setSuccess("");

    if (
      !leaveTypeId ||
      !startDate ||
      !endDate ||
      !reason.trim()
    ) {
      setError("Please fill in all leave request fields.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before the start date.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await apiRequest<{ message?: string }>(
        "/api/leaves",
        {
          method: "POST",
          body: JSON.stringify({
            leaveTypeId,
            startDate,
            endDate,
            reason: reason.trim(),
          }),
        }
      );

      setSuccess(
        result.message || "Leave request submitted successfully."
      );

      setStartDate("");
      setEndDate("");
      setReason("");

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit leave."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeaveReview(
    leaveId: string,
    status: "approved" | "rejected"
  ) {
    if (!isManager) return;

    const decisionRemark = window.prompt(
      `Optional remark for ${status} leave request:`
    );

    // Cancel means do not submit the review.
    if (decisionRemark === null) return;

    if (decisionRemark.length > 1000) {
      setError("Decision remark must be 1000 characters or fewer.");
      return;
    }

    setReviewingId(leaveId);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest<{ message?: string }>(
        `/api/leaves/${encodeURIComponent(leaveId)}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            decisionRemark: decisionRemark.trim() || null,
          }),
        }
      );

      setSuccess(
        result.message || `Leave request ${status}.`
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to review leave request."
      );
    } finally {
      setReviewingId(null);
    }
  }

  const roleDescription = isHR
    ? "View organization attendance and leave requests. HR access is read-only."
    : isManager
      ? "Manage your attendance, leave requests, and your direct reportees."
      : "Manage your daily attendance and leave requests.";

  return (
    <section className="al">
      <div>
        <h2 className="al-title">Attendance & Leave</h2>

        <p className="al-subtitle">{roleDescription}</p>
      </div>

      {error && (
        <div role="alert" className="al-alert al-alert-error">
          {error}

          {error.toLowerCase().includes("session") && (
            <p>
              Sign out, sign in again using OTP, and reload this page.
            </p>
          )}
        </div>
      )}

      {success && (
        <div role="status" className="al-alert al-alert-success">
          {success}
        </div>
      )}

      <div className="al-tabs">
        <button
          type="button"
          onClick={() => setTab("attendance")}
          className={`al-tab ${tab === "attendance" ? "active" : ""}`}
        >
          Attendance
        </button>

        <button
          type="button"
          onClick={() => setTab("leave")}
          className={`al-tab ${tab === "leave" ? "active" : ""}`}
        >
          Leave Management
        </button>
      </div>

      {loading ? (
        <p className="al-loading">Loading data from backend...</p>
      ) : tab === "attendance" ? (
        <>
          <div className="al-card">
            <div className="al-card-head">
              <h3>Today&apos;s Attendance</h3>

              <p className="al-muted">
                Date: {formatDate(today?.attendanceDate)}
              </p>
            </div>

            <div className="al-metrics">
              <div className="al-metric">
                <p className="al-label">Check-in</p>
                <p className="al-value">{formatTime(today?.checkIn)}</p>
              </div>

              <div className="al-metric">
                <p className="al-label">Check-out</p>
                <p className="al-value">{formatTime(today?.checkOut)}</p>
              </div>

              <div className="al-metric">
                <p className="al-label">Status</p>
                <p className="al-value">
                  <span
                    className={`pill ${statusClass(
                      today?.status || "not checked in"
                    )}`}
                  >
                    {today?.status || "Not checked in"}
                  </span>
                </p>
              </div>
            </div>

            {canTakeAttendanceAction && (
              <div className="al-actions">
                <button
                  type="button"
                  disabled={submitting || Boolean(today?.checkIn)}
                  onClick={() => handleAttendance("check-in")}
                  className="btn btn-primary"
                >
                  Check In
                </button>

                <button
                  type="button"
                  disabled={
                    submitting ||
                    !today?.checkIn ||
                    Boolean(today?.checkOut)
                  }
                  onClick={() => handleAttendance("check-out")}
                  className="btn btn-dark"
                >
                  Check Out
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void loadData()}
                  className="btn btn-outline"
                >
                  Refresh
                </button>
              </div>
            )}

            {isHR && (
              <p className="al-note">
                HR attendance is read-only. Check-in and check-out are
                not available for this role.
              </p>
            )}
          </div>

          <div className="al-card al-table-card">
            <div className="al-card-head">
              <h3>
                {isHR
                  ? "Organization Attendance"
                  : isManager
                    ? "Team Attendance"
                    : "Attendance History"}
              </h3>

              {(isHR || isManager) && (
                <p className="al-muted">
                  {isHR
                    ? "Attendance records across the organization."
                    : "Your attendance and attendance records for your direct reportees."}
                </p>
              )}
            </div>

            <div className="al-table-wrap">
              <table className="al-table">
                <thead>
                  <tr>
                    {(isHR || isManager) && <th>Employee</th>}

                    {(isHR || isManager) && <th>Email</th>}

                    <th>Date</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {attendance.map((record) => (
                    <tr key={record.id}>
                      {(isHR || isManager) && (
                        <td>{record.employee?.name || "—"}</td>
                      )}

                      {(isHR || isManager) && (
                        <td>{record.employee?.email || "—"}</td>
                      )}

                      <td>{formatDate(record.attendanceDate)}</td>

                      <td>{formatTime(record.checkIn)}</td>

                      <td>{formatTime(record.checkOut)}</td>

                      <td>
                        <span
                          className={`pill ${statusClass(record.status)}`}
                        >
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {attendance.length === 0 && (
                    <tr>
                      <td
                        colSpan={isHR || isManager ? 6 : 4}
                        className="al-empty"
                      >
                        No attendance records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {canApplyLeave && (
            <form onSubmit={handleLeaveSubmit} className="al-card al-form">
              <h3>Request Leave</h3>

              <div className="al-field">
                <label>Leave type</label>

                <select
                  value={leaveTypeId}
                  onChange={(event) =>
                    setLeaveTypeId(event.target.value)
                  }
                  required
                >
                  <option value="">Select leave type</option>

                  {leaveTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                      {type.isPaid === false ? " (Unpaid)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="al-grid-2">
                <div className="al-field">
                  <label>Start date</label>

                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) =>
                      setStartDate(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="al-field">
                  <label>End date</label>

                  <input
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(event) =>
                      setEndDate(event.target.value)
                    }
                    required
                  />
                </div>
              </div>

              <div className="al-field">
                <label>Reason</label>

                <textarea
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value)
                  }
                  required
                  rows={3}
                  maxLength={1000}
                  placeholder="Enter the reason for your leave"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || leaveTypes.length === 0}
                className="btn btn-primary"
              >
                {submitting
                  ? "Submitting..."
                  : "Submit Leave Request"}
              </button>
            </form>
          )}

          <div className="al-card al-table-card">
            <div className="al-card-head">
              <h3>
                {isHR
                  ? "All Organization Leave Requests"
                  : "My Leave Requests"}
              </h3>
            </div>

            <div className="al-table-wrap">
              <table className="al-table">
                <thead>
                  <tr>
                    {isHR && <th>Employee</th>}
                    {isHR && <th>Email</th>}
                    <th>Leave type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave.id}>
                      {isHR && <td>{leave.employee?.name || "—"}</td>}

                      {isHR && <td>{leave.employee?.email || "—"}</td>}

                      <td>{leave.leaveType?.name || "Leave"}</td>

                      <td>{formatDate(leave.startDate)}</td>

                      <td>{formatDate(leave.endDate)}</td>

                      <td>{leave.reason}</td>

                      <td>
                        <span
                          className={`pill ${statusClass(leave.status)}`}
                        >
                          {leave.status}
                        </span>

                        {leave.decisionRemark && (
                          <p className="al-remark">
                            {leave.decisionRemark}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}

                  {leaves.length === 0 && (
                    <tr>
                      <td
                        colSpan={isHR ? 7 : 5}
                        className="al-empty"
                      >
                        No leave requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isManager && (
            <div className="al-card al-table-card">
              <div className="al-card-head">
                <h3>Team Leave Requests</h3>

                <p className="al-muted">
                  Review pending leave requests from your direct reportees.
                </p>
              </div>

              <div className="al-table-wrap">
                <table className="al-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Email</th>
                      <th>Leave type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {teamLeaves.map((leave) => (
                      <tr key={leave.id}>
                        <td>{leave.employee?.name || "—"}</td>

                        <td>{leave.employee?.email || "—"}</td>

                        <td>{leave.leaveType?.name || "Leave"}</td>

                        <td>{formatDate(leave.startDate)}</td>

                        <td>{formatDate(leave.endDate)}</td>

                        <td>{leave.reason}</td>

                        <td>
                          <span
                            className={`pill ${statusClass(leave.status)}`}
                          >
                            {leave.status}
                          </span>

                          {leave.decisionRemark && (
                            <p className="al-remark">
                              {leave.decisionRemark}
                            </p>
                          )}

                          {leave.reviewer && (
                            <p className="al-remark">
                              Reviewed by {leave.reviewer.name}
                            </p>
                          )}
                        </td>

                        <td>
                          {leave.status.toLowerCase() === "pending" ? (
                            <div className="al-row-actions">
                              <button
                                type="button"
                                disabled={reviewingId === leave.id}
                                onClick={() =>
                                  handleLeaveReview(leave.id, "approved")
                                }
                                className="btn btn-sm btn-success"
                              >
                                {reviewingId === leave.id
                                  ? "Processing..."
                                  : "Approve"}
                              </button>

                              <button
                                type="button"
                                disabled={reviewingId === leave.id}
                                onClick={() =>
                                  handleLeaveReview(leave.id, "rejected")
                                }
                                className="btn btn-sm btn-danger"
                              >
                                {reviewingId === leave.id
                                  ? "Processing..."
                                  : "Reject"}
                              </button>
                            </div>
                          ) : (
                            <span className="al-muted">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {teamLeaves.length === 0 && (
                      <tr>
                        <td colSpan={8} className="al-empty">
                          No team leave requests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
