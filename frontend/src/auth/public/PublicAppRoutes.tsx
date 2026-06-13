import { Navigate, Route, Routes } from "react-router-dom";
import { PublicLandingPage } from "@/pages/PublicLandingPage";

export function PublicAppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicLandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
