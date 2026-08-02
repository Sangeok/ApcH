import NextAuth from "next-auth";
import { authConfigEdge } from "~/server/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
