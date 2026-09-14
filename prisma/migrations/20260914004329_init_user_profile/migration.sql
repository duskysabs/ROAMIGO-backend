-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER', 'STAFF', 'DRIVER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "user_profile" (
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "birth_date" DATE,
    "home_address" VARCHAR(255),
    "role" "UserRole" NOT NULL,
    "account_status" "AccountStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "public"."user_profile"
ADD CONSTRAINT "user_profile_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
ON DELETE CASCADE;

ALTER TABLE "public"."user_profile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."user_profile" FROM anon, authenticated;