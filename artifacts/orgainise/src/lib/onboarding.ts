const DONE_KEY = "orgainise_onboarding_done";
const SKIP_KEY = "orgainise_skip_onboarding";

export function isOnboardingDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return false; }
}

export function isOnboardingSkipped(): boolean {
  try { return sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}

export function markOnboardingDone(): void {
  try { localStorage.setItem(DONE_KEY, "1"); sessionStorage.removeItem(SKIP_KEY); } catch { /* */ }
}

export function skipOnboarding(): void {
  try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* */ }
}

export function resetOnboarding(): void {
  try { localStorage.removeItem(DONE_KEY); sessionStorage.removeItem(SKIP_KEY); } catch { /* */ }
}

export function shouldShowOnboarding(): boolean {
  return !isOnboardingDone() && !isOnboardingSkipped();
}
