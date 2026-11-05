# ROAMIGO Postman Collections

Import both files into Postman:

1. `ROAMIGO-local.postman_environment.json`
2. `ROAMIGO-booking-review.postman_collection.json`
3. `ROAMIGO-fleet-management.postman_collection.json`

Select the imported environment and fill in the Customer and Staff/Admin
credentials locally. Do not commit populated credentials or access tokens.

Run folders 01 through 05 for the approval path. Customer rejection and Staff
rejection are alternative terminal paths and require a newly generated review
booking.

The collection selects the largest vehicle for the chosen vehicle type and
marks it unavailable. If another vehicle can satisfy the same passenger count,
repeat the unavailable-status request for that vehicle before generating the
quote. The quote test must return resourceAvailability: REVIEW_REQUIRED.

Always run the cleanup request for every vehicle whose status was changed.
Database-backed execution still requires access to the configured Postgres and
Supabase services.

## Fleet management

The fleet collection requires Administrator credentials in the `staffEmail`
and `staffPassword` variables. Set `driverStaffId` to an existing active Staff
record that does not yet have a Driver record. The collection creates a unique
licence number and vehicle plate, creates the Driver and vehicle, pairs them,
makes the pair available, exercises fleet reads, and then deactivates the
Driver and soft-deletes the vehicle.

Because Driver records are retained for history, the same `driverStaffId`
cannot be used for a second complete run. Use another Staff record for each
onboarding run. If the vehicle-type discovery request returns no records, set
`vehicleTypeId` manually from an existing `vehicle_type` row.
