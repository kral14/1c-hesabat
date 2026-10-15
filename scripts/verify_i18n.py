import re

with open('static/js/c1_i18n.js', encoding='utf-8') as f:
    content = f.read()

az_part = re.search(r'az:\s*\{(.*?)\n\s*\},', content, re.DOTALL)
ru_part = re.search(r'ru:\s*\{(.*?)\n\s*\}\n\s*\};', content, re.DOTALL)

az_keys = set(re.findall(r'"([a-zA-Z0-9_.]+)":', az_part.group(1)))
ru_keys = set(re.findall(r'"([a-zA-Z0-9_.]+)":', ru_part.group(1)))

print('AZ keys count:', len(az_keys))
print('RU keys count:', len(ru_keys))

missing_in_ru = az_keys - ru_keys
missing_in_az = ru_keys - az_keys

print('Missing in RU:', missing_in_ru)
print('Missing in AZ:', missing_in_az)
if not missing_in_ru and not missing_in_az:
    print('SUCCESS: Both dictionaries are 100% synchronized!')
