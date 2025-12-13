#!/bin/bash
# =============================================================================
# VibeVST Entrypoint Script
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
cat << 'EOF'
 __      __ _  _           __      __  _____  _______ 
 \ \    / /(_)| |          \ \    / / / ____||__   __|
  \ \  / /  _ | |__    ___  \ \  / / | (___     | |   
   \ \/ /  | || '_ \  / _ \  \ \/ /   \___ \    | |   
    \  /   | || |_) ||  __/   \  /    ____) |   | |   
     \/    |_||_.__/  \___|    \/    |_____/    |_|   
                                                      
EOF
echo -e "${NC}"

echo -e "${GREEN}🎹 Welcome to VibeVST - AI-Powered VST Development${NC}"
echo ""

# Check for API key
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "  ${GREEN}✓${NC} Anthropic API Key configured"
else
    echo -e "  ${YELLOW}⚠${NC} Anthropic API Key not set (can be entered in web UI)"
fi

echo ""
echo -e "${CYAN}Environment:${NC}"
echo -e "  JUCE Path: ${GREEN}$JUCE_PATH${NC}"
echo -e "  Working Dir: ${GREEN}$(pwd)${NC}"
echo ""

# Start web UI if web folder exists
if [ -d "/home/dev/web" ]; then
    echo -e "${CYAN}Starting Web UI...${NC}"
    cd /home/dev/web
    
    # Only install if node_modules is missing to save time
    if [ -f "package.json" ]; then
        if [ ! -d "node_modules" ]; then
            echo -e "  Installing dependencies for Linux..."
            npm install --silent 2>/dev/null
        else
            echo -e "  Using existing node_modules..."
        fi
    fi
    
    # Start API server in background
    echo -e "  Starting API server on port 3001..."
    node server/index.js &
    API_PID=$!
    
    # Start Vite dev server in background
    echo -e "  Starting Vite on port 5173..."
    npm run dev:client -- --host 0.0.0.0 &
    WEB_PID=$!
    
    # Wait a moment for servers to start
    sleep 3
    
    echo -e "  ${GREEN}✓${NC} Web UI running at ${GREEN}http://localhost:5173${NC}"
    echo -e "  ${GREEN}✓${NC} API server running at ${GREEN}http://localhost:3001${NC}"
    echo ""
    
    cd /home/dev/MyPlugins
fi

echo -e "${CYAN}Quick Start:${NC}"
echo -e "  ${GREEN}vibevst init \"MyPlugin\"${NC}  - Create new plugin project"
echo -e "  ${GREEN}vibevst build${NC}            - Build current project"
echo -e "  ${GREEN}vibevst vibe \"prompt\"${NC}   - Start AI coding session"
echo -e "  ${GREEN}vibevst info${NC}             - Show environment info"
echo ""

# Execute the command passed to docker run
exec "$@"
