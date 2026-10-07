-- Existing profiles remain valid while all new registrations require a phone
-- number through CompleteProfileDto.
ALTER TABLE "user_profile"
ADD COLUMN "phone_number" VARCHAR(20);
