import { lazy, Suspense } from "react";
import { getViktorSpaceAccessMode } from "@/lib/viktor-spaces-access/config";

const PublicAppRoutes = lazy(() =>
  import("./public/PublicAppRoutes").then(module => ({
    default: module.PublicAppRoutes,
  })),
);
const SpaceAuthAppRoutes = lazy(() =>
  import("./space-auth/SpaceAuthAppRoutes").then(module => ({
    default: module.SpaceAuthAppRoutes,
  })),
);
const ViktorAuthAppRoutes = lazy(() =>
  import("./viktor-auth/ViktorAuthAppRoutes").then(module => ({
    default: module.ViktorAuthAppRoutes,
  })),
);

function AuthStrategyLoading() {
  return null;
}

export function AuthStrategyRoutes() {
  const mode = getViktorSpaceAccessMode();

  const routes =
    mode === "viktor_auth" ? (
      <ViktorAuthAppRoutes />
    ) : mode === "space_auth" ? (
      <SpaceAuthAppRoutes />
    ) : (
      <PublicAppRoutes />
    );

  return <Suspense fallback={<AuthStrategyLoading />}>{routes}</Suspense>;
}
