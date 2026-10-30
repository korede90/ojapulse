@echo off
echo ===================================================================
echo   Deploying OjaPulse to GitHub (@korede90)
echo ===================================================================
echo.
set /p REPO_URL="Paste your GitHub Repository URL (default: https://github.com/korede90/ojapulse.git): "
if "%REPO_URL%"=="" set REPO_URL=https://github.com/korede90/ojapulse.git

git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main

echo.
echo Pushing commits to %REPO_URL% ...
git push -u origin main

echo.
echo ===================================================================
echo   Done! Your repository is now live on GitHub.
echo ===================================================================
pause
