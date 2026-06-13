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

export interface CreateWorkspaceInput {
  name: string;
  github_owner: string;
  github_repo: string;
  default_branch?: string;
  cotext_folder_name?: string;
}
