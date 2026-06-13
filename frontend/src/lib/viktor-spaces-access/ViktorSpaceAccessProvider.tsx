import { createContext, type ReactNode, useContext, useMemo } from "react";
import { getViktorSpaceAccessMode, getViktorSpacesSpaceId } from "./config";
import type { ViktorSpaceAccessMode } from "./types";

interface ViktorSpaceAccessContextValue {
  mode: ViktorSpaceAccessMode;
  spaceId: string;
}

const ViktorSpaceAccessContext =
  createContext<ViktorSpaceAccessContextValue | null>(null);

export function ViktorSpaceAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const mode = getViktorSpaceAccessMode();
  const spaceId = getViktorSpacesSpaceId();
  const value = useMemo(() => ({ mode, spaceId }), [mode, spaceId]);

  return (
    <ViktorSpaceAccessContext.Provider value={value}>
      {children}
    </ViktorSpaceAccessContext.Provider>
  );
}

export function useViktorSpaceAccess() {
  const context = useContext(ViktorSpaceAccessContext);
  if (!context) {
    throw new Error(
      "useViktorSpaceAccess must be used within ViktorSpaceAccessProvider",
    );
  }
  return context;
}
