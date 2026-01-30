#!/bin/bash
# Deploy Changes Script
# Run this to push the pending commits and trigger Heroku deployment

echo "=== Experience Marketplace Platform - Deploy Changes ==="
echo ""

# Check current status
echo "1. Checking current git status..."
git status

echo ""
echo "2. Pending commits to push:"
git log --oneline origin/main..HEAD

echo ""
echo "3. Pushing changes to GitHub..."
git push origin main

echo ""
echo "4. Verifying push was successful..."
git log --oneline -3

echo ""
echo "=== Done! ==="
echo ""
echo "Heroku will automatically deploy the changes."
echo "Check deployment status at: https://dashboard.heroku.com/apps/holibob-experiences-demand-gen/activity"
echo "View the live site at: https://holibob-experiences-demand-gen-c27f61accbd2.herokuapp.com/experiences"
