
-- Create attendance records.
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "attendanceDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- Create leave types.
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- Create leave requests.
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decisionRemark" TEXT,
    "reviewerId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- Create indexes and uniqueness constraints.
CREATE INDEX "AttendanceRecord_attendanceDate_idx"
    ON "AttendanceRecord"("attendanceDate");

CREATE INDEX "AttendanceRecord_employeeId_attendanceDate_idx"
    ON "AttendanceRecord"("employeeId", "attendanceDate");

CREATE UNIQUE INDEX "AttendanceRecord_employeeId_attendanceDate_key"
    ON "AttendanceRecord"("employeeId", "attendanceDate");

CREATE UNIQUE INDEX "LeaveType_name_key"
    ON "LeaveType"("name");

CREATE INDEX "LeaveRequest_employeeId_status_idx"
    ON "LeaveRequest"("employeeId", "status");

CREATE INDEX "LeaveRequest_reviewerId_status_idx"
    ON "LeaveRequest"("reviewerId", "status");

CREATE INDEX "LeaveRequest_startDate_endDate_idx"
    ON "LeaveRequest"("startDate", "endDate");

-- Add foreign keys for the new tables only.
ALTER TABLE "AttendanceRecord"
    ADD CONSTRAINT "AttendanceRecord_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
    FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
