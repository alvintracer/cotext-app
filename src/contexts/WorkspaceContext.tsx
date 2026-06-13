import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from './AuthContext';

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
  cotext_folder_name: string;
  created_at: string;
  updated_at: string;
}

interface CreateWorkspaceInput {
  name: string;
  github_owner: string;
  github_repo: string;
  default_branch?: string;
  cotext_folder_name?: string;
}

interface UpdateWorkspaceInput {
  name?: string;
  github_owner?: string;
  github_repo?: string;
  default_branch?: string;
  cotext_folder_name?: string;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  error: Error | null;
  selectWorkspace: (workspace: Workspace | null) => void;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
  updateWorkspace: (id: string, input: UpdateWorkspaceInput) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from('workspaces')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (queryError) throw queryError;
      const fetched = (data as Workspace[]) ?? [];
      setWorkspaces(fetched);

      // If current workspace was deleted or doesn't exist, reset
      if (currentWorkspace && !fetched.find((w) => w.id === currentWorkspace.id)) {
        setCurrentWorkspace(fetched[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch workspaces'));
    } finally {
      setLoading(false);
    }
  }, [user, currentWorkspace]);

  const selectWorkspace = useCallback((workspace: Workspace | null) => {
    setCurrentWorkspace(workspace);
  }, []);

  const createWorkspace = useCallback(
    async (input: CreateWorkspaceInput): Promise<Workspace> => {
      if (!user) throw new Error('Must be authenticated to create a workspace');

      try {
        setError(null);
        const { data, error: insertError } = await supabase
          .from('workspaces')
          .insert({
            user_id: user.id,
            name: input.name,
            github_owner: input.github_owner,
            github_repo: input.github_repo,
            default_branch: input.default_branch ?? 'main',
            cotext_folder_name: input.cotext_folder_name ?? '.cotext',
          })
          .select()
          .single();

        if (insertError) throw insertError;
        const created = data as Workspace;
        setWorkspaces((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create workspace');
        setError(error);
        throw error;
      }
    },
    [user]
  );

  const updateWorkspace = useCallback(
    async (id: string, input: UpdateWorkspaceInput): Promise<Workspace> => {
      if (!user) throw new Error('Must be authenticated to update a workspace');

      try {
        setError(null);
        const { data, error: updateError } = await supabase
          .from('workspaces')
          .update(input)
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) throw updateError;
        const updated = data as Workspace;
        setWorkspaces((prev) => prev.map((w) => (w.id === id ? updated : w)));
        if (currentWorkspace?.id === id) {
          setCurrentWorkspace(updated);
        }
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update workspace');
        setError(error);
        throw error;
      }
    },
    [user, currentWorkspace]
  );

  const deleteWorkspace = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Must be authenticated to delete a workspace');

      try {
        setError(null);
        const { error: deleteError } = await supabase
          .from('workspaces')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);

        if (deleteError) throw deleteError;
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
        if (currentWorkspace?.id === id) {
          setCurrentWorkspace(null);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete workspace');
        setError(error);
        throw error;
      }
    },
    [user, currentWorkspace]
  );

  // Fetch workspaces when user changes
  useEffect(() => {
    fetchWorkspaces();
  }, [user]);

  const value: WorkspaceContextValue = {
    workspaces,
    currentWorkspace,
    loading,
    error,
    selectWorkspace,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
