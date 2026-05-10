#!/bin/bash
set -e

echo "📦 Installing dependencies..."
npm install

echo "✅ Testing build..."
npm run build

echo "🔗 Setting up git..."
git init
git add .
git commit -m "initial commit — LexAI legal analyzer"

echo "🚀 Adding remote and pushing..."
git remote add origin https://github.com/Zack4909/legal-analyzer.git
git branch -M main
git push -u origin main

echo "🌐 Deploying to GitHub Pages..."
npm run deploy

echo ""
echo "✅ Done! Your site will be live at:"
echo "   https://Zack4909.github.io/legal-analyzer/"
echo ""
echo "⏳ GitHub Pages can take 1-2 minutes to go live."
