export {};

declare module "next-auth" {
  interface User {
    role?: string;
    verifierIssuedAt?: number;
  }
}
