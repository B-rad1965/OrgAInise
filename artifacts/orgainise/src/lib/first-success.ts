const ctxKey = (id: string) => `orgainise_ctx_${id}`;
const checklistKey = (id: string) => `orgainise_checklist_done_${id}`;

export function markContextGenerated(projectId: string): void {
  try { localStorage.setItem(ctxKey(projectId), "1"); } catch { /* ignore */ }
}

export function hasGeneratedContext(projectId: string): boolean {
  try { return localStorage.getItem(ctxKey(projectId)) === "1"; } catch { return false; }
}

export function dismissChecklist(projectId: string): void {
  try { localStorage.setItem(checklistKey(projectId), "1"); } catch { /* ignore */ }
}

export function isChecklistDismissed(projectId: string): boolean {
  try { return localStorage.getItem(checklistKey(projectId)) === "1"; } catch { return false; }
}
