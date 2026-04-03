import re

with open('/home/codeczero/Desktop/FullStack/dataAi/frontend/src/components/Dashboard.tsx', 'r') as f:
    text = f.read()

# We need to find the content inside:
start_marker = "            {activeTab === 'overview' && (\n                <>\n"
end_marker = "                </>\n            )}\n"

start_idx = text.find(start_marker) + len(start_marker)
end_idx = text.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Markers not found!")
    exit(1)

overview_content = text[start_idx:end_idx]

blocks = {}

markers = [
    ("exec", "                    {/* Executive Summary */}"),
    ("stats", "                    {/* Inline Numeric Stats */}"),
    ("preview", "                    {/* Data Preview */}"),
    ("types", "                    {/* Column Types */}"),
    ("prompts", "                    {/* Smart Data Extraction */}"),
    ("export", "                    {/* Export & Download Panel */}"),
    ("charts", "                    {/* Interactive Chart Controls */}"),
]

# Extract blocks by finding the indices
indices = []
for k, m in markers:
    idx = overview_content.find(m)
    if idx != -1:
        indices.append((idx, k, m))

indices.sort(key=lambda x: x[0])

for i in range(len(indices)):
    idx, k, m = indices[i]
    if i < len(indices) - 1:
        next_idx = indices[i+1][0]
        blocks[k] = overview_content[idx:next_idx]
    else:
        blocks[k] = overview_content[idx:]

# Ensure all blocks parsed
for k, _ in markers:
    if k not in blocks:
        print(f"Missing block: {k}")
        exit(1)

# Desired order: Exec -> Export -> Charts -> Prompts -> Preview -> Types -> Stats
new_overview = (
    blocks["exec"] +
    blocks["export"] +
    blocks["charts"] +
    blocks["prompts"] +
    blocks["preview"] +
    blocks["types"] +
    blocks["stats"]
)

new_text = text[:start_idx] + new_overview + text[end_idx:]

with open('/home/codeczero/Desktop/FullStack/dataAi/frontend/src/components/Dashboard.tsx', 'w') as f:
    f.write(new_text)

print("Reordered successfully!")
