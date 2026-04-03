const fs = require('fs');

const dashboardPath = 'src/components/Dashboard.tsx';
let content = fs.readFileSync(dashboardPath, 'utf8');

// Add SearchTerm state specifically inside ProfileSection component
let replaceBlock = `function ProfileSection({ profile }: { profile: Record<string, unknown> }) {
    const columns = (profile.column_profiles || []) as Record<string, unknown>[]
    const correlations = (profile.correlation_pairs || profile.correlations || []) as Record<string, unknown>[]`;

let newBlock = `function ProfileSection({ profile }: { profile: Record<string, unknown> }) {
    const [searchTerm, setSearchTerm] = require('react').useState('')
    const columns = (profile.column_profiles || []) as Record<string, unknown>[]
    const correlations = (profile.correlation_pairs || profile.correlations || []) as Record<string, unknown>[]
    
    // Safety check map filtering
    const filteredColumns = columns.filter((col: any) => 
        String(col.name).toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(col.dtype_family).toLowerCase().includes(searchTerm.toLowerCase())
    )`;

content = content.replace(replaceBlock, newBlock);


// Insert Search Input UI
let tableReplaceBlock = `<div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card__header"><span className="card__title">�� Column Statistics ({columns.length})</span></div>`;

let newUiBlock = `${tableReplaceBlock}
                    {/* Add Table Search Box */}
                    <div style={{ padding: '0.5rem 1rem' }}>
                        <input 
                           type="text" 
                           placeholder="Search columns or types..." 
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-primary)' }}
                        />
                    </div>`;

content = content.replace(tableReplaceBlock, newUiBlock);

// Map filtered target instead of raw array
content = content.replace('{columns.map((col, i) => (', '{filteredColumns.map((col: any, i: number) => (');

fs.writeFileSync(dashboardPath, content);
console.log("Dashboard JS Patched");
