#!/bin/bash

# =============================================================================
# Prepare Fork Handoff Script
# =============================================================================
# This script creates a COPY of the project in a new directory and sanitizes it
# for handoff to another developer. The original project is NOT modified.
#
# Usage: ./scripts/prepare-fork-handoff.sh [target-directory]
# Example: ./scripts/prepare-fork-handoff.sh ~/Downloads/hotels-marketplace-platform
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the source directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

# Target directory (required argument)
TARGET_DIR="${1:-}"

if [ -z "$TARGET_DIR" ]; then
    echo -e "${RED}Error: Target directory is required${NC}"
    echo ""
    echo "Usage: $0 <target-directory>"
    echo "Example: $0 ~/Downloads/hotels-marketplace-platform"
    exit 1
fi

# Convert to absolute path
TARGET_DIR="$(cd "$(dirname "$TARGET_DIR")" 2>/dev/null && pwd)/$(basename "$TARGET_DIR")" || TARGET_DIR="$1"

# Safety checks
if [ "$SOURCE_DIR" = "$TARGET_DIR" ]; then
    echo -e "${RED}Error: Target directory cannot be the same as source directory${NC}"
    exit 1
fi

if [[ "$TARGET_DIR" == "$SOURCE_DIR"* ]]; then
    echo -e "${RED}Error: Target directory cannot be inside source directory${NC}"
    exit 1
fi

if [ -e "$TARGET_DIR" ]; then
    echo -e "${RED}Error: Target directory already exists: $TARGET_DIR${NC}"
    echo "Please remove it first or choose a different name."
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Prepare Fork Handoff Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Source: ${GREEN}$SOURCE_DIR${NC}"
echo -e "Target: ${GREEN}$TARGET_DIR${NC}"
echo ""
echo -e "${YELLOW}This script will:${NC}"
echo "  1. Copy the project to the target directory"
echo "  2. Remove git history, node_modules, and build artifacts"
echo "  3. Remove environment files (.env, .env.local, etc.)"
echo "  4. Replace hardcoded references with placeholders"
echo "  5. Update documentation for the new maintainer"
echo ""
echo -e "${GREEN}Your original project will NOT be modified.${NC}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${BLUE}Step 1: Copying project...${NC}"

# Copy the project, excluding unnecessary files
rsync -av --progress "$SOURCE_DIR/" "$TARGET_DIR/" \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'dist' \
    --exclude 'coverage' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.development.local' \
    --exclude '.env.test.local' \
    --exclude '.env.production.local' \
    --exclude '.turbo' \
    --exclude '.vercel' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'Thumbs.db' \
    --exclude '*.tsbuildinfo' \
    --exclude 'Demand Gen' \
    --exclude '.claude' \
    --exclude 'package-lock.json' \
    --exclude '*.pem' \
    --exclude '*.key' \
    --exclude '*.p12' \
    --exclude '*.pfx' \
    --exclude 'credentials*.json' \
    --exclude 'service-account*.json' \
    --exclude '*secret*' \
    --exclude '.npmrc' \
    --exclude '.yarnrc' \
    --exclude '.netrc'

echo ""
echo -e "${BLUE}Step 2: Initializing fresh git repository...${NC}"
cd "$TARGET_DIR"
git init
echo ""

echo -e "${BLUE}Step 3: Removing additional environment files...${NC}"
# Double-check removal of any env files that might have been copied
find "$TARGET_DIR" -name ".env" -type f -delete 2>/dev/null || true
find "$TARGET_DIR" -name ".env.local" -type f -delete 2>/dev/null || true
find "$TARGET_DIR" -name ".env.*.local" -type f -delete 2>/dev/null || true
echo "Done."
echo ""

echo -e "${BLUE}Step 4: Updating hardcoded references...${NC}"

# Function to safely replace text in a file
safe_replace() {
    local file="$1"
    local search="$2"
    local replace="$3"
    if [ -f "$file" ]; then
        if grep -q "$search" "$file" 2>/dev/null; then
            sed -i '' "s|$search|$replace|g" "$file"
            echo "  Updated: $file"
        fi
    fi
}

# Update deploy.yml - Heroku app name
safe_replace ".github/workflows/deploy.yml" \
    "HEROKU_APP_NAME: holibob-experiences-demand-gen" \
    "HEROKU_APP_NAME: YOUR_HEROKU_APP_NAME  # TODO: Update this"

# Update admin domains route - fallback hostname
safe_replace "apps/admin/src/app/api/domains/route.ts" \
    "holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com" \
    "YOUR_APP_HOSTNAME  # TODO: Update this"

# Update tenant test file
safe_replace "apps/website-platform/src/lib/tenant.test.ts" \
    "holibob-experiences-demand-gen.herokuapp.com" \
    "your-app.herokuapp.com"

echo ""
echo -e "${BLUE}Step 5: Cleaning up documentation...${NC}"

# Remove STATUS.md (contains deployment history specific to original project)
if [ -f "STATUS.md" ]; then
    rm "STATUS.md"
    echo "  Removed: STATUS.md (deployment history)"
fi

# Remove deploy-changes.sh (specific to original deployment)
if [ -f "deploy-changes.sh" ]; then
    rm "deploy-changes.sh"
    echo "  Removed: deploy-changes.sh (original deployment script)"
fi

echo ""
echo -e "${BLUE}Step 6: Updating README.md...${NC}"

# Create a new README header section
cat > "$TARGET_DIR/README.md.new" << 'EOF'
# Marketplace Platform

<!-- TODO: Add your CI/CD badges here -->
<!-- [![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/ci.yml) -->
<!-- [![Deploy](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/actions/workflows/deploy.yml) -->

> Autonomous SEO/LLM-optimised marketplace platform powered by Holibob API

## Quick Start

1. Copy `.env.example` to `.env` and configure all values
2. Run `npm install`
3. Run `npm run db:generate` to generate Prisma client
4. Run `npm run db:migrate` to run migrations
5. Run `npm run dev` to start development servers

## Setup Checklist

### Infrastructure
- [ ] Create GitHub repository
- [ ] Create Heroku app (or choose hosting)
- [ ] Provision PostgreSQL database
- [ ] Create Cloudflare account
- [ ] Create R2 bucket for assets
- [ ] Register domain(s)

### API Credentials Needed
- [ ] Holibob partner account
- [ ] Stripe account
- [ ] Anthropic API key
- [ ] OpenAI API key (for logo generation)
- [ ] Google Cloud service account (for GSC/GA4)
- [ ] DataForSEO account (optional, for keyword research)
- [ ] Unsplash API key (for images)

### Configuration
- [ ] Fill all values in `.env`
- [ ] Update `HEROKU_APP_NAME` in `.github/workflows/deploy.yml`
- [ ] Set GitHub secrets: `HEROKU_EMAIL`, `HEROKU_API_KEY`, `DATABASE_URL`
- [ ] Update any domain references in the codebase

---

EOF

# Append the rest of the original README (skipping the first few lines with badges)
if [ -f "README.md" ]; then
    # Find where the actual content starts (after badges) and append
    tail -n +10 "README.md" >> "$TARGET_DIR/README.md.new" 2>/dev/null || true
    mv "$TARGET_DIR/README.md.new" "$TARGET_DIR/README.md"
    echo "  Updated: README.md"
else
    mv "$TARGET_DIR/README.md.new" "$TARGET_DIR/README.md"
    echo "  Created: README.md"
fi

echo ""
echo -e "${BLUE}Step 7: Creating SETUP.md guide...${NC}"

cat > "$TARGET_DIR/SETUP.md" << 'EOF'
# Setup Guide

This project was forked from an experience marketplace platform. Follow this guide to set it up for your use case.

## Prerequisites

- Node.js 20.x
- npm 10.x
- PostgreSQL database
- Heroku CLI (if deploying to Heroku)

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required for Basic Operation
```
DATABASE_URL=postgresql://user:password@host:5432/database
HOLIBOB_API_URL=https://api.sandbox.holibob.tech/graphql
HOLIBOB_PARTNER_ID=your-partner-id
HOLIBOB_API_KEY=your-api-key
HOLIBOB_API_SECRET=your-api-secret
```

### Required for Content Generation
```
ANTHROPIC_API_KEY=your-anthropic-key
```

### Required for Payments
```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Required for Image Storage
```
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://assets.yourdomain.com
```

## First-Time Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# (Optional) Seed with sample data
npm run db:seed

# Start development servers
npm run dev
```

## Deployment to Heroku

1. Create a Heroku app:
   ```bash
   heroku create your-app-name
   ```

2. Add PostgreSQL:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

3. Set environment variables:
   ```bash
   heroku config:set HOLIBOB_API_KEY=xxx ...
   ```

4. Update `.github/workflows/deploy.yml`:
   - Change `HEROKU_APP_NAME` to your app name

5. Add GitHub secrets:
   - `HEROKU_EMAIL`: Your Heroku account email
   - `HEROKU_API_KEY`: From Heroku account settings
   - `DATABASE_URL`: From `heroku config:get DATABASE_URL`

6. Push to trigger deployment:
   ```bash
   git push origin main
   ```

## Project Structure

```
apps/
  admin/              # Admin dashboard (Next.js)
  demand-generation/  # Background job worker
  website-platform/   # Public-facing website (Next.js)
  proxy/              # Reverse proxy for multi-tenant routing

packages/
  content-engine/     # AI content generation
  database/           # Prisma schema and client
  holibob-api/        # Holibob API client
  jobs/               # Background job definitions
  shared/             # Shared types and utilities
  ui-components/      # Shared React components
```

## Customization Notes

This platform was originally built for experiences (tours, activities). If adapting for a different vertical (e.g., hotels):

1. Review and update terminology in UI components
2. Adjust the Prisma schema for your data model
3. Update the Holibob API integration for your product type
4. Modify content generation prompts in `packages/content-engine`

## Useful Commands

```bash
npm run dev           # Start all dev servers
npm run build         # Build all packages and apps
npm run test          # Run all tests
npm run lint          # Lint all code
npm run db:studio     # Open Prisma Studio (database GUI)
```
EOF

echo "  Created: SETUP.md"

echo ""
echo -e "${BLUE}Step 8: Updating package.json...${NC}"

# Update the package.json name
if [ -f "package.json" ]; then
    sed -i '' 's/"name": "experience-marketplace-platform"/"name": "marketplace-platform"/' package.json
    echo "  Updated: package.json (changed project name)"
fi

echo ""
echo -e "${BLUE}Step 9: Scanning for potential secrets...${NC}"

# Define patterns that might indicate secrets
SECRET_PATTERNS=(
    'sk_live_[a-zA-Z0-9]+'
    'sk_test_[a-zA-Z0-9]{24,}'
    'whsec_[a-zA-Z0-9]+'
    'sk-ant-[a-zA-Z0-9-]+'
    'AKIA[A-Z0-9]{16}'
    'ghp_[a-zA-Z0-9]{36}'
    'gho_[a-zA-Z0-9]{36}'
    'xox[baprs]-[a-zA-Z0-9-]+'
    '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
    'postgres://[^:]+:[^@]+@'
    'mysql://[^:]+:[^@]+@'
    'mongodb(\+srv)?://[^:]+:[^@]+@'
    'redis://[^:]+:[^@]+@'
)

SECRETS_FOUND=0
SECRETS_LOG="$TARGET_DIR/.secrets-scan-results.txt"
echo "Secrets scan results - $(date)" > "$SECRETS_LOG"
echo "=================================" >> "$SECRETS_LOG"

for pattern in "${SECRET_PATTERNS[@]}"; do
    # Search for pattern, excluding binary files and common false positives
    matches=$(grep -rIE "$pattern" . \
        --include="*.ts" \
        --include="*.tsx" \
        --include="*.js" \
        --include="*.jsx" \
        --include="*.json" \
        --include="*.yml" \
        --include="*.yaml" \
        --include="*.md" \
        --include="*.sh" \
        --include="*.env*" \
        2>/dev/null | grep -v "node_modules" | grep -v ".env.example" || true)

    if [ -n "$matches" ]; then
        echo "" >> "$SECRETS_LOG"
        echo "Pattern: $pattern" >> "$SECRETS_LOG"
        echo "$matches" >> "$SECRETS_LOG"
        SECRETS_FOUND=1
    fi
done

# Also check for specific file types that shouldn't be included
SENSITIVE_FILES=$(find . -type f \( \
    -name "*.pem" -o \
    -name "*.key" -o \
    -name "*.p12" -o \
    -name "*.pfx" -o \
    -name "*.keystore" -o \
    -name "id_rsa*" -o \
    -name "id_ed25519*" -o \
    -name "*.crt" -o \
    -name "service-account*.json" -o \
    -name "credentials*.json" -o \
    -name ".npmrc" -o \
    -name ".netrc" \
    \) 2>/dev/null || true)

if [ -n "$SENSITIVE_FILES" ]; then
    echo "" >> "$SECRETS_LOG"
    echo "Potentially sensitive files found:" >> "$SECRETS_LOG"
    echo "$SENSITIVE_FILES" >> "$SECRETS_LOG"
    SECRETS_FOUND=1
fi

if [ "$SECRETS_FOUND" -eq 1 ]; then
    echo -e "${YELLOW}  WARNING: Potential secrets detected!${NC}"
    echo -e "  Review: ${BLUE}$SECRETS_LOG${NC}"
    echo ""
    echo -e "${YELLOW}  Please review the scan results before sharing this package.${NC}"
    echo -e "${YELLOW}  The scan log will be excluded from the git commit.${NC}"
    echo ""
    # Add the scan results to gitignore so it's not committed
    echo ".secrets-scan-results.txt" >> .gitignore
else
    echo -e "${GREEN}  No obvious secrets detected.${NC}"
    rm -f "$SECRETS_LOG"
fi

echo ""
echo -e "${BLUE}Step 10: Final verification - checking for any remaining .env files...${NC}"
ENV_FILES=$(find . -name ".env*" -type f 2>/dev/null || true)
if [ -n "$ENV_FILES" ]; then
    echo -e "${YELLOW}  Found .env files that should be removed:${NC}"
    echo "$ENV_FILES"
    echo ""
    read -p "Remove these files? (Y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "$ENV_FILES" | xargs rm -f
        echo -e "${GREEN}  Removed.${NC}"
    fi
else
    echo -e "${GREEN}  No .env files found.${NC}"
fi

echo ""
echo -e "${BLUE}Step 11: Creating initial commit...${NC}"
git add .
git commit -m "Initial commit - forked marketplace platform

This project was forked from an experience marketplace platform.
See SETUP.md for configuration instructions."

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Handoff Package Ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Location: ${BLUE}$TARGET_DIR${NC}"
echo ""

# Final summary
echo -e "${BLUE}What was excluded from the copy:${NC}"
echo "  - .git/ (git history)"
echo "  - node_modules/, .next/, dist/, coverage/"
echo "  - All .env files"
echo "  - .claude/ (local Claude settings)"
echo "  - package-lock.json (will be regenerated)"
echo "  - Private key files (*.pem, *.key, *.p12)"
echo "  - Credential files (credentials*.json, service-account*.json)"
echo "  - Auth config files (.npmrc, .netrc)"
echo ""

if [ -f "$TARGET_DIR/.secrets-scan-results.txt" ]; then
    echo -e "${YELLOW}IMPORTANT: Review the secrets scan before sharing:${NC}"
    echo -e "  ${BLUE}$TARGET_DIR/.secrets-scan-results.txt${NC}"
    echo ""
fi

echo "Next steps for the recipient:"
echo "  1. Create a new GitHub repository"
echo "  2. cd $TARGET_DIR"
echo "  3. npm install (to regenerate package-lock.json)"
echo "  4. git add package-lock.json && git commit -m 'Add package-lock.json'"
echo "  5. git remote add origin https://github.com/USERNAME/REPO.git"
echo "  6. git push -u origin main"
echo "  7. Follow the instructions in SETUP.md"
echo ""
echo -e "${YELLOW}Files that need manual review:${NC}"
echo "  - .github/workflows/deploy.yml (Heroku app name)"
echo "  - apps/admin/src/app/api/domains/route.ts (fallback hostname)"
echo "  - Any files referencing 'experiencess.com' (if using different domain)"
echo ""
echo -e "${GREEN}Your original project was not modified.${NC}"
