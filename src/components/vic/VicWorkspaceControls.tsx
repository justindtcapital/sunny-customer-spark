import { createContext, useContext, useState, type ReactNode } from "react";
import type { VicSkillId } from "@/lib/vic-skills";
import { VicSkillPicker } from "./VicSkillPicker";
import { KbFolderPicker } from "./KbFolderPicker";

const WorkspaceContext = createContext<{
  skillId?: VicSkillId;
  setSkillId: (id?: VicSkillId) => void;
  folders: string[];
  setFolders: (ids: string[]) => void;
} | null>(null);

export function VicWorkspaceProvider({ children }: { children: ReactNode }) {
  const [skillId, setSkillId] = useState<VicSkillId>();
  const [folders, setFolders] = useState<string[]>([]);
  return <WorkspaceContext.Provider value={{ skillId, setSkillId, folders, setFolders }}>{children}</WorkspaceContext.Provider>;
}

export function useVicWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("V.I.C. workspace is unavailable.");
  return value;
}

export function VicWorkspaceControls() {
  const { skillId, setSkillId, folders, setFolders } = useVicWorkspace();
  return <nav aria-label="V.I.C. tools" className="space-y-3 border-t border-border px-3 py-2.5">
    <VicSkillPicker value={skillId} onChange={setSkillId} onDraft={() => {}} disabled={false} placement="sidebar" />
    <KbFolderPicker value={folders} onChange={setFolders} placement="sidebar" />
  </nav>;
}