import { Password } from "@convex-dev/auth/providers/Password";
import type { AuthProviderConfig } from "@convex-dev/auth/server";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { TestCredentials } from "./testAuth";
import {
  ViktorSpacesEmail,
  ViktorSpacesPasswordReset,
} from "./ViktorSpacesEmail";

declare const process: { env: Record<string, string | undefined> };

type ViktorSpaceAccessMode = "public" | "space_auth" | "viktor_auth";

function decodePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.includes("\n")) return key;
  if (key.startsWith("-----BEGIN")) {
    return key
      .replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
      .replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
      .split(" ")
      .join("\n");
  }
  try {
    return atob(key);
  } catch {
    return key;
  }
}

const authPrivateKey = process.env.AUTH_PRIVATE_KEY;
if (authPrivateKey) {
  process.env.AUTH_PRIVATE_KEY = decodePrivateKey(authPrivateKey);
}

const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
if (jwtPrivateKey) {
  process.env.JWT_PRIVATE_KEY = decodePrivateKey(jwtPrivateKey);
}

function configuredAccessMode(): ViktorSpaceAccessMode {
  const mode =
    process.env.VIKTOR_SPACES_ACCESS_MODE ||
    process.env.VITE_VIKTOR_SPACES_ACCESS_MODE;
  if (mode === "public" || mode === "viktor_auth") {
    return mode;
  }
  return mode === "space_auth" ? "space_auth" : "public";
}

function configuredSpaceAuthProviders(): AuthProviderConfig[] {
  return [
    Password({
      verify: ViktorSpacesEmail,
      reset: ViktorSpacesPasswordReset,
    }),
    ...(process.env.VIKTOR_SPACES_IS_PREVIEW === "true" ? [TestCredentials] : []),
  ];
}

function configuredAuthProviders(): AuthProviderConfig[] {
  const mode = configuredAccessMode();
  if (mode === "public") {
    return [];
  }
  return mode === "space_auth" ? configuredSpaceAuthProviders() : [];
}

// Only register the @test.local credentials provider on preview/dev Convex
// deployments. `VIKTOR_SPACES_IS_PREVIEW` is set per-deployment by the Viktor
// Spaces backend (true on dev, false on prod). On production it is "false" or
// unset, so the test provider is omitted entirely and `signIn("test", ...)`
// fails with "Provider not configured".
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: configuredAuthProviders(),
});

export const currentUser = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});
