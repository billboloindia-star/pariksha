#!/bin/bash
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed on this computer."
  echo "  Install the LTS version from https://nodejs.org"
  echo "  then double-click this file again."
  echo ""
  read -r -p "Press enter to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo ""
  echo "  First run - installing dependencies. This takes a minute or two."
  echo ""
  npm install || { read -r -p "npm install failed. Press enter to close..."; exit 1; }
fi

echo ""
echo "  Starting the app - your browser will open in a few seconds."
echo "  Keep this window open while you use it. Press Ctrl+C to stop."
echo ""
( sleep 5; open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null ) &
npm run dev
