-- Add an optional profile image path to existing employees.
ALTER TABLE "public"."employee"
ADD COLUMN "profileImagePath" TEXT;

-- Store the logged-in user's own profile image path.
CREATE TABLE "public"."UserProfile" (
    "email" TEXT NOT NULL,
    "profileImagePath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("email")
);