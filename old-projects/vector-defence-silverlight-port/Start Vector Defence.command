#!/bin/zsh

set -u

cd "$(dirname "$0")"

PORT=4177
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://127.0.0.1:$PORT/"

echo "Starting VectorDefenceSL Canvas Port..."
echo "Project: $(pwd)"
echo "URL: $URL"
echo

if [ ! -d node_modules ]; then
  echo "node_modules not found. Installing dependencies first..."
  npm install || exit 1
  echo
fi

npm run dev -- --host 127.0.0.1 --port "$PORT" --strictPort &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1
}

trap cleanup EXIT INT TERM

OPENED=0
for _ in {1..80}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    open "$URL"
    OPENED=1
    break
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    wait "$SERVER_PID"
    exit $?
  fi

  sleep 0.25
done

if [ "$OPENED" -eq 0 ]; then
  echo "The server started, but $URL did not respond in time."
  echo "If Vite printed a different URL above, open that one manually."
fi

echo
echo "The game server is running. Close this Terminal window to stop it."
wait "$SERVER_PID"
