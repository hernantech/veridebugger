# Git Setup Guide: Connecting Frontend to Backend Repo

This guide shows how to connect this frontend to a backend repository on GitHub, using a separate branch so it doesn't affect the main backend code.

## Step 1: Add Backend Repo as Remote

Replace `YOUR_BACKEND_REPO_URL` with the actual GitHub URL of the backend repository:

```bash
# Add the backend repo as a remote (we'll call it 'backend')
git remote add backend YOUR_BACKEND_REPO_URL

# Verify it was added
git remote -v
```

**Example:**
```bash
git remote add backend https://github.com/username/backend-repo.git
```

## Step 2: Fetch Backend Branches

```bash
# Fetch all branches from the backend repo
git fetch backend
```

## Step 3: Create a Separate Branch for Frontend

Create a new branch specifically for the frontend work. This keeps it separate from the backend's main branch:

```bash
# Create and switch to a new branch for frontend
git checkout -b frontend/veridebug-ui

# Or if you want to base it on the backend's main branch:
git checkout -b frontend/veridebug-ui backend/main
```

## Step 4: Push Frontend Branch to Backend Repo

Push your frontend branch to the backend repository (this won't affect their main branch):

```bash
# Push your frontend branch to the backend repo
git push backend frontend/veridebug-ui

# Set upstream for easier future pushes
git push -u backend frontend/veridebug-ui
```

## Step 5: Create a Pull Request (Optional)

On GitHub, you can create a Pull Request from `frontend/veridebug-ui` to the backend's main branch. This allows:
- Code review
- Discussion
- Easy merging when ready
- Keeping the branches separate until approved

## Daily Workflow

### Making Changes

```bash
# Make your changes, then:
git add .
git commit -m "Description of changes"
git push backend frontend/veridebug-ui
```

### Syncing with Backend Updates

If the backend repo gets updates you want to pull:

```bash
# Fetch latest from backend
git fetch backend

# Merge backend's main into your frontend branch (if needed)
git checkout frontend/veridebug-ui
git merge backend/main

# Or rebase to keep history clean
git rebase backend/main
```

### Creating a Subdirectory Structure (Alternative Approach)

If you prefer to keep the frontend in a subdirectory of the backend repo:

```bash
# Create a subdirectory branch
git checkout -b frontend/veridebug-ui backend/main

# Move frontend files to a subdirectory (e.g., 'frontend/')
mkdir frontend
git mv src frontend/
git mv package.json frontend/
git mv vite.config.ts frontend/
# ... move other frontend files

git commit -m "Add frontend in subdirectory"
git push backend frontend/veridebug-ui
```

## Alternative: Keep Repos Separate

If you want to keep the frontend and backend as completely separate repositories:

1. **Keep this as a separate repo** (current setup)
2. **Add backend as a submodule** (if you need to reference backend code):
   ```bash
   git submodule add YOUR_BACKEND_REPO_URL backend
   ```
3. **Use separate remotes** for frontend and backend

## Recommended Structure

For a clean setup, I recommend:

```
backend-repo/
├── backend/          # Backend code (main branch)
├── frontend/         # Frontend code (frontend/veridebug-ui branch)
└── README.md
```

Or keep them as separate repos and coordinate via:
- API contracts (which we've defined in `src/api/schemas.ts`)
- Shared types/interfaces
- Documentation

## Quick Reference

```bash
# View remotes
git remote -v

# View all branches (local and remote)
git branch -a

# Switch branches
git checkout frontend/veridebug-ui

# Push to backend repo
git push backend frontend/veridebug-ui

# Pull from backend
git pull backend frontend/veridebug-ui
```

## Notes

- The frontend branch (`frontend/veridebug-ui`) is completely separate from the backend's main branch
- You can work on it without affecting their code
- When ready, create a PR to merge into their main branch
- The backend team can review and merge when appropriate

