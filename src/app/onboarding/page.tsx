import { Suspense } from "react";
import OnboardingClient from "./onboarding-client";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingClient />
    </Suspense>
  );
}
