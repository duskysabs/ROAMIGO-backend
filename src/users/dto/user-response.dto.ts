export class UserResponseDto {
  userId!: string;
  firstName!: string | null;
  lastName!: string | null;
  birthDate!: Date | null;
  homeAddress!: string | null;
  role!: string;
  accountStatus!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
