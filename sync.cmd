@echo off
rem Sync the deployed site from the pipeline repo's webmap/ folder.
rem Run from this folder, then: git diff / git add -A / git commit / git push
copy /Y "C:\Projects\humanservices\webmap\index.html" .
copy /Y "C:\Projects\humanservices\webmap\app.js" .
copy /Y "C:\Projects\humanservices\webmap\styles.css" .
echo Synced. Review with: git diff
copy /Y "C:\Projects\humanservices\webmap\winter.html" .
copy /Y "C:\Projects\humanservices\webmap\winter.js" .
copy /Y "C:\Projects\humanservices\webmap\winter.css" .
copy /Y "C:\Projects\humanservices\webmap\winter-donate.json" .
