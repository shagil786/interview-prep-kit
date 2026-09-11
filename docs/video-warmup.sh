#!/usr/bin/env bash
# Prep the deployed app for video recording: wake Render (cold start ~50s),
# wait until healthy, then open the live app.
echo "waking API…"
curl -s --max-time 70 https://prepkit-api-yjnm.onrender.com/health || true
for i in 1 2 3; do
  curl -s --max-time 30 https://interview-prep-kit-web-xi.vercel.app/ >/dev/null && curl -s --max-time 30 https://prepkit-api-yjnm.onrender.com/health && echo && break
  sleep 5
done
echo "opening app…"
open https://interview-prep-kit-web-xi.vercel.app/register
