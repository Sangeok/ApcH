import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { comparePasswords } from "~/fsd/shared/lib/auth";

import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface User {
    emailVerified?: Date | null;
  }
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await db.user.findUnique({
          where: {
            email: email,
          },
        });

        if (!user) {
          return null;
        }

        if (!user.password) {
          return null;
        }

        const passwordsMatch = await comparePasswords(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return user;
      },
    }),
  ],
  session: { strategy: "jwt" },
  adapter: PrismaAdapter(db),
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      if (account?.provider === "google") {
        if (!user.email) return false;

        // signIn callback runs BEFORE PrismaAdapter creates the user record.
        // Only update existing users; new users will be created by the adapter.
        const existingUser = await db.user.findUnique({
          where: { email: user.email },
        });

        if (existingUser) {
          const googleProfile = profile as { picture?: string; name?: string };
          const needsImageOrName = !existingUser.image || !existingUser.name;
          const needsEmailVerified = !existingUser.emailVerified;

          if (needsImageOrName || needsEmailVerified) {
            await db.user.update({
              where: { email: user.email },
              data: {
                ...(needsImageOrName && {
                  image: existingUser.image ?? googleProfile?.picture,
                  name: existingUser.name ?? googleProfile?.name,
                }),
                ...(needsEmailVerified && {
                  emailVerified: new Date(),
                }),
              },
            });
          }
        }

        return true;
      }

      return true;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        image: token.image as string | undefined,
      },
    }),
    jwt: ({ token, user, account, profile }) => {
      if (user) {
        token.id = user.id;
        token.image = user.image;
      }
      if (account?.provider === "google" && profile) {
        token.image = (profile as { picture?: string }).picture;
      }
      return token;
    },
  },
} satisfies NextAuthConfig;
