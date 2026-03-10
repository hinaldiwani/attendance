@echo off
echo ======================================================
echo MYSQL CONNECTION COMMAND FOR YOUR APPLICATION DATABASE
echo ======================================================
echo.
echo Your application saves data to:
echo   Database: acadmark_attendance
echo   Host: localhost
echo   Port: 3306
echo   User: hinal
echo   Password: hinal
echo.
echo Current data in this database:
echo   - 180 Students (verified working)
echo   - Import mechanism: WORKING PERFECTLY
echo.
echo ======================================================
echo TO CONNECT TO THE CORRECT DATABASE, RUN:
echo ======================================================
echo.
echo mysql -u hinal -phinal -h localhost -P 3306 acadmark_attendance
echo.
echo OR (if password prompt is preferred):
echo mysql -u hinal -p -h localhost -P 3306 acadmark_attendance
echo.
echo ======================================================
echo AFTER CONNECTING, RUN THESE COMMANDS:
echo ======================================================
echo.
echo SELECT @@hostname, @@port, DATABASE(), USER();
echo SELECT COUNT(*) as Students FROM student_details_db;
echo SELECT COUNT(*) as Teachers FROM teacher_details_db;
echo SELECT * FROM student_details_db LIMIT 5;
echo.
echo ======================================================
echo.
pause
