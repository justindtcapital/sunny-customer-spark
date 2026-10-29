import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Contact, Interaction } from "@/lib/types";
import type { RelationshipChange } from "@/lib/relationship-rating";

interface SelectionContextType {
  relationshipChange: RelationshipChange | null;
  setRelationshipChange: (change: RelationshipChange | null) => void;
  selectedIds: Set<string>;
  selectedContacts: Contact[];
  allFilteredContacts: Contact[];
  toggleId: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  setFilteredContacts: (contacts: Contact[]) => void;
  onBulkUpdate?: (updatedContacts: Contact[]) => void;
  setOnBulkUpdate: (fn: ((updatedContacts: Contact[]) => void) | undefined) => void;
  onBulkDelete?: (deletedIds: string[]) => void;
  setOnBulkDelete: (fn: ((deletedIds: string[]) => void) | undefined) => void;
}

const SelectionContext = createContext<SelectionContextType>({
  relationshipChange: null,
  setRelationshipChange: () => {},
  selectedIds: new Set(),
  selectedContacts: [],
  allFilteredContacts: [],
  toggleId: () => {},
  toggleAll: () => {},
  clearSelection: () => {},
  setFilteredContacts: () => {},
  setOnBulkUpdate: () => {},
  setOnBulkDelete: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [relationshipChange, setRelationshipChange] = useState<RelationshipChange | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allFilteredContacts, setAllFilteredContacts] = useState<Contact[]>([]);
  const [onBulkUpdate, setOnBulkUpdateState] = useState<((updatedContacts: Contact[]) => void) | undefined>();
  const [onBulkDelete, setOnBulkDeleteState] = useState<((deletedIds: string[]) => void) | undefined>();

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === allFilteredContacts.length && allFilteredContacts.length > 0) {
        return new Set();
      }
      return new Set(allFilteredContacts.map((c) => c.id));
    });
  }, [allFilteredContacts]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedContacts = allFilteredContacts.filter((c) => selectedIds.has(c.id));

  const setFilteredContacts = useCallback((contacts: Contact[]) => {
    setAllFilteredContacts(contacts);
    const visible = new Set(contacts.map(c => c.id));
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const setOnBulkUpdate = useCallback((fn: ((updatedContacts: Contact[]) => void) | undefined) => {
    setOnBulkUpdateState(() => fn);
  }, []);

  const setOnBulkDelete = useCallback((fn: ((deletedIds: string[]) => void) | undefined) => {
    setOnBulkDeleteState(() => fn);
  }, []);

  return (
    <SelectionContext.Provider
      value={{
        relationshipChange,
        setRelationshipChange,
        selectedIds,
        selectedContacts,
        allFilteredContacts,
        toggleId,
        toggleAll,
        clearSelection,
        setFilteredContacts,
        onBulkUpdate,
        setOnBulkUpdate,
        onBulkDelete,
        setOnBulkDelete,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  return useContext(SelectionContext);
}
