"use server";

import { hashPassword } from "~/fsd/shared/lib/auth";
import {
  signupSchema,
  type SignupFormValues,
} from "~/fsd/entity/auth/model/schemas/auth";
import { db } from "~/server/db";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";

/**
 * Sign up a new user
 */
export async function signUp(
  data: SignupFormValues,
): Promise<ActionResult<void>> {
  const validatedResult = signupSchema.safeParse(data);
  if (!validatedResult.success) {
    return failure(
      validatedResult.error.issues[0]?.message ?? "Invalid input",
    );
  }

  const { email, password } = validatedResult.data;

  try {
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return failure("User already exists");
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    return success(undefined);
  } catch (error) {
    console.error("Sign up error:", error);
    return failure("An unexpected error occurred while signing up");
  }
}
