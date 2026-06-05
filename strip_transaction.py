import re

with open("sync_dump.sql", "r") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() in ("BEGIN TRANSACTION;", "COMMIT;"):
        continue
    
    # Check for CREATE TABLE or CREATE TABLE IF NOT EXISTS
    match = re.search(r'CREATE TABLE (?:IF NOT EXISTS )?("?\w+"?)', line, re.IGNORECASE)
    if match and line.startswith("CREATE TABLE"):
        table_name = match.group(1)
        new_lines.append(f'DROP TABLE IF EXISTS {table_name};\n')
        
    new_lines.append(line)

with open("sync_dump_notrans.sql", "w") as f:
    f.writelines(new_lines)

print("Stripped transactions and added DROP TABLE IF EXISTS.")
