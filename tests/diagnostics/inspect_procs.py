import subprocess
import sys

out = subprocess.check_output('wmic process where "name=\'1cv8.exe\'" get ProcessId,CommandLine', shell=True, text=True)
print(out)
