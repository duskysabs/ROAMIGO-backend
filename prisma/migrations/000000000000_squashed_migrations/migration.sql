-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER', 'STAFF', 'DRIVER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'IN_TRIP', 'UNAVAILABLE', 'TURNAROUND', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VehicleTypeName" AS ENUM ('SEDAN', 'SUV', 'VAN', 'MINIBUS', 'BUS');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'IN_TRIP', 'UNAVAILABLE', 'TURNAROUND', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'INTERMEDIATE', 'DROPOFF');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('TOUR_PACKAGE', 'CUSTOM_TRIP');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'AWAITING_PAYMENT', 'BOOKING_REVIEW', 'CONFIRMED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'RESERVED', 'ASSIGNED', 'ACKNOWLEDGED', 'DECLINED', 'RELEASED', 'REPLACED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'CLEANING', 'REFUELING');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ONLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'E_WALLET', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "CancellationCategory" AS ENUM ('CUSTOMER_REQUEST', 'RESOURCE_UNAVAILABLE', 'PAYMENT_DEADLINE', 'OPERATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_METHOD', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TravelSlipStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING', 'PAYMENT', 'ASSIGNMENT', 'CANCELLATION', 'REFUND', 'TRIP', 'SYSTEM');

-- CreateTable
CREATE TABLE "user_profile" (
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone_number" VARCHAR(20),
    "birth_date" DATE,
    "home_address" VARCHAR(255),
    "role" "UserRole" NOT NULL,
    "account_status" "AccountStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "customer" (
    "customer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "has_credit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "staff" (
    "staff_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employment_status" "EmploymentStatus" NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "driver" (
    "driver_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "license_number" VARCHAR(100) NOT NULL,
    "license_expiry" DATE NOT NULL,
    "driver_status" "DriverStatus" NOT NULL,

    CONSTRAINT "driver_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "vehicle_type" (
    "vehicle_type_id" UUID NOT NULL,
    "vehicle_type" "VehicleTypeName" NOT NULL,

    CONSTRAINT "vehicle_type_pkey" PRIMARY KEY ("vehicle_type_id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "vehicle_id" UUID NOT NULL,
    "assigned_driver_id" UUID,
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" VARCHAR(30) NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "fuel_efficiency" DECIMAL(10,2) NOT NULL,
    "vehicle_model" VARCHAR(150) NOT NULL,
    "passenger_capacity" INTEGER NOT NULL,
    "year_model" INTEGER NOT NULL,
    "color" VARCHAR(80) NOT NULL,
    "vehicle_status" "VehicleStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "tour_package" (
    "tour_package_id" UUID NOT NULL,
    "package_name" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "base_price" DECIMAL(12,2) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "package_status" "PackageStatus" NOT NULL,
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tour_package_pkey" PRIMARY KEY ("tour_package_id")
);

-- CreateTable
CREATE TABLE "package_stop" (
    "package_stop_id" UUID NOT NULL,
    "tour_package_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "stop_type" "StopType" NOT NULL,
    "location_name" VARCHAR(150) NOT NULL,
    "activity" VARCHAR(255) NOT NULL,
    "formatted_address" VARCHAR(255) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "default_stop_minutes" INTEGER NOT NULL,

    CONSTRAINT "package_stop_pkey" PRIMARY KEY ("package_stop_id")
);

-- CreateTable
CREATE TABLE "booking" (
    "booking_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "tour_package_id" UUID,
    "vehicle_type_id" UUID NOT NULL,
    "booking_type" "BookingType" NOT NULL,
    "start_datetime" TIMESTAMPTZ(3) NOT NULL,
    "end_datetime" TIMESTAMPTZ(3) NOT NULL,
    "passenger_count" INTEGER NOT NULL,
    "booking_status" "BookingStatus" NOT NULL,
    "total_distance_km" DECIMAL(12,2) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "final_quoted_price" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "booking_quote" (
    "booking_quote_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "booking_type" "BookingType" NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "tour_package_id" UUID,
    "request_snapshot" JSONB NOT NULL,
    "route_evidence" JSONB,
    "pricing_config_id" UUID NOT NULL,
    "total_distance_km" DECIMAL(12,2) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "final_quoted_price" DECIMAL(12,2) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "booking_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_quote_pkey" PRIMARY KEY ("booking_quote_id")
);

-- CreateTable
CREATE TABLE "booking_transition" (
    "booking_transition_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "previous_state" "BookingStatus" NOT NULL,
    "next_state" "BookingStatus" NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_transition_pkey" PRIMARY KEY ("booking_transition_id")
);

-- CreateTable
CREATE TABLE "booking_stop" (
    "booking_stop_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "stop_type" "StopType" NOT NULL,
    "location_name" VARCHAR(150) NOT NULL,
    "formatted_address" VARCHAR(255) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "activity" VARCHAR(255),
    "planned_stop_minutes" INTEGER,
    "additional_distance_km" DECIMAL(12,2),
    "additional_charge" DECIMAL(12,2),
    "added_by_driver_id" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_stop_pkey" PRIMARY KEY ("booking_stop_id")
);

-- CreateTable
CREATE TABLE "booking_assignment" (
    "booking_assignment_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "assignment_status" "AssignmentStatus" NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_assignment_pkey" PRIMARY KEY ("booking_assignment_id")
);

-- CreateTable
CREATE TABLE "pricing_configuration" (
    "pricing_config_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "base_rate" DECIMAL(12,2) NOT NULL,
    "min_adjustment_pct" DECIMAL(6,2) NOT NULL,
    "max_adjustment_pct" DECIMAL(6,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_admin_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pricing_configuration_pkey" PRIMARY KEY ("pricing_config_id")
);

-- CreateTable
CREATE TABLE "fuel_price_record" (
    "fuel_price_id" UUID NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "price_per_liter" DECIMAL(12,2) NOT NULL,
    "observed_date" DATE NOT NULL,
    "source_name" VARCHAR(150) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_price_record_pkey" PRIMARY KEY ("fuel_price_id")
);

-- CreateTable
CREATE TABLE "pricing_calculation" (
    "pricing_calculation_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "pricing_config_id" UUID NOT NULL,
    "fuel_price_record_id" UUID,
    "base_rate_used" DECIMAL(12,2) NOT NULL,
    "fuel_price_used" DECIMAL(12,2),
    "distance_km" DECIMAL(12,2) NOT NULL,
    "trip_duration_minutes" INTEGER NOT NULL,
    "booking_demand_count" INTEGER NOT NULL,
    "vehicle_availability" INTEGER NOT NULL,
    "driver_availability" INTEGER NOT NULL,
    "suggested_amount" DECIMAL(12,2) NOT NULL,
    "adjustment_percentage" DECIMAL(6,2) NOT NULL,
    "model_version" VARCHAR(100) NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_calculation_pkey" PRIMARY KEY ("pricing_calculation_id")
);

-- CreateTable
CREATE TABLE "payment" (
    "payment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "recorded_by_staff_id" UUID,
    "payment_channel" "PaymentChannel" NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "provider" VARCHAR(100),
    "provider_reference" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "payment_status" "PaymentStatus" NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payment_proof" (
    "payment_proof_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "payment_proof_pkey" PRIMARY KEY ("payment_proof_id")
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
    "receivable_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount_due" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(12,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "receivable_status" "ReceivableStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("receivable_id")
);

-- CreateTable
CREATE TABLE "booking_cancellation" (
    "cancellation_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "reviewed_by_staff_id" UUID,
    "cancellation_reason" TEXT NOT NULL,
    "cancellation_category" "CancellationCategory" NOT NULL,
    "cancellation_status" "CancellationStatus" NOT NULL,
    "is_late_cancellation" BOOLEAN NOT NULL DEFAULT false,
    "penalty_rate" DECIMAL(6,2) NOT NULL,
    "penalty_amount" DECIMAL(12,2) NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_notes" TEXT,

    CONSTRAINT "booking_cancellation_pkey" PRIMARY KEY ("cancellation_id")
);

-- CreateTable
CREATE TABLE "refund" (
    "refund_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "processed_by_staff_id" UUID,
    "refund_type" "RefundType" NOT NULL,
    "refund_amount" DECIMAL(12,2) NOT NULL,
    "refund_reason" TEXT NOT NULL,
    "refund_method" "RefundMethod" NOT NULL,
    "refund_status" "RefundStatus" NOT NULL,
    "refund_reference" VARCHAR(255),
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "remarks" TEXT,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "outsourced_details" (
    "outsourced_details_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "vehicle_model" VARCHAR(150) NOT NULL,
    "plate_number" VARCHAR(30) NOT NULL,
    "vehicle_provider" VARCHAR(150) NOT NULL,
    "driver_name" VARCHAR(150) NOT NULL,
    "driver_contact" VARCHAR(100) NOT NULL,
    "agreed_cost" DECIMAL(12,2) NOT NULL,
    "recorded_by_staff_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outsourced_details_pkey" PRIMARY KEY ("outsourced_details_id")
);

-- CreateTable
CREATE TABLE "maintenance_record" (
    "maintenance_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "maintenance_type" "MaintenanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "completed_date" DATE,
    "cost" DECIMAL(12,2) NOT NULL,
    "odometer_reading" INTEGER NOT NULL,
    "maintenance_status" "MaintenanceStatus" NOT NULL,
    "recorded_by_staff_id" UUID NOT NULL,

    CONSTRAINT "maintenance_record_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "travel_slip" (
    "travel_slip_id" UUID NOT NULL,
    "booking_assignment_id" UUID NOT NULL,
    "actual_trip_start_at" TIMESTAMPTZ(3),
    "actual_trip_end_at" TIMESTAMPTZ(3),
    "travel_slip_status" "TravelSlipStatus" NOT NULL,
    "remarks" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "travel_slip_pkey" PRIMARY KEY ("travel_slip_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_user_id_key" ON "customer"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_staff_id_key" ON "driver"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_type_vehicle_type_key" ON "vehicle_type"("vehicle_type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_assigned_driver_id_key" ON "vehicle"("assigned_driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_plate_number_key" ON "vehicle"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "package_stop_tour_package_id_sequence_number_key" ON "package_stop"("tour_package_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "booking_idempotency_key_key" ON "booking"("idempotency_key");

-- CreateIndex
CREATE INDEX "booking_customer_user_id_created_at_idx" ON "booking"("customer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_booking_status_start_datetime_idx" ON "booking"("booking_status", "start_datetime");

-- CreateIndex
CREATE UNIQUE INDEX "booking_quote_booking_id_key" ON "booking_quote"("booking_id");

-- CreateIndex
CREATE INDEX "booking_quote_customer_user_id_expires_at_idx" ON "booking_quote"("customer_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "booking_transition_booking_id_occurred_at_idx" ON "booking_transition"("booking_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_stop_booking_id_sequence_number_key" ON "booking_stop"("booking_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "booking_assignment_booking_id_key" ON "booking_assignment"("booking_id");

-- CreateIndex
CREATE INDEX "payment_booking_id_payment_status_idx" ON "payment"("booking_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_provider_reference_key" ON "payment"("provider", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_receivable_booking_id_key" ON "accounts_receivable"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_cancellation_booking_id_key" ON "booking_cancellation"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "outsourced_details_booking_id_key" ON "outsourced_details"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "travel_slip_booking_assignment_id_key" ON "travel_slip"("booking_assignment_id");

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver" ADD CONSTRAINT "driver_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "driver"("driver_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_package" ADD CONSTRAINT "tour_package_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "staff"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_stop" ADD CONSTRAINT "package_stop_tour_package_id_fkey" FOREIGN KEY ("tour_package_id") REFERENCES "tour_package"("tour_package_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_tour_package_id_fkey" FOREIGN KEY ("tour_package_id") REFERENCES "tour_package"("tour_package_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_tour_package_id_fkey" FOREIGN KEY ("tour_package_id") REFERENCES "tour_package"("tour_package_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_pricing_config_id_fkey" FOREIGN KEY ("pricing_config_id") REFERENCES "pricing_configuration"("pricing_config_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_transition" ADD CONSTRAINT "booking_transition_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_transition" ADD CONSTRAINT "booking_transition_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_stop" ADD CONSTRAINT "booking_stop_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_stop" ADD CONSTRAINT "booking_stop_added_by_driver_id_fkey" FOREIGN KEY ("added_by_driver_id") REFERENCES "driver"("driver_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment" ADD CONSTRAINT "booking_assignment_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment" ADD CONSTRAINT "booking_assignment_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment" ADD CONSTRAINT "booking_assignment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_configuration" ADD CONSTRAINT "pricing_configuration_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_calculation" ADD CONSTRAINT "pricing_calculation_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_calculation" ADD CONSTRAINT "pricing_calculation_pricing_config_id_fkey" FOREIGN KEY ("pricing_config_id") REFERENCES "pricing_configuration"("pricing_config_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_calculation" ADD CONSTRAINT "pricing_calculation_fuel_price_record_id_fkey" FOREIGN KEY ("fuel_price_record_id") REFERENCES "fuel_price_record"("fuel_price_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_staff_id_fkey" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("payment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_cancellation" ADD CONSTRAINT "booking_cancellation_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_cancellation" ADD CONSTRAINT "booking_cancellation_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_cancellation" ADD CONSTRAINT "booking_cancellation_reviewed_by_staff_id_fkey" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_processed_by_staff_id_fkey" FOREIGN KEY ("processed_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsourced_details" ADD CONSTRAINT "outsourced_details_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsourced_details" ADD CONSTRAINT "outsourced_details_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outsourced_details" ADD CONSTRAINT "outsourced_details_recorded_by_staff_id_fkey" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_record" ADD CONSTRAINT "maintenance_record_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_record" ADD CONSTRAINT "maintenance_record_recorded_by_staff_id_fkey" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_slip" ADD CONSTRAINT "travel_slip_booking_assignment_id_fkey" FOREIGN KEY ("booking_assignment_id") REFERENCES "booking_assignment"("booking_assignment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user_profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve application-table security in Supabase.
ALTER TABLE "public"."user_profile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."user_profile" FROM anon, authenticated;