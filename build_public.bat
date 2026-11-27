@echo off
rem Builds the APK for public release (GitHub): the same app, but WITHOUT the developer's own icon
rem (app\src\personal, the game's original logo): the public icon is the app's own artwork.
rem The extended city background and the tutorial's saved town stay in (allowed for releases).
rem Output: IkariamMobile-public.apk
set "PROJ=D:\Programs\02 - APK Development\IkariamMobile"
set "IKM_PUBLIC=1"
rem Start from a fresh APK: quick builds update the old file in place, which can leave the personal
rem icon's bytes inside it.
if exist "%PROJ%\app\build\outputs\apk\debug" rmdir /s /q "%PROJ%\app\build\outputs\apk\debug"
if exist "%PROJ%\app\build\intermediates" rmdir /s /q "%PROJ%\app\build\intermediates"
call "%PROJ%\build.bat"
copy /y "%PROJ%\app\build\outputs\apk\debug\app-debug.apk" "%PROJ%\IkariamMobile-public.apk" >nul
rem and the same for the next normal build, which puts the personal icon back
rmdir /s /q "%PROJ%\app\build\outputs\apk\debug"
rmdir /s /q "%PROJ%\app\build\intermediates"
echo PUBLIC APK: %PROJ%\IkariamMobile-public.apk
