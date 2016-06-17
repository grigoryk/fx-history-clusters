set -e

rm -rf public/*
cp index.html public 
cp app.js public 
cp -r bower_components public 
firebase deploy
