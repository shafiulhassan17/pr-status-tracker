Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\shafi\OneDrive\Documents\pr-status-tracker"
WshShell.Run "cmd /c """"""C:\Program Files\nodejs\node.exe"""" server.js >> server_output.log 2>&1""", 0, False
