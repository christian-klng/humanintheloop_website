-- 001: Initial schema for user auth, organizations, projects, and experiments

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    openrouter_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE org_members (
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (org_id, user_id)
);

CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE criteria_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    version INTEGER NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, version)
);

CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    version INTEGER NOT NULL,
    prompt_md TEXT NOT NULL,
    system_prompt_md TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, version)
);

CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    content_md TEXT NOT NULL,
    model TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE NOT NULL,
    criteria_version_id UUID REFERENCES criteria_versions(id) ON DELETE SET NULL,
    result JSONB NOT NULL,
    model TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_criteria_versions_project ON criteria_versions(project_id);
CREATE INDEX idx_prompt_versions_project ON prompt_versions(project_id);
CREATE INDEX idx_test_cases_project ON test_cases(project_id);
CREATE INDEX idx_evaluations_test_case ON evaluations(test_case_id);

INSERT INTO schema_migrations (version) VALUES (1);
