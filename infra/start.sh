#!/bin/bash
# Wrapper to start ZenOptions in production mode.
# Uses Node.js v20+ built-in --env-file flag to load .env.
# PORT override: production uses 5001 so it doesn't conflict with the dev server on 5000.
# Called by launchd (com.zenoptions.plist).

exec /usr/local/bin/node \
  --env-file=/Users/froisagent/ZenOptions/.env \
  /Users/froisagent/ZenOptions/dist/index.js
