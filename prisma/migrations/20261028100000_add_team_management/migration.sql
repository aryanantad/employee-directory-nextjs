-- Create teams.
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderEmployeeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- Prevent duplicate team names.
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- Support lookups by team leader.
CREATE INDEX "Team_leaderEmployeeId_idx"
ON "Team"("leaderEmployeeId");

-- Create memberships so an employee can join multiple teams.
CREATE TABLE "TeamMembership" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- A given employee can belong to a team only once.
CREATE UNIQUE INDEX "TeamMembership_employeeId_teamId_key"
ON "TeamMembership"("employeeId", "teamId");

CREATE INDEX "TeamMembership_teamId_idx"
ON "TeamMembership"("teamId");

-- Keep team references valid when employees or teams are deleted.
ALTER TABLE "Team"
ADD CONSTRAINT "Team_leaderEmployeeId_fkey"
FOREIGN KEY ("leaderEmployeeId") REFERENCES "employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamMembership"
ADD CONSTRAINT "TeamMembership_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMembership"
ADD CONSTRAINT "TeamMembership_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id")
ON DELETE CASCADE ON UPDATE CASCADE;