# LexAI — Legal Document Analyzer

An AI-powered contract analysis tool built with React and the Claude API.

**Live demo:** https://Zack4909.github.io/legal-analyzer/

## What it does

Upload a PDF or paste contract text and get back:
- **Plain-English summary** of the contract's purpose and parties
- **Risk-flagged clauses** categorized by severity (high / medium / low)
- **Key obligations & deadlines** in a structured table

## Stack

- React + Vite
- Claude API (claude-sonnet-4)
- pdf.js for PDF text extraction
- Deployed via GitHub Pages

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173

You'll need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com). Enter it in the app — it's stored in localStorage only, never sent anywhere except the Anthropic API.

## Deploying

```bash
npm run deploy
```

This builds the app and pushes to the `gh-pages` branch. GitHub Pages serves it automatically.
