import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO = Data Transfer Object
 * Defines and validates the rules for data entering or leaving the endpoint.
*/

export class LoginDto {
    @IsEmail() // Email Required, and must be valid email
    email!: string;

    @IsString() // Password required, and must be a string
    @IsNotEmpty()
    password!: string;
}
