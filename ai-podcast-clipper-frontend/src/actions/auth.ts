"use server";

import { hashPassword } from "~/fsd/shared/lib/auth";
import {
  signupSchema,
  type SignupFormValues,
} from "~/fsd/entity/auth/model/schemas/auth";
import { db } from "~/server/db";

type SignUpResult = {
  success: boolean;
  error?: string;
};

export async function signUp(data: SignupFormValues): Promise<SignUpResult> {
  const validatedResult = signupSchema.safeParse(data);
  if (!validatedResult.success) {
    return {
      success: false,
      error: validatedResult.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { email, password } = validatedResult.data;

  try {
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "User already exists" };
    }

    const hashedPassword = await hashPassword(password);

    await db.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    return { success: true };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "An unexpected error occurred while signing up",
    };
  }
}
