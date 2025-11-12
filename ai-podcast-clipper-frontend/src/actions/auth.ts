"use server";

import { hashPassword } from "~/lib/auth";
import { signupSchema, type SignupFormValues } from "~/schemas/auth";
import { db } from "~/server/db";
import Stripe from "stripe";

type SignUpResult = {
  success: boolean;
  error?: string;
};

export async function signUp(data: SignupFormValues): Promise<SignUpResult> {
  const validatedResult = signupSchema.safeParse(data);
  if (!validatedResult.success) {
    return {
      success: false,
      error: validatedResult.error.issues[0]?.message || "Invalid input",
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

    // const stripe = new Stripe("TODO: stripe key");
    // const stripeCustomer = await stripe.customers.create({
    //   email: email.toLowerCase(),
    // });

    await db.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        // stripeCustomerId: stripeCustomer.id,
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
